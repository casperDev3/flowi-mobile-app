import Foundation
import SwiftUI
import WatchKit

/// Стан годинника: кешований знімок + черга дій + сесія. Доставка гібридна (§6.1):
/// телефон досяжний → sendMessage з ack ≤3 с; немає ack → ті самі дії на сервер;
/// ідентичний UUID дії робить обидва шляхи безпечними.
@MainActor
final class WatchStore: ObservableObject {
  static let shared = WatchStore()

  // MARK: Published state

  /// Найновіший знімок (телефон / сервер / applicationContext).
  @Published private(set) var base: WatchSnapshot?
  /// Непідтверджені дії, FIFO, збережені на диску.
  @Published private(set) var queue: [DeviceAction] = []
  /// Підтверджені дії, які ще не відображені в жодному знімку.
  @Published private var settled: [(action: DeviceAction, at: Date)] = []
  @Published private(set) var hasToken = false
  /// `authed` з applicationContext: nil — контексту ще не було.
  @Published private(set) var contextAuthed: Bool?
  @Published private(set) var lang: String = WatchStore.deviceLang
  @Published var toast: String?
  @Published var showAdd = false

  // MARK: Dependencies

  let session = SessionStore()
  private lazy var api = FlowiAPI(session: session)
  let link = PhoneLink()

  private var contextUserId: String?
  private var flushing = false
  private var backoff: TimeInterval = 0
  private var retryTask: Task<Void, Never>?
  private var lastHello: (reason: String, at: Date)?
  private var lastSnapshotFetch = Date.distantPast
  private var started = false
  /// false — файл черги є, але прочитати його ще не вдалося (до першого
  /// розблокування): на диск нічого не пишемо, щоб не затерти чергу.
  private var queueLoaded = false
  /// Поки черга не прочитана, її стерли (вихід/інший користувач): прочитаний
  /// пізніше вміст диска відкидаємо.
  private var discardDiskQueue = false

  private static let lastAccountKey = "flowi_watch_last_account"
  private static let reasonKey = "flowi_watch_auth_reason"

  private init() {}

  static var deviceLang: String {
    (Locale.preferredLanguages.first ?? "uk").hasPrefix("en") ? "en" : "uk"
  }

  // MARK: Derived

  /// Знімок для UI: база + оптимістичне накладання.
  var snapshot: WatchSnapshot? {
    guard let base else { return nil }
    return Overlay.apply(base, settled.map(\.action) + queue)
  }

  /// Екран «Відкрийте Flowi на iPhone»: немає токена І контекст каже «не увійшли» або його немає.
  var isSignedOut: Bool { !hasToken && contextAuthed != true }

  var lastAccountId: String? {
    get { UserDefaults.standard.string(forKey: Self.lastAccountKey) }
    set { UserDefaults.standard.set(newValue, forKey: Self.lastAccountKey) }
  }

  /// Причина для `hello` (none/revoked/expired/user_mismatch), переживає перезапуск.
  private var authReason: String {
    get { UserDefaults.standard.string(forKey: Self.reasonKey) ?? "none" }
    set { UserDefaults.standard.set(newValue, forKey: Self.reasonKey) }
  }

  func t(_ key: String) -> String { L10n.string(key, lang: lang) }

  // MARK: Lifecycle

  func start() {
    guard !started else { return }
    started = true
    reloadIfNeeded()
    if let snapshotLang = base?.lang ?? session.credentials?.lang { lang = Self.normalizedLang(snapshotLang) }

    link.onContext = { [weak self] in self?.handleContext($0) }
    link.onUserInfo = { [weak self] in self?.handleUserInfo($0) }
    link.onReachability = { [weak self] reachable in
      guard let self else { return }
      if reachable { self.flush(force: true) }
    }
    link.activate()
    scheduleBackgroundRefresh()
  }

  /// Дочитати те, що було недоступне до першого розблокування (Keychain, файли).
  /// Повторюється на кожній точці входу, доки не вдасться.
  private func reloadIfNeeded() {
    if !queueLoaded {
      switch WatchFiles.read([DeviceAction].self, WatchFiles.queueName) {
      case .value(let stored):
        queueLoaded = true
        if discardDiskQueue {
          WatchFiles.save(queue, WatchFiles.queueName)
        } else {
          let known = Set(stored.map(\.id))
          let merged = stored + queue.filter { !known.contains($0.id) }
          if merged.count != stored.count { setQueue(merged) } else { queue = merged }
        }
      case .missing:
        queueLoaded = true
        if !queue.isEmpty || discardDiskQueue { WatchFiles.save(queue, WatchFiles.queueName) }
      case .unreadable:
        break
      }
    }
    if base == nil, contextAuthed != false, authReason != "revoked" {
      base = WatchFiles.load(WatchSnapshot.self, WatchFiles.snapshotName)
    }
    if !hasToken { hasToken = session.credentials != nil }
  }

  /// Після `signout` з причиною revoked (з «Пристроїв») годинник ігнорує
  /// знімки з контексту/телефону, доки не прийде нова пара токенів.
  private var isRevoked: Bool { !hasToken && authReason == "revoked" }

  func becameActive() {
    start()
    reloadIfNeeded()
    if !hasToken { sendHello(reason: authReason) }
    flush(force: true)
    refreshSnapshot()
  }

  // MARK: Snapshot

  private func adopt(_ snapshot: WatchSnapshot) {
    guard !isRevoked, snapshot.isNewer(than: base) else { return }
    if let a = snapshot.user?.id, let b = base?.user?.id, a != b { settled.removeAll() }
    base = snapshot
    WatchFiles.save(snapshot, WatchFiles.snapshotName)
    if let snapshotLang = snapshot.lang { lang = Self.normalizedLang(snapshotLang) }
    // Знімок, згенерований після підтвердження, уже містить ефект дії.
    let generated = snapshot.generatedDate
    let horizon = Date().addingTimeInterval(-600)
    settled.removeAll { $0.at <= generated || $0.at < horizon }
  }

  /// Джерела: телефон (`snapshotRequest`) або сервер (`GET /watch/today/`).
  func refreshSnapshot(force: Bool = false) {
    guard force || Date().timeIntervalSince(lastSnapshotFetch) > 20 else { return }
    lastSnapshotFetch = Date()
    Task {
      if link.isReachable, let reply = await link.requestSnapshot(watchId: session.watchId) {
        switch reply {
        case .snapshot(let snapshot):
          adopt(snapshot)
          return
        case .signedOut:
          if !hasToken { contextAuthed = false }
          return
        }
      }
      await fetchServerSnapshot()
    }
  }

  private func fetchServerSnapshot() async {
    guard session.credentials != nil else { return }
    do {
      adopt(try await api.today(tz: TimeZone.current.identifier))
    } catch {
      handle(error)
    }
  }

  // MARK: WatchConnectivity inbound (§6.3)

  private func handleContext(_ context: [String: String]) {
    reloadIfNeeded()
    if let ctxLang = context["lang"], !ctxLang.isEmpty { lang = Self.normalizedLang(ctxLang) }
    // Відкликаний годинник: контекст `authed:"1"` (телефон досі в акаунті) не
    // повертає даних — лише нова пара токенів (`auth`).
    if isRevoked { contextAuthed = false; return }
    if let authed = context["authed"] { contextAuthed = authed == "1" }
    if contextAuthed == false {
      // Телефон вийшов: знімок більше не показуємо (токени стирає `signout`).
      base = nil
      settled.removeAll()
      WatchFiles.save(Optional<WatchSnapshot>.none, WatchFiles.snapshotName)
      return
    }
    if let userId = context["userId"], !userId.isEmpty {
      contextUserId = userId
      if let creds = session.credentials, creds.userId != userId {
        // Годинник тримає токен іншого користувача (§6.4) → стерти токен і чергу.
        session.wipe()
        hasToken = false
        setQueue([])
        settled.removeAll()
        authReason = "user_mismatch"
        sendHello(reason: "user_mismatch", force: true)
      }
    }
    if let json = context["snapshot"], let snapshot = WatchSnapshot.decode(json: json) {
      adopt(snapshot)
    }
    flush()
  }

  private func handleUserInfo(_ info: [String: String]) {
    switch info["t"] {
    case "auth":
      guard let body = info["body"]?.data(using: .utf8),
            let object = try? JSONSerialization.jsonObject(with: body) as? [String: Any],
            let access = object["access"] as? String,
            let refresh = object["refresh"] as? String,
            let sessionId = object["sessionId"] as? String,
            let apiBase = object["apiBase"] as? String
      else { return }
      // Та сама пара приходить двома шляхами (userInfo + sendMessage) — дедуп за sessionId.
      if let current = session.credentials, current.sessionId == sessionId { return }
      let userId = (object["userId"] as? String) ?? (object["userId"] as? NSNumber)?.stringValue ?? ""
      // Свіжа пара від телефону авторитетніша за застарілий контекст (зміна акаунта).
      if !userId.isEmpty, let contextUserId, userId != contextUserId {
        setQueue([])
        settled.removeAll()
        base = nil
      }
      if !userId.isEmpty { contextUserId = userId }
      session.save(WatchCredentials(
        access: access, refresh: refresh, sessionId: sessionId, apiBase: apiBase,
        userId: userId, lang: object["lang"] as? String, issuedAt: object["issuedAt"] as? String
      ))
      if let newLang = object["lang"] as? String { lang = Self.normalizedLang(newLang) }
      hasToken = true
      authReason = "none"
      backoff = 0
      flush(force: true)
      refreshSnapshot(force: true)

    case "signout":
      // Сесію завершили свідомо з «Пристроїв» (reason `revoked`) — далі hello
      // має казати `revoked`, інакше телефон автоматично видасть нову сесію.
      var reason = "none"
      if let body = info["body"]?.data(using: .utf8),
         let object = try? JSONSerialization.jsonObject(with: body) as? [String: Any],
         object["reason"] as? String == "revoked" {
        reason = "revoked"
      }
      signOut(reason: reason)

    default:
      break
    }
  }

  private func signOut(reason: String = "none") {
    session.wipe()
    hasToken = false
    setQueue([])
    settled.removeAll()
    base = nil
    contextAuthed = false
    WatchFiles.save(Optional<WatchSnapshot>.none, WatchFiles.snapshotName)
    authReason = reason
  }

  private func sendHello(reason: String, force: Bool = false) {
    // Keychain ще недоступний — невідомо, чи є токен і який watchId: мовчимо,
    // інакше телефон видав би зайву сесію чи побачив би «новий» годинник.
    guard session.isKnown, let watchId = session.watchId else { return }
    if !force, let lastHello, lastHello.reason == reason, Date().timeIntervalSince(lastHello.at) < 30 { return }
    lastHello = (reason, Date())
    let creds = session.credentials
    link.sendHello(watchId: watchId, hasToken: creds != nil, sessionId: creds?.sessionId, reason: reason)
  }

  // MARK: Actions

  func enqueue(_ action: DeviceAction) {
    reloadIfNeeded()
    setQueue(queue + [action])
    WKInterfaceDevice.current().play(.click)
    flush(force: true)
  }

  func completeTask(_ task: WTask) {
    enqueue(.make(ActionType.taskComplete, ["taskId": .string(task.id)]))
  }

  func createTask(_ title: String) {
    let trimmed = String(title.trimmingCharacters(in: .whitespacesAndNewlines).prefix(200))
    guard !trimmed.isEmpty else { return }
    enqueue(.make(ActionType.taskCreate, ["title": .string(trimmed), "deadline": .string(FlowiDate.localNoon())]))
  }

  func startTaskTimer(_ task: WTask) {
    enqueue(.make(ActionType.timerStart, ["kind": .string("task"), "taskId": .string(task.id)]))
  }

  func startAdHocTimer(_ label: String) {
    let trimmed = String(label.trimmingCharacters(in: .whitespacesAndNewlines).prefix(120))
    guard !trimmed.isEmpty else { return }
    enqueue(.make(ActionType.timerStart, ["kind": .string("adhoc"), "label": .string(trimmed)]))
  }

  func stopTimer(_ timer: WTimer) {
    enqueue(.make(ActionType.timerStop, ["timerId": .string(timer.id)]))
  }

  func setHabit(_ habit: WHabit, done: Bool) {
    enqueue(.make(ActionType.habitCheck, ["habitId": .string(habit.id), "done": .bool(done)]))
  }

  func createNote(_ text: String) {
    let trimmed = String(text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(2000))
    guard !trimmed.isEmpty else { return }
    enqueue(.make(ActionType.noteCreate, ["text": .string(trimmed)]))
  }

  /// Сума в точності рахунку (decimals 0 → цілі).
  static func roundedAmount(_ amount: Double, account: WAccount?) -> Double {
    let factor = pow(10, Double(max(0, account?.decimals ?? 2)))
    return (amount * factor).rounded() / factor
  }

  /// false — після округлення до точності рахунку сума нульова; нічого не збережено.
  @discardableResult
  func createExpense(amount: Double, category: String, account: WAccount) -> Bool {
    let rounded = Self.roundedAmount(amount, account: account)
    guard rounded > 0 else { return false }
    lastAccountId = account.id
    enqueue(.make(ActionType.expenseCreate, [
      "amount": .number(rounded),
      "category": .string(String(category.prefix(64))),
      "accountId": .string(account.id),
    ]))
    return true
  }

  private func setQueue(_ actions: [DeviceAction]) {
    queue = actions
    if queueLoaded {
      WatchFiles.save(actions, WatchFiles.queueName)
    } else if actions.isEmpty {
      // Черга чужа/стерта: що б не лежало на диску — відкинути при дочитуванні.
      discardDiskQueue = true
    }
  }

  // MARK: Delivery (§6.1, §9)

  /// `force` ігнорує поточну затримку backoff (enqueue, активація, досяжність).
  func flush(force: Bool = false) {
    reloadIfNeeded()
    guard !queue.isEmpty, !flushing else { return }
    if !force && retryTask != nil { return }
    retryTask?.cancel()
    retryTask = nil
    flushing = true
    Task {
      await deliverAll()
      flushing = false
    }
  }

  /// Для фонового оновлення: дочекатися спроби доставки.
  func flushAndWait() async {
    reloadIfNeeded()
    guard !queue.isEmpty, !flushing else { return }
    flushing = true
    await deliverAll()
    flushing = false
  }

  private func deliverAll() async {
    while !queue.isEmpty {
      let outcome = await deliverBatch()
      switch outcome {
      case .progress:
        backoff = 0
        continue
      case .stalled:
        scheduleRetry()
        return
      }
    }
  }

  private enum Outcome { case progress, stalled }

  private func deliverBatch() async -> Outcome {
    // watchId з Keychain ще недоступний (до першого розблокування) — чекати.
    guard let watchId = session.watchId else { return .stalled }
    // 1) Телефон: ack ≤3 с.
    if link.isReachable {
      let batch = Array(queue.prefix(20))
      let owner = session.credentials?.userId.nilIfEmpty ?? contextUserId?.nilIfEmpty
      if let ack = await link.sendActions(batch, userId: owner, watchId: watchId) {
        let phoneOutcome = settle(batch, ack)
        // `retry` від телефону (запис ще не доїхав до нього синком) — сервер
        // може вже мати ціль; той самий UUID робить подвійну доставку безпечною.
        let pending = Set(queue.map(\.id))
        let leftovers = batch.filter { pending.contains($0.id) }
        guard !leftovers.isEmpty, session.credentials != nil else { return phoneOutcome }
        do {
          let response = try await api.postActions(watchId: watchId, actions: leftovers)
          let serverOutcome = settle(leftovers, response)
          return phoneOutcome == .progress || serverOutcome == .progress ? .progress : .stalled
        } catch {
          handle(error)
          return phoneOutcome
        }
      }
    }
    // 2) Сервер — ті самі дії, той самий UUID.
    guard session.credentials != nil else {
      sendHello(reason: authReason)
      return .stalled
    }
    let batch = Array(queue.prefix(50))
    do {
      let response = try await api.postActions(watchId: watchId, actions: batch)
      return settle(batch, response)
    } catch {
      handle(error)
      return .stalled
    }
  }

  /// applied/duplicate/rejected знімають дію з черги; retry і відсутні в відповіді — лишаються.
  private func settle(_ batch: [DeviceAction], _ response: ActionsResponse) -> Outcome {
    let results = Dictionary(response.results.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
    var done = Set<String>()
    let now = Date()
    for action in batch {
      guard let result = results[action.id], result.isFinal else { continue }
      done.insert(action.id)
      if result.status == "rejected" {
        showToast(rejectMessage(result.reason))
      } else {
        settled.append((action, now))
      }
    }
    if !done.isEmpty { setQueue(queue.filter { !done.contains($0.id) }) }
    if let snapshot = response.snapshot { adopt(snapshot) }
    return done.isEmpty ? .stalled : .progress
  }

  private func scheduleRetry() {
    backoff = backoff == 0 ? 5 : min(backoff * 2, 300)
    let delay = backoff
    retryTask?.cancel()
    retryTask = Task { [weak self] in
      try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
      guard !Task.isCancelled, let self else { return }
      self.retryTask = nil
      self.flush(force: true)
    }
  }

  private func handle(_ error: Error) {
    guard let apiError = error as? APIError else { return }
    switch apiError {
    case .authLost(let reason, let sessionId):
      // Токен мертвий: стерти, сказати телефону чому (§6.5). Черга лишається —
      // доставиться через WC або після нового provisioning. Стираємо лише ту
      // сесію, що впала: телефон міг тим часом передати нову пару.
      guard session.wipe(ifSessionId: sessionId) else {
        hasToken = session.credentials != nil
        return
      }
      hasToken = false
      authReason = reason
      sendHello(reason: reason, force: true)
    case .noCredentials:
      hasToken = false
    default:
      break
    }
  }

  private func rejectMessage(_ reason: String?) -> String {
    switch reason {
    case "review_required": return t("Needs review in the app")
    case "forbidden": return t("Not allowed")
    case "task_done": return t("Task is already done")
    case "invalid_account": return t("Account unavailable")
    case "not_found": return t("Not found")
    case "stale": return t("Too old to sync")
    default: return t("Couldn't save")
    }
  }

  func showToast(_ message: String, success: Bool = false) {
    toast = message
    WKInterfaceDevice.current().play(success ? .success : .failure)
    Task {
      try? await Task.sleep(nanoseconds: 2_500_000_000)
      if toast == message { toast = nil }
    }
  }

  // MARK: Background refresh (WKApplicationRefreshBackgroundTask, ~15 хв)

  func scheduleBackgroundRefresh() {
    WKApplication.shared().scheduleBackgroundRefresh(
      withPreferredDate: Date(timeIntervalSinceNow: 15 * 60), userInfo: nil
    ) { _ in }
  }

  func backgroundRefresh() async {
    start()
    reloadIfNeeded()
    await flushAndWait()
    if session.credentials != nil { await fetchServerSnapshot() }
  }

  // MARK: Helpers

  static func normalizedLang(_ value: String) -> String { value.hasPrefix("en") ? "en" : "uk" }
}

private extension String {
  var nilIfEmpty: String? { isEmpty ? nil : self }
}

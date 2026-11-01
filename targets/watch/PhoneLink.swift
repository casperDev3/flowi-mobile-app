import Foundation
import WatchConnectivity

/// Відповідь телефону на `snapshotRequest` (§6.1).
enum SnapshotReply {
  case snapshot(WatchSnapshot)
  case signedOut
}

/// Одноразове відновлення continuation: відповідь, помилка або таймаут — що прийде першим.
private final class ReplyOnce: @unchecked Sendable {
  private let lock = NSLock()
  private var continuation: CheckedContinuation<[String: String]?, Never>?

  init(_ continuation: CheckedContinuation<[String: String]?, Never>) {
    self.continuation = continuation
  }

  func resume(_ value: [String: String]?) {
    lock.lock()
    let c = continuation
    continuation = nil
    lock.unlock()
    c?.resume(returning: value)
  }
}

/// WatchConnectivity з боку годинника (§6). Усі значення словників — рядки,
/// структуровані дані — JSON у `"body"`, тип — `"t"`.
final class PhoneLink: NSObject, WCSessionDelegate, @unchecked Sendable {
  /// Таймаут ack на `actions`: далі ті самі дії йдуть на сервер (§6.1).
  static let ackTimeout: TimeInterval = 3.0

  var onContext: (@MainActor ([String: String]) -> Void)?
  var onUserInfo: (@MainActor ([String: String]) -> Void)?
  var onReachability: (@MainActor (Bool) -> Void)?

  private var session: WCSession? { WCSession.isSupported() ? WCSession.default : nil }

  func activate() {
    guard let session else { return }
    session.delegate = self
    if session.activationState != .activated { session.activate() }
  }

  var isReachable: Bool {
    guard let session else { return false }
    return session.activationState == .activated && session.isReachable
  }

  // MARK: Watch → phone

  /// `actions` (≤20) через sendMessage. nil — немає ack за 3 с або помилка.
  /// `userId` — власник черги: телефон, де вже інший акаунт, не відповідає
  /// (дія не потрапить у чужі дані) — і годинник іде на сервер зі своїм токеном.
  /// `watchId` — щоб телефон не приймав дії від відкликаного годинника.
  func sendActions(_ actions: [DeviceAction], userId: String?, watchId: String) async -> ActionsResponse? {
    struct Body: Encodable { let actions: [DeviceAction]; let userId: String?; let watchId: String }
    guard let body = Self.json(Body(actions: actions, userId: userId, watchId: watchId)) else { return nil }
    guard let reply = await request(["t": "actions", "body": body], timeout: Self.ackTimeout),
          reply["t"] == "ack",
          let raw = reply["body"]?.data(using: .utf8)
    else { return nil }
    return try? JSONDecoder().decode(ActionsResponse.self, from: raw)
  }

  /// `watchId` — телефон відповідає «вийшли», якщо саме цей годинник відкликано.
  func requestSnapshot(watchId: String?) async -> SnapshotReply? {
    struct Body: Encodable { let watchId: String? }
    let body = Self.json(Body(watchId: watchId)) ?? "{}"
    guard let reply = await request(["t": "snapshotRequest", "body": body], timeout: Self.ackTimeout) else { return nil }
    switch reply["t"] {
    case "snapshot":
      guard let body = reply["body"], let snapshot = WatchSnapshot.decode(json: body) else { return nil }
      return .snapshot(snapshot)
    case "signedOut":
      return .signedOut
    default:
      return nil
    }
  }

  /// `hello`: sendMessage, коли телефон досяжний, інакше transferUserInfo (гарантована доставка, §6.2).
  func sendHello(watchId: String, hasToken: Bool, sessionId: String?, reason: String) {
    guard let session, session.activationState == .activated else { return }
    let body: [String: Any] = [
      "watchId": watchId,
      "appVersion": Self.appVersion,
      "hasToken": hasToken,
      "sessionId": sessionId ?? NSNull(),
      "reason": reason,
    ]
    guard let data = try? JSONSerialization.data(withJSONObject: body),
          let string = String(data: data, encoding: .utf8)
    else { return }
    let message: [String: Any] = ["t": "hello", "body": string]
    // Недоставлений старий hello (інша причина/стан токена) лише заплутав би
    // телефон, коли нарешті дійде, — актуальний тільки останній.
    for transfer in session.outstandingUserInfoTransfers where transfer.userInfo["t"] as? String == "hello" {
      transfer.cancel()
    }
    if session.isReachable {
      session.sendMessage(message, replyHandler: { _ in }, errorHandler: { _ in
        session.transferUserInfo(message)
      })
    } else {
      session.transferUserInfo(message)
    }
  }

  static var appVersion: String {
    Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0.0"
  }

  private func request(_ message: [String: String], timeout: TimeInterval) async -> [String: String]? {
    guard let session, isReachable else { return nil }
    return await withCheckedContinuation { (continuation: CheckedContinuation<[String: String]?, Never>) in
      let once = ReplyOnce(continuation)
      session.sendMessage(
        message,
        replyHandler: { reply in once.resume(Self.strings(reply)) },
        errorHandler: { _ in once.resume(nil) }
      )
      DispatchQueue.global().asyncAfter(deadline: .now() + timeout) { once.resume(nil) }
    }
  }

  // MARK: WCSessionDelegate

  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
    guard activationState == .activated else { return }
    let context = Self.strings(session.receivedApplicationContext)
    let reachable = session.isReachable
    Task { @MainActor in
      if !context.isEmpty { self.onContext?(context) }
      self.onReachability?(reachable)
    }
  }

  func sessionReachabilityDidChange(_ session: WCSession) {
    let reachable = session.isReachable
    Task { @MainActor in self.onReachability?(reachable) }
  }

  func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
    let context = Self.strings(applicationContext)
    Task { @MainActor in self.onContext?(context) }
  }

  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
    let info = Self.strings(userInfo)
    Task { @MainActor in self.onUserInfo?(info) }
  }

  /// `auth` телефон шле й через sendMessage, коли годинник досяжний (§6.3).
  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    let info = Self.strings(message)
    Task { @MainActor in self.onUserInfo?(info) }
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
    let info = Self.strings(message)
    replyHandler(["t": "ok"])
    Task { @MainActor in self.onUserInfo?(info) }
  }

  // MARK: Helpers

  static func strings(_ dict: [String: Any]) -> [String: String] {
    var out: [String: String] = [:]
    for (key, value) in dict {
      if let s = value as? String { out[key] = s } else if let n = value as? NSNumber { out[key] = n.stringValue }
    }
    return out
  }

  static func json<T: Encodable>(_ value: T) -> String? {
    guard let data = try? JSONEncoder().encode(value) else { return nil }
    return String(data: data, encoding: .utf8)
  }
}

import Foundation

/// Оптимістичний UI (§9): ще не підтверджені дії накладаються на кешований знімок.
/// Кожен крок ідемпотентний — якщо знімок уже містить ефект дії, нічого не змінюється,
/// тож накладання на свіжий знімок безпечне.
enum Overlay {
  static func apply(_ base: WatchSnapshot, _ actions: [DeviceAction]) -> WatchSnapshot {
    actions.reduce(base) { apply($0, $1) }
  }

  static func apply(_ snapshot: WatchSnapshot, _ action: DeviceAction) -> WatchSnapshot {
    var s = snapshot
    switch action.type {
    case ActionType.taskComplete:
      guard let taskId = action.string("taskId"),
            let index = s.tasks.firstIndex(where: { $0.id == taskId }),
            !s.tasks[index].isDone
      else { break }
      var task = s.tasks.remove(at: index)
      if let timerId = task.timerId { stopTimer(&s, timerId: timerId, at: action.atDate) }
      stopTimer(&s, timerId: "task:\(taskId)", at: action.atDate)
      task.done = true
      task.canComplete = false
      task.timerId = nil
      task.overdue = false
      // Нове виконане — на початок групи виконаних (§4: найновіші першими).
      let firstDone = s.tasks.firstIndex(where: { $0.isDone }) ?? s.tasks.count
      s.tasks.insert(task, at: firstDone)
      var counts = s.taskCounts ?? WCounts(done: 0, total: s.tasks.count)
      counts.done = min((counts.done ?? 0) + 1, counts.total ?? Int.max)
      s.taskCounts = counts

    case ActionType.taskCreate:
      guard !s.tasks.contains(where: { $0.id == action.id }), let title = action.string("title") else { break }
      let task = WTask(
        id: action.id, title: title, projectId: nil, projectName: nil,
        deadline: action.string("deadline"), hasTime: false, overdue: false, done: false,
        canComplete: true, timerId: nil, recurring: false
      )
      let firstDone = s.tasks.firstIndex(where: { $0.isDone }) ?? s.tasks.count
      s.tasks.insert(task, at: firstDone)
      var counts = s.taskCounts ?? WCounts(done: 0, total: 0)
      counts.total = (counts.total ?? 0) + 1
      s.taskCounts = counts

    case ActionType.timerStart:
      var timers = s.timers ?? WTimers()
      if action.string("kind") == "task", let taskId = action.string("taskId") {
        let timerId = "task:\(taskId)"
        guard let index = s.tasks.firstIndex(where: { $0.id == taskId }), !s.tasks[index].isDone else { break }
        if !timers.active.contains(where: { $0.id == timerId }) {
          timers.active.append(WTimer(
            id: timerId, label: s.tasks[index].title, startedAt: action.at,
            taskId: taskId, meetingId: nil, projectName: s.tasks[index].projectName
          ))
        }
        s.tasks[index].timerId = timerId
      } else if let label = action.string("label") {
        let timerId = "adhoc:\(action.id)"
        if !timers.active.contains(where: { $0.id == timerId }) {
          timers.active.append(WTimer(id: timerId, label: label, startedAt: action.at, taskId: nil, meetingId: nil, projectName: nil))
        }
        if !timers.recentLabels.contains(label) {
          timers.recentLabels = Array(([label] + timers.recentLabels).prefix(3))
        }
      }
      s.timers = timers

    case ActionType.timerStop:
      guard let timerId = action.string("timerId") else { break }
      stopTimer(&s, timerId: timerId, at: action.atDate)

    case ActionType.habitCheck:
      guard let habitId = action.string("habitId"), let done = action.bool("done"),
            let index = s.habits.firstIndex(where: { $0.id == habitId }),
            (s.habits[index].doneToday == true) != done
      else { break }
      s.habits[index].doneToday = done
      s.habits[index].streak = max(0, (s.habits[index].streak ?? 0) + (done ? 1 : -1))

    default:
      // expense_create / note_create на знімку годинника не видно.
      break
    }
    return s
  }

  private static func stopTimer(_ s: inout WatchSnapshot, timerId: String, at: Date) {
    guard var timers = s.timers, let index = timers.active.firstIndex(where: { $0.id == timerId }) else { return }
    let timer = timers.active.remove(at: index)
    let elapsed = max(0, floor(at.timeIntervalSince(timer.startDate)))
    timers.trackedTodaySec = (timers.trackedTodaySec ?? 0) + elapsed
    s.timers = timers
    if let taskId = timer.taskId, let taskIndex = s.tasks.firstIndex(where: { $0.id == taskId }) {
      s.tasks[taskIndex].timerId = nil
    }
  }
}

/// Файли в Application Support (§9): черга FIFO і кеш знімка.
enum WatchFiles {
  static let queueName = "flowi_pending_actions.json"
  static let snapshotName = "flowi_today_snapshot.json"

  /// Підміна для тестів.
  static var directoryOverride: URL?

  private static var directory: URL? {
    if let directoryOverride { return directoryOverride }
    guard let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { return nil }
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir
  }

  enum LoadResult<T> {
    case value(T)
    /// Файлу немає або вміст зіпсований — можна починати з порожнього.
    case missing
    /// Файл є, але прочитати його зараз не можна (захист даних до першого
    /// розблокування): НЕ перезаписувати, спробувати пізніше.
    case unreadable
  }

  static func read<T: Decodable>(_ type: T.Type, _ name: String) -> LoadResult<T> {
    guard let url = directory?.appendingPathComponent(name) else { return .unreadable }
    guard FileManager.default.fileExists(atPath: url.path) else { return .missing }
    guard let data = try? Data(contentsOf: url) else { return .unreadable }
    guard let value = try? JSONDecoder().decode(T.self, from: data) else { return .missing }
    return .value(value)
  }

  static func load<T: Decodable>(_ type: T.Type, _ name: String) -> T? {
    if case .value(let value) = read(type, name) { return value }
    return nil
  }

  static func save<T: Encodable>(_ value: T?, _ name: String) {
    guard let url = directory?.appendingPathComponent(name) else { return }
    guard let value, let data = try? JSONEncoder().encode(value) else {
      try? FileManager.default.removeItem(at: url)
      return
    }
    try? data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
  }
}

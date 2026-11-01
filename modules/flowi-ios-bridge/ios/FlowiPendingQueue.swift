// FlowiPendingQueue.swift — черга дій поза застосунком (watch-lockscreen-v1.md §7.3).
//
// Пише її інтент «Стоп» Live Activity (FlowiStopTimerIntent → FlowiPendingActions,
// у цілі застосунку й віджета): App Group, ОДИН КЛЮЧ НА ДІЮ —
// `flowi_pending_device_actions_v1.<id>`, значення — JSON-рядок одного DeviceAction.
// Запис/видалення окремого ключа атомарні, тож інтент і прибирання тут не
// затирають одне одного (раніше спільний масив під різними замками губив «Стоп»).
// Старий формат (масив під самим ключем) переноситься в нові ключі при читанні.
// JS бачить те саме: read() → JSON-масив, remove(ids:).
//
// Власник черги (`flowi_device_action_owner_v1`) — userId, що увійшов; інтент
// штампує його в кожну дію і без власника нічого не ставить.
import Foundation

enum FlowiPendingQueue {
  static let appGroup = "group.com.casper3.f-tracking-app"
  static let key = "flowi_pending_device_actions_v1"
  static let ownerKey = "flowi_device_action_owner_v1"
  static let darwinName = "com.casper3.f-tracking-app.pendingActions"

  private static var prefix: String { key + "." }
  private static let lock = NSLock()

  /// JSON-масив усіх дій (за `at`, далі за id); `[]`, коли нічого немає.
  static func read() -> String {
    guard let defaults = UserDefaults(suiteName: appGroup) else { return "[]" }
    lock.lock()
    defer { lock.unlock() }
    migrateLegacy(defaults)
    var entries: [[String: Any]] = []
    for (name, value) in defaults.dictionaryRepresentation() where name.hasPrefix(prefix) {
      let id = String(name.dropFirst(prefix.count))
      guard !id.isEmpty, let entry = parse(value), entry["id"] as? String == id else {
        // Битий запис ніхто інший не прибере.
        defaults.removeObject(forKey: name)
        continue
      }
      entries.append(entry)
    }
    entries.sort {
      let a = $0["at"] as? String ?? "", b = $1["at"] as? String ?? ""
      return a == b ? ($0["id"] as? String ?? "") < ($1["id"] as? String ?? "") : a < b
    }
    guard !entries.isEmpty,
          let data = try? JSONSerialization.data(withJSONObject: entries),
          let string = String(data: data, encoding: .utf8) else { return "[]" }
    return string
  }

  /// Прибрати оброблені id.
  static func remove(ids: [String]) {
    guard let defaults = UserDefaults(suiteName: appGroup) else { return }
    lock.lock()
    defer { lock.unlock() }
    migrateLegacy(defaults)
    for id in Set(ids) where !id.isEmpty {
      defaults.removeObject(forKey: prefix + id)
    }
  }

  /// Вихід / зміна акаунта чи простору: черга належала попередньому власнику.
  static func clear() {
    guard let defaults = UserDefaults(suiteName: appGroup) else { return }
    lock.lock()
    defer { lock.unlock() }
    defaults.removeObject(forKey: key)
    for name in defaults.dictionaryRepresentation().keys where name.hasPrefix(prefix) {
      defaults.removeObject(forKey: name)
    }
  }

  /// nil або порожній — ніхто не увійшов: інтент «Стоп» більше нічого не ставить.
  static func setOwner(_ userId: String?) {
    guard let defaults = UserDefaults(suiteName: appGroup) else { return }
    if let userId, !userId.isEmpty {
      defaults.set(userId, forKey: ownerKey)
    } else {
      defaults.removeObject(forKey: ownerKey)
    }
  }

  private static func parse(_ value: Any) -> [String: Any]? {
    if let entry = value as? [String: Any] { return entry }
    guard let string = value as? String, let data = string.data(using: .utf8) else { return nil }
    return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
  }

  /// Масив старого формату → окремі ключі (лише під `lock`). Старий масив пише
  /// тільки попередня версія інтенту, тож після оновлення гонки тут немає.
  private static func migrateLegacy(_ defaults: UserDefaults) {
    guard let legacy = defaults.object(forKey: key) else { return }
    var items: [Any] = []
    if let string = legacy as? String, let data = string.data(using: .utf8) {
      items = ((try? JSONSerialization.jsonObject(with: data)) as? [Any]) ?? []
    } else if let array = legacy as? [Any] {
      items = array
    }
    for item in items {
      guard let entry = item as? [String: Any], let id = entry["id"] as? String, !id.isEmpty,
            let data = try? JSONSerialization.data(withJSONObject: entry),
            let string = String(data: data, encoding: .utf8) else { continue }
      if defaults.object(forKey: prefix + id) == nil { defaults.set(string, forKey: prefix + id) }
    }
    defaults.removeObject(forKey: key)
  }
}

/// Darwin-нотифікація від інтенту → подія `onPendingActions` у JS.
final class FlowiPendingObserver {
  static let shared = FlowiPendingObserver()
  private var started = false
  private let lock = NSLock()

  func start() {
    lock.lock()
    defer { lock.unlock() }
    guard !started else { return }
    started = true
    CFNotificationCenterAddObserver(
      CFNotificationCenterGetDarwinNotifyCenter(),
      nil,
      { _, _, _, _, _ in
        FlowiBridgeEvents.shared.emit(FlowiBridgeEvents.pendingActions, [:], buffering: .none)
      },
      FlowiPendingQueue.darwinName as CFString,
      nil,
      .deliverImmediately
    )
  }
}

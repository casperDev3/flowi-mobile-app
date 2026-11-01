// FlowiStopTimerIntent.swift — SHARED CONTRACT, docs/specs/watch-lockscreen-v1.md §7.2.
// Byte-identical copies: targets/widget/, modules/flowi-ios-bridge/app-target/.
import AppIntents
import Foundation
#if canImport(ActivityKit)
import ActivityKit
#endif

enum FlowiPendingActions {
  static let appGroup = "group.com.casper3.f-tracking-app"
  /// Кожна дія — окремий ключ `<key>.<id>` зі значенням-JSON одного DeviceAction:
  /// запис одного ключа атомарний, тож інтент і прибирання в застосунку
  /// (FlowiPendingQueue) не можуть затерти одне одного (без read-modify-write).
  static let key = "flowi_pending_device_actions_v1"
  /// userId власника черги; nil — ніхто не увійшов (FlowiPendingQueue.setOwner).
  static let ownerKey = "flowi_device_action_owner_v1"
  static let darwinName = "com.casper3.f-tracking-app.pendingActions"

  /// false — дію не поставлено (немає власника: користувач вийшов).
  @discardableResult
  static func enqueueTimerStop(timerId: String, at: Date) -> Bool {
    guard let defaults = UserDefaults(suiteName: appGroup),
          let owner = defaults.string(forKey: ownerKey), !owner.isEmpty else { return false }
    let iso = ISO8601DateFormatter()
    iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let id = UUID().uuidString.lowercased()
    let entry: [String: Any] = [
      "id": id,
      "type": "timer_stop",
      "at": iso.string(from: at),
      "source": "live_activity",
      "userId": owner,
      "payload": ["timerId": timerId],
    ]
    guard let data = try? JSONSerialization.data(withJSONObject: entry),
          let string = String(data: data, encoding: .utf8) else { return false }
    defaults.set(string, forKey: "\(key).\(id)")
    CFNotificationCenterPostNotification(
      CFNotificationCenterGetDarwinNotifyCenter(),
      CFNotificationName(darwinName as CFString), nil, nil, true
    )
    return true
  }
}

@available(iOS 17.0, *)
struct FlowiStopTimerIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Stop timer"
  static var isDiscoverable: Bool = false

  @Parameter(title: "Timer ID")
  var timerId: String

  init() {}

  init(timerId: String) {
    self.timerId = timerId
  }

  func perform() async throws -> some IntentResult {
    // Без власника (вихід із акаунта) дію не ставимо — лише закриваємо активність.
    FlowiPendingActions.enqueueTimerStop(timerId: timerId, at: Date())
    #if canImport(ActivityKit)
    for activity in Activity<FlowiTimerAttributes>.activities where activity.content.state.timerId == timerId {
      await activity.end(nil, dismissalPolicy: .immediate)
    }
    #endif
    return .result()
  }
}

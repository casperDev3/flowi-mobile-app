// FlowiLiveActivityController.swift — одна Live Activity таймера (watch-lockscreen-v1.md §7.4).
//
// JS (store/live-activity.ts) каже, що показувати: найсвіжіший таймер або
// нічого. Тут — лише ActivityKit: оновити наявну, завершити зайві, запустити
// нову (ActivityKit дозволяє це, лише поки застосунок активний). Вигляд —
// targets/widget/TimerLiveActivity.swift з тим самим FlowiTimerAttributes.
//
// Гейт iOS 17: віджет-розширення, що малює активність, має deploymentTarget
// 17.0 — на 16.x її просто нікому показати.
import Foundation
import UIKit
#if canImport(ActivityKit)
import ActivityKit
#endif

enum FlowiLiveActivityController {
  static func enabled() -> Bool {
    #if canImport(ActivityKit)
    if #available(iOS 17.0, *) {
      return ActivityAuthorizationInfo().areActivitiesEnabled
    }
    #endif
    return false
  }

  /// nil — завершити всі; інакше оновити/запустити єдину.
  static func sync(_ raw: [String: Any]?) {
    #if canImport(ActivityKit)
    if #available(iOS 17.0, *) {
      let state = raw.flatMap(contentState)
      let wantsActivity = raw != nil
      // Виклики з JS ідуть один за одним: кожен чекає попередній, інакше два
      // apply() з await усередині перемежовуються (застарілий стан перезаписує
      // новий або запускаються дві активності).
      chainLock.lock()
      let previous = tail
      tail = Task { @MainActor in
        await previous?.value
        await apply(state: wantsActivity ? state : nil)
      }
      chainLock.unlock()
    }
    #endif
  }

  private static let chainLock = NSLock()
  private static var tail: Task<Void, Never>?

  /// Активність, яку застосунок довго не оновлював (таймер могли зупинити на
  /// іншому пристрої), позначається застарілою (`context.isStale` — віджет її
  /// приглушує). Кожен sync з відкритого застосунку переносить межу.
  static let staleInterval: TimeInterval = 4 * 3600

  #if canImport(ActivityKit)
  @available(iOS 17.0, *)
  @MainActor
  private static func apply(state: FlowiTimerAttributes.ContentState?) async {
    // Стан застосунку — ДО читання списку: між читанням і request не має бути
    // жодного await, інакше два виклики поспіль запустили б дві активності.
    let appActive = UIApplication.shared.applicationState == .active
    let live = Activity<FlowiTimerAttributes>.activities.filter {
      $0.activityState == .active || $0.activityState == .stale
    }
    guard let state = state else {
      for activity in live { await activity.end(nil, dismissalPolicy: .immediate) }
      return
    }
    let content = ActivityContent(state: state, staleDate: Date().addingTimeInterval(staleInterval))
    if let first = live.first {
      for extra in live.dropFirst() { await extra.end(nil, dismissalPolicy: .immediate) }
      await first.update(content)
      return
    }
    guard appActive, ActivityAuthorizationInfo().areActivitiesEnabled else { return }
    do {
      _ = try Activity<FlowiTimerAttributes>.request(
        attributes: FlowiTimerAttributes(),
        content: content,
        pushType: nil
      )
    } catch {
      NSLog("[FlowiIosBridge] Live Activity request failed: \(error.localizedDescription)")
    }
  }

  @available(iOS 17.0, *)
  private static func contentState(_ raw: [String: Any]) -> FlowiTimerAttributes.ContentState? {
    guard let timerId = raw["timerId"] as? String, !timerId.isEmpty,
          let startedAtMs = (raw["startedAtMs"] as? NSNumber)?.doubleValue else { return nil }
    let label = raw["label"] as? String ?? ""
    let projectName = raw["projectName"] as? String
    let colorHex = raw["colorHex"] as? String
    let otherCount = (raw["otherCount"] as? NSNumber)?.intValue ?? 0
    let lang = (raw["lang"] as? String) == "en" ? "en" : "uk"
    return FlowiTimerAttributes.ContentState(
      timerId: timerId,
      label: label,
      startedAt: Date(timeIntervalSince1970: startedAtMs / 1000),
      projectName: projectName?.isEmpty == false ? projectName : nil,
      colorHex: colorHex?.isEmpty == false ? colorHex : nil,
      otherCount: max(0, otherCount),
      lang: lang
    )
  }
  #endif
}

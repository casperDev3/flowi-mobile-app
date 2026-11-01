import SwiftUI
import WatchConnectivity
import WatchKit

/// Фонові завдання: WKApplicationRefreshBackgroundTask (~15 хв) доставляє чергу
/// й оновлює знімок із сервера (§9).
final class FlowiWatchDelegate: NSObject, WKApplicationDelegate {
  func applicationDidFinishLaunching() {
    Task { @MainActor in WatchStore.shared.start() }
  }

  func handle(_ backgroundTasks: Set<WKRefreshBackgroundTask>) {
    for task in backgroundTasks {
      switch task {
      case let refresh as WKApplicationRefreshBackgroundTask:
        Task { @MainActor in
          await WatchStore.shared.backgroundRefresh()
          WatchStore.shared.scheduleBackgroundRefresh()
          refresh.setTaskCompletedWithSnapshot(false)
        }
      case let connectivity as WKWatchConnectivityRefreshBackgroundTask:
        // Дати WCSession доставити контекст/userInfo (поки hasContentPending),
        // тоді закрити завдання; стеля — щоб не вичерпати фоновий бюджет.
        Task { @MainActor in
          WatchStore.shared.start()
          await Self.waitForPendingContent(cap: 15)
          connectivity.setTaskCompletedWithSnapshot(false)
        }
      default:
        task.setTaskCompletedWithSnapshot(false)
      }
    }
  }
}

extension FlowiWatchDelegate {
  /// Чекає, доки WCSession віддасть усе, що чекає доставки (`hasContentPending`
  /// false), але не довше `cap` секунд; потім коротка пауза, щоб делегат
  /// встиг передати отримане в WatchStore (main actor).
  @MainActor
  static func waitForPendingContent(cap: TimeInterval) async {
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    let deadline = Date().addingTimeInterval(cap)
    // Сесія ще активується — hasContentPending до того не має сенсу.
    while session.activationState != .activated, Date() < deadline {
      try? await Task.sleep(nanoseconds: 100_000_000)
    }
    while session.hasContentPending, Date() < deadline {
      try? await Task.sleep(nanoseconds: 200_000_000)
    }
    try? await Task.sleep(nanoseconds: 300_000_000)
  }
}

@main
struct FlowiWatchApp: App {
  @WKApplicationDelegateAdaptor(FlowiWatchDelegate.self) private var delegate
  @ObservedObject private var store = WatchStore.shared
  @Environment(\.scenePhase) private var scenePhase

  var body: some Scene {
    WindowGroup {
      RootView()
        .environmentObject(store)
        .environment(\.locale, L10n.locale(store.lang))
    }
    .onChange(of: scenePhase) { _, phase in
      if phase == .active { store.becameActive() }
    }
  }
}

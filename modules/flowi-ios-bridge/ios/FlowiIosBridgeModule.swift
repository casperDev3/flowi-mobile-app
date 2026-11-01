// FlowiIosBridgeModule.swift — JS API мосту (modules/flowi-ios-bridge/index.ts,
// watch-lockscreen-v1.md §7.1).
import ExpoModulesCore

public class FlowiIosBridgeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("FlowiIosBridge")

    Events(
      FlowiBridgeEvents.watchMessage,
      FlowiBridgeEvents.watchUserInfo,
      FlowiBridgeEvents.watchState,
      FlowiBridgeEvents.pendingActions
    )

    OnCreate {
      // Підписник AppDelegate уже активував сесію; повторний виклик — no-op,
      // але рятує запуск, де підписника не зареєстровано (тести, Expo Go).
      FlowiWatchSession.shared.activate()
      FlowiPendingObserver.shared.start()
      FlowiBridgeEvents.shared.setSender { [weak self] name, body in
        self?.sendEvent(name, body.mapValues { $0 as Any? })
      }
    }

    OnDestroy {
      FlowiBridgeEvents.shared.setSender(nil)
    }

    OnStartObserving(FlowiBridgeEvents.watchMessage) {
      FlowiBridgeEvents.shared.setObserved(FlowiBridgeEvents.watchMessage, true)
    }
    OnStopObserving(FlowiBridgeEvents.watchMessage) {
      FlowiBridgeEvents.shared.setObserved(FlowiBridgeEvents.watchMessage, false)
    }
    OnStartObserving(FlowiBridgeEvents.watchUserInfo) {
      FlowiBridgeEvents.shared.setObserved(FlowiBridgeEvents.watchUserInfo, true)
    }
    OnStopObserving(FlowiBridgeEvents.watchUserInfo) {
      FlowiBridgeEvents.shared.setObserved(FlowiBridgeEvents.watchUserInfo, false)
    }
    OnStartObserving(FlowiBridgeEvents.watchState) {
      FlowiBridgeEvents.shared.setObserved(FlowiBridgeEvents.watchState, true)
    }
    OnStopObserving(FlowiBridgeEvents.watchState) {
      FlowiBridgeEvents.shared.setObserved(FlowiBridgeEvents.watchState, false)
    }
    OnStartObserving(FlowiBridgeEvents.pendingActions) {
      FlowiBridgeEvents.shared.setObserved(FlowiBridgeEvents.pendingActions, true)
    }
    OnStopObserving(FlowiBridgeEvents.pendingActions) {
      FlowiBridgeEvents.shared.setObserved(FlowiBridgeEvents.pendingActions, false)
    }

    // ─── WatchConnectivity ──────────────────────────────────────────────────

    Function("getWatchState") { () -> [String: Any] in
      FlowiWatchSession.shared.state()
    }

    Function("updateWatchContext") { (context: [String: String]) in
      FlowiWatchSession.shared.updateContext(context)
    }

    Function("transferToWatch") { (info: [String: String]) in
      FlowiWatchSession.shared.transfer(info)
    }

    Function("sendToWatch") { (info: [String: String]) in
      FlowiWatchSession.shared.send(info)
    }

    Function("replyToWatch") { (requestId: String, reply: [String: String]) in
      FlowiWatchSession.shared.reply(requestId: requestId, reply: reply)
    }

    // ─── Live Activity ──────────────────────────────────────────────────────

    Function("liveActivitiesEnabled") { () -> Bool in
      FlowiLiveActivityController.enabled()
    }

    Function("liveActivitySync") { (state: [String: Any]?) in
      FlowiLiveActivityController.sync(state)
    }

    // ─── Черга дій поза застосунком ─────────────────────────────────────────

    Function("readPendingActions") { () -> String in
      FlowiPendingQueue.read()
    }

    Function("removePendingActions") { (ids: [String]) in
      FlowiPendingQueue.remove(ids: ids)
    }

    Function("clearPendingActions") {
      FlowiPendingQueue.clear()
    }

    Function("setDeviceActionOwner") { (userId: String?) in
      FlowiPendingQueue.setOwner(userId)
    }
  }
}

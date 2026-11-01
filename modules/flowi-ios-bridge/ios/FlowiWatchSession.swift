// FlowiWatchSession.swift — WCSession телефона (watch-lockscreen-v1.md §6).
//
// Активується в didFinishLaunching (FlowiIosBridgeAppDelegate), щоб годинник
// міг розбудити застосунок у фоні. Протокол — словники лише з рядками;
// структуровані дані — JSON у "body".
//
// `sendMessage` з годинника приходить з replyHandler. Обробник живе тут під
// requestId, доки JS не відповість (`replyToWatch`), але не довше за 2.5 с:
// годинник чекає 3 с і далі сам іде на сервер, тож пізня відповідь лише
// заплутала б його чергу.
import Foundation
#if canImport(WatchConnectivity)
import WatchConnectivity
#endif

final class FlowiWatchSession: NSObject {
  static let shared = FlowiWatchSession()
  static let replyTimeout: TimeInterval = 2.5

  private let queue = DispatchQueue(label: "com.casper3.f-tracking-app.watch-session")
  private var replies: [String: ([String: Any]) -> Void] = [:]

  #if canImport(WatchConnectivity)
  private var session: WCSession? {
    WCSession.isSupported() ? WCSession.default : nil
  }
  #endif

  func activate() {
    #if canImport(WatchConnectivity)
    guard let session = session else { return }
    if session.delegate == nil { session.delegate = self }
    if session.activationState != .activated { session.activate() }
    #endif
  }

  func state() -> [String: Any] {
    #if canImport(WatchConnectivity)
    guard let session = session else { return Self.noWatch }
    let activated = session.activationState == .activated
    return [
      "supported": true,
      "paired": activated && session.isPaired,
      "installed": activated && session.isWatchAppInstalled,
      "reachable": activated && session.isReachable,
      "activated": activated,
    ]
    #else
    return Self.noWatch
    #endif
  }

  private static let noWatch: [String: Any] = [
    "supported": false, "paired": false, "installed": false, "reachable": false, "activated": false,
  ]

  func updateContext(_ context: [String: String]) {
    #if canImport(WatchConnectivity)
    guard let session = session, session.activationState == .activated,
          session.isPaired, session.isWatchAppInstalled else { return }
    do {
      try session.updateApplicationContext(context)
    } catch {
      NSLog("[FlowiIosBridge] updateApplicationContext failed: \(error.localizedDescription)")
    }
    #endif
  }

  func transfer(_ info: [String: String]) {
    #if canImport(WatchConnectivity)
    guard let session = session, session.activationState == .activated,
          session.isPaired, session.isWatchAppInstalled else { return }
    session.transferUserInfo(info)
    #endif
  }

  func send(_ message: [String: String]) {
    #if canImport(WatchConnectivity)
    guard let session = session, session.activationState == .activated, session.isReachable else { return }
    session.sendMessage(message, replyHandler: nil, errorHandler: { error in
      NSLog("[FlowiIosBridge] sendMessage failed: \(error.localizedDescription)")
    })
    #endif
  }

  /// Відповідь JS на повідомлення з requestId. Прострочене — тихо ігнорується.
  func reply(requestId: String, reply: [String: String]) {
    var handler: (([String: Any]) -> Void)?
    queue.sync { handler = replies.removeValue(forKey: requestId) }
    handler?(reply)
  }

  fileprivate func register(reply handler: @escaping ([String: Any]) -> Void) -> String {
    let requestId = UUID().uuidString.lowercased()
    queue.sync { replies[requestId] = handler }
    queue.asyncAfter(deadline: .now() + Self.replyTimeout) { [weak self] in
      // Без відповіді — без відповіді: годинник сам вирішить, що «ack» немає.
      _ = self?.replies.removeValue(forKey: requestId)
    }
    return requestId
  }

  fileprivate func emitState() {
    FlowiBridgeEvents.shared.emit(FlowiBridgeEvents.watchState, state(), buffering: .none)
  }

  fileprivate static func strings(_ dictionary: [String: Any]) -> [String: String] {
    var out: [String: String] = [:]
    for (key, value) in dictionary {
      if let string = value as? String { out[key] = string }
    }
    return out
  }
}

#if canImport(WatchConnectivity)
extension FlowiWatchSession: WCSessionDelegate {
  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
    if let error = error { NSLog("[FlowiIosBridge] WCSession activation failed: \(error.localizedDescription)") }
    emitState()
  }

  func sessionDidBecomeInactive(_ session: WCSession) {}

  func sessionDidDeactivate(_ session: WCSession) {
    // Перемикання на інший годинник: нова сесія потребує нової активації.
    session.activate()
  }

  func sessionWatchStateDidChange(_ session: WCSession) {
    emitState()
  }

  func sessionReachabilityDidChange(_ session: WCSession) {
    emitState()
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
    let requestId = register(reply: replyHandler)
    FlowiBridgeEvents.shared.emit(
      FlowiBridgeEvents.watchMessage,
      ["requestId": requestId, "message": Self.strings(message)],
      buffering: .expiring(Self.replyTimeout)
    )
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    FlowiBridgeEvents.shared.emit(
      FlowiBridgeEvents.watchMessage,
      ["requestId": "", "message": Self.strings(message)],
      buffering: .expiring(Self.replyTimeout)
    )
  }

  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
    FlowiBridgeEvents.shared.emit(
      FlowiBridgeEvents.watchUserInfo,
      ["info": Self.strings(userInfo)],
      buffering: .keep
    )
  }
}
#endif

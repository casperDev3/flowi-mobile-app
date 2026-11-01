// FlowiIosBridgeAppDelegate.swift — підписник AppDelegate (expo-module.config.json).
//
// WCSession має бути активна вже в didFinishLaunching: годинник може
// розбудити застосунок у фоні повідомленням чи userInfo ще до того, як
// завантажиться JS. Darwin-спостерігач черги — з тієї ж причини: «Стоп» у
// Live Activity виконується в процесі застосунку, можливо, без живого JS.
import ExpoModulesCore
import UIKit

public class FlowiIosBridgeAppDelegate: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    FlowiWatchSession.shared.activate()
    FlowiPendingObserver.shared.start()
    return true
  }
}

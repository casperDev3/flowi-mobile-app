// FlowiTimerAttributes.swift — SHARED CONTRACT, docs/specs/watch-lockscreen-v1.md §7.2.
// Byte-identical copies: targets/widget/, modules/flowi-ios-bridge/ios/, modules/flowi-ios-bridge/app-target/.
#if canImport(ActivityKit)
import ActivityKit
import Foundation

@available(iOS 16.1, *)
public struct FlowiTimerAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    public var timerId: String
    public var label: String
    public var startedAt: Date
    public var projectName: String?
    public var colorHex: String?
    public var otherCount: Int
    public var lang: String

    public init(timerId: String, label: String, startedAt: Date, projectName: String?,
                colorHex: String?, otherCount: Int, lang: String) {
      self.timerId = timerId
      self.label = label
      self.startedAt = startedAt
      self.projectName = projectName
      self.colorHex = colorHex
      self.otherCount = otherCount
      self.lang = lang
    }
  }

  public var kind: String

  public init(kind: String = "timer") {
    self.kind = kind
  }
}
#endif

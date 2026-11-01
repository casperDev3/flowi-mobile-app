#if canImport(ActivityKit)
import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

/// Live Activity таймера (spec §7.4): заблокований екран + Dynamic Island.
/// Стан пише застосунок (modules/flowi-ios-bridge → liveActivitySync); кнопка
/// «Зупинити» — FlowiStopTimerIntent, що кладе timer_stop у чергу App Group.
struct TimerLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: FlowiTimerAttributes.self) { context in
      TimerLockScreenView(state: context.state)
        // Застосунок давно не оновлював активність (staleDate з
        // FlowiLiveActivityController) — стан міг змінитись деінде.
        .opacity(context.isStale ? 0.6 : 1)
        .activityBackgroundTint(FlowiColor.background.opacity(0.92))
        .activitySystemActionForegroundColor(FlowiTimerStyle.color(context.state))
        .widgetURL(FlowiLinks.time)
    } dynamicIsland: { context in
      let state = context.state
      let s = FlowiStrings(lang: state.lang)
      let color = FlowiTimerStyle.color(state)
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          VStack(alignment: .leading, spacing: 2) {
            Text(FlowiTimerStyle.label(state, s))
              .font(.system(size: 15, weight: .semibold))
              .lineLimit(1)
            if let project = state.projectName, !project.isEmpty {
              Text(project)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(color)
                .lineLimit(1)
            }
          }
          .padding(.leading, 4)
        }
        DynamicIslandExpandedRegion(.trailing) {
          Text(state.startedAt, style: .timer)
            .font(.system(size: 22, weight: .bold, design: .rounded).monospacedDigit())
            .foregroundStyle(color)
            .multilineTextAlignment(.trailing)
            .frame(maxWidth: 110, alignment: .trailing)
            .padding(.trailing, 4)
        }
        DynamicIslandExpandedRegion(.bottom) {
          HStack {
            if state.otherCount > 0 {
              Text(s.more(state.otherCount))
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
            TimerStopButton(state: state, strings: s, color: color)
          }
          .padding(.horizontal, 4)
        }
      } compactLeading: {
        Circle()
          .fill(color)
          .frame(width: 10, height: 10)
          .padding(.leading, 2)
      } compactTrailing: {
        Text(state.startedAt, style: .timer)
          .font(.system(size: 13, weight: .semibold).monospacedDigit())
          .foregroundStyle(color)
          .multilineTextAlignment(.trailing)
          .frame(maxWidth: 56)
      } minimal: {
        Image(systemName: "timer")
          .foregroundStyle(color)
      }
      .widgetURL(FlowiLinks.time)
      .keylineTint(color)
    }
  }
}

enum FlowiTimerStyle {
  static let defaultHex = "#6366F1"

  static func color(_ state: FlowiTimerAttributes.ContentState) -> Color {
    Color(flowiHex: state.colorHex) ?? Color(flowiHex: defaultHex)!
  }

  static func label(_ state: FlowiTimerAttributes.ContentState, _ s: FlowiStrings) -> String {
    state.label.isEmpty ? s.timer : state.label
  }
}

struct TimerStopButton: View {
  let state: FlowiTimerAttributes.ContentState
  let strings: FlowiStrings
  let color: Color

  var body: some View {
    Button(intent: FlowiStopTimerIntent(timerId: state.timerId)) {
      Label(strings.stop, systemImage: "stop.fill")
        .font(.system(size: 14, weight: .semibold))
        .labelStyle(.titleAndIcon)
    }
    .buttonStyle(.borderedProminent)
    .tint(color)
    .accessibilityLabel(strings.stopTimer)
  }
}

struct TimerLockScreenView: View {
  let state: FlowiTimerAttributes.ContentState

  var body: some View {
    let s = FlowiStrings(lang: state.lang)
    let color = FlowiTimerStyle.color(state)
    HStack(alignment: .center, spacing: 12) {
      ZStack {
        Circle().fill(color.opacity(0.18))
        Image(systemName: "timer")
          .font(.system(size: 18, weight: .semibold))
          .foregroundStyle(color)
      }
      .frame(width: 40, height: 40)

      VStack(alignment: .leading, spacing: 2) {
        Text(FlowiTimerStyle.label(state, s))
          .font(.system(size: 15, weight: .semibold))
          .foregroundStyle(.primary)
          .lineLimit(1)
        HStack(spacing: 6) {
          if let project = state.projectName, !project.isEmpty {
            Text(project)
              .font(.system(size: 12, weight: .medium))
              .foregroundStyle(color)
              .lineLimit(1)
          }
          if state.otherCount > 0 {
            Text(s.more(state.otherCount))
              .font(.system(size: 12, weight: .medium))
              .foregroundStyle(.secondary)
              .lineLimit(1)
          }
        }
        Text(state.startedAt, style: .timer)
          .font(.system(size: 24, weight: .bold, design: .rounded).monospacedDigit())
          .foregroundStyle(.primary)
      }

      Spacer(minLength: 0)

      TimerStopButton(state: state, strings: s, color: color)
    }
    .padding(16)
  }
}

extension Color {
  /// `#RRGGBB` або `RRGGBB`; nil — порожньо чи невалідно.
  init?(flowiHex hex: String?) {
    guard var text = hex?.trimmingCharacters(in: .whitespaces), !text.isEmpty else { return nil }
    if text.hasPrefix("#") { text.removeFirst() }
    guard text.count == 6, let value = UInt32(text, radix: 16) else { return nil }
    self.init(
      red: Double((value >> 16) & 0xFF) / 255,
      green: Double((value >> 8) & 0xFF) / 255,
      blue: Double(value & 0xFF) / 255
    )
  }
}
#endif

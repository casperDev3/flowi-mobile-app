import SwiftUI
import WidgetKit

// MARK: - Lock screen: швидкий запис нотатки
//
// Віджет екрана блокування (accessory-сімейства): один тап → застосунок
// відкриває міні-аркуш «Нова нотатка» поверх поточного екрана
// (deep link `ftrackingapp:///notes?capture=1`, перехоплює
// app/+native-intent.tsx). Даних не показує — лише дію, тож таймлайн
// статичний; мова — та, що обрана в застосунку (snapshot.lang).

struct CaptureEntry: TimelineEntry {
  let date: Date
  let lang: String
}

struct CaptureProvider: TimelineProvider {
  func placeholder(in context: Context) -> CaptureEntry {
    CaptureEntry(date: Date(), lang: FlowiSnapshot.deviceLang)
  }

  func getSnapshot(in context: Context, completion: @escaping (CaptureEntry) -> Void) {
    completion(makeEntry())
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<CaptureEntry>) -> Void) {
    // Оновлюватись нема чого, крім мови: застосунок і так перезавантажує
    // таймлайни, коли пише новий знімок (WidgetCenter.reloadAllTimelines).
    completion(Timeline(entries: [makeEntry()], policy: .never))
  }

  private func makeEntry() -> CaptureEntry {
    CaptureEntry(date: Date(), lang: FlowiSnapshot.load()?.lang ?? FlowiSnapshot.deviceLang)
  }
}

struct CaptureWidgetView: View {
  @Environment(\.widgetFamily) private var family
  let entry: CaptureEntry

  var body: some View {
    let strings = FlowiStrings(lang: entry.lang)
    Group {
      switch family {
      case .accessoryRectangular:
        HStack(spacing: 8) {
          Image(systemName: FlowiAction.note.symbol)
            .font(.system(size: 20, weight: .semibold))
            .widgetAccentable()
          VStack(alignment: .leading, spacing: 1) {
            Text(strings.newNote)
              .font(.system(size: 15, weight: .bold))
              .lineLimit(1)
              .minimumScaleFactor(0.8)
            Text("Flowi")
              .font(.system(size: 12, weight: .medium))
              .foregroundStyle(.secondary)
              .lineLimit(1)
          }
          Spacer(minLength: 0)
        }
      case .accessoryInline:
        Label(strings.newNote, systemImage: FlowiAction.note.symbol)
      default:
        ZStack {
          AccessoryWidgetBackground()
          Image(systemName: FlowiAction.note.symbol)
            .font(.system(size: 22, weight: .semibold))
            .widgetAccentable()
        }
        .accessibilityLabel(Text(strings.newNote))
      }
    }
    .widgetURL(FlowiLinks.noteCapture)
    .containerBackground(Color.clear, for: .widget)
  }
}

struct FlowiCaptureWidget: Widget {
  let kind = "FlowiCaptureWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: CaptureProvider()) { entry in
      CaptureWidgetView(entry: entry)
    }
    .configurationDisplayName("Нова нотатка")
    .description("Швидкий запис нотатки з екрана блокування.")
    .supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryInline])
  }
}

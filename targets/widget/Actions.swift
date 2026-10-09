import AppIntents
import SwiftUI
import WidgetKit

/// Рядки віджета. Мова — та, що обрана в застосунку (snapshot.lang), а не
/// мова пристрою; без знімка — мова пристрою. Українська — типова.
struct FlowiStrings {
  let lang: String
  private var en: Bool { lang == "en" }

  var addTask: String { en ? "Add task" : "Додати завдання" }
  var addExpense: String { en ? "Add expense" : "Додати витрату" }
  var addEvent: String { en ? "Add event" : "Додати подію" }
  var addNote: String { en ? "Take a note" : "Зробити нотатку" }
  var finance: String { en ? "Finance" : "Фінанси" }
  var steps: String { en ? "Steps" : "Кроки" }
  var tasks: String { en ? "Tasks" : "Завдання" }
  var time: String { en ? "Time" : "Час" }
  var today: String { en ? "Today" : "Сьогодні" }
  var running: String { en ? "Running" : "Йде" }
  var ofGoal: String { en ? "of" : "з" }
  var signedOut: String { en ? "Sign in to Flowi" : "Увійдіть у Flowi" }
  var hoursShort: String { en ? "h" : "г" }
  var minutesShort: String { en ? "m" : "хв" }
  var thousandShort: String { en ? "k" : "тис" }

  var locale: Locale { Locale(identifier: en ? "en_US" : "uk_UA") }
}

/// Чотири дії віджета. rawValue — стабільний ідентифікатор у конфігурації.
enum FlowiAction: String, AppEnum, CaseIterable {
  case task
  case expense
  case event
  case note

  static let typeDisplayRepresentation: TypeDisplayRepresentation = TypeDisplayRepresentation(name: "Дія")
  static let caseDisplayRepresentations: [FlowiAction: DisplayRepresentation] = [
    .task: DisplayRepresentation(title: "Завдання"),
    .expense: DisplayRepresentation(title: "Витрата"),
    .event: DisplayRepresentation(title: "Подія"),
    .note: DisplayRepresentation(title: "Нотатка"),
  ]

  /// Deep link застосунку (схема ftrackingapp, expo-router).
  var url: URL {
    switch self {
    case .task: return URL(string: "ftrackingapp:///?create=1")!
    case .expense: return URL(string: "ftrackingapp:///explore?create=1")!
    case .event: return URL(string: "ftrackingapp:///calendar?create=meeting")!
    case .note: return URL(string: "ftrackingapp:///notes?create=1")!
    }
  }

  var symbol: String {
    switch self {
    case .task: return "checkmark.circle.fill"
    case .expense: return "creditcard.fill"
    case .event: return "calendar.badge.plus"
    case .note: return "square.and.pencil"
    }
  }

  var tint: Color {
    switch self {
    case .task: return Color(red: 0x63 / 255, green: 0x66 / 255, blue: 0xF1 / 255)   // #6366F1
    case .expense: return Color(red: 0xEF / 255, green: 0x44 / 255, blue: 0x44 / 255) // #EF4444
    case .event: return Color(red: 0x0E / 255, green: 0xA5 / 255, blue: 0xE9 / 255)   // #0EA5E9
    case .note: return Color(red: 0x7C / 255, green: 0x3A / 255, blue: 0xED / 255)    // #7C3AED
    }
  }

  func title(_ s: FlowiStrings) -> String {
    switch self {
    case .task: return s.addTask
    case .expense: return s.addExpense
    case .event: return s.addEvent
    case .note: return s.addNote
    }
  }
}

/// Конфігурація віджета (довге натискання → «Змінити віджет»). Параметр
/// показується лише для малого розміру — на середньому й великому чотири дії
/// фіксовані.
struct FlowiWidgetIntent: WidgetConfigurationIntent {
  static let title: LocalizedStringResource = "Віджет Flowi"
  static let description = IntentDescription("Оберіть дію для малого віджета.")

  @Parameter(title: "Дія", default: .task)
  var action: FlowiAction

  init() {}

  init(action: FlowiAction) {
    self.action = action
  }

  static var parameterSummary: some ParameterSummary {
    When(widgetFamily: .equalTo, .systemSmall) {
      Summary { \.$action }
    } otherwise: {
      Summary()
    }
  }
}

enum FlowiLinks {
  static let finance = URL(string: "ftrackingapp:///explore")!
  static let steps = URL(string: "ftrackingapp:///health-activity")!
  static let tasks = URL(string: "ftrackingapp:///")!
  static let time = URL(string: "ftrackingapp:///time")!
}

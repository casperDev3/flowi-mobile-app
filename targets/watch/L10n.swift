import Foundation

/// Рядки з `{uk,en}.lproj/Localizable.strings` (ключ — англійський текст) за мовою
/// застосунку (`lang` зі знімка/контексту), а не мовою годинника (§13.3). Типова — uk.
enum L10n {
  static func bundle(_ lang: String) -> Bundle {
    for code in [lang, "uk"] {
      if let path = Bundle.main.path(forResource: code, ofType: "lproj"), let bundle = Bundle(path: path) {
        return bundle
      }
    }
    return .main
  }

  static func string(_ key: String, lang: String) -> String {
    bundle(lang).localizedString(forKey: key, value: key, table: nil)
  }

  static func locale(_ lang: String) -> Locale {
    Locale(identifier: lang == "en" ? "en_US" : "uk_UA")
  }

  /// «2 г 15 хв» / «2h 15m».
  static func duration(_ seconds: Double, lang: String) -> String {
    let total = max(0, Int(seconds))
    let hours = total / 3600
    let minutes = (total % 3600) / 60
    if hours > 0 { return String(format: string("%dh %dm", lang: lang), hours, minutes) }
    return String(format: string("%dm", lang: lang), minutes)
  }
}

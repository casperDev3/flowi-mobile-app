import Foundation
import Security

/// Токени окремої сесії годинника (kind=watch, §6.5). Їх видає телефон через
/// WatchConnectivity (`auth`); на годиннику немає входу. Телефон токенів не зберігає.
struct WatchCredentials: Codable, Equatable {
  var access: String
  var refresh: String
  var sessionId: String
  var apiBase: String
  var userId: String
  var lang: String?
  var issuedAt: String?
}

/// Keychain годинника (service `com.casper3.f-tracking-app.watch`).
enum Keychain {
  static let service = "com.casper3.f-tracking-app.watch"

  private static func query(_ account: String) -> [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
  }

  /// Результат читання: «немає» і «зараз не прочитати» — різні речі. До першого
  /// розблокування після перезавантаження Keychain повертає
  /// errSecInteractionNotAllowed — це НЕ «немає запису».
  enum ReadResult {
    case found(Data)
    case notFound
    case unavailable(OSStatus)
  }

  /// Підміна для тестів (harness без справжнього Keychain).
  static var copyMatching: (CFDictionary, UnsafeMutablePointer<CFTypeRef?>?) -> OSStatus = SecItemCopyMatching

  static func read(_ account: String) -> ReadResult {
    var q = query(account)
    q[kSecReturnData as String] = true
    q[kSecMatchLimit as String] = kSecMatchLimitOne
    var out: CFTypeRef?
    let status = copyMatching(q as CFDictionary, &out)
    switch status {
    case errSecSuccess:
      guard let data = out as? Data else { return .notFound }
      return .found(data)
    case errSecItemNotFound:
      return .notFound
    default:
      return .unavailable(status)
    }
  }

  @discardableResult
  static func write(_ account: String, _ data: Data) -> Bool {
    let q = query(account)
    // Доступ після першого розблокування — потрібен для фонового оновлення.
    let attrs: [String: Any] = [
      kSecValueData as String: data,
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
    ]
    let status = SecItemUpdate(q as CFDictionary, attrs as CFDictionary)
    if status == errSecItemNotFound {
      var add = q
      attrs.forEach { add[$0.key] = $0.value }
      return SecItemAdd(add as CFDictionary, nil) == errSecSuccess
    }
    return status == errSecSuccess
  }

  static func delete(_ account: String) {
    SecItemDelete(query(account) as CFDictionary)
  }
}

/// Потокобезпечне сховище токенів і `watchId`.
///
/// Keychain, недоступний до першого розблокування, — стан «невідомо»: нічого не
/// кешуємо, не генеруємо й не пишемо, а повторюємо читання при наступному зверненні.
final class SessionStore: @unchecked Sendable {
  private static let credentialsAccount = "credentials"
  private static let watchIdAccount = "watchId"

  private let lock = NSLock()
  private var cached: WatchCredentials?
  /// false — Keychain ще не вдалося прочитати (до першого розблокування).
  private var loaded = false
  private var cachedWatchId: String?

  init() {
    lock.lock(); defer { lock.unlock() }
    loadLocked()
  }

  private func loadLocked() {
    guard !loaded else { return }
    switch Keychain.read(Self.credentialsAccount) {
    case .found(let data):
      cached = try? JSONDecoder().decode(WatchCredentials.self, from: data)
      loaded = true
    case .notFound:
      cached = nil
      loaded = true
    case .unavailable:
      cached = nil
    }
  }

  /// nil — токенів немає АБО Keychain ще недоступний (див. `isKnown`).
  var credentials: WatchCredentials? {
    lock.lock(); defer { lock.unlock() }
    loadLocked()
    return cached
  }

  /// true — стан токенів відомий (Keychain прочитано).
  var isKnown: Bool {
    lock.lock(); defer { lock.unlock() }
    loadLocked()
    return loaded
  }

  func save(_ credentials: WatchCredentials?) {
    lock.lock(); defer { lock.unlock() }
    saveLocked(credentials)
  }

  private func saveLocked(_ credentials: WatchCredentials?) {
    cached = credentials
    loaded = true
    if let credentials, let data = try? JSONEncoder().encode(credentials) {
      Keychain.write(Self.credentialsAccount, data)
    } else {
      Keychain.delete(Self.credentialsAccount)
    }
  }

  /// Ротація: зберігаємо обидва токени, але лише якщо сесія та сама
  /// (телефон міг тим часом передати нову пару). Перевірка й запис — під
  /// одним замком, щоб паралельний `save` нової пари не затерся старою.
  func rotate(sessionId: String, access: String, refresh: String?) {
    lock.lock(); defer { lock.unlock() }
    loadLocked()
    guard var current = cached, current.sessionId == sessionId else { return }
    current.access = access
    if let refresh, !refresh.isEmpty { current.refresh = refresh }
    saveLocked(current)
  }

  func wipe() { save(nil) }

  /// Стерти, лише якщо досі діє сесія `sessionId` (не нова пара від телефону).
  @discardableResult
  func wipe(ifSessionId sessionId: String) -> Bool {
    lock.lock(); defer { lock.unlock() }
    loadLocked()
    guard let cached, cached.sessionId == sessionId else { return false }
    saveLocked(nil)
    return true
  }

  /// UUID інсталяції годинника, генерується один раз (§1). nil — Keychain
  /// зараз недоступний: НЕ генеруємо новий (інакше телефон побачив би «інший» годинник).
  var watchId: String? {
    lock.lock(); defer { lock.unlock() }
    if let cachedWatchId { return cachedWatchId }
    switch Keychain.read(Self.watchIdAccount) {
    case .found(let data):
      if let id = String(data: data, encoding: .utf8), !id.isEmpty {
        cachedWatchId = id
        return id
      }
    case .notFound:
      break
    case .unavailable:
      return nil
    }
    let id = UUID().uuidString.lowercased()
    guard Keychain.write(Self.watchIdAccount, Data(id.utf8)) else { return nil }
    cachedWatchId = id
    return id
  }
}

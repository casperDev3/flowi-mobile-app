import Foundation

enum APIError: Error {
  /// Токенів немає — дію лишаємо в черзі й шлемо телефону `hello`.
  case noCredentials
  /// Refresh відхилено: `revoked` (code session_revoked) або `expired`;
  /// `sessionId` — сесія, що впала (стирати лише її).
  case authLost(String, sessionId: String)
  /// Під час refresh телефон передав нову пару (інша сесія): запит НЕ
  /// повторюємо під нею — дію спробуємо знову звичайним шляхом.
  case sessionChanged
  case http(Int, String?)
  case network
  case decoding
}

/// Клієнт серверного шляху годинника (§5.4, §6.5).
actor FlowiAPI {
  static let clientHeader = "watch/1.0.0 (watchos)"

  private let session: SessionStore
  private let urlSession: URLSession
  private var refreshTask: Task<Void, Error>?

  init(session: SessionStore) {
    self.session = session
    let config = URLSessionConfiguration.default
    config.timeoutIntervalForRequest = 20
    config.waitsForConnectivity = false
    urlSession = URLSession(configuration: config)
  }

  // MARK: Endpoints

  /// GET {apiBase}/watch/today/?tz=
  func today(tz: String) async throws -> WatchSnapshot {
    let data = try await authorized { creds in
      var components = URLComponents(string: Self.url(creds.apiBase, "/watch/today/"))
      components?.queryItems = [URLQueryItem(name: "tz", value: tz)]
      guard let url = components?.url else { throw APIError.decoding }
      return URLRequest(url: url)
    }
    guard let snapshot = try? JSONDecoder().decode(WatchSnapshot.self, from: data) else { throw APIError.decoding }
    return snapshot
  }

  /// POST {apiBase}/watch/actions/ — ідемпотентний пакет (≤50).
  func postActions(watchId: String, actions: [DeviceAction]) async throws -> ActionsResponse {
    struct Body: Encodable {
      let watch_id: String
      let actions: [DeviceAction]
    }
    let body = try JSONEncoder().encode(Body(watch_id: watchId, actions: actions))
    let data = try await authorized { creds in
      guard let url = URL(string: Self.url(creds.apiBase, "/watch/actions/")) else { throw APIError.decoding }
      var request = URLRequest(url: url)
      request.httpMethod = "POST"
      request.httpBody = body
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      return request
    }
    guard let response = try? JSONDecoder().decode(ActionsResponse.self, from: data) else { throw APIError.decoding }
    return response
  }

  // MARK: Plumbing

  static func url(_ base: String, _ path: String) -> String {
    var trimmed = base
    while trimmed.hasSuffix("/") { trimmed.removeLast() }
    return trimmed + path
  }

  /// Запит з Bearer; 401 → один refresh із ротацією → повтор.
  private func authorized(_ build: (WatchCredentials) throws -> URLRequest) async throws -> Data {
    guard let creds = session.credentials else { throw APIError.noCredentials }
    let (data, status) = try await perform(try build(creds), access: creds.access)
    if status == 401 {
      try await refresh(using: creds)
      guard let fresh = session.credentials else { throw APIError.noCredentials }
      guard fresh.sessionId == creds.sessionId else { throw APIError.sessionChanged }
      let (retryData, retryStatus) = try await perform(try build(fresh), access: fresh.access)
      if retryStatus == 401 {
        throw APIError.authLost(Self.errorCode(retryData) == "session_revoked" ? "revoked" : "expired",
                                sessionId: fresh.sessionId)
      }
      return try Self.check(retryData, retryStatus)
    }
    return try Self.check(data, status)
  }

  private func perform(_ request: URLRequest, access: String?) async throws -> (Data, Int) {
    var request = request
    request.setValue(Self.clientHeader, forHTTPHeaderField: "X-Flowi-Client")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    if let access { request.setValue("Bearer \(access)", forHTTPHeaderField: "Authorization") }
    do {
      let (data, response) = try await urlSession.data(for: request)
      return (data, (response as? HTTPURLResponse)?.statusCode ?? 0)
    } catch {
      throw APIError.network
    }
  }

  private static func check(_ data: Data, _ status: Int) throws -> Data {
    if (200..<300).contains(status) { return data }
    let code = errorCode(data)
    if status == 403 && code == "watch_scope" {
      // Помилка клієнта: годинник звернувся поза /api/watch/* (§6.5) — лише лог.
      print("[FlowiWatch] 403 watch_scope")
    }
    throw APIError.http(status, code)
  }

  /// `{code, detail}` (§5); DRF може загорнути значення в масив.
  static func errorCode(_ data: Data) -> String? {
    guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
    if let code = object["code"] as? String { return code }
    if let codes = object["code"] as? [String] { return codes.first }
    if let detail = object["detail"] as? [String: Any], let code = detail["code"] as? String { return code }
    return nil
  }

  /// Один спільний refresh на всі паралельні запити.
  private func refresh(using creds: WatchCredentials) async throws {
    if let refreshTask { return try await refreshTask.value }
    let task = Task { try await self.performRefresh(creds) }
    refreshTask = task
    defer { refreshTask = nil }
    try await task.value
  }

  private func performRefresh(_ creds: WatchCredentials) async throws {
    // Телефон міг уже передати нову пару — тоді рефрешити нічого.
    if let current = session.credentials, current.access != creds.access { return }
    guard let url = URL(string: Self.url(creds.apiBase, "/auth/refresh/")) else { throw APIError.decoding }
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONSerialization.data(withJSONObject: ["refresh": creds.refresh])
    let (data, status) = try await perform(request, access: nil)
    if status == 401 || status == 400 {
      throw APIError.authLost(Self.errorCode(data) == "session_revoked" ? "revoked" : "expired",
                              sessionId: creds.sessionId)
    }
    guard (200..<300).contains(status),
          let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let access = object["access"] as? String
    else { throw APIError.http(status, Self.errorCode(data)) }
    session.rotate(sessionId: creds.sessionId, access: access, refresh: object["refresh"] as? String)
  }
}

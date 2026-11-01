// FlowiBridgeEvents.swift — доставка подій моста в JS (watch-lockscreen-v1.md §7.1).
//
// Годинник може розбудити застосунок раніше, ніж JS підпишеться на події.
// Повідомлення з відповіддю (`sendMessage`) тримаються в буфері не довше за
// 2.5 с — далі їхній replyHandler усе одно скинуто, і годинник уже пішов на
// сервер. userInfo (гарантована доставка, лише `hello`) чекає JS без строку,
// але не більше 50 штук. Стан годинника й сигнал черги не буферизуються:
// JS сам читає їх на старті.
import Foundation

final class FlowiBridgeEvents {
  static let shared = FlowiBridgeEvents()

  static let watchMessage = "onWatchMessage"
  static let watchUserInfo = "onWatchUserInfo"
  static let watchState = "onWatchState"
  static let pendingActions = "onPendingActions"

  enum Buffering {
    case none
    case expiring(TimeInterval)
    case keep
  }

  private struct Buffered {
    let name: String
    let body: [String: Any]
    let expiresAt: Date?
  }

  private let lock = NSLock()
  private var sender: ((String, [String: Any]) -> Void)?
  private var observed = Set<String>()
  private var buffer: [Buffered] = []
  private let maxBuffered = 50

  /// Модуль створено — є куди слати.
  func setSender(_ sender: ((String, [String: Any]) -> Void)?) {
    lock.lock()
    self.sender = sender
    lock.unlock()
    flush()
  }

  func setObserved(_ name: String, _ isObserved: Bool) {
    lock.lock()
    if isObserved { observed.insert(name) } else { observed.remove(name) }
    lock.unlock()
    if isObserved { flush() }
  }

  func emit(_ name: String, _ body: [String: Any], buffering: Buffering) {
    lock.lock()
    let target = observed.contains(name) ? sender : nil
    if target == nil {
      switch buffering {
      case .none:
        break
      case .expiring(let ttl):
        buffer.append(Buffered(name: name, body: body, expiresAt: Date().addingTimeInterval(ttl)))
      case .keep:
        buffer.append(Buffered(name: name, body: body, expiresAt: nil))
      }
      if buffer.count > maxBuffered { buffer.removeFirst(buffer.count - maxBuffered) }
    }
    lock.unlock()
    target?(name, body)
  }

  private func flush() {
    lock.lock()
    guard let sender = sender else {
      lock.unlock()
      return
    }
    let now = Date()
    var ready: [Buffered] = []
    var rest: [Buffered] = []
    for item in buffer {
      if let expiresAt = item.expiresAt, expiresAt < now { continue }
      if observed.contains(item.name) { ready.append(item) } else { rest.append(item) }
    }
    buffer = rest
    lock.unlock()
    for item in ready { sender(item.name, item.body) }
  }
}

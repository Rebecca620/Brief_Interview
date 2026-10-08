import Foundation

/// Save before terminating, without entering AppKit's termination modal run loop.
/// A stalled WebKit callback must not trap the app in an unresponsive quit state.
@MainActor final class QuitCoordinator {
  private(set) var approved = false
  private var attempt: UUID?
  private var timeout: DispatchWorkItem?
  private var resolving = false

  func request(
    timeoutSeconds: Double = 5,
    flush: @escaping (@escaping (Bool) -> Void) -> Void,
    confirmUnsavedQuit: @escaping () -> Bool,
    terminate: @escaping () -> Void
  ) {
    guard attempt == nil, !approved else { return }
    let id = UUID()
    attempt = id
    let finish: (Bool) -> Void = { [weak self] saved in
      guard let self, self.attempt == id, !self.resolving else { return }
      self.resolving = true
      self.timeout?.cancel()
      self.timeout = nil
      // Keep this attempt active while a recovery prompt is open.
      let shouldQuit = saved || confirmUnsavedQuit()
      self.attempt = nil
      self.resolving = false
      if shouldQuit {
        self.approved = true
        terminate()
      }
    }
    let timer = DispatchWorkItem { finish(false) }
    timeout = timer
    DispatchQueue.main.asyncAfter(deadline: .now() + timeoutSeconds, execute: timer)
    // Let applicationShouldTerminate return .terminateCancel first so WebKit
    // and its storage requests continue on the normal application run loop.
    DispatchQueue.main.async { flush(finish) }
  }
}

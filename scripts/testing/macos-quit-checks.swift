import Foundation

@main struct QuitChecks {
  @MainActor static func waitFor(_ condition: () -> Bool) async throws {
    let limit = Date().addingTimeInterval(2)
    while !condition(), Date() < limit { try await Task.sleep(nanoseconds: 10_000_000) }
    precondition(condition(), "Quit check timed out")
  }
  @MainActor static func main() async throws {
    let success = QuitCoordinator()
    var exits = 0
    var prompts = 0
    success.request(
      flush: { $0(true) },
      confirmUnsavedQuit: {
        prompts += 1
        return false
      }, terminate: { exits += 1 })
    precondition(exits == 0, "Must return from termination delegate before flushing")
    try await waitFor { exits == 1 }
    precondition(success.approved && prompts == 0)

    let failure = QuitCoordinator()
    var stale: ((Bool) -> Void)?
    failure.request(
      flush: {
        stale = $0
        $0(false)
      },
      confirmUnsavedQuit: {
        prompts += 1
        return false
      }, terminate: { exits += 1 })
    try await waitFor { prompts == 1 }
    precondition(!failure.approved && exits == 1, "Keep working must cancel quit")
    stale?(true)
    precondition(exits == 1, "Stale callback must not terminate")
    failure.request(flush: { $0(true) }, confirmUnsavedQuit: { false }, terminate: { exits += 1 })
    try await waitFor { exits == 2 }

    let stalled = QuitCoordinator()
    var late: ((Bool) -> Void)?
    var flushes = 0
    let flush: (@escaping (Bool) -> Void) -> Void = {
      flushes += 1
      late = $0
    }
    stalled.request(
      timeoutSeconds: 0.05, flush: flush,
      confirmUnsavedQuit: {
        prompts += 1
        late?(true)  // A nested modal run loop may deliver a late WebKit reply.
        precondition(exits == 2, "Late reply must not dismiss the user's recovery choice")
        return false
      }, terminate: { exits += 1 })
    stalled.request(flush: flush, confirmUnsavedQuit: { true }, terminate: { exits += 1 })
    try await waitFor { prompts == 2 }
    precondition(flushes == 1 && !stalled.approved && exits == 2)
    stalled.request(flush: { $0(false) }, confirmUnsavedQuit: { true }, terminate: { exits += 1 })
    try await waitFor { exits == 3 }
    precondition(stalled.approved)
    print(
      "PASS: saved quit, failed-save cancellation/retry, timeout recovery, repeated requests, late callbacks, explicit quit anyway"
    )
  }
}

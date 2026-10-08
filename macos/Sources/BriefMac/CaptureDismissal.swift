import AppKit

/// Observe only while capture is visible. Finder remains usable as the drag source.
@MainActor final class CaptureDismissal {
  private var localMonitor: Any?
  private var globalMonitor: Any?
  private var activationObserver: NSObjectProtocol?

  func start(panel: NSWindow, reportWindow: NSWindow, close: @escaping () -> Void) {
    stop()
    localMonitor = NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) {
      event in
      // Native pickers and capture controls remain usable. A report-window click dismisses capture.
      if event.window === reportWindow { close() }
      return event
    }
    globalMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseUp, .rightMouseUp]) {
      _ in
      // Mouse-up observes the destination app after activation, and does not interrupt a drag.
      guard !panel.frame.contains(NSEvent.mouseLocation) else { return }
      if NSWorkspace.shared.frontmostApplication?.bundleIdentifier != "com.apple.finder" {
        close()
      }
    }
    activationObserver = NSWorkspace.shared.notificationCenter.addObserver(
      forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main
    ) { notification in
      guard
        let app = notification.userInfo?[NSWorkspace.applicationUserInfoKey]
          as? NSRunningApplication,
        app.processIdentifier != ProcessInfo.processInfo.processIdentifier,
        app.bundleIdentifier != "com.apple.finder"
      else { return }
      close()
    }
  }

  func stop() {
    if let localMonitor { NSEvent.removeMonitor(localMonitor) }
    if let globalMonitor { NSEvent.removeMonitor(globalMonitor) }
    if let activationObserver {
      NSWorkspace.shared.notificationCenter.removeObserver(activationObserver)
    }
    localMonitor = nil
    globalMonitor = nil
    activationObserver = nil
  }
}

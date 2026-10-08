import AppKit
import SwiftUI

@MainActor final class AppDelegate: NSObject, NSApplicationDelegate, NSPopoverDelegate {
  var statusItem: NSStatusItem!
  var popover: NSPopover!
  var model: CaptureModel!
  var reportWindow: ReportWindow!
  private let quitCoordinator = QuitCoordinator()
  private let captureDismissal = CaptureDismissal()
  func applicationDidFinishLaunching(_ notification: Notification) {
    do {
      let args = CommandLine.arguments
      let root: URL
      if let index = args.firstIndex(of: "--data-dir"), args.count > index + 1 {
        root = URL(fileURLWithPath: args[index + 1])
      } else {
        root = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
          .appendingPathComponent("BriefPOC")
      }
      let store = try LocalStore(directory: root)
      guard let assets = Bundle.main.resourceURL?.appendingPathComponent("Web"),
        FileManager.default.fileExists(atPath: assets.appendingPathComponent("index.html").path)
      else {
        throw BriefError.message(
          "Bundled report engine is missing. Run scripts/build-macos.sh first.")
      }
      model = CaptureModel(store: store)
      reportWindow = ReportWindow(model: model, root: assets)
      model.generateAction = { [weak self] in
        self?.reportWindow.generate()
      }
      model.openAction = { [weak self] id in
        self?.reportWindow.show(id: id)
      }
      model.closeAction = { [weak self] in
        self?.model.persist()
        self?.popover.performClose(nil)
      }
      popover = NSPopover()
      popover.delegate = self
      // Collection spans other apps: clicking Finder must not dismiss the target.
      popover.behavior = .applicationDefined
      popover.contentViewController = NSHostingController(rootView: CaptureView(model: model))
      statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
      if let button = statusItem.button {
        button.image = NSImage(systemSymbolName: "doc.text", accessibilityDescription: "Brief")
        button.toolTip = "Brief — drop project material or click to capture"
        button.target = self
        button.action = #selector(toggleCapture)
        let target = StatusDropTarget(frame: button.bounds)
        target.autoresizingMask = [.width, .height]
        target.onClick = { [weak self] in self?.toggleCapture() }
        target.onDrop = { [weak self] board in
          guard let self, !self.model.processing else { return }
          if let urls = board.readObjects(
            forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true]) as? [URL],
            !urls.isEmpty
          {
            self.model.add(urls: urls)
          } else if let text = board.string(forType: .string),
            self.model.notes.utf8.count + text.utf8.count < 2 * 1024 * 1024
          {
            self.model.notes += (self.model.notes.isEmpty ? "" : "\n\n") + text
          }
          self.showCapture()
        }
        button.addSubview(target)
      }
      installMenu()
      if args.contains("--smoke-test") {
        reportWindow.onReady = { [weak self] in self?.runSmokeTest() }
      } else {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { self.showCapture() }
      }
    } catch {
      let alert = NSAlert()
      alert.messageText = "Brief could not start"
      alert.informativeText = error.localizedDescription
      alert.runModal()
      NSApp.terminate(nil)
    }
  }
  @objc func toggleCapture() {
    if popover.isShown { popover.performClose(nil) } else { showCapture() }
  }
  func showCapture() {
    guard let button = statusItem.button else { return }
    // Leave space for the popover arrow and screen edges. A bounded scroll view
    // absorbs extra files/errors instead of allowing the panel to grow offscreen.
    let screen = button.window?.screen ?? NSScreen.main
    let available = max(240, (screen?.visibleFrame.height ?? 700) - 40)
    model.panelHeight = min(600, available)
    popover.contentSize = NSSize(width: 420, height: model.panelHeight)
    NSApp.activate(ignoringOtherApps: true)
    popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
    if let window = popover.contentViewController?.view.window {
      window.hidesOnDeactivate = false
      window.level = .floating
      window.makeKey()
      captureDismissal.start(panel: window, reportWindow: reportWindow.window) { [weak self] in
        self?.model.persist()
        self?.popover.performClose(nil)
      }
    }
  }
  func popoverDidClose(_ notification: Notification) { captureDismissal.stop() }
  func applicationWillTerminate(_ notification: Notification) { captureDismissal.stop() }
  func installMenu() {
    let menu = NSMenu()
    let app = NSMenuItem()
    let appMenu = NSMenu()
    app.submenu = appMenu
    appMenu.addItem(
      withTitle: "Capture in Brief", action: #selector(toggleCapture), keyEquivalent: ""
    ).target = self
    appMenu.addItem(
      withTitle: "Quit Brief", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
    appMenu.insertItem(
      withTitle: "Settings…", action: #selector(openSettings), keyEquivalent: ",", at: 0
    ).target = self
    menu.addItem(app)
    let file = NSMenuItem()
    file.title = "File"
    let fileMenu = NSMenu(title: "File")
    file.submenu = fileMenu
    for (name, action, key) in [
      ("New Report", #selector(newReport), "n"), ("My Reports", #selector(openLibrary), "o"),
      ("Share…", #selector(shareReport), ""), ("Export…", #selector(exportReport), "e"),
    ] {
      fileMenu.addItem(withTitle: name, action: action, keyEquivalent: key).target = self
    }
    menu.addItem(file)
    let edit = NSMenuItem()
    edit.title = "Edit"
    let editMenu = NSMenu(title: "Edit")
    edit.submenu = editMenu
    editMenu.addItem(withTitle: "Undo", action: #selector(undoEdit), keyEquivalent: "z").target =
      self
    let redo = editMenu.addItem(withTitle: "Redo", action: #selector(redoEdit), keyEquivalent: "z")
    redo.keyEquivalentModifierMask = [.command, .shift]
    redo.target = self
    editMenu.addItem(.separator())
    for (name, selector, key) in [
      ("Cut", "cut:", "x"), ("Copy", "copy:", "c"),
      ("Paste", "paste:", "v"), ("Select All", "selectAll:", "a"),
    ] { editMenu.addItem(withTitle: name, action: Selector(selector), keyEquivalent: key) }
    menu.addItem(edit)
    let windowItem = NSMenuItem()
    windowItem.title = "Window"
    let windowMenu = NSMenu(title: "Window")
    windowItem.submenu = windowMenu
    windowMenu.addItem(
      withTitle: "Report Workspace", action: #selector(openLibrary), keyEquivalent: "0"
    ).target = self
    windowMenu.addItem(
      withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
    menu.addItem(windowItem)
    NSApp.windowsMenu = windowMenu
    NSApp.mainMenu = menu
  }
  @objc func undoEdit() {
    if reportWindow.window.isKeyWindow {
      reportWindow.command("undo")
    } else {
      NSApp.sendAction(Selector(("undo:")), to: nil, from: self)
    }
  }
  @objc func redoEdit() {
    if reportWindow.window.isKeyWindow {
      reportWindow.command("redo")
    } else {
      NSApp.sendAction(Selector(("redo:")), to: nil, from: self)
    }
  }
  @objc func newReport() { reportWindow.command("new") }
  @objc func openLibrary() { reportWindow.command("library") }
  @objc func openSettings() { reportWindow.command("settings") }
  @objc func shareReport() { reportWindow.command("share") }
  @objc func exportReport() { reportWindow.command("export") }
  func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
    if quitCoordinator.approved { return .terminateNow }
    popover?.performClose(nil)
    if model?.processing == true {
      let alert = NSAlert()
      alert.messageText = "A report is being prepared"
      alert.informativeText = "Your captured files are saved. Quit and finish the report next time?"
      alert.addButton(withTitle: "Keep working")
      alert.addButton(withTitle: "Quit")
      if alert.runModal() == .alertFirstButtonReturn { return .terminateCancel }
    }
    model?.flushCapture()
    guard model?.ready == true else { return .terminateNow }
    quitCoordinator.request(
      flush: { [weak self] complete in
        self?.reportWindow.webView.callAsyncJavaScript(
          "return await window.briefFlush()", arguments: [:], in: nil, in: .page
        ) { result in
          if case .success(let value) = result {
            complete(value as? Bool == true)
          } else {
            complete(false)
          }
        }
      },
      confirmUnsavedQuit: { [weak self] in
        self?.reportWindow.show()
        let alert = NSAlert()
        alert.messageText = "Brief could not confirm the latest save"
        alert.informativeText =
          "The report editor did not confirm saving. Keep working to export a backup, or quit anyway. Changes since the last successful save may be lost."
        alert.addButton(withTitle: "Keep working")
        alert.addButton(withTitle: "Quit anyway")
        return alert.runModal() == .alertSecondButtonReturn
      },
      terminate: { sender.terminate(nil) })
    return .terminateCancel
  }
  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
  private func runSmokeTest() {
    reportWindow.onReady = nil
    let data =
      "[{\"date\":\"2026-09-01\",\"completed\":0},{\"date\":\"2026-09-02\",\"completed\":20}]"
    let payload: [String: Any] = [
      "title": "Native smoke test",
      "notes": "Progress: Native capture works.\n\nNext steps: Review the report.",
      "destination": "", "template": "retrospective",
      "files": [
        [
          "name": "metrics.json", "type": "application/json",
          "data": Data(data.utf8).base64EncodedString(),
        ]
      ],
    ]
    reportWindow.webView.callAsyncJavaScript(
      """
      const before = window.briefReportCount();
      const result = await window.briefCapture(payload);
      const appended = await window.briefCapture({...payload, destination: result.reportId, notes: '',
        files: [{name: 'follow-up.txt', type: 'text/plain', data: btoa('Next steps: Verify the appended document.')}]});
      return {result, appended, before, after: window.briefReportCount(),
        headings: document.querySelectorAll('#cards h3').length, secure: window.isSecureContext, flushed: await window.briefFlush()};
      """,
      arguments: ["payload": payload], in: nil, in: .page
    ) { [weak self] result in
      guard let self else { return }
      var output: [String: Any] = [:]
      switch result {
      case .success(let value):
        output = value as? [String: Any] ?? [:]
        if let appended = output["appended"] as? [String: Any] {
          self.model.completed(appended)
          output["destinationRetained"] = self.model.destination == appended["reportId"] as? String
        }
        output["persisted"] =
          (try? self.model.store.read("brief-manifest-v3")) != nil
      case .failure(let error): output = ["error": error.localizedDescription]
      }
      if let data = try? JSONSerialization.data(withJSONObject: output, options: [.prettyPrinted]),
        let path = ProcessInfo.processInfo.environment["BRIEF_SMOKE_OUTPUT"]
      {
        try? data.write(to: URL(fileURLWithPath: path))
      }
      NSApp.terminate(nil)
    }
  }
}

final class StatusDropTarget: NSView {
  var onClick: (() -> Void)?
  var onDrop: ((NSPasteboard) -> Void)?
  override init(frame frameRect: NSRect) {
    super.init(frame: frameRect)
    registerForDraggedTypes([.fileURL, .string])
    setAccessibilityElement(true)
    setAccessibilityRole(.button)
    setAccessibilityLabel("Brief capture")
  }
  required init?(coder: NSCoder) { fatalError("Not used") }
  override func mouseDown(with event: NSEvent) { onClick?() }
  override func accessibilityPerformPress() -> Bool {
    onClick?()
    return true
  }
  override func draggingEntered(_ sender: NSDraggingInfo) -> NSDragOperation { .copy }
  override func performDragOperation(_ sender: NSDraggingInfo) -> Bool {
    onDrop?(sender.draggingPasteboard)
    return true
  }
}

@main struct BriefApplication {
  @MainActor static func main() {
    let app = NSApplication.shared
    let delegate = AppDelegate()
    app.delegate = delegate
    app.setActivationPolicy(.accessory)
    withExtendedLifetime(delegate) { app.run() }
  }
}

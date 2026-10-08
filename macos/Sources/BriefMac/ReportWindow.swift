import AppKit
import WebKit

@MainActor
final class ReportWindow: NSObject, WKScriptMessageHandlerWithReply, WKNavigationDelegate,
  WKUIDelegate, NSWindowDelegate
{
  let model: CaptureModel
  let store: LocalStore
  let server: AssetServer
  private(set) var webView: WKWebView!
  private(set) var window: NSWindow!
  private var origin: URL?
  private var shares: [SharePresentation] = []
  private var printers: [PrintPresentation] = []
  var onReady: (() -> Void)?
  init(model: CaptureModel, root: URL) {
    self.model = model
    self.store = model.store
    self.server = AssetServer(root: root, store: model.store)
    super.init()
    let config = WKWebViewConfiguration()
    config.websiteDataStore = .nonPersistent()
    config.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "brief")
    let token = server.token
    let bootstrap = """
      window.briefHost = {
        send: (action, payload) => window.webkit.messageHandlers.brief.postMessage({action, payload}),
        storage: {
          async getItem(key) {
            const response = await fetch('/native/storage?key=' + encodeURIComponent(key), {headers: {'X-Brief-Native': '\(token)'}});
            if (!response.ok) throw Error('Saved reports could not be read. Existing files are preserved.');
            return (await response.json()).value;
          },
          async setItem(key, value) {
            const response = await fetch('/native/storage', {method:'POST', headers:{'X-Brief-Native':'\(token)', 'Content-Type':'application/json'}, body:JSON.stringify({key,value})});
            if (!response.ok) throw Error('The latest changes could not be saved. Export a backup and retry.');
          },
          async batch(writes, expected) {
            const response = await fetch('/native/batch', {method:'POST', headers:{'X-Brief-Native':'\(token)', 'Content-Type':'application/json'}, body:JSON.stringify({writes,expected})});
            if (!response.ok) throw Error((await response.json()).error || 'Local save failed. Export a backup and retry.');
          }
        }

      };
      """
    config.userContentController.addUserScript(
      WKUserScript(source: bootstrap, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    webView = WKWebView(frame: .zero, configuration: config)
    webView.navigationDelegate = self
    webView.uiDelegate = self
    window = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 1180, height: 820),
      styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false
    )
    window.title = "Brief — Report workspace"
    window.minSize = NSSize(width: 760, height: 560)
    window.contentView = webView
    window.isReleasedWhenClosed = false
    window.delegate = self
    window.center()
    do {
      try server.start { [weak self] result in
        DispatchQueue.main.async {
          guard let self else { return }
          switch result {
          case .success(let url):
            self.origin = url
            self.webView.load(URLRequest(url: url))
          case .failure(let error):
            self.model.error = "Could not start Brief: \(error.localizedDescription)"
          }
        }
      }
    } catch { model.error = error.localizedDescription }
  }
  func show(id: String? = nil) {
    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
    if let id, model.ready {
      webView.callAsyncJavaScript(
        "window.briefOpenReport(id)", arguments: ["id": id], in: nil, in: .page
      ) { _ in }
    }
  }
  func command(_ name: String) {
    show()
    webView.callAsyncJavaScript(
      "window.briefCommand(command)", arguments: ["command": name], in: nil, in: .page
    ) { _ in }
  }
  func generate() {
    guard model.canGenerate else { return }
    model.processing = true
    model.error = ""
    model.status = "Building locally. Any ambiguous data will open for review."
    show()
    webView.callAsyncJavaScript(
      "return await window.briefCapture(payload)", arguments: ["payload": model.payload], in: nil,
      in: .page
    ) { [weak self] result in
      guard let self else { return }
      switch result {
      case .success(let value): self.model.completed(value as? [String: Any] ?? [:])
      case .failure(let error):
        self.model.processing = false
        self.model.error = error.localizedDescription
        self.model.status = "Capture kept. Resolve the issue and try again."
      }
    }
  }
  func windowShouldClose(_ sender: NSWindow) -> Bool {
    sender.orderOut(nil)
    return false
  }
  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    model.ready = false
    model.processing = false
    model.error =
      "The report engine stopped. Your saved reports and capture are kept. Reopen Brief to continue."
  }
  func webView(
    _ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!,
    withError error: Error
  ) { model.error = "Report engine: \(error.localizedDescription)" }
  func webView(
    _ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
    decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
  ) {
    guard let url = navigationAction.request.url else {
      decisionHandler(.cancel)
      return
    }
    if url.host == "127.0.0.1", url.port == origin?.port {
      decisionHandler(.allow)
      return
    }
    if navigationAction.navigationType == .linkActivated,
      ["https", "http", "mailto"].contains(url.scheme ?? "")
    {
      NSWorkspace.shared.open(url)
    }
    decisionHandler(.cancel)
  }
  func webView(
    _ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
    for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures
  ) -> WKWebView? {
    if let url = navigationAction.request.url,
      ["https", "http", "mailto"].contains(url.scheme ?? ""), url.host != "127.0.0.1"
    {
      NSWorkspace.shared.open(url)
    }
    return nil
  }
  func webView(
    _ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
    initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void
  ) {
    let panel = NSOpenPanel()
    panel.allowsMultipleSelection = parameters.allowsMultipleSelection
    panel.canChooseDirectories = false
    panel.beginSheetModal(for: window) { response in
      completionHandler(response == .OK ? panel.urls : nil)
    }
  }
  func userContentController(
    _ userContentController: WKUserContentController, didReceive message: WKScriptMessage,
    replyHandler: @escaping (Any?, String?) -> Void
  ) {
    guard message.frameInfo.isMainFrame, message.frameInfo.securityOrigin.host == "127.0.0.1",
      message.frameInfo.securityOrigin.port == origin?.port,
      let object = message.body as? [String: Any], let action = object["action"] as? String,
      let payload = object["payload"] as? [String: Any]
    else {
      replyHandler(nil, "Untrusted host request.")
      return
    }
    switch action {
    case "ready":
      model.ready = true
      replyHandler(["ok": true], nil)
      onReady?()
    case "reports":
      model.reports = (payload["reports"] as? [[String: Any]] ?? []).compactMap { row in
        guard let id = row["id"] as? String, let title = row["title"] as? String,
          let count = row["count"] as? Int
        else { return nil }
        return RecentReport(id: id, title: title, count: count)
      }
      if !model.destination.isEmpty
        && !model.reports.contains(where: { $0.id == model.destination })
      {
        model.destination = ""
      }
      replyHandler(["ok": true], nil)
    case "title":
      window.title = "\(payload["title"] as? String ?? "My reports") — Brief"
      replyHandler(["ok": true], nil)
    case "copy":
      NSPasteboard.general.clearContents()
      NSPasteboard.general.setString(payload["text"] as? String ?? "", forType: .string)
      if let html = payload["html"] as? String {
        NSPasteboard.general.setString(html, forType: .html)
      }
      replyHandler(["copied": true], nil)
    case "saveFile": save(payload, reply: replyHandler)
    case "share": share(payload, reply: replyHandler)
    case "print":
      guard let html = payload["html"] as? String, html.utf8.count <= 20 * 1024 * 1024 else {
        replyHandler(nil, "Invalid print document.")
        return
      }
      let presentation = PrintPresentation(
        html: html, parent: window, title: payload["title"] as? String ?? "Brief report")
      printers.append(presentation)
      presentation.start { [weak self, weak presentation] in
        self?.printers.removeAll { $0 === presentation }
      }
      replyHandler(["opened": true], nil)
    default: replyHandler(nil, "Unsupported host action.")
    }
  }
  private func decodeFile(_ file: [String: Any], maximumMB: Int = 20) throws -> (String, Data) {
    guard let name = file["name"] as? String, let encoded = file["data"] as? String,
      encoded.utf8.count <= (maximumMB * 4 / 3 + 1) * 1024 * 1024,
      let data = Data(base64Encoded: encoded), data.count <= maximumMB * 1024 * 1024
    else { throw BriefError.message("Invalid or oversized file.") }
    let safeName = URL(fileURLWithPath: name).lastPathComponent
    guard !safeName.isEmpty, safeName != ".", safeName != ".." else {
      throw BriefError.message("Invalid filename.")
    }
    return (safeName, data)
  }
  private func save(_ payload: [String: Any], reply: @escaping (Any?, String?) -> Void) {
    do {
      let (name, data) = try decodeFile(
        payload, maximumMB: payload["type"] as? String == "application/json" ? 256 : 20)
      let panel = NSSavePanel()
      panel.nameFieldStringValue = name
      panel.canCreateDirectories = true
      show()
      panel.beginSheetModal(for: window) { response in
        guard response == .OK, let url = panel.url else {
          reply(["saved": false], nil)
          return
        }
        do {
          try data.write(to: url, options: .atomic)
          reply(["saved": true], nil)
        } catch { reply(nil, error.localizedDescription) }
      }
    } catch { reply(nil, error.localizedDescription) }
  }
  private func share(_ payload: [String: Any], reply: @escaping (Any?, String?) -> Void) {
    do {
      var items: [Any] = []
      let files = payload["files"] as? [[String: Any]] ?? []
      guard files.count <= 12 else { throw BriefError.message("Share at most 12 files.") }
      if !files.isEmpty {
        let directory = store.directory.appendingPathComponent("ShareCache/\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        for file in files {
          let (name, data) = try decodeFile(file)
          let url = directory.appendingPathComponent(name)
          try data.write(to: url, options: .atomic)
          items.append(url)
        }
      } else if let text = payload["text"] as? String {
        items.append(text)
      }
      guard !items.isEmpty else { throw BriefError.message("Nothing to share.") }
      let presentation = SharePresentation(
        items: items, title: payload["title"] as? String ?? "", anchor: webView,
        position: payload["anchor"] as? [String: Double])
      shares.append(presentation)
      presentation.show { [weak self, weak presentation] status in
        reply(["status": status], nil)
        self?.shares.removeAll { $0 === presentation }
      }
    } catch { reply(nil, error.localizedDescription) }
  }
}

@MainActor final class SharePresentation: NSObject, @preconcurrency NSSharingServicePickerDelegate {
  private let picker: NSSharingServicePicker
  private let anchor: NSView
  private let title: String
  private let position: [String: Double]?
  private var complete: ((String) -> Void)?
  init(items: [Any], title: String, anchor: NSView, position: [String: Double]? = nil) {
    picker = NSSharingServicePicker(items: items)
    self.anchor = anchor
    self.position = position
    self.title = title
    super.init()
    picker.delegate = self
  }
  func show(completion: @escaping (String) -> Void) {
    complete = completion
    picker.show(
      relativeTo: NSRect(
        x: position?["x"] ?? anchor.bounds.midX,
        y: anchor.isFlipped
          ? (position?["y"] ?? 40) : anchor.bounds.height - (position?["y"] ?? 40), width: 1,
        height: 1),
      of: anchor, preferredEdge: .minY)
  }
  func sharingServicePicker(
    _ sharingServicePicker: NSSharingServicePicker, didChoose service: NSSharingService?
  ) {
    service?.subject = title
    complete?(service == nil ? "cancelled" : "handed-off")
    complete = nil
  }
}

@MainActor final class PrintPresentation: NSObject, WKNavigationDelegate {
  private let web = WKWebView(frame: NSRect(x: 0, y: 0, width: 794, height: 1123))
  private let html: String
  private let parent: NSWindow
  private let title: String
  private var complete: (() -> Void)?
  init(html: String, parent: NSWindow, title: String) {
    self.html = html
    self.parent = parent
    self.title = title
    super.init()
    web.navigationDelegate = self
  }
  func start(completion: @escaping () -> Void) {
    complete = completion
    web.loadHTMLString(html, baseURL: nil)
  }
  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    webView.callAsyncJavaScript(
      "await Promise.all(Array.from(document.images).map(i => i.decode().catch(() => {})))",
      arguments: [:], in: nil, in: .page
    ) { [weak self] _ in
      guard let self else { return }
      let info = NSPrintInfo.shared.copy() as! NSPrintInfo
      info.horizontalPagination = .fit
      info.isHorizontallyCentered = true
      let operation = self.web.printOperation(with: info)
      operation.jobTitle = self.title
      operation.runModal(
        for: self.parent, delegate: self, didRun: #selector(self.finished(_:success:context:)),
        contextInfo: nil)
    }
  }
  @objc private func finished(
    _ operation: NSPrintOperation, success: Bool, context: UnsafeMutableRawPointer?
  ) {
    complete?()
    complete = nil
  }
}

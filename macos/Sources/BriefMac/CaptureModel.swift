import AppKit
import CryptoKit
import SwiftUI
import UniformTypeIdentifiers

struct CapturedFile: Codable, Identifiable, Sendable {
  let id: String
  let name: String
  let type: String
  let data: String
  let size: Int
  var payload: [String: Any] { ["name": name, "type": type, "data": data] }
}
struct RecentReport: Identifiable {
  let id: String
  let title: String
  let count: Int
}
private struct SavedCapture: Codable, Sendable {
  let notes: String
  let title: String
  let destination: String
  let template: String
  let files: [CapturedFile]
}

@MainActor final class CaptureModel: ObservableObject {
  @Published var notes = "" { didSet { scheduleSave() } }
  @Published var title = "" { didSet { scheduleSave() } }
  @Published var destination = "" { didSet { persist() } }
  @Published var template = "standard" { didSet { persist() } }
  @Published var files: [CapturedFile] = [] { didSet { persist() } }
  @Published var reports: [RecentReport] = []
  @Published var status = "Drop files or paste notes to start."
  @Published var error = ""
  @Published var ready = false
  @Published var processing = false
  @Published var collecting = false
  private let persistenceQueue = DispatchQueue(label: "Brief.capture.persistence", qos: .utility)
  // Presentation state only; recalculated for the menu bar's display on each opening.
  @Published var panelHeight: CGFloat = 600
  private var restoring = true
  private var protectedCapture = false
  private var pendingSave: DispatchWorkItem?
  let store: LocalStore
  var generateAction: (() -> Void)?
  var openAction: ((String) -> Void)?
  var closeAction: (() -> Void)?
  init(store: LocalStore) {
    self.store = store
    do {
      if let raw = try store.read("capture"), let data = raw.data(using: .utf8) {
        let saved = try JSONDecoder().decode(SavedCapture.self, from: data)
        notes = saved.notes
        title = saved.title
        destination = saved.destination
        template = saved.template
        files = saved.files
      }
    } catch {
      self.error =
        "Saved capture could not be read. It has not been overwritten: \(error.localizedDescription)"
      protectedCapture = true
    }
    restoring = false
  }
  private func scheduleSave() {
    guard !restoring else { return }
    pendingSave?.cancel()
    let task = DispatchWorkItem { [weak self] in self?.persist() }
    pendingSave = task
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.25, execute: task)
  }
  func persist() {
    pendingSave?.cancel()
    guard !restoring, !protectedCapture else { return }
    let saved = SavedCapture(
      notes: notes, title: title, destination: destination, template: template, files: files)
    let store = self.store
    persistenceQueue.async { [weak self] in
      do {
        let data = try JSONEncoder().encode(saved)
        try store.write("capture", value: String(decoding: data, as: UTF8.self))
      } catch {
        let message = error.localizedDescription
        DispatchQueue.main.async { self?.error = "Capture not saved: \(message)" }
      }
    }
  }
  func flushCapture() {
    persist()
    persistenceQueue.sync {}
  }

  var canGenerate: Bool {
    ready && !processing && !collecting
      && (!files.isEmpty || !notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
  }
  func add(urls: [URL]) {
    guard !processing, !collecting else { return }
    collecting = true
    error = ""
    status = "Collecting files…"
    let remaining = max(0, 20 - files.count)
    Task {
      var collected: [CapturedFile] = []
      var errors: [String] = []
      for url in urls.prefix(remaining) {
        do {
          collected.append(
            try await Task.detached(priority: .userInitiated) { try Self.readFile(url) }.value)
        } catch { errors.append(error.localizedDescription) }
      }
      if urls.count > remaining { errors.append("Use at most 20 files per capture.") }
      for file in collected where !files.contains(where: { $0.id == file.id }) {
        files.append(file)
      }
      collecting = false
      error = errors.joined(separator: "\n")
      status =
        "\(files.count) \(files.count == 1 ? "file" : "files") collected. Ready to build your draft."
    }
  }
  nonisolated private static func readFile(_ url: URL) throws -> CapturedFile {
    let access = url.startAccessingSecurityScopedResource()
    defer { if access { url.stopAccessingSecurityScopedResource() } }
    let info = try url.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
    guard info.isRegularFile == true else { throw BriefError.message("Choose files, not folders.") }
    guard (info.fileSize ?? Int.max) <= 2 * 1024 * 1024 else {
      throw BriefError.message("\(url.lastPathComponent) exceeds 2 MB.")
    }
    let ext = url.pathExtension.lowercased()
    guard
      [
        "txt", "md", "csv", "json", "jsonl", "ndjson", "pdf", "docx", "html", "htm", "png", "jpg",
        "jpeg", "webp",
      ].contains(ext)
    else { throw BriefError.message("Unsupported file: \(url.lastPathComponent).") }
    let bytes = try Data(contentsOf: url)
    guard bytes.count <= 2 * 1024 * 1024 else { throw BriefError.message("File exceeds 2 MB.") }
    let hash = SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined()
    return CapturedFile(
      id: hash, name: url.lastPathComponent,
      type: UTType(filenameExtension: ext)?.preferredMIMEType ?? "application/octet-stream",
      data: bytes.base64EncodedString(), size: bytes.count)
  }
  func chooseFiles() {
    let panel = NSOpenPanel()
    panel.allowsMultipleSelection = true
    panel.canChooseDirectories = false
    if panel.runModal() == .OK { add(urls: panel.urls) }
  }
  func paste() {
    guard !processing else { return }
    let board = NSPasteboard.general
    if let urls = board.readObjects(
      forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true]) as? [URL], !urls.isEmpty
    {
      add(urls: urls)
      return
    }
    if let text = board.string(forType: .string), !text.isEmpty {
      guard notes.utf8.count + text.utf8.count < 2 * 1024 * 1024 else {
        error = "Notes exceed 2 MB."
        return
      }
      notes += (notes.isEmpty ? "" : "\n\n") + text
      status = "Notes added to this capture."
    } else {
      error = "Copy text or files, then choose Paste."
    }
  }
  func example() {
    guard files.isEmpty && notes.isEmpty else {
      error = "Keep or remove your current capture before trying the example."
      return
    }
    title = "Device rollout · Weekly update"
    notes =
      "Progress: The pilot is live. Feedback from the first group is positive.\n\nNeeds a decision: VPN access approval. Approval is pending before the next rollout.\n\nNext steps: Complete the rollout. Roll out to the remaining 20 devices once access is approved."
    let text = "title,value,target\nDevices deployed,80,100"
    files = [
      CapturedFile(
        id: UUID().uuidString, name: "fictional-metrics.csv", type: "text/csv",
        data: Data(text.utf8).base64EncodedString(), size: text.utf8.count)
    ]
    status = "Fictional example ready. Build a draft to review it."
  }
  func completed(_ result: [String: Any]) {
    processing = false
    status = result["message"] as? String ?? "Draft ready."
    if result["consumed"] as? Bool == true {
      if let reportID = result["reportId"] as? String { destination = reportID }
      files = []
      notes = ""
      persist()
    }
  }
  var payload: [String: Any] {
    [
      "files": files.map(\.payload), "notes": notes, "title": title, "template": template,
      "destination": destination,
    ]
  }
}

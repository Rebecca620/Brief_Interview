import Foundation

/// One owner for atomic persistence; WebKit origins may change between launches.
// Mutable operations are protected by lock; the directory is immutable.
final class LocalStore: @unchecked Sendable {
  let directory: URL
  private let lock = NSLock()
  init(directory: URL) throws {
    self.directory = directory
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    // Before any server/readers exist, discard only objects proven unreachable.
    compactObjects()
  }
  private func compactObjects() {
    do {
      let data = try Data(contentsOf: directory.appendingPathComponent("library.json"))
      guard let manifest = try JSONSerialization.jsonObject(with: data) as? [String: Any],
        manifest["version"] as? Int == 3,
        let reports = manifest["reports"] as? [[String: String]]
      else { return }
      let folder = directory.appendingPathComponent("Objects")
      var keep = Set<String>()
      for entry in reports {
        guard let key = entry["key"] else { return }
        let reportData = try Data(contentsOf: url(key))
        guard let report = try JSONSerialization.jsonObject(with: reportData) as? [String: Any],
          let cards = report["cards"] as? [[String: Any]]
        else { return }
        keep.insert(key)
        for card in cards {
          for field in ["image", "chartImage"] {
            if let reference = card[field] as? [String: String], let asset = reference["asset"] {
              guard FileManager.default.fileExists(atPath: try url(asset).path) else { return }
              keep.insert(asset)
            }
          }
        }
      }
      for file in try FileManager.default.contentsOfDirectory(
        at: folder, includingPropertiesForKeys: nil)
      {
        let name = file.lastPathComponent
        if name.range(of: "^(asset|report)-[a-f0-9]{64}$", options: .regularExpression) != nil
          && !keep.contains(name)
        {
          try? FileManager.default.removeItem(at: file)
        }
      }
    } catch {
      // Failed validation preserves all recovery material.
    }
  }
  private func url(_ key: String) throws -> URL {
    let names = [
      "brief-library-v2": "reports.json", "capture": "capture.json",
      "brief-appearance": "appearance.txt",
    ]
    if key.range(of: "^(asset|report)-[a-f0-9]{64}$", options: .regularExpression) != nil {
      let folder = directory.appendingPathComponent("Objects")
      try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
      return folder.appendingPathComponent(key)
    }
    if key == "brief-manifest-v3" { return directory.appendingPathComponent("library.json") }
    guard let name = names[key] else { throw BriefError.message("Unknown storage key.") }
    return directory.appendingPathComponent(name)
  }
  func read(_ key: String) throws -> String? {
    if key == "brief-v1" { return nil }
    lock.lock()
    defer { lock.unlock() }
    let file = try url(key)
    guard FileManager.default.fileExists(atPath: file.path) else { return nil }
    return try String(contentsOf: file, encoding: .utf8)
  }
  func write(_ key: String, value: String) throws {
    lock.lock()
    defer { lock.unlock() }
    let data = Data(value.utf8)
    let limit = key == "capture" ? 60 * 1024 * 1024 : 8 * 1024 * 1024
    guard data.count <= limit else { throw BriefError.message("Local storage limit exceeded.") }
    if key != "brief-appearance" && !key.hasPrefix("asset-") {
      _ = try JSONSerialization.jsonObject(with: data)
    }
    try data.write(to: url(key), options: .atomic)
  }
  /// Objects are immutable. The manifest is the single atomic commit point.
  func writeBatch(_ writes: [String: String], expected: String?) throws {
    lock.lock()
    defer { lock.unlock() }
    let manifestURL = try url("brief-manifest-v3")
    let current =
      FileManager.default.fileExists(atPath: manifestURL.path)
      ? try String(contentsOf: manifestURL, encoding: .utf8) : nil
    if writes["brief-manifest-v3"] != nil && current != expected {
      throw BriefError.message(
        "The library changed in another window. Export your work before reopening.")
    }
    for (key, value) in writes {
      _ = try url(key)
      guard value.utf8.count <= 128 * 1024 * 1024 else {
        throw BriefError.message("An individual record is too large.")
      }
      if key != "brief-appearance" && !key.hasPrefix("asset-") {
        _ = try JSONSerialization.jsonObject(with: Data(value.utf8))
      }
    }
    for (key, value) in writes where key != "brief-manifest-v3" {
      try Data(value.utf8).write(to: url(key), options: .atomic)
    }
    if let manifest = writes["brief-manifest-v3"] {
      try Data(manifest.utf8).write(to: manifestURL, options: .atomic)
    }
  }
}
enum BriefError: LocalizedError {
  case message(String)
  var errorDescription: String? {
    if case .message(let text) = self { return text }
    return nil
  }
}

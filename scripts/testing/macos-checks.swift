import Foundation

/// Runs with Command Line Tools alone; XCTest additionally requires full Xcode here.
@main struct NativeChecks {
  static func require(_ condition: Bool, _ message: String) throws {
    if !condition { throw BriefError.message(message) }
  }
  static func main() async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: directory) }
    let store = try LocalStore(directory: directory)
    let saved = "[{\"title\":\"中文\"}]"
    try store.write("brief-library-v2", value: saved)
    try require(
      try LocalStore(directory: directory).read("brief-library-v2") == saved, "Relaunch persistence"
    )
    for (key, value) in [
      ("../elsewhere", "[]"), ("brief-library-v2", "invalid"),
      ("brief-library-v2", String(repeating: "x", count: 9 * 1024 * 1024)),
    ] {
      var rejected = false
      do { try store.write(key, value: value) } catch { rejected = true }
      try require(rejected, "Invalid write accepted")
      try require(
        try store.read("brief-library-v2") == saved, "Saved library changed after rejection")
    }
    let assets = directory.appendingPathComponent("Web")
    let objectKey = "report-" + String(repeating: "a", count: 64)
    let firstManifest = "{\"version\":3,\"reports\":[]}"
    try store.writeBatch([objectKey: "{}", "brief-manifest-v3": firstManifest], expected: nil)
    try require(try store.read(objectKey) == "{}", "Object persistence")
    var conflictRejected = false
    do {
      try store.writeBatch(["brief-manifest-v3": "{}"], expected: nil)
    } catch { conflictRejected = true }
    try require(conflictRejected, "Stale manifest accepted")
    try require(try store.read("brief-manifest-v3") == firstManifest, "Conflict changed manifest")
    var badBatchRejected = false
    do {
      try store.writeBatch(
        [objectKey: "invalid", "brief-manifest-v3": "{}"], expected: firstManifest)
    } catch { badBatchRejected = true }
    try require(badBatchRejected, "Invalid batch accepted")
    try require(
      try store.read("brief-manifest-v3") == firstManifest, "Failed batch changed manifest")
    try require(try store.read("brief-library-v2") == saved, "Migration altered legacy data")
    let orphan = "asset-" + String(repeating: "b", count: 64)
    let liveManifest = "{\"version\":3,\"reports\":[{\"id\":\"test\",\"key\":\"\(objectKey)\"}]}"
    try store.writeBatch(
      [objectKey: "{\"cards\":[]}", orphan: "unused image", "brief-manifest-v3": liveManifest],
      expected: firstManifest)
    let reopened = try LocalStore(directory: directory)
    try require(try reopened.read(objectKey) == "{\"cards\":[]}", "Cleanup removed current report")
    try require(try reopened.read(orphan) == nil, "Cleanup retained unreachable object")
    try require(try reopened.read("brief-library-v2") == saved, "Cleanup removed legacy library")
    try FileManager.default.createDirectory(at: assets, withIntermediateDirectories: true)
    try Data("<html>Brief</html>".utf8).write(to: assets.appendingPathComponent("index.html"))
    let server = AssetServer(root: assets, store: store)
    defer { server.stop() }
    let url: URL = try await withCheckedThrowingContinuation { continuation in
      do { try server.start { continuation.resume(with: $0) } } catch {
        continuation.resume(throwing: error)
      }
    }
    let config = URLSessionConfiguration.ephemeral
    config.httpShouldSetCookies = false
    config.timeoutIntervalForRequest = 5
    let session = URLSession(configuration: config)
    defer { session.invalidateAndCancel() }
    func request(
      _ path: String, authenticated: Bool = true, bridge: Bool = false,
      origin: String? = nil, post: [String: String]? = nil
    ) async throws -> (Data, HTTPURLResponse) {
      var request = URLRequest(url: URL(string: path, relativeTo: url)!)
      if authenticated {
        request.setValue("brief_session=\(server.token)", forHTTPHeaderField: "Cookie")
      }
      if bridge { request.setValue(server.token, forHTTPHeaderField: "X-Brief-Native") }
      if let origin { request.setValue(origin, forHTTPHeaderField: "Origin") }
      if let post {
        request.httpMethod = "POST"
        request.httpBody = try JSONSerialization.data(withJSONObject: post)
      }
      let (data, response) = try await session.data(for: request)
      return (data, response as! HTTPURLResponse)
    }
    try require(
      try await request("/", authenticated: false).1.statusCode == 403,
      "Unauthenticated asset access")
    let initial = try await request(url.absoluteString, authenticated: false)
    try require(
      initial.1.statusCode == 200 && initial.1.value(forHTTPHeaderField: "Set-Cookie") != nil,
      "Bootstrap cookie")
    try require(
      try await request("/native/storage?key=brief-library-v2").1.statusCode == 403,
      "Missing bridge token")
    try require(
      try await request(
        "/native/storage?key=brief-library-v2", bridge: true, origin: "https://example.com"
      ).1.statusCode == 403, "Cross-origin storage access")
    try require(try await request("/src/%2e%2e/reports.json").1.statusCode != 200, "Path traversal")
    try require(
      try await request(
        "/native/storage", bridge: true, post: ["key": "brief-library-v2", "value": "[]"]
      ).1.statusCode == 200, "Bridge save")
    let read = try await request("/native/storage?key=brief-library-v2", bridge: true)
    let object = try JSONSerialization.jsonObject(with: read.0) as! [String: String]
    try require(object["value"] == "[]", "Bridge read after save")
    print(
      "PASS: native persistence, invalid-write preservation, authenticated assets, origin isolation, traversal rejection, storage bridge"
    )
  }
}

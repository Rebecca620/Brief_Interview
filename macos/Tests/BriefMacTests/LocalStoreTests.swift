import XCTest

@testable import BriefMac

final class LocalStoreTests: XCTestCase {
  func testAtomicRoundTripAndUnknownKeys() throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: directory) }
    let store = try LocalStore(directory: directory)
    XCTAssertNil(try store.read("brief-library-v2"))
    try store.write("brief-library-v2", value: "[{\"title\":\"中文\"}]")
    XCTAssertEqual(
      try LocalStore(directory: directory).read("brief-library-v2"), "[{\"title\":\"中文\"}]")
    XCTAssertThrowsError(try store.write("../elsewhere", value: "[]"))
    XCTAssertThrowsError(try store.write("brief-library-v2", value: "broken JSON"))
    XCTAssertEqual(try store.read("brief-library-v2"), "[{\"title\":\"中文\"}]")
  }
  func testOversizedWritePreservesSavedLibrary() throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: directory) }
    let store = try LocalStore(directory: directory)
    try store.write("brief-library-v2", value: "[]")
    XCTAssertThrowsError(
      try store.write("brief-library-v2", value: String(repeating: "x", count: 9 * 1024 * 1024)))
    XCTAssertEqual(try store.read("brief-library-v2"), "[]")
  }
}

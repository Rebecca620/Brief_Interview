import AppKit
import PDFKit

let input = URL(fileURLWithPath: CommandLine.arguments[1])
let output = URL(fileURLWithPath: CommandLine.arguments[2])
guard let document = PDFDocument(url: input), document.pageCount == 12 else {
  fatalError("Expected a readable PDF with 12 pages")
}
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
var counts: [Int] = []
for index in 0..<document.pageCount {
  guard let page = document.page(at: index), let text = page.string, text.count > 40 else {
    fatalError("Missing selectable text on page \(index + 1)")
  }
  counts.append(text.count)
  let image = page.thumbnail(of: NSSize(width: 1200, height: 675), for: .mediaBox)
  let bitmap = NSBitmapImageRep(data: image.tiffRepresentation!)!
  try bitmap.representation(using: .png, properties: [:])!.write(
    to: output.appendingPathComponent(String(format: "page-%02d.png", index + 1)))
}
let evidence: [String: Any] = [
  "pages": document.pageCount, "selectableCharacters": counts, "renderer": "macOS PDFKit",
]
try JSONSerialization.data(withJSONObject: evidence, options: [.prettyPrinted, .sortedKeys]).write(
  to: output.appendingPathComponent("verification.json"))
print("PASS: 12 PDF pages with selectable text; every page rendered through PDFKit.")

import AppKit

// Original vector artwork; rendered at each macOS icon size.
let output = URL(fileURLWithPath: CommandLine.arguments[1])
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
for size in [16, 32, 128, 256, 512] {
  for scale in [1, 2] {
    let pixels = size * scale
    let image = NSImage(size: NSSize(width: pixels, height: pixels))
    image.lockFocus()
    let transform = NSAffineTransform()
    transform.scale(by: CGFloat(pixels) / 1024)
    transform.concat()
    let tile = NSBezierPath(
      roundedRect: NSRect(x: 72, y: 72, width: 880, height: 880), xRadius: 198, yRadius: 198)
    NSGradient(
      starting: NSColor(red: 0.22, green: 0.43, blue: 0.9, alpha: 1),
      ending: NSColor(red: 0.1, green: 0.24, blue: 0.66, alpha: 1))!.draw(in: tile, angle: -90)
    NSColor.white.setFill()
    NSBezierPath(
      roundedRect: NSRect(x: 302, y: 224, width: 420, height: 576), xRadius: 48, yRadius: 48
    ).fill()
    NSColor(red: 0.2, green: 0.36, blue: 0.73, alpha: 1).setFill()
    for (y, width) in [(634, 244), (524, 244), (414, 158)] {
      NSBezierPath(
        roundedRect: NSRect(x: 390, y: y, width: width, height: 34), xRadius: 17, yRadius: 17
      ).fill()
    }
    image.unlockFocus()
    let bitmap = NSBitmapImageRep(data: image.tiffRepresentation!)!
    let suffix = scale == 2 ? "@2x" : ""
    try bitmap.representation(using: .png, properties: [:])!.write(
      to: output.appendingPathComponent("icon_\(size)x\(size)\(suffix).png"))
  }
}

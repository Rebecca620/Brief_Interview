// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "BriefMac",
  platforms: [.macOS(.v13)],
  products: [.executable(name: "BriefMac", targets: ["BriefMac"])],
  targets: [
    .executableTarget(name: "BriefMac"),
    .testTarget(name: "BriefMacTests", dependencies: ["BriefMac"]),
  ]
)

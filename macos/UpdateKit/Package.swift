// swift-tools-version: 5.9
import PackageDescription
let package = Package(name: "UpdateKit", platforms: [.macOS(.v13)], products: [.executable(name: "StudioUpdater", targets: ["UpdateKitApp"]), .library(name: "UpdateKitCore", targets: ["UpdateKitCore"])], targets: [.target(name: "UpdateKitCore"), .executableTarget(name: "UpdateKitApp", dependencies: ["UpdateKitCore"]), .testTarget(name: "UpdateKitCoreTests", dependencies: ["UpdateKitCore"])])

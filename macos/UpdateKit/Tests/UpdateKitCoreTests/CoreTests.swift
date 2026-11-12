import XCTest
@testable import UpdateKitCore
final class CoreTests: XCTestCase {
    let config = Configuration(product: "align-studio", stableManifestUrl: "", betaManifestUrl: "", pinnedPublicKeyXml: "", developerTeamID: "")
    func testVersionNormalization() throws { XCTAssertEqual(try ReleaseVersion("1.0"), try ReleaseVersion("1.0.0")); XCTAssertLessThan(try ReleaseVersion("1.0"), try ReleaseVersion("1.0.1")) }
    func testInvalidVersions() { for value in ["1", "0.9", "1.-1", "1..0", "1.0-beta", "1.999999"] { XCTAssertThrowsError(try ReleaseVersion(value)) } }
    func testRoutes() {
        XCTAssertTrue(Route.allowed(URL(string: "https://github.com/rodrigoblergh/align-studio/releases/download/update-v1-macos-stable/stable.json")!, config: config, asset: false))
        for s in ["http://github.com/rodrigoblergh/align-studio/releases/download/v1/x", "https://github.com/other/align-studio/releases/download/v1/x", "https://user@github.com/rodrigoblergh/align-studio/releases/download/v1/x", "https://127.0.0.1/a", "https://github.com/rodrigoblergh/effects-studio/releases/download/v1/x"] { XCTAssertFalse(Route.allowed(URL(string:s)!, config:config, asset:false)) }
        XCTAssertTrue(Route.allowed(URL(string:"https://release-assets.githubusercontent.com/a")!, config:config, asset:true))
        XCTAssertFalse(Route.allowed(URL(string:"https://release-assets.githubusercontent.com/a")!, config:config, asset:false))
    }
    func testInvalidKey() { XCTAssertThrowsError(try Verification.publicKey(xml: "<RSAKeyValue><D>private</D></RSAKeyValue>")) }
    func testUnsignedRejected() { XCTAssertThrowsError(try Verification.verify(Data("{\"payload\":\"e30=\",\"signature\":\"AA==\"}".utf8), config:config, channel:"stable", aeMajor:26)) }
}

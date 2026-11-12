import XCTest
import Security
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
    func testTimestampFormats() {
        XCTAssertNotNil(Verification.date("2026-11-12T17:15:13.1234567Z"))
        XCTAssertNotNil(Verification.date("2026-11-12T17:15:13Z"))
        XCTAssertNil(Verification.date("yesterday"))
    }
    func testTransactionRollbackAndTamper() throws {
        let base=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at:base) }
        let target=base.appendingPathComponent("target"), stage=base.appendingPathComponent("stage"), state=base.appendingPathComponent("state")
        for dir in [target,stage,state] { try FileManager.default.createDirectory(at:dir,withIntermediateDirectories:true) }
        try Data("old".utf8).write(to:target.appendingPathComponent("file"))
        try Data("new".utf8).write(to:stage.appendingPathComponent("file"))
        try Transaction.commit(stage:stage,target:target,state:state)
        XCTAssertEqual(try String(contentsOf:target.appendingPathComponent("file")),"new")
        try Transaction.rollback(target:target,state:state)
        XCTAssertEqual(try String(contentsOf:target.appendingPathComponent("file")),"old")
        let backups=try FileManager.default.contentsOfDirectory(at:base,includingPropertiesForKeys:nil).filter{$0.lastPathComponent.hasPrefix(".align-backup-")}
        for backup in backups { try Data("tampered".utf8).write(to:backup.appendingPathComponent("file")) }
        XCTAssertThrowsError(try Transaction.rollback(target:target,state:state))
        XCTAssertEqual(try String(contentsOf:target.appendingPathComponent("file")),"old")
    }
    func testDanglingLinkRejected() throws {
        let base=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at:base,withIntermediateDirectories:true)
        defer { try? FileManager.default.removeItem(at:base) }
        let link=base.appendingPathComponent("link")
        try FileManager.default.createSymbolicLink(atPath:link.path,withDestinationPath:base.appendingPathComponent("missing").path)
        XCTAssertThrowsError(try Installation.noLinks(link))
    }
    func testInterruptedRenameRestoresVerifiedBackup() throws {
        let base=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let state=base.appendingPathComponent("state"), target=base.appendingPathComponent("target"), backup=base.appendingPathComponent(".align-backup-"+UUID().uuidString)
        for dir in [state,backup] { try FileManager.default.createDirectory(at:dir,withIntermediateDirectories:true) }
        defer { try? FileManager.default.removeItem(at:base) }
        try Data("original".utf8).write(to:backup.appendingPathComponent("file"))
        let record:[String:Any]=["backup":backup.lastPathComponent,"old":try Transaction.inventory(backup),"new":["file":"different"]]
        try JSONSerialization.data(withJSONObject:record).write(to:state.appendingPathComponent("transaction.json"))
        try Transaction.recover(target:target,state:state)
        XCTAssertEqual(try String(contentsOf:target.appendingPathComponent("file")),"original")
        XCTAssertFalse(FileManager.default.fileExists(atPath:state.appendingPathComponent("transaction.json").path))
    }
    func testArchiveNames() {
        for name in ["index.html", "updater/AlignStudioUpdater.app/Contents/MacOS/AlignStudioUpdater", "CSXS/"] { XCTAssertTrue(Archive.safePath(name)) }
        for name in ["../a", "/a", "a/../b", "a\\b", "a:b", "a//b", "a/./b", "a\u{0}b"] { XCTAssertFalse(Archive.safePath(name)) }
    }
    func testUnsignedRejected() { XCTAssertThrowsError(try Verification.verify(Data("{\"payload\":\"e30=\",\"signature\":\"AA==\"}".utf8), config:config, channel:"stable", aeMajor:26)) }
    func testRealSignatureAndBinding() throws {
        var error:Unmanaged<CFError>?
        let privateKey=try XCTUnwrap(SecKeyCreateRandomKey([kSecAttrKeyType:kSecAttrKeyTypeRSA,kSecAttrKeySizeInBits:3072] as CFDictionary,&error))
        let publicKey=try XCTUnwrap(SecKeyCopyPublicKey(privateKey))
        let der=try XCTUnwrap(SecKeyCopyExternalRepresentation(publicKey,&error)) as Data
        var p=0
        func length()->Int { let value=Int(der[p]); p+=1; if value<128 { return value }; var n=0; for _ in 0..<(value&127) { n=(n<<8)|Int(der[p]); p+=1 }; return n }
        p+=1; _=length(); p+=1; let ml=length(); var modulus=der.subdata(in:p..<p+ml); p+=ml; p+=1; let el=length(); let exponent=der.subdata(in:p..<p+el)
        if modulus.first==0 { modulus.removeFirst() }
        var configured=config; configured.pinnedPublicKeyXml="<RSAKeyValue><Modulus>\(modulus.base64EncodedString())</Modulus><Exponent>\(exponent.base64EncodedString())</Exponent></RSAKeyValue>"
        let now=Date(), formatter=ISO8601DateFormatter()
        var fields:[String:Any]=["product":"align-studio","releaseLine":"v1","platform":"macos-arm64","version":"1.0.2","channel":"stable","minAeMajor":26,"maxAeMajor":26,"packageUrl":"https://github.com/rodrigoblergh/align-studio/releases/download/v1.0.2/package.zip","packageSha256":String(repeating:"a",count:64),"packageBytes":100,"issuedUtc":formatter.string(from:now),"expiresUtc":formatter.string(from:now.addingTimeInterval(86400))]
        func signed()->Data {
            let payload=try! JSONSerialization.data(withJSONObject:fields)
            let signature=SecKeyCreateSignature(privateKey,.rsaSignatureMessagePKCS1v15SHA256,payload as CFData,&error)! as Data
            return try! JSONSerialization.data(withJSONObject:["payload":payload.base64EncodedString(),"signature":signature.base64EncodedString()])
        }
        XCTAssertEqual(try Verification.verify(signed(),config:configured,channel:"stable",aeMajor:26).version,"1.0.2")
        XCTAssertThrowsError(try Verification.verify(signed(),config:configured,channel:"beta",aeMajor:26))
        XCTAssertThrowsError(try Verification.verify(signed(),config:configured,channel:"stable",aeMajor:25))
        XCTAssertThrowsError(try Verification.verify(signed(),config:configured,channel:"stable",aeMajor:26,highest:"1.0.3"))
        fields["platform"]="windows-x64"; XCTAssertThrowsError(try Verification.verify(signed(),config:configured,channel:"stable",aeMajor:26))
        fields["platform"]="macos-arm64"; fields["product"]="effect-studio"; XCTAssertThrowsError(try Verification.verify(signed(),config:configured,channel:"stable",aeMajor:26))
    }
}

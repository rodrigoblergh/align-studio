import Foundation
import FoundationXML
import Security
import CryptoKit

public enum UpdateError: Error, LocalizedError {
    case invalid(String)
    public var errorDescription: String? { if case .invalid(let s) = self { return s }; return nil }
}
public struct ReleaseVersion: Comparable, Equatable {
    public let parts: [Int]
    public init(_ value: String) throws {
        let fields = value.split(separator: ".", omittingEmptySubsequences: false)
        guard (2...4).contains(fields.count), fields.allSatisfy({ !$0.isEmpty && $0.allSatisfy({ $0.isASCII && $0.isNumber }) }), let first = Int(fields[0]), first >= 1 else { throw UpdateError.invalid("Invalid release version") }
        let nums = fields.compactMap { Int($0) }
        guard nums.count == fields.count, nums.allSatisfy({ $0 <= 65535 }) else { throw UpdateError.invalid("Invalid release version") }
        parts = nums + Array(repeating: 0, count: 4 - nums.count)
    }
    public static func < (a: Self, b: Self) -> Bool { a.parts.lexicographicallyPrecedes(b.parts) }
}
public struct Configuration: Codable {
    public var product: String
    public var stableManifestUrl: String
    public var betaManifestUrl: String
    public var pinnedPublicKeyXml: String
    public var developerTeamID: String
    public var repository: String { product == "align-studio" ? "align-studio" : "effects-studio" }
    public init(product: String, stableManifestUrl: String, betaManifestUrl: String, pinnedPublicKeyXml: String, developerTeamID: String) {
        self.product = product; self.stableManifestUrl = stableManifestUrl; self.betaManifestUrl = betaManifestUrl; self.pinnedPublicKeyXml = pinnedPublicKeyXml; self.developerTeamID = developerTeamID
    }
}
public struct Manifest: Codable {
    public let product: String
    public let releaseLine: String
    public let platform: String
    public let version: String
    public let channel: String
    public let minAeMajor: Int
    public let maxAeMajor: Int
    public let packageUrl: String
    public let packageSha256: String
    public let packageBytes: Int64
    public let issuedUtc: String
    public let expiresUtc: String
}
private struct Envelope: Codable { let payload: String; let signature: String }
private final class PublicXML: NSObject, XMLParserDelegate {
    var element = ""; var fields: [String:String] = [:]; var invalid = false
    func parser(_ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?, qualifiedName qName: String?, attributes attributeDict: [String:String]) {
        element = elementName
        if !["RSAKeyValue", "Modulus", "Exponent"].contains(elementName) || !attributeDict.isEmpty { invalid = true }
        if elementName != "RSAKeyValue" { if fields[elementName] != nil { invalid = true }; fields[elementName] = "" }
    }
    func parser(_ parser: XMLParser, foundCharacters string: String) { if element != "RSAKeyValue" { fields[element, default: ""] += string } }
    func parser(_ parser: XMLParser, didEndElement elementName: String, namespaceURI: String?, qualifiedName qName: String?) { element = "RSAKeyValue" }
}
public enum Verification {
    public static func date(_ value:String)->Date? {
        let parser=ISO8601DateFormatter(); parser.formatOptions=[.withInternetDateTime,.withFractionalSeconds]
        if let result=parser.date(from:value) { return result }
        parser.formatOptions=[.withInternetDateTime]; return parser.date(from:value)
    }
    private static func der(_ tag: UInt8, _ bytes: Data) -> Data {
        var size = bytes.count; var length: [UInt8] = []
        if size < 128 { length = [UInt8(size)] } else { while size > 0 { length.insert(UInt8(size & 255), at: 0); size >>= 8 }; length.insert(0x80 | UInt8(length.count), at: 0) }
        return Data([tag] + length) + bytes
    }
    public static func publicKey(xml: String) throws -> SecKey {
        let delegate = PublicXML(); let parser = XMLParser(data: Data(xml.utf8)); parser.delegate = delegate; parser.shouldResolveExternalEntities = false
        guard parser.parse(), !delegate.invalid, delegate.fields.count == 2,
              let modulus = Data(base64Encoded: delegate.fields["Modulus"] ?? "", options: .ignoreUnknownCharacters), modulus.count >= 384,
              let exponent = Data(base64Encoded: delegate.fields["Exponent"] ?? "", options: .ignoreUnknownCharacters), !exponent.isEmpty else { throw UpdateError.invalid("Invalid publisher public key") }
        func integer(_ data: Data) -> Data { der(2, (data.first! & 128 != 0 ? Data([0]) : Data()) + data) }
        let data = der(0x30, integer(modulus) + integer(exponent))
        var error: Unmanaged<CFError>?
        guard let key = SecKeyCreateWithData(data as CFData, [kSecAttrKeyType: kSecAttrKeyTypeRSA, kSecAttrKeyClass: kSecAttrKeyClassPublic] as CFDictionary, &error) else { throw UpdateError.invalid("Publisher key cannot be loaded") }
        return key
    }
    public static func verify(_ envelope: Data, config: Configuration, channel: String, aeMajor: Int, highest: String? = nil, now: Date = Date()) throws -> Manifest {
        guard envelope.count <= 262144 else { throw UpdateError.invalid("Manifest too large") }
        let signed = try JSONDecoder().decode(Envelope.self, from: envelope)
        guard let payload = Data(base64Encoded: signed.payload), payload.count <= 131072, let signature = Data(base64Encoded: signed.signature) else { throw UpdateError.invalid("Invalid signed envelope") }
        var error: Unmanaged<CFError>?
        guard SecKeyVerifySignature(try publicKey(xml: config.pinnedPublicKeyXml), .rsaSignatureMessagePKCS1v15SHA256, payload as CFData, signature as CFData, &error) else { throw UpdateError.invalid("Publisher signature failed") }
        let m = try JSONDecoder().decode(Manifest.self, from: payload)
        guard ["align-studio", "effect-studio"].contains(config.product), m.product == config.product, m.releaseLine == "v1", m.platform == "macos-arm64", m.channel == channel, ["stable", "beta"].contains(channel) else { throw UpdateError.invalid("Wrong product, platform or channel") }
        let version = try ReleaseVersion(m.version)
        if let highest, version < (try ReleaseVersion(highest)) { throw UpdateError.invalid("Older feed rejected") }
        guard let issued = date(m.issuedUtc), let expires = date(m.expiresUtc), issued <= now.addingTimeInterval(300), expires > now, expires > issued, expires.timeIntervalSince(issued) <= 90 * 86400 else { throw UpdateError.invalid("Release signature expired or has invalid dates") }
        guard m.minAeMajor <= aeMajor, aeMajor <= m.maxAeMajor, m.minAeMajor > 0, m.packageBytes > 0, m.packageBytes <= 200 * 1024 * 1024, m.packageSha256.count == 64, m.packageSha256.allSatisfy({ $0.isHexDigit && $0.isASCII }), let url = URL(string: m.packageUrl), Route.allowed(url, config: config, asset: false) else { throw UpdateError.invalid("Incompatible or invalid release") }
        return m
    }
    public static func package(_ url: URL, manifest: Manifest) throws {
        let handle = try FileHandle(forReadingFrom: url); defer { try? handle.close() }
        var hash = SHA256(); var size: Int64 = 0
        while let part = try handle.read(upToCount: 65536), !part.isEmpty { size += Int64(part.count); guard size <= manifest.packageBytes else { throw UpdateError.invalid("Package size mismatch") }; hash.update(data: part) }
        guard size == manifest.packageBytes, hash.finalize().map({ String(format: "%02x", $0) }).joined() == manifest.packageSha256.lowercased() else { throw UpdateError.invalid("Package hash mismatch") }
    }
}

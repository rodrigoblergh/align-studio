import Foundation
import Darwin
public struct Preferences: Codable {
    public var startupChecks = false
    public var autoDownload = false
    public var channel = "stable"
    public var lastCheck: Date?
    public var highest: [String:String] = [:]
    public var available: Data?
    public var pending: String?
    public var lastStatus = ""
    public init() {}
}
public final class FileLock {
    private var descriptor:Int32 = -1
    public init(_ file:URL, nonblocking:Bool=false) throws {
        descriptor = open(file.path,O_CREAT|O_RDWR|O_NOFOLLOW,0o600)
        guard descriptor >= 0 else { throw UpdateError.invalid("Cannot open updater lock") }
        guard flock(descriptor,LOCK_EX | (nonblocking ? LOCK_NB : 0))==0 else { close(descriptor); descriptor = -1; throw UpdateError.invalid("Another update operation is running") }
    }
    deinit { if descriptor >= 0 { flock(descriptor,LOCK_UN); close(descriptor) } }
}
public final class StateStore: @unchecked Sendable {
    public let folder:URL
    public init(product:String,home:URL=FileManager.default.homeDirectoryForCurrentUser) throws {
        guard ["align-studio","effect-studio"].contains(product) else { throw UpdateError.invalid("Unknown product") }
        folder=home.appendingPathComponent("Library/Application Support/\(product == "align-studio" ? "AlignStudio" : "EffectStudio")/updater/v1/macos")
        try Installation.noLinks(folder)
        try FileManager.default.createDirectory(at:folder,withIntermediateDirectories:true,attributes:[.posixPermissions:0o700])
    }
    public func modify<T>(_ body:(inout Preferences)throws->T) throws -> T {
        let lock=try FileLock(folder.appendingPathComponent("preferences.lock")); defer { withExtendedLifetime(lock) {} }
        let path=folder.appendingPathComponent("preferences.json")
        var prefs:Preferences
        if FileManager.default.fileExists(atPath:path.path) {
            let size=(try path.resourceValues(forKeys:[.fileSizeKey])).fileSize ?? 0
            guard size < 512*1024 else { throw UpdateError.invalid("Updater preferences are too large") }
            prefs=try JSONDecoder().decode(Preferences.self,from:Data(contentsOf:path))
        } else { prefs=Preferences() }
        let result=try body(&prefs)
        try JSONEncoder().encode(prefs).write(to:path,options:.atomic)
        return result
    }
    public func load() throws -> Preferences { try modify { $0 } }
}

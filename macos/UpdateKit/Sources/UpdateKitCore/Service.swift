import Foundation
public final class UpdateService: @unchecked Sendable {
    public let config:Configuration
    public let store:StateStore
    public let aeMajor:Int
    public let current:ReleaseVersion
    public init(config:Configuration,aeMajor:Int,currentVersion:String) throws { self.config=config; self.aeMajor=aeMajor; current=try ReleaseVersion(currentVersion); store=try StateStore(product:config.product) }
    public func check(startup:Bool) async throws -> String {
        let before=try store.load()
        if startup && (!before.startupChecks || (before.lastCheck.map{ Date().timeIntervalSince($0)<86400 } ?? false)) { return before.lastStatus }
        let channel=before.channel
        guard let url=URL(string:channel=="beta" ? config.betaManifestUrl : config.stableManifestUrl) else { throw UpdateError.invalid("Update feed is not configured") }
        let temporary=store.folder.appendingPathComponent("feed-"+UUID().uuidString+".json")
        defer { try? FileManager.default.removeItem(at:temporary) }
        _ = try await Download(config:config,limit:262144,output:temporary).fetch(url)
        let envelope=try Data(contentsOf:temporary)
        let available:Bool=try store.modify { prefs in
            guard prefs.channel==channel else { throw UpdateError.invalid("Update channel changed; check again") }
            let manifest=try Verification.verify(envelope,config:config,channel:channel,aeMajor:aeMajor,highest:prefs.highest[channel])
            let newer=try ReleaseVersion(manifest.version)>current
            prefs.highest[channel]=manifest.version; prefs.available=envelope; prefs.lastCheck=Date()
            prefs.lastStatus=newer ? "Version \(manifest.version) is available." : "You are up to date."
            return newer
        }
        if startup && available && (try store.load()).autoDownload { return try await download() }
        return try store.load().lastStatus
    }
    public func download() async throws -> String {
        let before=try store.load(); guard let envelope=before.available else { throw UpdateError.invalid("Check for updates first") }
        let manifest=try Verification.verify(envelope,config:config,channel:before.channel,aeMajor:aeMajor,highest:before.highest[before.channel])
        guard try ReleaseVersion(manifest.version)>current else { return "You are up to date." }
        let file=store.folder.appendingPathComponent("package-"+UUID().uuidString+".zip")
        do {
            _ = try await Download(config:config,limit:Int(manifest.packageBytes),output:file).fetch(URL(string:manifest.packageUrl)!)
            try Verification.package(file,manifest:manifest)
            try store.modify { prefs in
                guard prefs.channel==before.channel else { throw UpdateError.invalid("Channel changed; downloaded update was discarded") }
                _ = try Verification.verify(envelope,config:config,channel:prefs.channel,aeMajor:aeMajor,highest:prefs.highest[prefs.channel])
                prefs.pending=file.lastPathComponent; prefs.available=envelope; prefs.lastStatus="Download verified. Close After Effects, then choose Install."
            }
            return try store.load().lastStatus
        } catch { try? FileManager.default.removeItem(at:file); throw error }
    }
    public func install() throws -> String {
        let prefs=try store.load()
        guard let envelope=prefs.available, let pending=prefs.pending, pending.hasPrefix("package-"), pending.hasSuffix(".zip"), !pending.contains("/"), !pending.contains("\\") else { throw UpdateError.invalid("Download an update first") }
        try Installation.install(archive:store.folder.appendingPathComponent(pending),envelope:envelope,config:config,channel:prefs.channel,aeMajor:aeMajor,highest:prefs.highest[prefs.channel])
        try store.modify { state in if state.pending==pending { state.pending=nil }; state.lastStatus="Update installed. Reopen After Effects." }
        return "Update installed. Reopen After Effects."
    }
}

import Foundation
import AppKit
import Security
import Darwin

public enum Installation {
    public static func afterEffectsRunning() -> Bool {
        NSWorkspace.shared.runningApplications.contains { app in
            let id=app.bundleIdentifier?.lowercased() ?? ""
            return id.hasPrefix("com.adobe.aftereffects") || app.executableURL?.lastPathComponent.lowercased()=="after effects"
        }
    }
    public static func alignTarget(home:URL=FileManager.default.homeDirectoryForCurrentUser) -> URL { home.appendingPathComponent("Library/Application Support/Adobe/CEP/extensions/com.alignstudio.wheel",isDirectory:true) }
    public static func noLinks(_ url:URL) throws {
        var current=url.standardizedFileURL
        while current.path != "/" {
            var info=stat()
            if lstat(current.path,&info)==0, info.st_mode & S_IFMT == S_IFLNK { throw UpdateError.invalid("Linked installation paths are not supported") }
            current.deleteLastPathComponent()
        }
    }
    public static func validateApplication(_ app:URL, team:String) throws {
        guard team.count==10, team.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber) }) else { throw UpdateError.invalid("Developer ID configuration is required before installation") }
        var code:SecStaticCode?; var requirement:SecRequirement?
        guard SecStaticCodeCreateWithPath(app as CFURL,SecCSFlags(),&code)==errSecSuccess,
              SecRequirementCreateWithString("anchor apple generic and certificate leaf[subject.OU] = \"\(team)\"" as CFString,SecCSFlags(),&requirement)==errSecSuccess,
              let code, SecStaticCodeCheckValidity(code,SecCSFlags(rawValue:kSecCSCheckAllArchitectures|kSecCSStrictValidate),requirement)==errSecSuccess else { throw UpdateError.invalid("Application Developer ID validation failed") }
        let process=Process(); process.executableURL=URL(fileURLWithPath:"/usr/sbin/spctl"); process.arguments=["--assess","--type","execute",app.path]; process.standardOutput=FileHandle.nullDevice; process.standardError=FileHandle.nullDevice
        try process.run(); process.waitUntilExit(); guard process.terminationStatus==0 else { throw UpdateError.invalid("Application notarization assessment failed") }
    }
    /// Only Align is enabled. A native AEGP destination needs a separate supported installation adapter.
    public static func install(archive:URL,envelope:Data,config:Configuration,channel:String,aeMajor:Int,highest:String?,home:URL=FileManager.default.homeDirectoryForCurrentUser) throws {
        guard config.product=="align-studio", !afterEffectsRunning() else { throw UpdateError.invalid("Close After Effects before installing") }
        let store=try StateStore(product:config.product,home:home)
        let lock=try FileLock(store.folder.appendingPathComponent("installation.lock"),nonblocking:true); defer { withExtendedLifetime(lock) {} }
        let currentPrefs=try store.load()
        guard currentPrefs.channel==channel else { throw UpdateError.invalid("Update channel changed; installation cancelled") }
        let manifest=try Verification.verify(envelope,config:config,channel:channel,aeMajor:aeMajor,highest:currentPrefs.highest[channel] ?? highest)
        try Verification.package(archive,manifest:manifest)
        let target=alignTarget(home:home), parent=target.deletingLastPathComponent()
        try noLinks(target)
        try Transaction.recover(target:target,state:store.folder)
        let versionFile=target.appendingPathComponent("VERSION.txt")
        if FileManager.default.fileExists(atPath:target.path) {
            let installed=try ReleaseVersion(String(contentsOf:versionFile,encoding:.utf8).trimmingCharacters(in:.whitespacesAndNewlines))
            guard try ReleaseVersion(manifest.version)>installed else { throw UpdateError.invalid("Update must be newer than the installed version") }
        }
        try noLinks(target); try FileManager.default.createDirectory(at:parent,withIntermediateDirectories:true)
        let stage=parent.appendingPathComponent(".align-stage-"+UUID().uuidString)
        // A verified private copy prevents a downloaded archive from changing during extraction.
        let copy=parent.appendingPathComponent(".align-package-"+UUID().uuidString+".zip")
        try FileManager.default.copyItem(at:archive,to:copy)
        defer { try? FileManager.default.removeItem(at:copy); try? FileManager.default.removeItem(at:stage) }
        try Verification.package(copy,manifest:manifest); try Archive.extract(copy,into:stage)
        guard FileManager.default.fileExists(atPath:stage.appendingPathComponent("CSXS/manifest.xml").path), FileManager.default.fileExists(atPath:stage.appendingPathComponent("META-INF/signatures.xml").path), (try String(contentsOf:stage.appendingPathComponent("VERSION.txt"),encoding:.utf8)).trimmingCharacters(in:.whitespacesAndNewlines)==manifest.version else { throw UpdateError.invalid("Incomplete signed extension package") }
        try validateApplication(stage.appendingPathComponent("updater/AlignStudioUpdater.app"),team:config.developerTeamID)
        guard !afterEffectsRunning() else { throw UpdateError.invalid("After Effects opened; installation cancelled") }
        try Transaction.commit(stage:stage,target:target,state:store.folder)
    }
    public static func rollback(home:URL=FileManager.default.homeDirectoryForCurrentUser) throws {
        guard !afterEffectsRunning() else { throw UpdateError.invalid("Close After Effects before restoring the previous version") }
        let store=try StateStore(product:"align-studio",home:home)
        let lock=try FileLock(store.folder.appendingPathComponent("installation.lock"),nonblocking:true); defer { withExtendedLifetime(lock) {} }
        let target=alignTarget(home:home); try noLinks(target)
        try Transaction.rollback(target:target,state:store.folder)
    }
}

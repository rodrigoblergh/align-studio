import AppKit
import UpdateKitCore

final class UpdaterDelegate: NSObject, NSApplicationDelegate {
    var window: NSWindow?
    var status: NSTextField?
    var config: Configuration?
    let args = CommandLine.arguments
    func value(_ name: String) -> String? { guard let i = args.firstIndex(of:name), i+1 < args.count else { return nil }; return args[i+1] }
    func applicationDidFinishLaunching(_ notification: Notification) {
        let configURL = Bundle.main.resourceURL?.appendingPathComponent("update-config.json")
        if let configURL { config = try? JSONDecoder().decode(Configuration.self, from: Data(contentsOf:configURL)) }
        if args.contains("--startup") { Task { await check(silent:true); NSApp.terminate(nil) }; return }
        NSApp.setActivationPolicy(.regular)
        let window = NSWindow(contentRect:NSRect(x:0,y:0,width:460,height:270), styleMask:[.titled,.closable,.miniaturizable], backing:.buffered, defer:false)
        window.title = config?.product == "effect-studio" ? "Effect Studio Updates" : "Align Studio Updates"
        window.backgroundColor = NSColor(calibratedWhite:31/255,alpha:1)
        let status = NSTextField(wrappingLabelWithString:"Check for signed Apple Silicon updates. Installation requires After Effects to be closed.")
        status.textColor = NSColor(calibratedWhite:218/255,alpha:1); status.frame = NSRect(x:22,y:125,width:416,height:105)
        let check = NSButton(title:"Check for updates",target:self,action:#selector(checkNow)); check.frame = NSRect(x:22,y:65,width:190,height:34)
        window.contentView?.addSubview(status); window.contentView?.addSubview(check)
        self.window = window; self.status = status; window.center(); window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps:true)
    }
    @objc func checkNow() { Task { await check(silent:false) } }
    @MainActor func check(silent: Bool) async {
        // Startup is opt-in and always remains an accessory process with no windows.
        let defaults = UserDefaults(suiteName:"com.studio.updater.\(config?.product ?? "unconfigured").v1.macos")!
        if silent && !defaults.bool(forKey:"startupChecks") { return }
        if silent, let last = defaults.object(forKey:"lastCheck") as? Date, Date().timeIntervalSince(last) < 86400 { return }
        do {
            guard let config, let raw = value("--ae-version"), let major = Int(raw.split(separator:".")[0]), let feed = URL(string:config.stableManifestUrl) else { throw UpdateError.invalid("Updater is not configured. Open it from the Studio panel.") }
            let file = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
            defer { try? FileManager.default.removeItem(at:file) }
            _ = try await Download(config:config,limit:262144,output:file).fetch(feed)
            let bytes = try Data(contentsOf:file)
            let manifest = try Verification.verify(bytes,config:config,channel:"stable",aeMajor:major,highest:defaults.string(forKey:"highest.stable"))
            let current = try ReleaseVersion(value("--current-version") ?? "1.0.1")
            let available = try ReleaseVersion(manifest.version) > current
            defaults.set(manifest.version,forKey:"highest.stable"); defaults.set(bytes,forKey:"availableEnvelope"); defaults.set(Date(),forKey:"lastCheck")
            let message = available ? "Version \(manifest.version) is available. Download and installation are not enabled in this development build." : "You are up to date."
            defaults.set(message,forKey:"lastStatus"); if !silent { status?.stringValue = message }
        } catch { if !silent { status?.stringValue = error.localizedDescription } }
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender:NSApplication) -> Bool { true }
}
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let delegate = UpdaterDelegate(); app.delegate = delegate; app.run()

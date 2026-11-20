import AppKit
import UpdateKitCore
@MainActor final class UpdaterDelegate:NSObject,NSApplicationDelegate {
    var window:NSWindow?; var status:NSTextField?; var service:UpdateService?
    var operation:Task<Void,Never>?; var startupBox:NSButton?; var downloadBox:NSButton?; var channel:NSPopUpButton?
    let args=CommandLine.arguments
    func value(_ name:String)->String? { guard let i=args.firstIndex(of:name), i+1<args.count else { return nil }; return args[i+1] }
    func applicationDidFinishLaunching(_ notification:Notification) {
        do {
            guard let configURL=Bundle.main.resourceURL?.appendingPathComponent("update-config.json"), let raw=value("--ae-version"), let first=raw.split(separator:".").first, let major=Int(first) else { throw UpdateError.invalid("Open Updates from the Studio panel so the After Effects version is known.") }
            let config=try JSONDecoder().decode(Configuration.self,from:Data(contentsOf:configURL))
            let root=value("--extension-path").map{ URL(fileURLWithPath:$0,isDirectory:true) }
            let installed=root.flatMap{ try? String(contentsOf:$0.appendingPathComponent("VERSION.txt"),encoding:.utf8).trimmingCharacters(in:.whitespacesAndNewlines) }
            service=try UpdateService(config:config,aeMajor:major,currentVersion:installed ?? value("--current-version") ?? "1.0.1")
        } catch { if args.contains("--startup") { NSApp.terminate(nil); return }; showWindow(message:error.localizedDescription); return }
        if args.contains("--startup") { operation=Task { do { _ = try await service!.check(startup:true) } catch {}; NSApp.terminate(nil) }; return }
        showWindow(message:(try? service?.store.load().lastStatus) ?? "Check for signed Apple Silicon updates.")
    }
    func showWindow(message:String) {
        NSApp.setActivationPolicy(.regular)
        let window=NSWindow(contentRect:NSRect(x:0,y:0,width:480,height:340),styleMask:[.titled,.closable,.miniaturizable],backing:.buffered,defer:false)
        window.title=service?.config.product=="effect-studio" ? "Effect Studio Updates" : "Align Studio Updates"
        window.appearance=NSAppearance(named:.darkAqua); window.backgroundColor=NSColor(calibratedWhite:31/255,alpha:1)
        let status=NSTextField(wrappingLabelWithString:message.isEmpty ? "Check for signed Apple Silicon updates." : message)
        status.textColor=NSColor(calibratedWhite:218/255,alpha:1); status.frame=NSRect(x:22,y:205,width:436,height:100); window.contentView?.addSubview(status)
        let startup=NSButton(checkboxWithTitle:"Check when the Studio panel opens",target:self,action:#selector(saveOptions)); startup.frame=NSRect(x:22,y:167,width:436,height:24)
        let download=NSButton(checkboxWithTitle:"Download updates automatically (never install)",target:self,action:#selector(saveOptions)); download.frame=NSRect(x:22,y:137,width:436,height:24)
        let channel=NSPopUpButton(frame:NSRect(x:22,y:100,width:145,height:26)); channel.addItems(withTitles:["Stable","Beta"]); channel.target=self; channel.action=#selector(saveOptions)
        if let prefs=try? service?.store.load() { startup.state=prefs.startupChecks ? .on:.off; download.state=prefs.autoDownload ? .on:.off; channel.selectItem(at:prefs.channel=="beta" ? 1:0) }
        for control in [startup,download,channel] as [NSView] { window.contentView?.addSubview(control) }
        let actions:[(String,Selector)]=[("Check",#selector(checkNow)),("Download",#selector(downloadNow)),("Install",#selector(installNow)),("Restore",#selector(restoreNow))]
        for (i,action) in actions.enumerated() { let button=NSButton(title:action.0,target:self,action:action.1); button.frame=NSRect(x:CGFloat(22+i*110),y:40,width:103,height:30); window.contentView?.addSubview(button) }
        self.window=window; self.status=status; startupBox=startup; downloadBox=download; self.channel=channel
        window.center(); window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps:true)
    }
    @objc func saveOptions() {
        do { try service?.store.modify { prefs in
            prefs.startupChecks=startupBox?.state == .on; prefs.autoDownload=downloadBox?.state == .on
            let selected=channel?.indexOfSelectedItem==1 ? "beta":"stable"
            if selected != prefs.channel { prefs.channel=selected; prefs.available=nil; prefs.pending=nil; prefs.lastStatus="Channel changed. Check for updates." }
        } } catch { status?.stringValue=error.localizedDescription }
    }
    func run(_ body:@escaping @Sendable (UpdateService) async throws -> String) {
        guard operation==nil, let service else { return }; status?.stringValue="Working…"
        operation=Task { do { let message=try await body(service); status?.stringValue=message } catch { status?.stringValue=error.localizedDescription }; operation=nil }
    }
    @objc func checkNow() { run { try await $0.check(startup:false) } }
    @objc func downloadNow() { run { try await $0.download() } }
    @objc func installNow() { run { service in try await Task.detached { try service.install() }.value } }
    @objc func restoreNow() { run { service in
        guard service.config.product=="align-studio" else { throw UpdateError.invalid("Effect Studio installation is not enabled in this build") }
        return try await Task.detached { try Installation.rollback(); return "Previous version restored. Reopen After Effects." }.value
    } }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender:NSApplication)->Bool { operation?.cancel(); return true }
}
MainActor.assumeIsolated {
    let app=NSApplication.shared
    app.setActivationPolicy(.accessory)
    let delegate=UpdaterDelegate()
    app.delegate=delegate
    withExtendedLifetime(delegate) { app.run() }
}

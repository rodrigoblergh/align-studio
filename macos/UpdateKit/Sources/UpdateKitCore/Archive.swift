import Foundation
public struct ArchiveEntry { public let path: String; public let size: Int; public let directory: Bool }
public enum Archive {
    public static func safePath(_ path: String) -> Bool {
        let value = path.hasSuffix("/") ? String(path.dropLast()) : path
        return !value.isEmpty && !value.hasPrefix("/") && !value.contains("\\") && !value.contains(":") && !value.unicodeScalars.contains(where:{$0.value < 32 || $0.value == 127}) && value.split(separator:"/",omittingEmptySubsequences:false).allSatisfy({ !$0.isEmpty && $0 != "." && $0 != ".." })
    }
    public static func inspect(_ url: URL) throws -> [ArchiveEntry] {
        let size = (try url.resourceValues(forKeys:[.fileSizeKey])).fileSize ?? 0
        guard size > 22, size <= 200*1024*1024 else { throw UpdateError.invalid("Invalid archive size") }
        let data = try Data(contentsOf:url, options:.mappedIfSafe)
        func number(_ p:Int,_ n:Int) throws -> Int { guard p >= 0, p+n <= data.count else { throw UpdateError.invalid("Truncated archive") }; var v=0; for i in 0..<n { v |= Int(data[p+i]) << (i*8) }; return v }
        var end: Int?
        for p in stride(from:data.count-22,through:max(0,data.count-65557),by:-1) { if try number(p,4) == 0x06054b50, p+22+(try number(p+20,2)) == data.count { end=p; break } }
        guard let end, try number(end+4,2)==0, try number(end+6,2)==0 else { throw UpdateError.invalid("Unsupported split archive") }
        let count=try number(end+10,2), centralSize=try number(end+12,4), start=try number(end+16,4)
        guard count > 0, count <= 2000, try number(end+8,2)==count, start+centralSize==end else { throw UpdateError.invalid("Invalid archive directory") }
        var cursor=start, total=0; var seen=Set<String>(); var entries:[ArchiveEntry]=[]
        for _ in 0..<count {
            guard try number(cursor,4)==0x02014b50 else { throw UpdateError.invalid("Invalid archive entry") }
            let flags=try number(cursor+8,2), method=try number(cursor+10,2), compressed=try number(cursor+20,4), expanded=try number(cursor+24,4), nameCount=try number(cursor+28,2), extra=try number(cursor+30,2), comment=try number(cursor+32,2), external=try number(cursor+38,4), local=try number(cursor+42,4)
            guard flags & 1 == 0, [0,8].contains(method), nameCount>0, cursor+46+nameCount+extra+comment <= end, expanded < 500*1024*1024 else { throw UpdateError.invalid("Unsupported archive entry") }
            let raw=data.subdata(in:cursor+46..<cursor+46+nameCount)
            guard let path=String(data:raw,encoding:.utf8), safePath(path) else { throw UpdateError.invalid("Unsafe archive path") }
            let kind=(external >> 16) & 0xf000
            guard [0,0x4000,0x8000].contains(kind) else { throw UpdateError.invalid("Links and special files are forbidden") }
            let directory=path.hasSuffix("/")
            guard kind != 0x4000 || directory, seen.insert(path.trimmingCharacters(in:CharacterSet(charactersIn:"/")).precomposedStringWithCanonicalMapping.lowercased()).inserted else { throw UpdateError.invalid("Conflicting archive paths") }
            // Do not let alternate-name or link metadata change the validated extraction path.
            var e=cursor+46+nameCount
            while e < cursor+46+nameCount+extra { let tag=try number(e,2), length=try number(e+2,2); guard [0x5455,0x7875].contains(tag), e+4+length <= cursor+46+nameCount+extra else { throw UpdateError.invalid("Unsupported archive metadata") }; e += 4+length }
            guard try number(local,4)==0x04034b50, try number(local+6,2)==flags, try number(local+8,2)==method else { throw UpdateError.invalid("Conflicting local archive header") }
            let ln=try number(local+26,2), le=try number(local+28,2)
            guard ln==nameCount, local+30+ln+le+compressed <= start, data.subdata(in:local+30..<local+30+ln)==raw else { throw UpdateError.invalid("Invalid local archive range") }
            // ditto reads local extra fields too. Permit only the same benign metadata.
            var l=local+30+ln
            while l < local+30+ln+le { let tag=try number(l,2), length=try number(l+2,2); guard [0x5455,0x7875].contains(tag), l+4+length <= local+30+ln+le else { throw UpdateError.invalid("Unsupported local archive metadata") }; l += 4+length }
            total += expanded; guard total <= 500*1024*1024 else { throw UpdateError.invalid("Expanded archive too large") }
            entries.append(ArchiveEntry(path:path,size:expanded,directory:directory)); cursor += 46+nameCount+extra+comment
        }
        guard cursor==end else { throw UpdateError.invalid("Trailing archive directory data") }
        return entries
    }
    public static func extract(_ archive:URL, into destination:URL) throws {
        let entries=try inspect(archive)
        guard !FileManager.default.fileExists(atPath:destination.path) else { throw UpdateError.invalid("Staging directory already exists") }
        try FileManager.default.createDirectory(at:destination,withIntermediateDirectories:false,attributes:[.posixPermissions:0o700])
        do {
            let process=Process(); process.executableURL=URL(fileURLWithPath:"/usr/bin/ditto"); process.arguments=["-x","-k",archive.path,destination.path]
            process.standardOutput=FileHandle.nullDevice; process.standardError=FileHandle.nullDevice
            try process.run(); process.waitUntilExit(); guard process.terminationStatus==0 else { throw UpdateError.invalid("Archive extraction failed") }
            let expected=Dictionary(uniqueKeysWithValues:entries.filter{ !$0.directory }.map{ ($0.path,$0.size) })
            let keys:Set<URLResourceKey>=[.isSymbolicLinkKey,.isRegularFileKey,.fileSizeKey,.isDirectoryKey]
            guard let walk=FileManager.default.enumerator(at:destination,includingPropertiesForKeys:Array(keys)) else { throw UpdateError.invalid("Cannot verify extracted archive") }
            var files=Set<String>()
            for case let file as URL in walk {
                let values=try file.resourceValues(forKeys:keys)
                guard values.isSymbolicLink != true else { throw UpdateError.invalid("Extracted link rejected") }
                if values.isDirectory==true { continue }
                let relative=String(file.path.dropFirst(destination.path.count+1))
                guard values.isRegularFile==true, expected[relative]==values.fileSize else { throw UpdateError.invalid("Extracted inventory mismatch") }; files.insert(relative)
            }
            guard files.count==expected.count else { throw UpdateError.invalid("Missing extracted files") }
        } catch { try? FileManager.default.removeItem(at:destination); throw error }
    }
}

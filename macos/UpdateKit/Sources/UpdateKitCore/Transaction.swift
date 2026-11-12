import Foundation
import CryptoKit

public enum Transaction {
    private struct Record:Codable { let backup:String; let old:[String:String]; let new:[String:String] }
    public static func inventory(_ root:URL) throws -> [String:String] {
        let keys:[URLResourceKey]=[.isDirectoryKey,.isRegularFileKey,.isSymbolicLinkKey,.fileSizeKey]
        guard let walk=FileManager.default.enumerator(at:root,includingPropertiesForKeys:keys) else { throw UpdateError.invalid("Cannot inspect installation") }
        var result:[String:String]=[:]; var total=0
        for case let url as URL in walk {
            let info=try url.resourceValues(forKeys:Set(keys))
            guard info.isSymbolicLink != true else { throw UpdateError.invalid("Installation contains a link") }
            if info.isDirectory==true { continue }
            guard info.isRegularFile==true else { throw UpdateError.invalid("Installation contains a special file") }
            total += info.fileSize ?? 0
            guard total<=500*1024*1024, result.count<2000 else { throw UpdateError.invalid("Installation inventory exceeds limits") }
            let file=try FileHandle(forReadingFrom:url); defer { try? file.close() }
            var hash=SHA256()
            while let data=try file.read(upToCount:65536), !data.isEmpty { hash.update(data:data) }
            result[String(url.path.dropFirst(root.path.count+1))]=hash.finalize().map{ String(format:"%02x",$0) }.joined()
        }
        return result
    }
    private static func backup(_ record:Record,target:URL)throws->URL {
        guard record.backup.hasPrefix(".align-backup-"), UUID(uuidString:String(record.backup.dropFirst(14))) != nil else { throw UpdateError.invalid("Invalid transaction identity") }
        let result=target.deletingLastPathComponent().appendingPathComponent(record.backup)
        try Installation.noLinks(result); return result
    }
    private static func read(_ file:URL)throws->Record {
        guard ((try file.resourceValues(forKeys:[.fileSizeKey])).fileSize ?? Int.max) < 1024*1024 else { throw UpdateError.invalid("Invalid transaction receipt") }
        return try JSONDecoder().decode(Record.self,from:Data(contentsOf:file))
    }
    public static func recover(target:URL,state:URL) throws {
        let journal=state.appendingPathComponent("transaction.json")
        guard FileManager.default.fileExists(atPath:journal.path) else { return }
        let record=try read(journal), previous=try backup(record,target:target)
        if FileManager.default.fileExists(atPath:target.path) {
            let current=try inventory(target)
            if current==record.new {
                if !record.old.isEmpty { guard try inventory(previous)==record.old else { throw UpdateError.invalid("Backup changed during interrupted update") }; try JSONEncoder().encode(record).write(to:state.appendingPathComponent("rollback.json"),options:.atomic) }
            } else if current != record.old { throw UpdateError.invalid("Interrupted installation needs manual recovery; files were preserved") }
        } else if !record.old.isEmpty {
            guard try inventory(previous)==record.old else { throw UpdateError.invalid("Interrupted backup failed verification") }
            try FileManager.default.moveItem(at:previous,to:target)
        }
        try FileManager.default.removeItem(at:journal)
    }
    public static func commit(stage:URL,target:URL,state:URL)throws {
        try recover(target:target,state:state)
        let exists=FileManager.default.fileExists(atPath:target.path)
        let record=Record(backup:".align-backup-"+UUID().uuidString,old:exists ? try inventory(target):[:],new:try inventory(stage))
        let previous=try backup(record,target:target), journal=state.appendingPathComponent("transaction.json")
        try JSONEncoder().encode(record).write(to:journal,options:.atomic)
        do {
            if exists { try FileManager.default.moveItem(at:target,to:previous) }
            try FileManager.default.moveItem(at:stage,to:target)
            try recover(target:target,state:state)
        } catch { try? recover(target:target,state:state); throw error }
    }
    public static func rollback(target:URL,state:URL)throws {
        try recover(target:target,state:state)
        let receipt=state.appendingPathComponent("rollback.json"), record=try read(receipt), previous=try backup(record,target:target)
        guard try inventory(previous)==record.old else { throw UpdateError.invalid("Previous installation changed; rollback refused") }
        // Reuse the journalled transaction, preserving the displaced current installation.
        try commit(stage:previous,target:target,state:state)
    }
}

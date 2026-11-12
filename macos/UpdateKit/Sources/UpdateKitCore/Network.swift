import Foundation
public enum Route {
    public static func allowed(_ url: URL, config: Configuration, asset: Bool) -> Bool {
        guard url.scheme == "https", url.user == nil, url.password == nil, url.fragment == nil, url.port == nil || url.port == 443 else { return false }
        if asset && url.host == "release-assets.githubusercontent.com" { return true }
        return url.host == "github.com" && url.path.hasPrefix("/rodrigoblergh/\(config.repository)/releases/download/")
    }
}
public final class Download: NSObject, URLSessionDataDelegate, @unchecked Sendable {
    private let config: Configuration
    private let limit: Int
    private let output: URL
    private var file: FileHandle?
    private var count = 0
    private var redirects = 0
    private var continuation: CheckedContinuation<URL, Error>?
    private var session: URLSession?
    private var task: URLSessionDataTask?
    private var failure: Error?
    public init(config: Configuration, limit: Int, output: URL) { self.config = config; self.limit = limit; self.output = output }
    public func fetch(_ url: URL) async throws -> URL {
        guard Route.allowed(url, config: config, asset: false) else { throw UpdateError.invalid("Untrusted download address") }
        guard FileManager.default.createFile(atPath: output.path, contents: nil, attributes: [.posixPermissions: 0o600]) else { throw UpdateError.invalid("Cannot create download") }
        file = try FileHandle(forWritingTo: output)
        return try await withTaskCancellationHandler(operation: {
            try await withCheckedThrowingContinuation { continuation in
                self.continuation = continuation
                let configuration = URLSessionConfiguration.ephemeral
                configuration.timeoutIntervalForRequest = 30; configuration.timeoutIntervalForResource = 180
                configuration.httpCookieStorage = nil; configuration.urlCredentialStorage = nil
                let queue = OperationQueue(); queue.maxConcurrentOperationCount = 1
                self.session = URLSession(configuration: configuration, delegate: self, delegateQueue: queue)
                self.task = self.session!.dataTask(with: url); self.task!.resume()
            }
        }, onCancel: { self.task?.cancel() })
    }
    public func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        redirects += 1
        guard redirects <= 5, let url = request.url, Route.allowed(url, config: config, asset: true) else { failure = UpdateError.invalid("Untrusted download redirect"); completionHandler(nil); task.cancel(); return }
        var clean = URLRequest(url: url); clean.httpMethod = "GET"; completionHandler(clean)
    }
    public func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        guard let http = response as? HTTPURLResponse, http.statusCode == 200, response.expectedContentLength <= Int64(limit) else { failure = UpdateError.invalid("Download unavailable or too large"); completionHandler(.cancel); return }
        completionHandler(.allow)
    }
    public func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        count += data.count
        do { guard count <= limit else { throw UpdateError.invalid("Download exceeds size limit") }; try file?.write(contentsOf: data) } catch { failure = error; dataTask.cancel() }
    }
    public func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        try? file?.close(); file = nil
        if let error = failure ?? error { try? FileManager.default.removeItem(at: output); continuation?.resume(throwing: error) } else { continuation?.resume(returning: output) }
        continuation = nil; session.finishTasksAndInvalidate(); self.session = nil
    }
}

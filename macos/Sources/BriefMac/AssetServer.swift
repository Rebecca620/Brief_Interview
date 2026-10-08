import Foundation
import Network

/// App-owned loopback server: no Node process, no external interface, no arbitrary filesystem reads.
final class AssetServer {
  let token = UUID().uuidString
  let root: URL
  let store: LocalStore
  private var listener: NWListener?
  private let queue = DispatchQueue(label: "Brief.assets", qos: .userInitiated)
  init(root: URL, store: LocalStore) {
    self.root = root
    self.store = store
  }
  func start(_ completion: @escaping (Result<URL, Error>) -> Void) throws {
    let parameters = NWParameters.tcp
    parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: .any)
    let listener = try NWListener(using: parameters)
    self.listener = listener
    var completed = false
    listener.stateUpdateHandler = { [weak self] state in
      guard let self, !completed else { return }
      switch state {
      case .ready:
        completed = true
        completion(
          .success(
            URL(string: "http://127.0.0.1:\(listener.port!.rawValue)/?session=\(self.token)")!))
      case .failed(let error):
        completed = true
        completion(.failure(error))
      default: break
      }
    }
    listener.newConnectionHandler = { [weak self] connection in
      guard let self else { return }
      connection.start(queue: self.queue)
      self.queue.asyncAfter(deadline: .now() + 30) { connection.cancel() }
      self.receive(connection, accumulated: Data())
    }
    listener.start(queue: queue)
  }
  private func receive(_ connection: NWConnection, accumulated: Data) {
    connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) {
      [weak self] data, _, complete, error in
      guard let self else { return }
      var bytes = accumulated
      if let data { bytes.append(data) }
      guard bytes.count <= 300 * 1024 * 1024 else {
        self.respond(connection, status: 413, body: Data())
        return
      }
      if let range = bytes.range(of: Data("\r\n\r\n".utf8)),
        let header = String(data: bytes[..<range.lowerBound], encoding: .utf8)
      {
        let lines = header.components(separatedBy: "\r\n")
        var headers: [String: String] = [:]
        for line in lines.dropFirst() {
          if let colon = line.firstIndex(of: ":") {
            headers[String(line[..<colon]).lowercased()] = line[line.index(after: colon)...]
              .trimmingCharacters(in: .whitespaces)
          }
        }
        guard headers["transfer-encoding"] == nil,
          let length = Int(headers["content-length"] ?? "0"), length >= 0,
          length <= 280 * 1024 * 1024
        else {
          self.respond(connection, status: 400, body: Data())
          return
        }
        if bytes.count - range.upperBound >= length {
          let first = (lines.first ?? "").split(separator: " ")
          guard first.count == 3 else {
            self.respond(connection, status: 400, body: Data())
            return
          }
          self.handle(
            connection, method: String(first[0]), target: String(first[1]), headers: headers,
            body: Data(bytes[range.upperBound..<(range.upperBound + length)]))
          return
        }
      } else if bytes.count > 16384 {
        self.respond(connection, status: 400, body: Data())
        return
      }
      if complete || error != nil {
        connection.cancel()
        return
      }
      self.receive(connection, accumulated: bytes)
    }
  }
  private func handle(
    _ connection: NWConnection, method: String, target: String, headers: [String: String],
    body: Data
  ) {
    guard let port = listener?.port?.rawValue, headers["host"] == "127.0.0.1:\(port)",
      let components = URLComponents(string: "http://127.0.0.1:\(port)\(target)")
    else {
      respond(connection, status: 403, body: Data())
      return
    }
    let path = components.path
    let initial =
      path == "/"
      && components.queryItems?.contains(where: { $0.name == "session" && $0.value == token })
        == true
    let authenticated =
      headers["cookie"]?.components(separatedBy: ";").contains(where: {
        $0.trimmingCharacters(in: .whitespaces) == "brief_session=\(token)"
      }) == true
    guard initial || authenticated else {
      respond(connection, status: 403, body: Data())
      return
    }
    if let origin = headers["origin"], origin != "http://127.0.0.1:\(port)" {
      respond(connection, status: 403, body: Data())
      return
    }
    do {
      if path == "/native/batch" {
        guard method == "POST", headers["x-brief-native"] == token,
          let object = try JSONSerialization.jsonObject(with: body) as? [String: Any],
          let writes = object["writes"] as? [String: String]
        else {
          respond(connection, status: 403, body: Data())
          return
        }
        try store.writeBatch(writes, expected: object["expected"] as? String)
        json(connection, value: ["saved": true])
        return
      }
      if path == "/native/storage" {
        guard headers["x-brief-native"] == token else {
          respond(connection, status: 403, body: Data())
          return
        }
        if method == "GET",
          let key = components.queryItems?.first(where: { $0.name == "key" })?.value
        {
          json(connection, value: ["value": try store.read(key) as Any? ?? NSNull()])
          return
        }
        if method == "POST",
          let object = try JSONSerialization.jsonObject(with: body) as? [String: String],
          let key = object["key"], let value = object["value"]
        {
          try store.write(key, value: value)
          json(connection, value: ["saved": true])
          return
        }
        respond(connection, status: 400, body: Data())
        return
      }
      guard method == "GET" else {
        respond(connection, status: 405, body: Data())
        return
      }
      if path == "/api/ai/status" {
        json(connection, value: ["enabled": false])
        return
      }
      let relative = path == "/" ? "index.html" : String(path.dropFirst())
      guard !relative.contains(".."), !relative.contains("\\"), !relative.hasPrefix("."),
        ["index.html", "style.css", "sample-metrics.csv"].contains(relative)
          || relative.hasPrefix("src/") || relative.hasPrefix("vendor/")
      else {
        respond(connection, status: 404, body: Data())
        return
      }
      let file = root.appendingPathComponent(relative).resolvingSymlinksInPath()
      guard file.path.hasPrefix(root.resolvingSymlinksInPath().path + "/") else {
        respond(connection, status: 403, body: Data())
        return
      }
      let types = [
        "html": "text/html; charset=utf-8", "js": "text/javascript", "mjs": "text/javascript",
        "css": "text/css", "csv": "text/csv", "ttf": "font/ttf",
      ]
      let extra =
        initial ? ["Set-Cookie": "brief_session=\(token); HttpOnly; SameSite=Strict; Path=/"] : [:]
      respond(
        connection, status: 200, body: try Data(contentsOf: file),
        type: types[file.pathExtension] ?? "application/octet-stream", extra: extra)
    } catch {
      json(
        connection, status: path.hasPrefix("/native/") ? 500 : 404,
        value: ["error": path.hasPrefix("/native/") ? error.localizedDescription : "Not found"])
    }
  }
  private func json(_ connection: NWConnection, status: Int = 200, value: [String: Any]) {
    respond(
      connection, status: status,
      body: (try? JSONSerialization.data(withJSONObject: value)) ?? Data(), type: "application/json"
    )
  }
  private func respond(
    _ connection: NWConnection, status: Int, body: Data, type: String = "text/plain",
    extra: [String: String] = [:]
  ) {
    let headers = [
      "Content-Type": type, "Content-Length": "\(body.count)", "Connection": "close",
      "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; worker-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    ].merging(extra) { _, new in new }
    var response = Data(
      ("HTTP/1.1 \(status) Response\r\n" + headers.map { "\($0.key): \($0.value)\r\n" }.joined()
        + "\r\n").utf8)
    response.append(body)
    connection.send(content: response, completion: .contentProcessed { _ in connection.cancel() })
  }
  func stop() { listener?.cancel() }
}

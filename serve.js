#!/usr/bin/env node
/* Minimal static file server for the NextAvatar demo site.
 *
 * The system `python3 -m http.server` on this host is a patched build
 * ("Secure_SimpleHTTP") whose ACL rejects requests arriving on the
 * container's external interface, so this standalone server is used instead.
 *
 *   node serve.js [port]        # default 8809
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

const ROOT = __dirname;
const PORT = Number(process.argv[2] || process.env.PORT || 8809);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".pdf": "application/pdf",
};

function send(res, status, headers, body) {
  res.writeHead(status, headers);
  if (body === undefined) res.end();
  else res.end(body);
}

function notFound(res) {
  send(res, 404, { "Content-Type": "text/plain; charset=utf-8" }, "404 Not Found\n");
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(url.parse(req.url).pathname);
  } catch (e) {
    return send(res, 400, { "Content-Type": "text/plain" }, "400 Bad Request\n");
  }

  // Resolve inside ROOT only (reject traversal such as ../../etc/passwd).
  const target = path.resolve(ROOT, "." + pathname);
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) return notFound(res);

  fs.stat(target, (err, stat) => {
    if (err) return notFound(res);

    let file = target;
    if (stat.isDirectory()) {
      file = path.join(target, "index.html");
      if (!fs.existsSync(file)) return notFound(res);
      stat = fs.statSync(file);
    }

    const type = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
    const headers = {
      "Content-Type": type,
      "Cache-Control": "public, max-age=300",
      "Accept-Ranges": "bytes",
    };

    // Range support keeps <video> seeking and lazy loading responsive.
    const range = req.headers.range;
    if (range && /^bytes=\d*-\d*$/.test(range)) {
      const [startRaw, endRaw] = range.replace("bytes=", "").split("-");
      let start = startRaw ? parseInt(startRaw, 10) : 0;
      let end = endRaw ? parseInt(endRaw, 10) : stat.size - 1;
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= stat.size) {
        return send(res, 416, { "Content-Range": `bytes */${stat.size}` });
      }
      end = Math.min(end, stat.size - 1);
      headers["Content-Range"] = `bytes ${start}-${end}/${stat.size}`;
      headers["Content-Length"] = end - start + 1;
      res.writeHead(206, headers);
      if (req.method === "HEAD") return res.end();
      return fs.createReadStream(file, { start, end }).pipe(res);
    }

    headers["Content-Length"] = stat.size;
    res.writeHead(200, headers);
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`NextAvatar demo site: http://0.0.0.0:${PORT}/  (root: ${ROOT})`);
});

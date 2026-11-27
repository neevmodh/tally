// Bolo Bijli - tiny dependency-free server: serves the PWA and stores drafted complaints.
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, "public");
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const COMPLAINTS_FILE = path.join(DATA_DIR, "complaints.json");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

function readComplaints() {
  try { return JSON.parse(fs.readFileSync(COMPLAINTS_FILE, "utf8")); } catch { return []; }
}
function writeComplaints(list) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(COMPLAINTS_FILE, JSON.stringify(list, null, 2));
}
function send(res, code, body, type = "application/json") {
  res.writeHead(code, { "Content-Type": type });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 1e5) req.destroy(); });
    req.on("end", () => { try { resolve(JSON.parse(data || "{}")); } catch (e) { reject(e); } });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname === "/api/health") return send(res, 200, { ok: true });

  if (url.pathname === "/api/complaints" && req.method === "GET") {
    return send(res, 200, readComplaints());
  }
  if (url.pathname === "/api/complaints" && req.method === "POST") {
    try {
      const body = await readBody(req);
      if (!body.text || typeof body.text !== "string") return send(res, 400, { error: "text required" });
      const list = readComplaints();
      const item = {
        id: "BS-" + String(list.length + 1001),
        text: body.text.slice(0, 2000),
        lang: String(body.lang || "en").slice(0, 5),
        bill: body.bill || null,
        createdAt: new Date().toISOString(),
      };
      list.push(item);
      writeComplaints(list);
      return send(res, 201, item);
    } catch { return send(res, 400, { error: "bad json" }); }
  }

  // static files
  let rel = url.pathname === "/" ? "/index.html" : url.pathname;
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) return send(res, 403, "Forbidden", "text/plain");
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, "Not found", "text/plain");
    send(res, 200, buf, TYPES[path.extname(file)] || "application/octet-stream");
  });
});

server.listen(PORT, () => console.log("Bolo Bijli running on http://localhost:" + PORT));

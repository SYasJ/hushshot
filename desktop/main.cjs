/**
 * Optional Electron shell around the built web app (experimental).
 *   npm run build && npx electron desktop/main.cjs
 * It serves ./dist from a loopback-only HTTP server (WASM/workers don't like file://) and blocks every
 * request that is not to that server, so the desktop app is offline-only by construction.
 */
const { app, BrowserWindow, session, shell } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const DIST = path.join(__dirname, '..', 'dist');
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.wasm': 'application/wasm', '.json': 'application/json', '.gz': 'application/gzip', '.bin': 'application/octet-stream',
};

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      let file = path.normalize(path.join(DIST, rel === '/' ? 'index.html' : rel)); // must stay inside dist/ (not a sibling like dist-x/)
      if (!file.startsWith(DIST + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

app.whenReady().then(async () => {
  const port = await serve();
  const origin = `http://127.0.0.1:${port}`;
  session.defaultSession.webRequest.onBeforeRequest((d, cb) => cb({ cancel: !(d.url.startsWith(origin) || /^(blob|data|devtools):/.test(d.url)) }));
  const win = new BrowserWindow({
    width: 1360, height: 900, backgroundColor: '#0a0c11', title: 'RedactIt',
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.loadURL(origin);
});
app.on('window-all-closed', () => app.quit());

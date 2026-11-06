// 小柚 Mac 应用：本机静态服务 + ESP32 桥接 + 全屏窗口。
// 资产文件夹（ComfyUI 出的背景、立绘部件、衣服）放在外接盘，丢进去就能用，不用重新打包。
import { app, BrowserWindow, Menu, dialog, screen, shell, powerSaveBlocker } from 'electron';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startBridge } from '../bridge/bridge.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(here, '..', 'dist');
const CONFIG = path.join(app.getPath('userData'), 'config.json');
const DEFAULT_ASSETS = '/Volumes/固态T800/小柚资产';
const WEB_PORT = 5180;
const BRIDGE_PORT = 8765;

function loadConfig() {
  const def = { assetsDir: DEFAULT_ASSETS, kiosk: true, openAtLogin: true, displayId: null, query: '' };
  try { return { ...def, ...JSON.parse(fs.readFileSync(CONFIG, 'utf8')) }; } catch { return def; }
}
function saveConfig() {
  fs.mkdirSync(path.dirname(CONFIG), { recursive: true });
  fs.writeFileSync(CONFIG, JSON.stringify(config, null, 2));
}
let config = loadConfig();

// 资产子目录：backgrounds/ 背景图，character/ 立绘部件，wardrobe/ 衣服
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.vrm': 'application/octet-stream', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.md': 'text/plain; charset=utf-8',
};
const IMAGE = /\.(png|jpe?g|webp)$/i;

function safeJoin(root, rel) {
  const p = path.normalize(path.join(root, rel));
  return p.startsWith(path.normalize(root)) ? p : null;
}

function serveFile(res, file) {
  fs.readFile(file, (err, data) => {
    if (err) { res.statusCode = 404; return res.end('not found'); }
    res.setHeader('content-type', TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
    res.setHeader('cache-control', 'no-cache');
    res.end(data);
  });
}

function startWeb() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let rel = decodeURIComponent(url.pathname);
    // 背景图：外接盘 backgrounds/ 优先，清单自动按目录生成
    if (rel === '/backgrounds/manifest.json') {
      const dir = path.join(config.assetsDir, 'backgrounds');
      let files = [];
      try { files = fs.readdirSync(dir).filter((f) => IMAGE.test(f)); } catch { /* 盘没插 */ }
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify(files));
    }
    if (rel.startsWith('/backgrounds/') || rel.startsWith('/character/') || rel.startsWith('/wardrobe/')) {
      const f = safeJoin(config.assetsDir, rel);
      if (f && fs.existsSync(f)) return serveFile(res, f);
    }
    if (rel === '/') rel = '/index.html';
    const f = safeJoin(SITE, rel);
    if (!f) { res.statusCode = 403; return res.end(); }
    serveFile(res, f);
  });
  server.listen(WEB_PORT, '127.0.0.1');
  return server;
}

function pickDisplay() {
  const all = screen.getAllDisplays();
  if (config.displayId) {
    const d = all.find((x) => x.id === config.displayId);
    if (d) return d;
  }
  // 有竖屏就用竖屏（小柚的展示屏），否则用最大的屏
  const portrait = all.filter((d) => d.size.height > d.size.width);
  const pool = portrait.length ? portrait : all;
  return pool.sort((a, b) => b.size.width * b.size.height - a.size.width * a.size.height)[0];
}

let win;
function createWindow() {
  const d = pickDisplay();
  win = new BrowserWindow({
    x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height,
    backgroundColor: '#111111',
    title: '小柚',
    kiosk: config.kiosk,
    fullscreen: config.kiosk,
    autoHideMenuBar: true,
    webPreferences: { backgroundThrottling: false },
  });
  const q = new URLSearchParams(config.query || '');
  if (config.kiosk) q.set('kiosk', '');
  q.set('bridge', `ws://127.0.0.1:${BRIDGE_PORT}`);
  win.loadURL(`http://127.0.0.1:${WEB_PORT}/?${q.toString().replace(/=(&|$)/g, '$1')}`);
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

function buildMenu() {
  const toggle = (key) => () => { config[key] = !config[key]; saveConfig(); applyLogin(); buildMenu(); if (key === 'kiosk') { win?.setKiosk(config.kiosk); win?.webContents.reload(); } };
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: '小柚', submenu: [
      { label: '全屏展示（隐藏面板）', type: 'checkbox', checked: config.kiosk, click: toggle('kiosk'), accelerator: 'Cmd+K' },
      { label: '开机自动启动', type: 'checkbox', checked: config.openAtLogin, click: toggle('openAtLogin') },
      { label: '选择资产文件夹…', click: chooseAssets },
      { label: '打开资产文件夹', click: () => { fs.mkdirSync(config.assetsDir, { recursive: true }); shell.openPath(config.assetsDir); } },
      { label: '移到下一块屏幕', click: nextDisplay },
      { type: 'separator' },
      { role: 'reload', label: '重新加载' },
      { role: 'toggleDevTools', label: '开发者工具' },
      { type: 'separator' },
      { role: 'quit', label: '退出小柚' },
    ] },
    { role: 'editMenu', label: '编辑' },
  ]));
}

async function chooseAssets() {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], defaultPath: config.assetsDir });
  if (r.canceled || !r.filePaths[0]) return;
  config.assetsDir = r.filePaths[0];
  saveConfig();
  ensureAssetDirs();
  win?.webContents.reload();
}

function nextDisplay() {
  const all = screen.getAllDisplays();
  const cur = screen.getDisplayMatching(win.getBounds());
  const next = all[(all.findIndex((d) => d.id === cur.id) + 1) % all.length];
  config.displayId = next.id;
  saveConfig();
  win.setKiosk(false);
  win.setBounds(next.bounds);
  if (config.kiosk) win.setKiosk(true);
}

function ensureAssetDirs() {
  for (const sub of ['backgrounds', 'character', 'wardrobe']) {
    try { fs.mkdirSync(path.join(config.assetsDir, sub), { recursive: true }); } catch { /* 外接盘没插时忽略 */ }
  }
}

function applyLogin() {
  if (process.platform === 'darwin') app.setLoginItemSettings({ openAtLogin: !!config.openAtLogin });
}

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });

app.whenReady().then(() => {
  ensureAssetDirs();
  applyLogin();
  startWeb();
  startBridge({ port: BRIDGE_PORT });
  powerSaveBlocker.start('prevent-display-sleep'); // 展示时不黑屏
  buildMenu();
  createWindow();
});
app.on('window-all-closed', () => app.quit());

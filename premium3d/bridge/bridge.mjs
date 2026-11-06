// 状态接口桥接：ESP32（或任何程序）HTTP POST /event 发 JSON → WebSocket 广播给小柚页面。
// 命令行（bridge/server.mjs）和 Mac 应用（electron/main.mjs）共用。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { validate } from './protocol.mjs';

// logDir：给了就把对话（heard = 用户说的，say = 小柚说的）按天追加到 logDir/YYYY-MM-DD.jsonl，
// 供每天读日志、补小柚的场景/衣服/动作用。
export function chatLogLine(m, now = new Date()) {
  if (m.type !== 'say' && m.type !== 'heard') return null;
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const who = m.type === 'heard' ? 'user' : 'xiaoyou';
  return { day, line: JSON.stringify({ t: now.toISOString(), who, text: m.text, ...(m.emotion ? { emotion: m.emotion } : {}), ...(m.scene ? { scene: m.scene } : {}) }) };
}

export function startBridge({ port = 8765, host = '0.0.0.0', log = console.log, logDir = null } = {}) {
  function record(m) {
    if (!logDir) return;
    const r = chatLogLine(m);
    if (!r) return;
    try { fs.mkdirSync(logDir, { recursive: true }); fs.appendFileSync(path.join(logDir, `${r.day}.jsonl`), r.line + '\n'); } catch (e) { log(`写聊天记录失败：${e.message}`); }
  }
  const server = http.createServer((req, res) => {
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', 'content-type');
    if (req.method === 'OPTIONS') return res.end();
    if (req.method === 'GET' && req.url === '/health') {
      return res.end(JSON.stringify({ ok: true, clients: wss.clients.size }));
    }
    if (req.method !== 'POST' || req.url !== '/event') { res.statusCode = 404; return res.end(); }
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      let m;
      try { m = JSON.parse(body); } catch { res.statusCode = 400; return res.end('invalid json'); }
      const err = validate(m);
      if (err) { res.statusCode = 400; return res.end(err); }
      record(m);
      const n = m.type === 'heard' ? 0 : broadcast(m);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true, delivered: n }));
    });
  });

  const wss = new WebSocketServer({ server });
  function broadcast(m, except) {
    const s = JSON.stringify(m);
    let n = 0;
    for (const c of wss.clients) if (c !== except && c.readyState === 1) { c.send(s); n++; }
    return n;
  }
  wss.on('connection', (ws) => {
    ws.on('message', (data) => {
      try {
        const m = JSON.parse(data);
        if (!validate(m)) { record(m); if (m.type !== 'heard') broadcast(m, ws); }
      } catch { /* ignore */ }
    });
  });

  server.on('error', (e) => log(`桥接服务启动失败：${e.message}`));
  server.listen(port, host, () => log(`小柚桥接服务：http://${host}:${port}/event  ws://${host}:${port}`));
  return { server, wss, broadcast, close: () => { wss.close(); server.close(); } };
}

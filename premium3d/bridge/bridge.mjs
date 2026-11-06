// 状态接口桥接：ESP32（或任何程序）HTTP POST /event 发 JSON → WebSocket 广播给小柚页面。
// 命令行（bridge/server.mjs）和 Mac 应用（electron/main.mjs）共用。
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { validate } from './protocol.mjs';

export function startBridge({ port = 8765, host = '0.0.0.0', log = console.log } = {}) {
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
      const n = broadcast(m);
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
        if (!validate(m)) broadcast(m, ws);
      } catch { /* ignore */ }
    });
  });

  server.on('error', (e) => log(`桥接服务启动失败：${e.message}`));
  server.listen(port, host, () => log(`小柚桥接服务：http://${host}:${port}/event  ws://${host}:${port}`));
  return { server, wss, broadcast, close: () => { wss.close(); server.close(); } };
}

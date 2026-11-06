// 状态接口桥接服务：ESP32（或任何程序）用 HTTP POST 发 JSON，这里转发给 3D 页面（WebSocket）。
//
//   curl -X POST localhost:8765/event -H 'content-type: application/json' \
//        -d '{"type":"say","text":"你好呀，今天在公司加班吗？"}'
//
// 支持的消息见 README「状态接口」一节。也可以直接用 WebSocket 连 ws://<mac>:8765 发同样的 JSON。
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { validate } from './protocol.mjs';

const PORT = Number(process.env.PORT || 8765);
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

server.listen(PORT, () => console.log(`小柚桥接服务：http://0.0.0.0:${PORT}/event  ws://0.0.0.0:${PORT}`));

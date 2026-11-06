// 连接本机桥接服务（bridge/server.mjs）。断线自动重连，连不上也不影响演示。
export function connectBridge(url, onMessage, onStatus) {
  let ws;
  let delay = 1000;
  const open = () => {
    try { ws = new WebSocket(url); } catch { return retry(); }
    ws.onopen = () => { delay = 1000; onStatus?.(true); };
    ws.onmessage = (e) => {
      try { onMessage(JSON.parse(e.data)); } catch (err) { console.warn('bad bridge message', err); }
    };
    ws.onclose = () => { onStatus?.(false); retry(); };
    ws.onerror = () => ws.close();
  };
  const retry = () => { setTimeout(open, delay); delay = Math.min(delay * 2, 15000); };
  open();
  return { send: (m) => ws?.readyState === 1 && ws.send(JSON.stringify(m)) };
}

import { randomUUID } from 'node:crypto';

// NapCat 可以只开放正向 WebSocket；每个请求使用独立连接，断线时不重发发送动作。
export async function onebotRequest(config, action, params = {}, timeoutMs = 15000) {
  const c = config?.snowluma ?? config ?? {};
  let body;
  if (c.transport === 'websocket') {
    const url = new URL(c.wsUrl);
    if (!['ws:', 'wss:'].includes(url.protocol)) throw new Error('OneBot wsUrl 必须使用 ws/wss');
    if (c.accessToken) url.searchParams.set('access_token', c.accessToken);
    body = await new Promise((resolve, reject) => {
      const echo = randomUUID();
      const socket = new WebSocket(url);
      let settled = false;
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.close();
        if (error) reject(error);
        else resolve(value);
      };
      const timer = setTimeout(() => finish(new Error(`OneBot ${action} 超时，未自动重试`)), timeoutMs);
      socket.addEventListener('open', () => socket.send(JSON.stringify({ action, params, echo })));
      socket.addEventListener('message', event => {
        let message;
        try { message = JSON.parse(String(event.data)); }
        catch { finish(new Error('OneBot 返回无效 JSON')); return; }
        if (message.echo === echo) finish(null, message);
      });
      socket.addEventListener('error', () => finish(new Error(`OneBot ${action} WebSocket 连接失败`)));
      socket.addEventListener('close', () => finish(new Error(`OneBot ${action} 收到响应前连接关闭`)));
    });
  } else if (c.transport === undefined || c.transport === 'http') {
    const base = String(c.httpUrl || 'http://127.0.0.1:3000').replace(/\/+$/, '');
    const response = await fetch(`${base}/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(c.accessToken ? { authorization: `Bearer ${c.accessToken}` } : {}) },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`OneBot ${action} HTTP ${response.status}`);
    body = await response.json();
  } else {
    throw new Error(`不支持的 OneBot transport: ${c.transport}`);
  }
  if (body?.status !== 'ok' || body.retcode !== 0) {
    throw new Error(`OneBot ${action} 失败: retcode=${body?.retcode} ${body?.wording || body?.message || ''}`);
  }
  return body.data;
}

// 网页界面的本地服务：只监听 127.0.0.1，每次启动生成随机口令，没有口令的请求一律拒绝。
// 页面：GET /（index.html、app.js、app.css）；数据：GET /api/events（SSE 推送状态）；操作：POST /api/*。
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { pageStrings } from './strings.js';
import { lang } from '../i18n/index.js';
import { RUNNABLE, listDirs } from './session.js';

const PUBLIC = new URL('./public/', import.meta.url);
const STATIC = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/app.css': ['app.css', 'text/css'] };
const MAX_BODY = 64 * 1024;

export const newToken = () => randomBytes(24).toString('hex');

const sameToken = (a, b) => {
  const x = Buffer.from(String(a ?? '')), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

// 防 DNS rebinding：Host 只能是本机地址；防其他网页偷偷提交：Origin 有的话必须是本服务
function sameSite(req, port) {
  const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!hosts.includes(req.headers.host)) return false;
  const origin = req.headers.origin;
  return !origin || hosts.some((h) => origin === `http://${h}`);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
};

// session：createWebSession 的返回值。返回 http.Server（还没 listen）
export function createWebServer({ session, token }) {
  // 页面文件启动时读一次：页面和接口永远出自同一个版本（改了代码要重启 ccpm web）
  const files = Object.fromEntries(Object.entries(STATIC).map(([path, [file, type]]) => [path, [readFileSync(new URL(file, PUBLIC)), type]]));
  const server = createServer(async (req, res) => {
    const port = server.address()?.port;
    const url = new URL(req.url, 'http://localhost');
    if (!sameSite(req, port)) return send(res, 403, { error: 'forbidden' });

    if (req.method === 'GET' && STATIC[url.pathname]) {
      const [body, type] = files[url.pathname];
      res.setHeader('content-security-policy', "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'");
      return send(res, 200, body, type);
    }
    if (!url.pathname.startsWith('/api/')) return send(res, 404, { error: 'not found' });

    // 口令：EventSource 不能带请求头，所以 SSE 用 ?t=，其余接口用请求头
    const given = req.method === 'GET' ? url.searchParams.get('t') : req.headers['x-ccpm-token'];
    if (!sameToken(given, token)) return send(res, 401, { error: 'unauthorized' });

    if (req.method === 'GET' && url.pathname === '/api/strings') return send(res, 200, { lang: lang(), strings: pageStrings() });
    if (req.method === 'GET' && url.pathname === '/api/plugin') {
      const info = await session.pluginInfo(url.searchParams.get('market') ?? '', url.searchParams.get('name') ?? '').catch(() => null);
      return info ? send(res, 200, info) : send(res, 404, { error: 'not found' });
    }
    if (req.method === 'GET' && url.pathname === '/api/dirs') {
      const r = listDirs(url.searchParams.get('path'));
      return r ? send(res, 200, r) : send(res, 404, { error: 'not a folder' });
    }
    if (req.method === 'GET' && url.pathname === '/api/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive' });
      const off = session.subscribe((s) => res.write(`data: ${JSON.stringify(s)}\n\n`));
      const ping = setInterval(() => res.write(': ping\n\n'), 15000);
      req.on('close', () => { clearInterval(ping); off(); });
      return;
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' });

    let body;
    try { body = await readJson(req); } catch { return send(res, 400, { error: 'bad request' }); }
    // 操作在后台进行，进度和结果通过 /api/events 推送；这里只回“收到了”。一次只做一件事
    const start = (fn) => {
      if (session.state().busy) return send(res, 409, { error: 'busy' });
      fn().catch(() => {});
      return send(res, 202, { ok: true });
    };
    switch (url.pathname) {
      case '/api/answer':
        return send(res, session.answer(Number(body.id), body.value) ? 200 : 409, { ok: true });
      case '/api/run': {
        if (!RUNNABLE.includes(body.cmd)) return send(res, 400, { error: 'unknown command' });
        const names = Array.isArray(body.names) ? body.names.filter((n) => typeof n === 'string') : [];
        return start(() => session.run({ cmd: body.cmd, names, market: typeof body.market === 'string' ? body.market : undefined }));
      }
      case '/api/select': {
        const pick = (k) => (typeof body[k] === 'string' ? body[k] : undefined);
        return start(() => session.select({ scope: pick('scope'), dir: pick('dir'), market: pick('market') }));
      }
      case '/api/marketplace':
        if (typeof body.source !== 'string' || !body.source.trim()) return send(res, 400, { error: 'source required' });
        return start(() => session.addMarketplace(body.source));
      case '/api/rescan': return start(() => session.rescan());
      default: return send(res, 404, { error: 'not found' });
    }
  });
  return server;
}

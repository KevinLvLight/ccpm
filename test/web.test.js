process.env.CCPM_LANG ??= 'zh';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startWeb } from '../src/web/index.js';
import { strip } from '../src/ui.js';

const here = dirname(fileURLToPath(import.meta.url));
const mkt = mkdtempSync(join(tmpdir(), 'ccpm-web-mkt-'));
cpSync(join(here, 'fixtures/marketplace'), mkt, { recursive: true });
const TOKEN = 'tok-123';
const inst = (name, o = {}) => ({ id: `${name}@acme-plugins`, name, marketplace: 'acme-plugins', version: '1.0.0', scope: 'user', enabled: true, ...o });

function fakeClaude({ installed = [], markets = [{ name: 'acme-plugins', installLocation: mkt }] } = {}) {
  const calls = [];
  const rec = (n, f) => async (...a) => { calls.push([n, ...a]); return f?.(...a); };
  return {
    calls,
    checkCapabilities: async () => ({ ok: true, missing: [] }),
    listMarketplaces: async () => markets.map((m) => ({ ...m })),
    updateMarketplace: async () => {},
    listInstalled: async () => [...installed],
    getUnconfigured: async (id) => (id.startsWith('a@') && !calls.some((c) => c[0] === 'configure') ? ['token'] : []),
    listUserMcp: async () => [],
    install: rec('install', (id) => installed.push(inst(id.split('@')[0], { version: '1.1.0' }))),
    configure: rec('configure'),
    enable: rec('enable'),
    disable: rec('disable'),
    update: rec('update'),
    uninstall: rec('uninstall'),
    prune: async () => ({ ids: [] }),
  };
}
const stateFile = (current = 'acme-plugins') => {
  const f = join(mkdtempSync(join(tmpdir(), 'ccpm-web-state-')), 'ccpm.json');
  if (current) writeFileSync(f, JSON.stringify({ current, marketplaces: {} }));
  return f;
};

async function boot(claude, file = stateFile()) {
  const logged = [];
  const web = await startWeb({ context: { claude, stateFile: file }, token: TOKEN, log: (l) => logged.push(l) });
  const base = web.url.replace(/\/\?t=.*$/, '');
  // 读 SSE：保留全部原文（用来检查秘密有没有泄露）和最新状态
  const res = await fetch(`${base}/api/events?t=${TOKEN}`);
  const reader = res.body.getReader();
  const ev = { raw: '', last: null };
  (async () => {
    const dec = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read().catch(() => ({ done: true }));
      if (done) return;
      ev.raw += dec.decode(value, { stream: true });
      const msgs = ev.raw.split('\n\n').filter((m) => m.startsWith('data: '));
      if (msgs.length) ev.last = JSON.parse(msgs.at(-1).slice(6));
    }
  })();
  const until = async (pred, what) => {
    for (let i = 0; i < 400; i++) { if (ev.last && pred(ev.last)) return ev.last; await new Promise((r) => setTimeout(r, 5)); }
    assert.fail(`等待超时：${what}`);
  };
  const post = (path, body, headers = {}) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-ccpm-token': TOKEN, ...headers }, body: JSON.stringify(body) });
  const close = async () => { await reader.cancel().catch(() => {}); await web.stop(); };
  return { web, base, ev, until, post, close, logged };
}

// 原始 http 请求（fetch 不允许改 Host）
const raw = (port, path, headers) => new Promise((resolve, reject) => {
  const req = request({ host: '127.0.0.1', port, path, headers }, (res) => { res.resume(); resolve(res.statusCode); });
  req.on('error', reject);
  req.end();
});

test('网页：只监听 127.0.0.1；页面可打开；接口要口令；外来 Host / Origin 一律拒绝', async () => {
  const s = await boot(fakeClaude());
  try {
    const port = s.web.server.address().port;
    assert.equal(s.web.server.address().address, '127.0.0.1');
    const page = await fetch(`${s.base}/`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-security-policy'), /default-src 'self'/);
    assert.match(await page.text(), /<script src="\/app.js"/);
    assert.equal((await fetch(`${s.base}/api/strings`)).status, 401);
    assert.equal((await fetch(`${s.base}/api/strings?t=wrong`)).status, 401);
    const strings = await (await fetch(`${s.base}/api/strings?t=${TOKEN}`)).json();
    assert.equal(strings.strings.install, '安装');
    assert.equal((await s.post('/api/rescan', {}, { 'x-ccpm-token': 'wrong' })).status, 401);
    assert.equal((await s.post('/api/rescan', {}, { origin: 'http://evil.example' })).status, 403);
    assert.equal(await raw(port, `/api/strings?t=${TOKEN}`, { host: `evil.example:${port}` }), 403); // DNS rebinding
    assert.equal(await raw(port, '/', { host: `localhost:${port}` }), 200);
  } finally { await s.close(); }
});

test('网页：安装 a → 确认 → 填 token（只经过 POST，不进推送和日志）→ 列表刷新', async () => {
  const claude = fakeClaude();
  const s = await boot(claude);
  try {
    await s.until((st) => st.model && !st.busy, '准备完成');
    assert.equal((await s.post('/api/run', { cmd: 'rm -rf', names: [] })).status, 400);
    assert.equal((await s.post('/api/run', { cmd: 'install', names: ['a'] })).status, 202);
    assert.equal((await s.post('/api/run', { cmd: 'sync' })).status, 409); // 一次只做一件事
    const c = await s.until((st) => st.dialog?.kind === 'confirm', '确认框');
    assert.match(c.op.lines.join('\n'), /将要执行/);
    await s.post('/api/answer', { id: c.dialog.id, value: true });
    const ask = await s.until((st) => st.dialog?.kind === 'ask', '填写框');
    assert.equal(ask.dialog.secret, true);
    assert.equal((await s.post('/api/answer', { id: 999, value: 'x' })).status, 409); // 旧弹窗的回答不算
    await s.post('/api/answer', { id: ask.dialog.id, value: 'sekret' });
    const done = await s.until((st) => !st.busy && st.message, '完成');
    assert.equal(done.message.kind, 'ok');
    assert.deepEqual(claude.calls.filter((x) => x[0] === 'install').map((x) => x[1]), ['b@acme-plugins', 'a@acme-plugins']);
    assert.deepEqual(claude.calls.find((x) => x[0] === 'configure')[2], { token: 'sekret' });
    assert.equal(done.model.plugins.find((p) => p.name === 'a').where, 'here');
    assert.doesNotMatch(s.ev.raw + s.logged.join('\n'), /sekret/);
    assert.doesNotMatch(s.logged.join('\n'), new RegExp(TOKEN));
  } finally { await s.close(); }
});

test('网页：卸载时选“否” → 已取消，不卸载', async () => {
  const claude = fakeClaude({ installed: [inst('c')] });
  const s = await boot(claude);
  try {
    await s.until((st) => st.model && !st.busy, '准备完成');
    await s.post('/api/run', { cmd: 'remove', names: ['c'] });
    const c = await s.until((st) => st.dialog?.kind === 'confirm', '确认框');
    assert.equal(c.dialog.def, false);
    await s.post('/api/answer', { id: c.dialog.id, value: false });
    const done = await s.until((st) => !st.busy && st.message, '结果');
    assert.match(strip(done.message.text), /已取消/);
    assert.equal(claude.calls.filter((x) => x[0] === 'uninstall').length, 0);
  } finally { await s.close(); }
});

test('网页：还没选 marketplace → 页面里选一个，选完进入列表', async () => {
  const claude = fakeClaude({ markets: [{ name: 'other', installLocation: mkt }, { name: 'acme-plugins', installLocation: mkt }] });
  const s = await boot(claude, stateFile(null));
  try {
    const d = await s.until((st) => st.dialog?.kind === 'marketplace', '选择 marketplace');
    assert.deepEqual(d.dialog.options, ['other', 'acme-plugins']);
    await s.post('/api/answer', { id: d.dialog.id, value: 'acme-plugins' });
    const st = await s.until((x) => x.model && !x.busy, '列表');
    assert.equal(st.marketplace, 'acme-plugins');
  } finally { await s.close(); }
});

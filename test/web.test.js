process.env.CCPM_LANG ??= 'zh';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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
      const msgs = ev.raw.split('\n\n').slice(0, -1).filter((m) => m.startsWith('data: ')); // 最后一段可能还没收完
      if (msgs.length) ev.last = JSON.parse(msgs.at(-1).slice(6));
    }
  })();
  const until = async (pred, what) => {
    for (let i = 0; i < 400; i++) { if (ev.last && pred(ev.last)) return ev.last; await new Promise((r) => setTimeout(r, 5)); }
    assert.fail(`等待超时：${what} · ${JSON.stringify({ busy: ev.last?.busy, dialog: ev.last?.dialog, message: ev.last?.message, lines: ev.last?.op?.lines.slice(-6) })}`);
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
    await s.until((st) => st.models?.['acme-plugins'] && !st.busy, '准备完成');
    assert.equal((await s.post('/api/run', { cmd: 'rm -rf', names: [], market: 'acme-plugins' })).status, 400);
    assert.equal((await s.post('/api/run', { cmd: 'install', names: ['a'], market: 'acme-plugins' })).status, 202);
    assert.equal((await s.post('/api/run', { cmd: 'sync', market: 'acme-plugins' })).status, 409); // 一次只做一件事
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
    assert.equal(done.models['acme-plugins'].plugins.find((p) => p.name === 'a').where, 'here');
    assert.doesNotMatch(s.ev.raw + s.logged.join('\n'), /sekret/);
    assert.doesNotMatch(s.logged.join('\n'), new RegExp(TOKEN));
  } finally { await s.close(); }
});

test('网页：卸载时选“否” → 已取消，不卸载', async () => {
  const claude = fakeClaude({ installed: [inst('c')] });
  const s = await boot(claude);
  try {
    await s.until((st) => st.models?.['acme-plugins'] && !st.busy, '准备完成');
    await s.post('/api/run', { cmd: 'remove', names: ['c'], market: 'acme-plugins' });
    const c = await s.until((st) => st.dialog?.kind === 'confirm', '确认框');
    assert.equal(c.dialog.def, false);
    await s.post('/api/answer', { id: c.dialog.id, value: false });
    const done = await s.until((st) => !st.busy && st.message, '结果');
    assert.match(strip(done.message.text), /已取消/);
    assert.equal(claude.calls.filter((x) => x[0] === 'uninstall').length, 0);
  } finally { await s.close(); }
});

test('网页：两个插件市场同时准备好，已安装的跨市场汇总，未装的可供发现', async () => {
  const claude = fakeClaude({
    installed: [inst('a'), { ...inst('x'), id: 'x@other', marketplace: 'other' }],
    markets: [{ name: 'other', installLocation: mkt }, { name: 'acme-plugins', installLocation: mkt }],
  });
  const s = await boot(claude, stateFile(null));
  try {
    const st = await s.until((x) => Object.keys(x.models ?? {}).length === 2 && !x.busy, '两个市场都准备好');
    const installed = Object.entries(st.models).flatMap(([m, d]) => d.plugins.filter((p) => p.where === 'here').map((p) => `${p.name}@${m}`));
    assert.deepEqual(installed.sort(), ['a@acme-plugins', 'x@other']);
    assert.ok(st.models['acme-plugins'].plugins.find((p) => p.name === 'a').update); // 目录里 a 是 1.1.0
    assert.deepEqual(st.markets.map((m) => [m.name, m.installed]), [['other', 1], ['acme-plugins', 1]]);
    assert.ok(st.models['acme-plugins'].plugins.some((p) => p.name === 'c' && p.where === 'none')); // “发现插件”的数据
  } finally { await s.close(); }
});

test('网页：更新时指明插件所属的市场；没指明就不执行', async () => {
  const claude = fakeClaude({ installed: [inst('a')], markets: [{ name: 'other', installLocation: mkt }, { name: 'acme-plugins', installLocation: mkt }] });
  const s = await boot(claude, stateFile(null));
  try {
    await s.until((x) => Object.keys(x.models ?? {}).length === 2 && !x.busy, '两个市场都准备好');
    await s.post('/api/run', { cmd: 'update', names: ['a'], market: 'acme-plugins' });
    const c = await s.until((x) => x.dialog?.kind === 'confirm', '确认框');
    await s.post('/api/answer', { id: c.dialog.id, value: true });
    // 更新后补问必填的 token：留空两次 → 跳过
    for (let st = await s.until((x) => x.dialog?.kind === 'ask' || (!x.busy && x.message), '补问'); st.dialog; ) {
      await s.post('/api/answer', { id: st.dialog.id, value: '' });
      const id = st.dialog.id;
      st = await s.until((x) => (x.dialog && x.dialog.id !== id) || (!x.busy && x.message), '下一个提问或结果');
    }
    assert.deepEqual(claude.calls.filter((x) => x[0] === 'update').map((x) => x[1]), ['a@acme-plugins']);
    assert.equal((await s.post('/api/run', { cmd: 'update', names: ['a'] })).status, 202); // 没指明市场：不执行
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(claude.calls.filter((x) => x[0] === 'update').length, 1);
  } finally { await s.close(); }
});

test('网页：切到某个项目目录 → 只显示装在那个项目里的，全局装的标为“装在全局”', async () => {
  const proj = mkdtempSync(join(tmpdir(), 'ccpm-web-proj-'));
  const claude = fakeClaude({ installed: [inst('c', { scope: 'project', projectPath: proj }), inst('b')] });
  const s = await boot(claude);
  try {
    await s.until((x) => x.models?.['acme-plugins'] && !x.busy, '准备完成');
    assert.equal((await s.post('/api/select', { scope: 'project', dir: '/no/such/dir' })).status, 202);
    await s.post('/api/select', { scope: 'project', dir: proj });
    const st = await s.until((x) => x.selection.scope === 'project' && x.models?.['acme-plugins'] && !x.busy, '项目范围');
    assert.equal(st.selection.dir, proj);
    const where = Object.fromEntries(st.models['acme-plugins'].plugins.map((p) => [p.name, p.where]));
    assert.equal(where.c, 'here');
    assert.equal(where.b, 'global');
    assert.ok(st.projects.some((p) => p.path === proj && p.installed === 1)); // 有项目插件的目录出现在项目列表里
  } finally { await s.close(); }
});

test('网页：目录浏览只给文件夹名；添加 marketplace 不改命令行的默认', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ccpm-web-dirs-'));
  for (const d of ['beta', 'alpha', '.hidden']) mkdirSync(join(root, d));
  writeFileSync(join(root, 'file.txt'), 'x');
  const markets = [{ name: 'acme-plugins', installLocation: mkt }];
  const claude = { ...fakeClaude({ markets }), listMarketplaces: async () => markets.map((m) => ({ ...m })), addMarketplace: async () => { markets.push({ name: 'new-one', installLocation: mkt, url: 'https://git.example.com/new.git' }); } };
  const file = stateFile();
  const s = await boot(claude, file);
  try {
    await s.until((x) => x.models?.['acme-plugins'] && !x.busy, '准备完成');
    assert.equal((await fetch(`${s.base}/api/dirs?path=${encodeURIComponent(root)}`)).status, 401);
    const d = await (await fetch(`${s.base}/api/dirs?t=${TOKEN}&path=${encodeURIComponent(root)}`)).json();
    assert.deepEqual(d.dirs, ['alpha', 'beta']);
    assert.equal(d.parent, dirname(root));
    assert.equal((await fetch(`${s.base}/api/dirs?t=${TOKEN}&path=${encodeURIComponent(join(root, 'file.txt'))}`)).status, 404);
    assert.equal((await s.post('/api/marketplace', { source: ' ' })).status, 400);
    await s.post('/api/marketplace', { source: 'https://git.example.com/new.git' });
    const st = await s.until((x) => x.models?.['new-one'] && !x.busy, '新市场准备好');
    assert.ok(st.markets.some((m) => m.name === 'new-one'));
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).current, 'acme-plugins');
  } finally { await s.close(); }
});

test('网页：先用本地数据显示列表，联网更新在后台；更新失败的插件市场不允许改动', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const claude = { ...fakeClaude(), updateMarketplace: async () => { await gate; throw new Error('Could not resolve host'); } };
  const s = await boot(claude);
  try {
    const first = await s.until((x) => x.models?.['acme-plugins'] && !x.busy, '先显示列表');
    assert.equal(first.checking, true); // 列表出来时，后台还在联网
    release();
    const st = await s.until((x) => !x.checking && !x.busy && x.markets?.[0]?.error, '后台检查结束');
    assert.match(st.markets[0].error, /Could not resolve host/);
    await s.post('/api/run', { cmd: 'install', names: ['c'], market: 'acme-plugins' });
    const r = await s.until((x) => x.message, '拒绝改动');
    assert.equal(r.message.kind, 'warn');
    assert.equal(claude.calls ? claude.calls.filter((c) => c[0] === 'install').length : 0, 0);
  } finally { await s.close(); }
});

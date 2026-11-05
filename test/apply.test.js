import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyPlan, postUpdate } from '../src/apply.js';
import { ClaudeError } from '../src/claude.js';
import { createProgress } from '../src/progress.js';
import { setColor } from '../src/ui.js';

setColor(false);

const meta = (name, o = {}) => ({ name, version: '1.0.0', dependencies: [], userConfig: {}, mcpServers: [], dir: '/nope', raw: {}, ...o });
const aMeta = meta('a', { userConfig: {
  url: { required: true },
  token: { required: true, sensitive: true },
} });
const fakeClaude = (o = {}) => {
  const calls = [];
  const rec = (n) => async (...a) => { calls.push([n, ...a]); if (o[n]) return o[n](...a); };
  return { calls, install: rec('install'), configure: rec('configure'), enable: rec('enable'), update: rec('update'), getUnconfigured: async (id) => { calls.push(['getUnconfigured', id]); return o.unconf ?? []; } };
};
const prompter = (answers) => ({
  ask: async (q, opts) => {
    const k = Object.keys(answers).find((x) => q.includes(x));
    if (k === undefined) throw Object.assign(new Error('NON_INTERACTIVE'));
    return answers[k];
  },
});
const mk = (claude, catalog, p, extra = {}) => {
  const lines = [];
  const out = (l) => lines.push(l);
  return { claude, catalog: new Map(catalog.map((m) => [m.name, m])), prompter: p, out, lines, progress: createProgress({ out }), scope: 'user', installed: [], ...extra };
};
const plan = (o) => ({ install: [], update: [], configure: [], ...o });

test('install 后 configure(stdin)，参数不含值', async () => {
  const c = fakeClaude();
  const r = await applyPlan(mk(c, [aMeta], prompter({ url: 'http://u', token: 'sekret' })), plan({ install: ['a'] }));
  assert.deepEqual(c.calls, [
    ['install', 'a@acme-plugins', { scope: 'user' }],
    ['configure', 'a@acme-plugins', { url: 'http://u', token: 'sekret' }],
  ]);
  assert.ok(!JSON.stringify(c.calls[0]).includes('sekret'));
  assert.deepEqual(r.ok, ['a']);
});

test('非交互缺必填 → skipped，不调用任何命令', async () => {
  const c = fakeClaude();
  const p = { interactive: false, ask: async (q, o) => { if (o.default !== undefined) return o.default; throw new Error('NON_INTERACTIVE'); } };
  const m = meta('a', { userConfig: { url: { required: true, default: 'x' }, token: { required: true, sensitive: true } } });
  const r = await applyPlan(mk(c, [m], p), plan({ install: ['a'] }));
  assert.deepEqual(r.skipped, [{ name: 'a', reason: '缺必填配置 token → ccpm install a' }]);
  assert.deepEqual(c.calls, []);
});

test('defaultEnabled:false → enable', async () => {
  const c = fakeClaude();
  await applyPlan(mk(c, [meta('b', { raw: { defaultEnabled: false } })], prompter({})), plan({ install: ['b'] }));
  assert.deepEqual(c.calls.map((x) => x[0]), ['install', 'enable']);
});

test('install 失败不影响后续', async () => {
  const c = fakeClaude({ install: (id) => { if (id.startsWith('a@')) throw new ClaudeError(['x'], 1, 'boom'); } });
  const r = await applyPlan(mk(c, [meta('a'), meta('b')], prompter({})), plan({ install: ['a', 'b'] }));
  assert.equal(r.failed.length, 1);
  assert.equal(r.failed[0].name, 'a');
  assert.deepEqual(r.ok, ['b']);
});

test('依赖被跳过 → 依赖方也跳过且不调用 install', async () => {
  const c = fakeClaude();
  const b = meta('b', { userConfig: { token: { required: true, sensitive: true } } });
  const a = meta('a', { dependencies: ['b'] });
  const x = meta('x', { dependencies: ['a'] });
  const r = await applyPlan(mk(c, [a, b, x], prompter({})), plan({ install: ['b', 'a', 'x'] }));
  assert.deepEqual(c.calls, []);
  assert.deepEqual(r.skipped.map((s) => s.reason), ['缺必填配置 token → ccpm install b', '依赖 b 没装上', '依赖 a 没装上']);
});

test('configure 条目只收集所列键', async () => {
  const c = fakeClaude();
  await applyPlan(mk(c, [aMeta], prompter({ token: 't' })), plan({ configure: [{ name: 'a', keys: ['token'] }] }));
  assert.deepEqual(c.calls, [['configure', 'a@acme-plugins', { token: 't' }]]);
});

test('postUpdate: 新依赖被安装，提示含版本变化与 changelog', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ccpm-'));
  writeFileSync(join(dir, 'CHANGELOG.md'), '## 1.3.0\n- 新功能\n\n## 1.2.0\n- old\n');
  const c = fakeClaude();
  const ctx = mk(c, [meta('a', { version: '1.3.0', dependencies: ['d'], dir }), meta('d')], prompter({}), {
    installed: [{ name: 'a' }],
    previous: new Map([['a', meta('a', { dependencies: ['old'] })]]),
  });
  const lines = await postUpdate(ctx, 'a', '1.2.0', '1.3.0');
  assert.ok(c.calls.some((x) => x[0] === 'install' && x[1] === 'd@acme-plugins'));
  assert.ok(lines.includes('    - 新功能'));
  assert.ok(lines.some((l) => l.includes('不再需要 old')));
  assert.ok(lines.some((l) => l.includes('不再需要 old')));
});

test('进度：非 TTY 不转圈，每项只打一行结果（含说明与耗时）', async () => {
  const c = fakeClaude();
  const ctx = mk(c, [meta('a'), meta('b')], prompter({}));
  await applyPlan(ctx, plan({ install: ['a', 'b'] }));
  assert.equal(ctx.lines.length, 2);
  assert.match(ctx.lines[1], /^✔ 已安装 b  已启用 +[\d.]+s$/);
});

test('changelog 最多 8 行，多出的提示看 CHANGELOG', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ccpm-'));
  writeFileSync(join(dir, 'CHANGELOG.md'), `## 2.0.0\n${Array.from({ length: 12 }, (_, i) => `- item ${i}`).join('\n')}\n`);
  const ctx = mk(fakeClaude(), [meta('a', { version: '2.0.0', dir })], prompter({}), { installed: [{ name: 'a' }] });
  const lines = await postUpdate(ctx, 'a', '1.0.0', '2.0.0');
  assert.equal(lines.length, 9);
  assert.equal(lines[7], '    - item 7');
  assert.equal(lines[8], '    … 完整更新记录见插件 CHANGELOG');
});

test('配置：答案去首尾空白；必填留空再问一次仍空 → 跳过', async () => {
  const c = fakeClaude();
  const asked = [];
  const p = { interactive: true, ask: async (q) => { asked.push(q); return q.includes('url') ? '  http://u \n' : '  '; } };
  const ctx = mk(c, [aMeta], p);
  const r = await applyPlan(ctx, plan({ install: ['a'] }));
  assert.equal(r.skipped[0].reason, '缺必填配置 token → ccpm install a');
  assert.deepEqual(asked, ['url', 'token', 'token']); // 必填留空 → 提示后再问一次
  assert.ok(ctx.lines.includes('  ▲ 此项必填'));
  assert.deepEqual(c.calls, []);
  const c2 = fakeClaude();
  const p2 = { interactive: true, ask: async (q) => (q.includes('url') ? ' http://u ' : ' t ') };
  await applyPlan(mk(c2, [aMeta], p2), plan({ install: ['a'] }));
  assert.deepEqual(c2.calls[1], ['configure', 'a@acme-plugins', { url: 'http://u', token: 't' }]);
});

test('配置已停用插件：交互 → 问后启用；--yes → 只提示 怎么办', async () => {
  const m = meta('a', { userConfig: { url: { required: true, default: 'x' } } });
  const disabled = () => [{ name: 'a', marketplace: 'acme-plugins', enabled: false }];
  const c = fakeClaude();
  const asked = [];
  const p = { interactive: true, ask: async () => 'v', confirm: async (q, o) => { asked.push([q, o]); return true; } };
  await applyPlan(mk(c, [m], p, { installed: disabled() }), plan({ configure: [{ name: 'a', keys: ['url'] }] }));
  assert.deepEqual(c.calls.map((x) => x[0]), ['configure', 'enable']);
  assert.deepEqual(asked, [['a 目前是停用状态，现在启用吗？', { default: true }]]);
  const y = fakeClaude();
  const ctx = mk(y, [m], { interactive: false, ask: async (q, o) => o.default }, { installed: disabled(), yes: true });
  const r = await applyPlan(ctx, plan({ configure: [{ name: 'a', keys: ['url'] }] }));
  assert.deepEqual(y.calls.map((x) => x[0]), ['configure']);
  assert.deepEqual(r.ok, ['a']);
  assert.ok(ctx.lines.includes('  › 运行 ccpm enable a'));
});

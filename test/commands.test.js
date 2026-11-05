import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContext } from '../src/context.js';
import { ClaudeError } from '../src/claude.js';
import * as install from '../src/commands/install.js';
import * as config from '../src/commands/config.js';
import * as remove from '../src/commands/remove.js';
import * as update from '../src/commands/update.js';
import * as sync from '../src/commands/sync.js';
import { SYMBOLS, setColor } from '../src/ui.js';
import { setMarketplace as useMarketplace } from '../src/claude.js';
useMarketplace('acme-plugins'); // 单元测试不走 loadContext，直接指定

setColor(false);
// 输出里不能有 emoji（单宽符号白名单除外）
const EMOJI = new RegExp(`(?![${SYMBOLS}])\\p{Extended_Pictographic}|\\uFE0F`, 'u');
const noEmoji = (l) => { assert.doesNotMatch(String(l), EMOJI); return l; };

const here = dirname(fileURLToPath(import.meta.url));
const mkt = mkdtempSync(join(tmpdir(), 'ccpm-mkt-'));
cpSync(join(here, 'fixtures/marketplace'), mkt, { recursive: true });
writeFileSync(join(mkt, 'presets.json'), JSON.stringify({ formatVersion: 1, presets: {
  base: { description: '基础', plugins: ['b'] },
  data: { description: '全套', plugins: ['base', 'a'] },
} }));

const inst = (name, o = {}) => ({ id: `${name}@acme-plugins`, name, marketplace: 'acme-plugins', version: '1.0.0', scope: 'user', enabled: true, ...o });

// 返回 { ctx, calls, lines, stateFile }；state 为 ccpm.json 初始内容（可选）
async function setup({ installed = [], state, opts = {}, failInstall, prune = { ids: [] }, prompter = {} } = {}) {
  const stateFile = join(mkdtempSync(join(tmpdir(), 'ccpm-state-')), 'ccpm.json');
  if (state) writeFileSync(stateFile, JSON.stringify({ current: 'acme-plugins', marketplaces: { 'acme-plugins': state } }));
  const calls = [];
  const lines = [];
  const rec = (n, f) => async (...a) => { calls.push([n, ...a]); return f?.(...a); };
  const claude = {
    checkCapabilities: async () => ({ ok: true, missing: [] }),
    listMarketplaces: async () => [{ name: 'acme-plugins', installLocation: mkt }],
    updateMarketplace: async () => {},
    addMarketplace: async () => {},
    listInstalled: async () => installed,
    getUnconfigured: async () => [],
    listUserMcp: async () => [],
    install: rec('install', (id) => { if (id === failInstall) throw new ClaudeError(['x'], 1, 'boom'); }),
    configure: rec('configure'),
    enable: rec('enable'),
    update: rec('update'),
    uninstall: rec('uninstall'),
    prune: rec('prune', async () => prune),
  };
  const p = { interactive: true, ask: async () => 'sekret', confirm: async () => true, choose: async (q, o) => o[0], ...prompter };
  const ctx = await loadContext({ scope: 'user', yes: false, ...opts }, { claude, prompter: p, out: (l) => lines.push(noEmoji(l)), stateFile });
  ctx.stateFile = stateFile;
  return { ctx, calls, lines, stateFile };
}
const names = (calls) => calls.map((c) => c[0]);
const stateOf = (f) => JSON.parse(readFileSync(f, 'utf8')).marketplaces['acme-plugins'];
const MUTATING = ['install', 'configure', 'enable', 'update', 'uninstall'];

test('install data：依赖在前，预设写入 state', async () => {
  const { ctx, calls, stateFile } = await setup();
  assert.equal(await install.run(ctx, ['data'], {}), 0);
  assert.deepEqual(calls.filter((c) => c[0] === 'install').map((c) => c[1]), ['b@acme-plugins', 'a@acme-plugins']);
  assert.deepEqual(stateOf(stateFile).presets, ['data']);
});

test('install --dry-run 不动环境也不写 state', async () => {
  const { ctx, calls, stateFile } = await setup({ opts: { dryRun: true } });
  assert.equal(await install.run(ctx, ['data'], {}), 0);
  assert.deepEqual(calls, []);
  assert.equal(existsSync(stateFile), false);
});

test('任一插件安装失败 → 返回 1', async () => {
  const { ctx, lines } = await setup({ failInstall: 'b@acme-plugins' });
  assert.equal(await install.run(ctx, ['b', 'a'], {}), 1);
  const t = lines.join('\n');
  assert.match(t, /✖ 安装失败 b  boom/);
  assert.match(t, /▲ 跳过 a  依赖 b 没装上/);
  assert.match(t, /│  ▲ 1 个跳过：a +│\n│  ✖ 1 个失败：b +│/);
  assert.doesNotMatch(t, /个插件已就绪/);
  assert.doesNotMatch(t, /重启 Claude Code/); // 没有成功项不提示重启
});

test('remove 预设内插件 → excluded，之后 sync --yes 不再装回', async () => {
  const state = { presets: ['base'], excluded: [] };
  const r = await setup({ installed: [inst('b')], state });
  assert.equal(await remove.run(r.ctx, ['b'], {}), 0);
  assert.deepEqual(r.calls[0], ['uninstall', 'b@acme-plugins', { scope: 'user' }]);
  assert.deepEqual(stateOf(r.stateFile).excluded, ['b']);
  const s = await setup({ state: stateOf(r.stateFile), opts: { yes: true } });
  assert.equal(await sync.run(s.ctx, [], {}), 0);
  assert.ok(!names(s.calls).includes('install'));
});

test('remove 提示依赖方', async () => {
  const { ctx, lines } = await setup({ installed: [inst('a', { version: '1.1.0' }), inst('b')] });
  await remove.run(ctx, ['b'], {});
  assert.match(lines.join('\n'), /a 依赖 b/);
});

test('sync --dry-run 不调用任何改动命令，也不写 state', async () => {
  const { ctx, calls, stateFile } = await setup({ installed: [inst('b')], opts: { dryRun: true }, prune: { ids: ['x@y'] } });
  assert.equal(await sync.run(ctx, [], {}), 0);
  assert.ok(calls.every((c) => !MUTATING.includes(c[0]) && !(c[0] === 'prune' && c[1].dryRun === false)));
  assert.equal(existsSync(stateFile), false);
});

test('sync --yes 无 ccpm.json → 写入推断预设', async () => {
  const { ctx, stateFile } = await setup({ installed: [inst('a', { version: '1.1.0' }), inst('b')], opts: { yes: true }, prompter: { interactive: false } });
  assert.equal(await sync.run(ctx, [], {}), 0);
  assert.deepEqual(stateOf(stateFile).presets.sort(), ['base', 'data']);
});

test('sync：prune note 静默跳过；ids 确认后清理', async () => {
  const n = await setup({ state: { presets: [], excluded: [] }, prune: { ids: [], note: 'Skipped: x' } });
  await sync.run(n.ctx, [], {});
  assert.doesNotMatch(n.lines.join('\n'), /Skipped|⚠️/);
  const p = await setup({ state: { presets: [], excluded: [] }, prune: { ids: ['x@acme-plugins', 'y@other'] } });
  assert.equal(await sync.run(p.ctx, [], {}), 0);
  assert.deepEqual(p.calls.filter((c) => c[0] === 'uninstall'), [['uninstall', 'x@acme-plugins', { scope: 'user' }]]);
});

test('sync：prune 抛错 → 静默，sync 继续不中断', async () => {
  const r = await setup({ state: { presets: ['base'], excluded: [] }, opts: { yes: true } });
  r.ctx.claude.prune = async () => { throw new ClaudeError(['plugin', 'prune'], 1, 'bad'); };
  assert.equal(await sync.run(r.ctx, [], {}), 0);
  assert.doesNotMatch(r.lines.join('\n'), /⚠️|❌/);
  assert.ok(names(r.calls).includes('install'));
});

test('sync 重复 MCP：只提示 ccpm remove，不卸载', async () => {
  const r = await setup({ installed: [inst('b')], state: { presets: ['base'], excluded: [] } });
  r.ctx.claude.listUserMcp = async () => ['srv'];
  r.ctx.catalog.get('b').mcpServers = ['srv'];
  assert.equal(await sync.run(r.ctx, [], {}), 0);
  const t = r.lines.join('\n');
  assert.equal(t.match(/配了两份/g).length, 1); // 只打印一次
  assert.match(t, /▲ MCP srv  配了两份：插件 b、你自己配置的  claude mcp remove srv -s user/);
  assert.ok(!names(r.calls).includes('uninstall'));
});

test('install 预设：全部已安装也写入 state；dry-run 不写', async () => {
  const r = await setup({ installed: [inst('a', { version: '1.1.0' }), inst('b')] });
  assert.equal(await install.run(r.ctx, ['data'], {}), 0);
  assert.deepEqual(stateOf(r.stateFile).presets, ['data']);
  const d = await setup({ installed: [inst('b')], opts: { dryRun: true } });
  await install.run(d.ctx, ['base'], {});
  assert.equal(existsSync(d.stateFile), false);
});

test('remove 预设内未安装插件仍记 excluded；有依赖方时不说“不再装回”', async () => {
  const r = await setup({ state: { presets: ['base'], excluded: [] } });
  assert.equal(await remove.run(r.ctx, ['b'], {}), 0);
  assert.deepEqual(stateOf(r.stateFile).excluded, ['b']);
  assert.match(r.lines.join('\n'), /b 是预设 base 里的插件，以后 ccpm sync 不会自动装回它；想要回来就运行 ccpm install b/);
  const d = await setup({ installed: [inst('a', { version: '1.1.0' }), inst('b')], state: { presets: ['base'], excluded: [] } });
  await remove.run(d.ctx, ['b'], {});
  assert.match(d.lines.join('\n'), /sync 会重新安装/);
  assert.doesNotMatch(d.lines.join('\n'), /不会自动装回/);
});

test('--dry-run 不重命名损坏的 ccpm.json', async () => {
  const f = join(mkdtempSync(join(tmpdir(), 'ccpm-state-')), 'ccpm.json');
  writeFileSync(f, '{bad');
  const { loadState } = await import('../src/state.js');
  assert.equal(loadState(f, { readOnly: true }), null);
  assert.ok(existsSync(f));
});

test('samePath：win32 不区分大小写', async () => {
  const { samePath } = await import('../src/context.js');
  assert.ok(samePath('C:\\Proj', 'c:\\proj', 'win32'));
  assert.ok(!samePath('/Proj', '/proj', 'linux'));
});

test('update a 已最新 → 已是最新，返回 0', async () => {
  const { ctx, calls, lines } = await setup({ installed: [inst('a', { version: '1.1.0' })] });
  assert.equal(await update.run(ctx, ['a'], {}), 0);
  assert.match(lines.join('\n'), /a 已是最新/);
  assert.ok(!names(calls).includes('update'));
});

test('update 有新版本 → 调用 update 并提示重启', async () => {
  const { ctx, calls, lines } = await setup({ installed: [inst('a')] });
  assert.equal(await update.run(ctx, [], {}), 0);
  assert.ok(names(calls).includes('update'));
  const t = lines.join('\n');
  assert.match(t, /✔ 已更新 a  1\.0\.0 → 1\.1\.0 +[\d.]+s/);
  assert.match(t, /╭─ 完成 ─+╮\n│  ✔ 1 个插件已就绪 +│\n│  重启 Claude Code 后生效 +│\n│  查看整体状态：ccpm status +│\n╰─+╯$/);
});

test('config：留空保留原值；全空则未修改；--yes 报错', async () => {
  const inst_ = [inst('a', { version: '1.1.0' })];
  const r = await setup({ installed: inst_ });
  assert.equal(await config.run(r.ctx, ['a'], {}), 0);
  assert.deepEqual(r.calls, [['configure', 'a@acme-plugins', { token: 'sekret' }]]);
  const e = await setup({ installed: inst_, prompter: { ask: async () => '' } });
  assert.equal(await config.run(e.ctx, ['a'], {}), 0);
  assert.deepEqual(e.calls, []);
  assert.match(e.lines.join('\n'), /未修改/);
  const y = await setup({ installed: inst_, opts: { yes: true } });
  assert.equal(await config.run(y.ctx, ['a'], {}), 1);
});

test('A1/A3：只对有必填配置的插件查配置（并发），无 MCP 插件不跑 mcp list', async () => {
  const r = await setup({ installed: [inst('a', { version: '1.1.0' }), inst('c'), { ...inst('z'), id: 'z@other', marketplace: 'other' }], state: { presets: [], excluded: [] } });
  const asked = [];
  r.ctx.claude.getUnconfigured = async (id) => { asked.push(id); return []; };
  let mcp = 0;
  r.ctx.claude.listUserMcp = async () => { mcp++; return []; };
  await sync.run(r.ctx, [], {});
  assert.deepEqual(asked, ['a@acme-plugins']);
  assert.equal(mcp, 0);
});

test('F：--scope project 不看预设；预设不能装到项目', async () => {
  const r = await setup({ state: { presets: ['data'], excluded: [] }, opts: { scope: 'project' } });
  const { gatherPlan } = await import('../src/context.js');
  assert.deepEqual((await gatherPlan(r.ctx)).install, []);
  assert.equal(await install.run(r.ctx, ['data'], {}), 1);
  assert.match(r.lines.join('\n'), /✖ 预设只能装到全局，去掉 --scope project\n  › 运行 ccpm install data --scope user/);
  assert.deepEqual(r.calls, []);
});

test('空计划：已是最新，不提问', async () => {
  let asked = false;
  const r = await setup({ installed: [inst('b')], state: { presets: ['base'], excluded: [] }, prompter: { confirm: async () => { asked = true; return true; } } });
  assert.equal(await sync.run(r.ctx, [], {}), 0);
  assert.match(r.lines.join('\n'), /\n  ✔ 已是最新，无需操作$/);
  assert.equal(asked, false);
});

test('sync 首次：解释预设并给出两个选项', async () => {
  let seen;
  const r = await setup({ installed: [inst('b')], prompter: { choose: async (q, o) => { seen = [q, o]; return o[1]; } } });
  await sync.run(r.ctx, [], {});
  assert.match(seen[0], /ccpm 会记住你选的预设.*推荐：base/);
  assert.deepEqual(seen[1], ['采用推荐（base）', '暂不选择预设']);
  assert.deepEqual(stateOf(r.stateFile).presets, []);
});

test('确认默认值：安装/同步默认 Y，卸载默认 N', async () => {
  const seen = [];
  const prompter = { confirm: async (q, o) => { seen.push([q, o.default]); return true; } };
  const i = await setup({ prompter });
  await install.run(i.ctx, ['b'], {});
  const r = await setup({ installed: [inst('b')], prompter });
  await remove.run(r.ctx, ['b'], {});
  assert.deepEqual(seen, [['继续？', true], ['确认卸载？', false]]);
  assert.match(r.lines.join('\n'), /将要执行\n  − b  1\.0\.0\n/);
});

test('enable / disable：只动状态不同的插件，未装的跳过并返回 1', async () => {
  const { run: enable } = await import('../src/commands/enable.js');
  const { run: disable } = await import('../src/commands/disable.js');
  const installed = [inst('a', { enabled: false }), inst('b')];
  let r = await setup({ installed });
  r.ctx.claude.disable = async (...a) => r.calls.push(['disable', ...a]);
  assert.equal(await enable(r.ctx, ['a', 'b']), 0);
  assert.deepEqual(r.calls, [['enable', 'a@acme-plugins', { scope: 'user' }]]);
  const t = r.lines.join('\n');
  assert.match(t, /✔ b  已经是启用状态/);
  assert.match(t, /✔ 1 个插件已启用/);
  r = await setup({ installed });
  r.ctx.claude.disable = async (...a) => r.calls.push(['disable', ...a]);
  assert.equal(await disable(r.ctx, ['b', 'zzz']), 1);
  assert.deepEqual(r.calls, [['disable', 'b@acme-plugins', { scope: 'user' }]]);
  assert.match(r.lines.join('\n'), /▲ zzz  没有安装/);
  r = await setup({ installed, opts: { dryRun: true } });
  assert.equal(await enable(r.ctx, ['a']), 0);
  assert.deepEqual(r.calls, []);
});

test('remove 预设：卸载预设里的插件（先卸依赖方），从 ccpm.json 去掉', async () => {
  const r = await setup({ installed: [inst('a'), inst('b'), inst('c')], state: { presets: ['data'], excluded: [] } });
  assert.equal(await remove.run(r.ctx, ['data'], {}), 0);
  assert.deepEqual(r.calls.map((c) => c[1]), ['a@acme-plugins', 'b@acme-plugins']);
  assert.deepEqual(stateOf(r.stateFile).presets, []);
  assert.match(r.lines.join('\n'), /卸载后 data 不再算你选的预设，ccpm sync 不会再按它补装插件/);
  assert.match(r.lines.join('\n'), /2 个插件已卸载/);
});

test('remove 预设：别的预设也包含的、仍被依赖的保留', async () => {
  let r = await setup({ installed: [inst('a'), inst('b')], state: { presets: ['data', 'base'], excluded: [] } });
  assert.equal(await remove.run(r.ctx, ['data'], {}), 0);
  assert.deepEqual(r.calls.map((c) => c[1]), ['a@acme-plugins']);
  assert.match(r.lines.join('\n'), /✔ b  保留：预设 base 也包含/);
  assert.deepEqual(stateOf(r.stateFile).presets, ['base']);

  r = await setup({ installed: [inst('a'), inst('b')], state: { presets: ['base'], excluded: [] } });
  assert.equal(await remove.run(r.ctx, ['base'], {}), 0);
  assert.deepEqual(r.calls, []);
  assert.match(r.lines.join('\n'), /✔ b  保留：a 依赖它\n[\s\S]*没有需要卸载的插件/);
  assert.deepEqual(stateOf(r.stateFile).presets, []);
});

test('remove 预设：--scope project 报错，--dry-run 不动', async () => {
  let r = await setup({ installed: [inst('a'), inst('b')], state: { presets: ['data'], excluded: [] }, opts: { scope: 'project' } });
  assert.equal(await remove.run(r.ctx, ['data'], {}), 1);
  r = await setup({ installed: [inst('a'), inst('b')], state: { presets: ['data'], excluded: [] }, opts: { dryRun: true } });
  assert.equal(await remove.run(r.ctx, ['data'], {}), 0);
  assert.deepEqual(r.calls, []);
  assert.deepEqual(stateOf(r.stateFile).presets, ['data']);
});

test('remove 多个：插件和预设混写，一次确认', async () => {
  let confirms = 0;
  const r = await setup({ installed: [inst('a'), inst('b'), inst('c')], state: { presets: ['data'], excluded: [] }, prompter: { confirm: async () => { confirms++; return true; } } });
  assert.equal(await remove.run(r.ctx, ['c', 'data'], {}), 0);
  assert.equal(confirms, 1);
  assert.deepEqual(r.calls.map((c) => c[1]).sort(), ['a@acme-plugins', 'b@acme-plugins', 'c@acme-plugins']);
  assert.ok(r.calls.findIndex((c) => c[1] === 'a@acme-plugins') < r.calls.findIndex((c) => c[1] === 'b@acme-plugins')); // a 依赖 b，先卸 a
  assert.deepEqual(stateOf(r.stateFile).presets, []);
  assert.match(r.lines.join('\n'), /确认卸载这 3 个插件|3 个插件已卸载/);
});

test('remove 名字写错 → 报错，什么都不做', async () => {
  const r = await setup({ installed: [inst('a')] });
  assert.equal(await remove.run(r.ctx, ['a', 'nope'], {}), 1);
  assert.deepEqual(r.calls, []);
  assert.match(r.lines.join('\n'), /没有叫 nope 的插件或预设/);
});

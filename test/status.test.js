import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadContext, PreconditionError } from '../src/context.js';
import { ClaudeError } from '../src/claude.js';
import * as status from '../src/commands/status.js';
import * as list from '../src/commands/list.js';
import { SYMBOLS, setColor } from '../src/ui.js';
import { setMarketplace as useMarketplace } from '../src/claude.js';
useMarketplace('acme-plugins'); // 单元测试不走 loadContext，直接指定

setColor(false);
const EMOJI = new RegExp(`(?![${SYMBOLS}])\\p{Extended_Pictographic}|\\uFE0F`, 'u');

const here = dirname(fileURLToPath(import.meta.url));
const mkt = mkdtempSync(join(tmpdir(), 'ccpm-mkt-'));
cpSync(join(here, 'fixtures/marketplace'), mkt, { recursive: true });
writeFileSync(join(mkt, 'presets.json'), JSON.stringify({ formatVersion: 1, presets: {
  base: { description: '基础', plugins: ['b'] },
  data: { description: '全套', plugins: ['base', 'a'] },
} }));
const stateFile = join(mkdtempSync(join(tmpdir(), 'ccpm-state-')), 'ccpm.json');

const inst = (name, o = {}) => ({ id: `${name}@acme-plugins`, name, marketplace: 'acme-plugins', version: '1.0.0', scope: 'user', enabled: true, ...o });
const fake = (o = {}) => ({
  checkCapabilities: async () => ({ ok: true, missing: [] }),
  listMarketplaces: async () => [{ name: 'acme-plugins', installLocation: mkt }],
  updateMarketplace: async () => { if (o.updateFails) throw new ClaudeError(['x'], 1, 'boom'); },
  addMarketplace: async () => {},
  listInstalled: async () => o.installed ?? [
    inst('a', { version: '1.0.0' }), inst('old'),
    { id: 'zzz@other', name: 'zzz', marketplace: 'other', version: '2.0.0', scope: 'user', enabled: true },
    inst('proj', { scope: 'project', projectPath: '/elsewhere' }),
  ],
  getUnconfigured: async (id) => (id.startsWith('a@') ? ['token'] : []),
  listUserMcp: async () => ['svc'],
});
const lines = [];
const ctxOf = (o = {}, opts = {}) => {
  lines.length = 0;
  return loadContext({ scope: 'user', readOnly: true, ...opts }, { claude: fake(o), prompter: {}, out: (l) => { assert.doesNotMatch(l, EMOJI); lines.push(l); }, stateFile });
};

test('status 输出各分组', async () => {
  const ctx = await ctxOf();
  assert.equal(ctx.installed.length, 3); // project 条目被过滤
  assert.equal(await status.run(ctx, [], {}), 0);
  const t = lines.join('\n');
  assert.match(t, /^✔ 准备就绪  acme-plugins · 插件列表已更新 · 2 个已装 +[\d.]+s\n正在使用 acme-plugins（ccpm use 可以切换）\n\n  ● 2 已装   ↑ 1 可更新   ▲ 1 需配置   ○ 3 未装\n/);
  assert.doesNotMatch(t, /zzz|其他来源/);
  // 每个已装插件一行，问题合并在说明里；未装的折成一行
  assert.match(t, /\n  已安装\n  ▲ a    1\.0\.0 → 1\.1\.0  可更新 · 缺少配置：Token · 缺少依赖 b\n  ▲ old  1\.0\.0          marketplace 里已下架\n\n  还没装的  可选，按需安装\n  ○ b、c、d\n  › ccpm install <插件名>   安装，依赖会一起装\n/);
  assert.match(t, /\n  需要注意\n  ▲ 还没开始用 ccpm 管理  推荐预设：/);
  assert.equal(t.match(/已下架/g).length, 2); // 插件行 + 下一步，不重复列在“需要注意”
  assert.doesNotMatch(t, /## |怎么办/); // 不再分 7 节
  // 下一步：去重、对齐的命令
  const next = t.slice(t.indexOf('下一步'));
  assert.equal(next.match(/ccpm sync/g).length, 1);
  assert.match(next, /ccpm sync         补装缺少的依赖、开始用 ccpm 管理、更新 a\n/); // update 并入 sync
  assert.match(next, /\n  › ccpm config a     填写 1 项配置\n/);
  assert.match(next, /  › ccpm remove old   卸载已下架的 old/);
});

test('重复 MCP', async () => {
  await status.run(await ctxOf({ installed: [inst('a'), inst('b')] }), [], {});
  assert.match(lines.join('\n'), /▲ MCP svc  配了两份：插件 b、你自己配置的\n[\s\S]*› claude mcp remove svc -s user/);
});

test('刷新失败：status 提示并继续；非只读抛 PreconditionError', async () => {
  const ctx = await ctxOf({ updateFails: true });
  await status.run(ctx, [], {});
  assert.match(lines[0], /^▲ 准备就绪  acme-plugins · 插件列表更新失败，使用本地副本 · 2 个已装/);
  assert.match(lines.join('\n'), /▲ 插件列表更新失败  结果来自上次的本地副本/);
  await assert.rejects(ctxOf({ updateFails: true }, { readOnly: false }), PreconditionError);
});

test('claude 缺失 / 能力不足', async () => {
  const bad = (missing) => loadContext({}, { claude: { checkCapabilities: async () => ({ ok: false, missing }) }, prompter: {}, out() {} });
  await assert.rejects(bad(['claude']), /未找到 claude 命令/);
  await assert.rejects(bad(['--values-stdin']), /请升级 Claude Code/);
});

test('还没添加任何 marketplace：提示 ccpm use', async () => {
  const claude = { ...fake(), listMarketplaces: async () => [] };
  await assert.rejects(loadContext({}, { claude, prompter: {}, out() {}, stateFile }), (e) => e.code === 'NO_MARKETPLACE' && /ccpm use/.test(e.message));
});

test('准备阶段某步失败：那一行变成 ✖ 步骤名，不打“准备就绪”', async () => {
  const out = [];
  const claude = { ...fake(), checkCapabilities: async () => ({ ok: false, missing: ['claude'] }) };
  await assert.rejects(loadContext({}, { claude, prompter: {}, out: (l) => out.push(l) }), PreconditionError);
  assert.deepEqual(out, ['✖ 检查 Claude Code']);
});

test('bin --help 与未知命令；失败打印详细日志路径', () => {
  const bin = join(here, '../bin/ccpm.js');
  const env = { ...process.env, FORCE_COLOR: '0', CLAUDE_CONFIG_DIR: mkdtempSync(join(tmpdir(), 'ccpm-cfg-')) };
  const h = spawnSync(process.execPath, [bin, '--help'], { env });
  assert.equal(h.status, 0);
  assert.match(h.stdout.toString(), /常用场景[\s\S]*ccpm install dev/);
  const u = spawnSync(process.execPath, [bin, 'bogus'], { env });
  assert.equal(u.status, 1);
  assert.match(u.stdout.toString(), /^✖ 未知命令：bogus\n  › 运行 ccpm help 查看所有命令\n$/);
  const s = spawnSync(process.execPath, [bin, 'sync'], { env: { ...env, PATH: '/nonexistent' } }); // 无 claude → 前置失败
  assert.equal(s.status, 2);
  const so = s.stdout.toString();
  assert.match(so, /^ccpm 0\.1\.0 · 全局\n✖ 检查 Claude Code\n✖ 未找到 claude 命令\n  › /);
  const m = /\n  详细日志：(.+\.log)\n$/.exec(so);
  assert.ok(m, so);
  assert.match(readFileSync(m[1], 'utf8'), /==== ccpm [\s\S]*未找到 claude 命令[\s\S]*退出码 2/);
});

test('ccpm log 打印路径', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ccpm-cfg-'));
  const r = spawnSync(process.execPath, [join(here, '../bin/ccpm.js'), 'log'], { env: { ...process.env, CLAUDE_CONFIG_DIR: dir, PATH: '/nonexistent' } });
  assert.equal(r.status, 0);
  const line = r.stdout.toString().split('\n')[0];
  assert.ok(line.startsWith(`今天的日志：${join(dir, 'ccpm', 'logs', 'ccpm-')}`), line); // Windows 路径是反斜杠
  assert.match(line, /ccpm-\d{4}-\d\d-\d\d\.log$/);
});

test('已停用的插件：下一步给出启用命令', async () => {
  const ctx = await ctxOf({ installed: [inst('a', { version: '1.1.0', enabled: false }), inst('b')] }, { marketplace: 'acme-plugins' });
  ctx.claude.getUnconfigured = async () => [];
  ctx.claude.listUserMcp = async () => [];
  ctx.state = { presets: ['data'], excluded: [] };
  await status.run(ctx, [], {});
  const t = lines.join('\n');
  assert.match(t, /⏸ a  1\.1\.0  已停用/);
  assert.match(t, /下一步\n  › ccpm enable a   重新启用（有意停用的可忽略）$/);
  assert.doesNotMatch(t, /一切正常/);
});

test('status 无事可做 → 一切正常', async () => {
  const ctx = await ctxOf({ installed: [inst('a', { version: '1.1.0' }), inst('b')] }, { marketplace: 'acme-plugins' });
  ctx.claude.getUnconfigured = async () => [];
  ctx.claude.listUserMcp = async () => [];
  ctx.state = { presets: ['data'], excluded: [] };
  await status.run(ctx, [], {});
  assert.deepEqual(lines.slice(1), ['', '  ● 2 已装   ○ 2 未装', '', '  已安装', '  ✔ a  1.1.0', '  ✔ b  1.0.0', '', '  还没装的  可选，按需安装', '  ○ c、d', '  › ccpm install <插件名>   安装，依赖会一起装',
    '', '  预设  一组常用插件 · 共 2 个，已选 1 个',
    '  ✔ base  已选（data 包含） · 已装齐  基础', '      ✔ b',
    '  ✔ data  已选 · 已装齐               全套', '      含 base 全部  ✔ a',
    '', '  ✔ 一切正常，无需操作']);
});

test('项目范围下建议的 ccpm 命令带 --scope project', async () => {
  const { withScope } = await import('../src/context.js');
  assert.equal(withScope('  ccpm update   # 更新插件'), '  ccpm update --scope project   # 更新插件');
  assert.equal(withScope('运行 ccpm config quality-mcp'), '运行 ccpm config quality-mcp --scope project');
  assert.equal(withScope('ccpm sync --scope project'), 'ccpm sync --scope project');
  assert.equal(withScope('claude mcp remove x -s user'), 'claude mcp remove x -s user');
});

test('list：已装在前、可更新标出、未装整行在后', async () => {
  const { run } = await import('../src/commands/list.js');
  const out = [];
  const catalog = new Map([
    ['a', { name: 'a', version: '1.1.0', description: 'A 插件' }],
    ['b', { name: 'b', version: '1.0.0', description: 'B 插件' }],
    ['c', { name: 'c', version: '2.0.0', description: 'C 插件' }],
  ]);
  const installed = [
    { name: 'a', marketplace: 'acme-plugins', version: '1.0.0', enabled: true },
    { name: 'b', marketplace: 'acme-plugins', version: '1.0.0', enabled: false },
    { name: 'x', marketplace: 'other', version: '9.9.9', enabled: true },
  ];
  assert.equal(await run({ catalog, installed, scope: 'user', out: (l) => out.push(l) }), 0);
  const t = out.join('\n');
  assert.equal(t, [
    '',
    'acme-plugins · 3 个插件 · 全局已装 2 · 未装 1',
    '',
    '     插件   版本            说明',
    '  ↑  a      1.0.0 → 1.1.0   A 插件',
    '  ⏸  b      1.0.0           B 插件  已停用',
    '  ○  c      2.0.0           C 插件',
    '',
    '  › ccpm install <插件名>   安装，依赖会一起装',
    '  › ccpm update             更新到最新版',
  ].join('\n'));
});

test('当前项目：全局装的插件不算“未装”', async () => {
  const ctx = await ctxOf({ installed: [inst('a', { version: '1.1.0' }), inst('b', { scope: 'project', projectPath: process.cwd() })] }, { scope: 'project' });
  ctx.claude.getUnconfigured = async () => [];
  ctx.claude.listUserMcp = async () => [];
  await status.run(ctx, [], {});
  const t = lines.join('\n');
  assert.match(t, /● 1 本项目已装   ● 1 全局已装   ○ 2 未装\n/);
  assert.match(t, /\n  本项目安装的\n  ✔ b  1\.0\.0\n\n  全局安装的  本项目也能用\n  ✔ a  1\.1\.0\n\n  还没装的  可选，按需安装\n  ○ c、d\n  › ccpm install --scope project <插件名>   只装到本项目\n  › ccpm install --scope user <插件名>      装到全局，所有项目都能用\n/);
  lines.length = 0;
  await list.run(ctx);
  assert.match(lines.join('\n'), /当前项目已装 1 · 全局已装 1 · 未装 2/);
});

test('预设没装齐：标出缺几个', async () => {
  const ctx = await ctxOf({ installed: [inst('a', { version: '1.1.0' })] });
  ctx.claude.getUnconfigured = async () => [];
  ctx.claude.listUserMcp = async () => [];
  ctx.state = { presets: ['data'], excluded: [] };
  await status.run(ctx, [], {});
  const t = lines.join('\n');
  assert.match(t, /\n  ▲ data  已选 · 缺 1 个 +全套\n      含 base 全部  ✔ a\n/);
  assert.match(t, /▲ base  已选（data 包含） · 缺 1 个 +基础\n      ○ b\n/);
  assert.match(t, /› ccpm install <预设名>   装齐整个预设/);
  assert.doesNotMatch(t, /预设 data 里还没装/); // 缺口只在“预设”一节标出
  assert.match(t, /下一步\n  › ccpm sync/);
});

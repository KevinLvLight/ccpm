process.env.CCPM_LANG ??= 'zh'; // 断言按中文文案写
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run as use } from '../src/commands/use.js';
import { findMarketplace, resolveMarketplace } from '../src/marketplace.js';
import { loadFile, loadState, saveState } from '../src/state.js';
import { ClaudeError } from '../src/claude.js';
import { loadContext, gatherPlan } from '../src/context.js';
import { strip } from '../src/ui.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, 'fixtures/marketplace');
const tmpFile = () => join(mkdtempSync(join(tmpdir(), 'ccpm-use-')), 'ccpm.json');
const ACME = { name: 'acme-plugins', source: 'github', repo: 'acme/plugins', installLocation: fixture };

function fakeClaude(list, { addError } = {}) {
  const calls = [];
  return {
    calls,
    checkCapabilities: async () => ({ ok: true, missing: [] }),
    listMarketplaces: async () => list.map((m) => ({ ...m })),
    addMarketplace: async (src) => {
      calls.push(src);
      if (addError) throw addError;
      list.push(ACME);
    },
  };
}
const ctxOf = (claude, o = {}) => {
  const lines = [];
  return { lines, ctx: { claude, out: (l) => lines.push(strip(l)), prompter: { interactive: true }, stateFile: tmpFile(), ...o } };
};

test('use owner/repo：没添加过就添加，并记为当前', async () => {
  const claude = fakeClaude([]);
  const { ctx, lines } = ctxOf(claude);
  assert.equal(await use(ctx, ['acme/plugins']), 0);
  assert.deepEqual(claude.calls, ['acme/plugins']);
  assert.equal(loadFile(ctx.stateFile).current, 'acme-plugins');
  assert.match(lines.join('\n'), /已切换到 acme-plugins/);
});

test('use owner/repo：已添加过（名字不同）→ 直接选中，不重复添加', async () => {
  const claude = fakeClaude([{ name: 'other', installLocation: fixture }, ACME]);
  const { ctx } = ctxOf(claude);
  assert.equal(await use(ctx, ['https://github.com/acme/plugins.git']), 0);
  assert.deepEqual(claude.calls, []);
  assert.equal(loadFile(ctx.stateFile).current, 'acme-plugins');
});

test('use <名字>：按名字选中', async () => {
  const claude = fakeClaude([ACME]);
  const { ctx } = ctxOf(claude);
  assert.equal(await use(ctx, ['acme-plugins']), 0);
  assert.deepEqual(claude.calls, []);
});

test('use 不带参数：交互时选择；非交互时报错并列出可选项', async () => {
  const claude = fakeClaude([{ name: 'other', installLocation: fixture }, ACME]);
  const { ctx } = ctxOf(claude, { prompter: { interactive: true, choose: async (_q, opts) => opts[1] } });
  assert.equal(await use(ctx, []), 0);
  assert.equal(loadFile(ctx.stateFile).current, 'acme-plugins');
  const b = ctxOf(claude, { prompter: { interactive: false } });
  assert.equal(await use(b.ctx, []), 1);
  assert.match(b.lines.join('\n'), /other、acme-plugins/);
});

test('use --show：只显示，不写文件', async () => {
  const { ctx, lines } = ctxOf(fakeClaude([ACME]));
  assert.equal(await use(ctx, [], { show: true }), 0);
  assert.match(lines.join('\n'), /还没选择/);
  assert.equal(existsSync(ctx.stateFile), false);
});

test('use：添加时认证失败 → PreconditionError 带凭证提示', async () => {
  const claude = fakeClaude([], { addError: new ClaudeError(['x'], 1, 'Authentication failed') });
  const { ctx } = ctxOf(claude);
  await assert.rejects(use(ctx, ['acme/plugins']), (e) => e.name === 'PreconditionError' && /credential helper/.test(e.message));
});

test('findMarketplace：名字、git 地址（忽略 .git 和末尾 /）、owner/repo', () => {
  const list = [{ name: 'x', url: 'https://git.example.com/acme/x.git' }, ACME];
  assert.equal(findMarketplace(list, 'x').name, 'x');
  assert.equal(findMarketplace(list, 'https://git.example.com/acme/x/').name, 'x');
  assert.equal(findMarketplace(list, 'acme/plugins').name, 'acme-plugins');
  assert.equal(findMarketplace(list, 'nope'), undefined);
});

test('resolveMarketplace：--marketplace > current > 只有一个；current 被删 → 提示 ccpm use', () => {
  const list = [ACME, { name: 'other' }];
  assert.equal(resolveMarketplace({ flag: 'other', file: { current: 'acme-plugins' }, list }).name, 'other');
  assert.deepEqual(resolveMarketplace({ file: { current: 'acme-plugins' }, list }), { name: 'acme-plugins', source: 'state' });
  assert.equal(resolveMarketplace({ file: { current: null }, list: [ACME] }).source, 'only');
  assert.throws(() => resolveMarketplace({ file: { current: 'gone' }, list }), (e) => e.code === 'NO_MARKETPLACE' && /gone 已从 Claude Code 中移除/.test(e.message) && /ccpm use/.test(e.message));
  assert.throws(() => resolveMarketplace({ file: { current: null }, list }), (e) => e.code === 'NO_MARKETPLACE');
});

test('ccpm.json：旧格式备份为 .bak；多个 marketplace 各存一份', () => {
  const f = tmpFile();
  writeFileSync(f, JSON.stringify({ presets: ['dev'], excluded: [] }));
  assert.deepEqual(loadFile(f), { current: null, marketplaces: {} });
  assert.equal(readFileSync(f + '.bak', 'utf8'), JSON.stringify({ presets: ['dev'], excluded: [] }));
  saveState({ presets: ['dev'], excluded: [] }, f, 'acme-plugins');
  saveState({ presets: [], excluded: ['x'] }, f, 'other');
  assert.deepEqual(loadState(f, { marketplace: 'acme-plugins' }), { presets: ['dev'], excluded: [] });
  assert.deepEqual(loadState(f, { marketplace: 'other' }), { presets: [], excluded: ['x'] });
});

test('没有 presets.json 的 marketplace：不提示、不显示预设，sync 计划照常', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ccpm-nopreset-'));
  cpSync(fixture, dir, { recursive: true });
  rmSync(join(dir, 'presets.json'), { force: true });
  const claude = {
    checkCapabilities: async () => ({ ok: true, missing: [] }),
    listMarketplaces: async () => [{ name: 'acme-plugins', installLocation: dir }],
    updateMarketplace: async () => {},
    listInstalled: async () => [{ id: 'a@acme-plugins', name: 'a', marketplace: 'acme-plugins', version: '0.9.0', scope: 'user', enabled: true }],
    getUnconfigured: async () => [],
    listUserMcp: async () => [],
  };
  const lines = [];
  const ctx = await loadContext({ readOnly: true, marketplace: 'acme-plugins' }, { claude, prompter: {}, out: (l) => lines.push(strip(l)), stateFile: tmpFile() });
  assert.deepEqual(ctx.presets, {});
  const plan = await gatherPlan(ctx);
  assert.ok(plan.update.some((u) => u.name === 'a'));
  await (await import('../src/commands/status.js')).run(ctx);
  assert.doesNotMatch(lines.join('\n'), /预设|presets\.json/);
});

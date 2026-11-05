process.env.CCPM_LANG ??= 'zh'; // 断言按中文文案写
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gatherPlan, loadContext, refreshInstalled, setScope } from '../src/context.js';
import { buildModel } from '../src/model.js';
import { setMarketplace as useMarketplace } from '../src/claude.js';
useMarketplace('acme-plugins'); // 单元测试不走 loadContext，直接指定

const here = dirname(fileURLToPath(import.meta.url));
const mkt = mkdtempSync(join(tmpdir(), 'ccpm-mkt-'));
cpSync(join(here, 'fixtures/marketplace'), mkt, { recursive: true });
writeFileSync(join(mkt, 'presets.json'), JSON.stringify({ formatVersion: 1, presets: {
  base: { description: '基础', plugins: ['b'] },
  data: { description: '全套', plugins: ['base', 'a'] },
} }));

const inst = (name, o = {}) => ({ id: `${name}@acme-plugins`, name, marketplace: 'acme-plugins', version: '1.0.0', scope: 'user', enabled: true, ...o });

async function setup({ installed, state, scope = 'user' }) {
  const stateFile = join(mkdtempSync(join(tmpdir(), 'ccpm-state-')), 'ccpm.json');
  if (state) writeFileSync(stateFile, JSON.stringify({ current: 'acme-plugins', marketplaces: { 'acme-plugins': state } }));
  const calls = [];
  const list = { now: installed };
  const claude = {
    checkCapabilities: async () => ({ ok: true, missing: [] }),
    listMarketplaces: async () => [{ name: 'acme-plugins', installLocation: mkt }],
    updateMarketplace: async () => {},
    listInstalled: async () => list.now,
    getUnconfigured: async (id) => { calls.push(id); return id.startsWith('a@') ? ['token'] : []; },
    listUserMcp: async () => { calls.push('mcp'); return []; },
  };
  const ctx = await loadContext({ scope, readOnly: true }, { claude, prompter: {}, out() {}, stateFile });
  return { ctx, calls, list };
}

test('buildModel 全局：插件、预设（via）、计数、下一步', async () => {
  const { ctx } = await setup({ installed: [inst('a'), inst('old', { enabled: false })], state: { presets: ['data'], excluded: [] } });
  const m = buildModel(ctx, await gatherPlan(ctx));
  assert.equal(m.scope, 'user');
  assert.deepEqual(m.counters, { installed: 2, global: 0, notInstalled: 3, update: 1, configure: 1, disabled: 1, presets: 2, presetsChosen: 1 });
  const a = m.plugins.find((p) => p.name === 'a');
  assert.deepEqual({ ...a, description: undefined }, {
    name: 'a', description: undefined, version: '1.0.0', latest: '1.1.0', where: 'here', enabled: true, update: { from: '1.0.0', to: '1.1.0' },
    missingConfig: ['Token'], missingDeps: ['b'], delisted: false, dependencies: ['b'], hasConfig: true,
  });
  assert.equal(m.plugins.find((p) => p.name === 'old').delisted, true);
  assert.equal(m.plugins.find((p) => p.name === 'c').where, 'none');
  const [base, data] = m.presets;
  assert.deepEqual([base.name, base.chosen, base.via, base.got, base.want], ['base', false, 'data', 0, 1]);
  assert.deepEqual([data.chosen, data.got, data.want], [true, 1, 2]);
  assert.deepEqual(data.members, [
    { name: 'base', kind: 'preset', installed: false, excluded: false, delisted: false },
    { name: 'a', kind: 'plugin', installed: true, excluded: false, delisted: false },
  ]);
  assert.deepEqual(m.next.map((n) => n.cmd), ['ccpm enable old', 'ccpm config a', 'ccpm sync', 'ccpm remove old']);
  assert.match(m.next[2].why, /补装缺少的依赖、更新 a/); // update 并入 sync
});

test('buildModel 当前项目：全局装的标 global，不含预设', async () => {
  const { ctx } = await setup({ installed: [inst('a', { version: '1.1.0' }), inst('b', { scope: 'project', projectPath: process.cwd() })], scope: 'project' });
  const m = buildModel(ctx, await gatherPlan(ctx));
  assert.deepEqual(m.plugins.map((p) => [p.name, p.where]), [['a', 'global'], ['b', 'here'], ['c', 'none'], ['d', 'none']]);
  assert.deepEqual(m.presets, []);
  assert.equal(m.counters.global, 1);
  assert.equal(m.plugins[0].version, '1.1.0');
});

test('refreshInstalled 只重查变化的插件；setScope 不重新拉取', async () => {
  const { ctx, calls, list } = await setup({ installed: [inst('b')], state: { presets: [], excluded: [] } });
  await gatherPlan(ctx);
  assert.deepEqual(calls, ['mcp']); // b 有 MCP、没有必填配置
  list.now = [inst('a', { version: '1.1.0' }), inst('b')];
  await refreshInstalled(ctx, ['a']);
  const plan = await gatherPlan(ctx);
  assert.deepEqual(calls, ['mcp', 'a@acme-plugins']); // MCP 列表沿用
  assert.deepEqual(plan.configure, [{ name: 'a', keys: ['token'] }]);
  list.now = [inst('b')]; // a 卸掉后不再算缺配置
  await refreshInstalled(ctx);
  assert.deepEqual((await gatherPlan(ctx)).configure, []);
  assert.deepEqual(calls, ['mcp', 'a@acme-plugins']);

  list.now = [inst('a', { version: '1.1.0' }), inst('b', { scope: 'project', projectPath: process.cwd() })];
  await refreshInstalled(ctx);
  await setScope(ctx, 'project');
  const m = buildModel(ctx, await gatherPlan(ctx));
  assert.deepEqual(m.plugins.filter((p) => p.where !== 'none').map((p) => [p.name, p.where]), [['a', 'global'], ['b', 'here']]);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, resolveDeps, inferPresets, computePlan, USER_MCP } from '../src/plan.js';

const meta = (name, o = {}) => ({ name, version: '1.0.0', dependencies: [], userConfig: {}, mcpServers: [], ...o });
const cat = (...ms) => new Map(ms.map((m) => [m.name, m]));
const inst = (name, o = {}) => ({ id: `${name}@ai-efficiency`, name, marketplace: 'ai-efficiency', version: '1.0.0', scope: 'user', enabled: true, ...o });
const run = (o) => computePlan({ installed: [], catalog: new Map(), state: null, presets: {}, unconfigured: new Map(), userMcp: [], ...o });

test('compareVersions', () => {
  assert.equal(compareVersions('1.10.0', '1.9.9'), 1);
  assert.equal(compareVersions('1.2', '1.2.0'), 0);
  assert.equal(compareVersions('1.0.0', '1.0.1'), -1);
});

test('resolveDeps 拓扑序、unknown、环', () => {
  const c = cat(meta('a', { dependencies: ['b'] }), meta('b', { dependencies: ['c'] }), meta('c'));
  assert.deepEqual(resolveDeps(['a'], c), { order: ['c', 'b', 'a'], unknown: [] });
  assert.deepEqual(resolveDeps(['x'], c), { order: [], unknown: ['x'] });
  const cyc = cat(meta('a', { dependencies: ['b'] }), meta('b', { dependencies: ['a'] }));
  assert.deepEqual(resolveDeps(['a'], cyc).order, ['b', 'a']);
});

test('inferPresets', () => {
  const p = { 'dev-base': { plugins: ['a'] }, dsgp: { plugins: ['dev-base', 'b'] } };
  assert.deepEqual(inferPresets(p, new Set(['a'])), ['dev-base']);
  assert.deepEqual(inferPresets(p, new Set(['a', 'b'])), ['dev-base', 'dsgp']);
  assert.deepEqual(inferPresets({ x: { plugins: ['y'] }, y: { plugins: ['x'] } }, new Set(['x'])), []);
});

test('install: 预设展开、excluded、依赖、已装去除、缺失警告', () => {
  const c = cat(meta('a', { dependencies: ['d'] }), meta('b'), meta('d'), meta('e'));
  const p = { s: { plugins: ['a', 'b', 'gone'] } };
  const plan = run({ catalog: c, presets: p, state: { presets: ['s'], excluded: ['b'] }, installed: [inst('e')] });
  assert.deepEqual(plan.install, ['d', 'a']);
  assert.deepEqual(plan.warnings.map((w) => w.msg), ['插件 gone 已从 marketplace 下架，已跳过']);
});

test('预设不存在 / state null / 已装依赖', () => {
  const c = cat(meta('a', { dependencies: ['d'] }), meta('d'));
  assert.deepEqual(run({ catalog: c, state: { presets: ['nope'], excluded: [] } }).warnings.map((w) => w.msg), ['预设 nope 已不存在，已跳过']);
  assert.deepEqual(run({ catalog: c, installed: [inst('a')] }).install, ['d']);
});

test('update / orphans / disabled / 忽略其它 marketplace', () => {
  const c = cat(meta('a', { version: '1.2.0' }), meta('b'));
  const plan = run({
    catalog: c,
    installed: [inst('a'), inst('b', { enabled: false }), inst('zz'), { ...inst('superpowers'), id: 'superpowers@other', marketplace: 'other' }],
  });
  assert.deepEqual(plan.update, [{ name: 'a', from: '1.0.0', to: '1.2.0' }]);
  assert.deepEqual(plan.orphans, ['zz']);
  assert.deepEqual(plan.disabled, ['b']);
});

test('configure 只含必填项', () => {
  const c = cat(meta('a', { userConfig: { k: { required: true }, o: {} } }));
  const plan = run({ catalog: c, installed: [inst('a')], unconfigured: new Map([['a', ['k', 'o']], ['b', []]]) });
  assert.deepEqual(plan.configure, [{ name: 'a', keys: ['k'] }]);
});

test('duplicateMcp', () => {
  const c = cat(meta('a', { mcpServers: ['s', 'u'] }), meta('b', { mcpServers: ['s'] }));
  const plan = run({ catalog: c, installed: [inst('a'), inst('b')], userMcp: ['u'] });
  assert.deepEqual(plan.duplicateMcp, [
    { server: 's', owners: ['a', 'b'] },
    { server: 'u', owners: ['a', USER_MCP] },
  ]);
});

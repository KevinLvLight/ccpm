process.env.CCPM_LANG ??= 'zh'; // 断言按中文文案写
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = join(root, 'test/fixtures/marketplace');
const tmp = () => mkdtempSync(join(tmpdir(), 'ccpm-check-'));
// ccpm check 不调用 claude：PATH 指向不存在的目录也能跑
const check = (args, env = {}) => spawnSync(process.execPath, [join(root, 'bin/ccpm.js'), 'check', ...args],
  { env: { ...process.env, PATH: '/nonexistent', CLAUDE_CONFIG_DIR: tmp(), ...env }, encoding: 'utf8' });
const copy = (presets) => {
  const dir = tmp();
  cpSync(fixture, dir, { recursive: true });
  if (presets) writeFileSync(join(dir, 'presets.json'), JSON.stringify(presets));
  return dir;
};

test('check：示例 marketplace 通过', () => {
  const r = check([fixture]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /校验通过 · \d+ 个插件/);
});

test('check：预设引用不存在的插件 → 1 并点名', () => {
  const r = check([copy({ formatVersion: 1, presets: { dev: { description: 'd', plugins: ['nope'] } } })]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /nope/);
});

test('check：预设与插件重名、formatVersion 过新 → 1', () => {
  assert.match(check([copy({ formatVersion: 1, presets: { a: { description: 'd', plugins: ['b'] } } })]).stdout, /重名/);
  assert.equal(check([copy({ formatVersion: 2, presets: {} })]).status, 1);
});

test('check：插件写法错误计入退出码', () => {
  const dir = copy();
  mkdirSync(join(dir, 'plugins/e/.claude-plugin'), { recursive: true });
  writeFileSync(join(dir, 'plugins/e/.claude-plugin/plugin.json'), JSON.stringify({ name: 'e', userConfig: { k: { type: 'boolean' } } }));
  const mp = join(dir, '.claude-plugin/marketplace.json');
  const m = JSON.parse(readFileSync(mp, 'utf8'));
  m.plugins.push({ name: 'e', source: './plugins/e' });
  writeFileSync(mp, JSON.stringify(m));
  const r = check([dir]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /e: .*boolean/);
});

test('check：不是 marketplace 目录 → 1', () => {
  const r = check([tmp()]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /不是 marketplace 目录/);
});

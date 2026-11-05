import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = join(root, 'test/fixtures/marketplace');
const tmp = () => mkdtempSync(join(tmpdir(), 'ccpm-'));
const check = (env) =>
  spawnSync(process.execPath, ['scripts/check.js'], { cwd: root, env: { ...process.env, ...env }, encoding: 'utf8' });
const presetsFile = (obj) => {
  const f = join(tmp(), 'presets.json');
  writeFileSync(f, JSON.stringify(obj));
  return f;
};


test('check: 预设与插件重名 -> 1', () => {
  const f = presetsFile({ formatVersion: 1, presets: { a: { description: 'd', plugins: ['b'] } } });
  const r = check({ CCPM_MARKETPLACE_DIR: fixture, CCPM_PRESETS_FILE: f });
  assert.equal(r.status, 1);
  assert.match(r.stdout + r.stderr, /重名/);
});
test('check: formatVersion 2 -> 1', () => {
  const f = presetsFile({ formatVersion: 2, presets: {} });
  assert.equal(check({ CCPM_MARKETPLACE_DIR: fixture, CCPM_PRESETS_FILE: f }).status, 1);
});
test('check: 插件写法错误计入退出码', () => {
  const dir = tmp();
  cpSync(fixture, dir, { recursive: true });
  mkdirSync(join(dir, 'plugins/e/.claude-plugin'), { recursive: true });
  writeFileSync(join(dir, 'plugins/e/.claude-plugin/plugin.json'),
    JSON.stringify({ name: 'e', userConfig: { k: { type: 'boolean' } } }));
  const mp = join(dir, '.claude-plugin/marketplace.json');
  const m = JSON.parse(readFileSync(mp, "utf8"));
  m.plugins.push({ name: 'e', source: './plugins/e' });
  writeFileSync(mp, JSON.stringify(m));
  const f = presetsFile({ formatVersion: 1, presets: {} });
  const r = check({ CCPM_MARKETPLACE_DIR: dir, CCPM_PRESETS_FILE: f });
  assert.equal(r.status, 1);
  assert.match(r.stdout + r.stderr, /e: .*boolean/);
});

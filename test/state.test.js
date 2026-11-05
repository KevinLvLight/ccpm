process.env.CCPM_LANG ??= 'zh'; // 断言按中文文案写
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { statePath, loadState, saveState } from '../src/state.js';
import { setMarketplace as useMarketplace } from '../src/claude.js';
useMarketplace('acme-plugins'); // 单元测试不走 loadContext，直接指定

const tmpFile = () => join(mkdtempSync(join(tmpdir(), 'ccpm-state-')), 'ccpm.json');

test('loadState 文件不存在返回 null', () => {
  assert.equal(loadState(tmpFile()), null);
});

test('saveState 后 loadState 读回相等，且自动创建目录', () => {
  const f = join(mkdtempSync(join(tmpdir(), 'ccpm-state-')), 'nested', 'ccpm.json');
  const state = { presets: ['full'], excluded: ['a@acme-plugins'] };
  saveState(state, f);
  assert.deepEqual(loadState(f), state);
});

test('loadState JSON 损坏时备份为 ccpm.json.bak 并返回 null', () => {
  const f = tmpFile();
  writeFileSync(f, '{oops');
  assert.equal(loadState(f), null);
  assert.equal(existsSync(f), false);
  assert.equal(readFileSync(f + '.bak', 'utf8'), '{oops');
});

test('loadState 字段类型不对同样按损坏处理', () => {
  const f = tmpFile();
  writeFileSync(f, '{"presets":"x"}');
  assert.equal(loadState(f), null);
  assert.equal(readFileSync(f + '.bak', 'utf8'), '{"presets":"x"}');
});

test('statePath 使用 CLAUDE_CONFIG_DIR', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ccpm-cfg-'));
  const old = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = dir;
  try {
    assert.equal(statePath(), join(dir, 'ccpm.json'));
  } finally {
    if (old === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = old;
  }
});

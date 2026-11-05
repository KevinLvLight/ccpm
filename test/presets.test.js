import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPresets, expandPreset, validatePresets } from '../src/presets.js';

const tmp = (obj) => {
  const f = join(mkdtempSync(join(tmpdir(), 'ccpm-')), 'presets.json');
  writeFileSync(f, typeof obj === 'string' ? obj : JSON.stringify(obj));
  return f;
};

test('expandPreset 展开嵌套并去重', () => {
  const p = { base: { plugins: ['a', 'b'] }, full: { plugins: ['base', 'c', 'a'] } };
  assert.deepEqual(expandPreset(p, 'full'), ['a', 'b', 'c']);
});

test('expandPreset 循环报错', () => {
  const p = { x: { plugins: ['y'] }, y: { plugins: ['x'] } };
  assert.throws(() => expandPreset(p, 'x'), /x -> y -> x/);
});

test('expandPreset 未知预设', () => {
  assert.throws(() => expandPreset({}, 'nope'), /未知预设: nope/);
});

test('loadPresets 文件不存在', () => {
  assert.deepEqual(loadPresets('/no/such/presets.json'), { presets: {}, warning: '未找到 presets.json，预设不可用' });
});

test('loadPresets formatVersion 过高', () => {
  const r = loadPresets(tmp({ formatVersion: 2, presets: { a: { description: '', plugins: [] } } }));
  assert.deepEqual(r, { presets: {}, warning: '预设格式已更新（formatVersion 2），请升级 ccpm' });
});

test('loadPresets 缺 formatVersion / 非整数 / 坏 JSON', () => {
  for (const c of [{ presets: {} }, { formatVersion: '1', presets: {} }, '{oops']) {
    assert.deepEqual(loadPresets(tmp(c)), { presets: {}, warning: 'presets.json 格式无效' });
  }
});

test('loadPresets 正常', () => {
  const presets = { a: { description: 'd', plugins: ['x'] } };
  assert.deepEqual(loadPresets(tmp({ formatVersion: 1, presets })), { presets, warning: null });
});

test('validatePresets', () => {
  const p = {
    a: { plugins: [] },
    full: { plugins: ['zzz', 'p1'] },
    x: { plugins: ['y'] },
    y: { plugins: ['x'] },
  };
  const errs = validatePresets(p, new Set(['a', 'p1']));
  assert.ok(errs.includes('预设 a 与插件重名'));
  assert.ok(errs.includes('预设 full 引用了不存在的 zzz'));
  assert.ok(errs.some((e) => e.includes('x -> y -> x')));
  assert.deepEqual(validatePresets({ ok: { plugins: ['p1'] } }, new Set(['p1'])), []);
});

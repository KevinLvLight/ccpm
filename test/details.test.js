process.env.CCPM_LANG ??= 'zh';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseDetails } from '../src/details.js';
import { changelogBetween } from '../src/catalog.js';

// `claude plugin details` 的真实输出（claude 2.1.310）
const SAMPLE = readFileSync(new URL('./fixtures/plugin-details.txt', import.meta.url), 'utf8');

test('parseDetails：组件清单、常驻 token、逐个组件的占用', () => {
  const d = parseDetails(SAMPLE);
  assert.deepEqual(d.components.map((c) => [c.kind, c.count]), [['skills', 2], ['agents', 0], ['hooks', 3], ['mcp', 1], ['lsp', 0]]);
  assert.deepEqual(d.components[0].names, ['ponytail', 'ponytail-audit']);
  assert.deepEqual(d.components[2].names, ['SessionStart', 'SubagentStart', 'UserPromptSubmit']);
  assert.equal(d.components[2].contextFree, true);
  assert.equal(d.alwaysOn, '~430');
  assert.deepEqual(d.perComponent[1], { name: 'ponytail-audit', alwaysOn: '~90', onInvoke: '~1.3k' });
});

test('parseDetails：认不出的格式返回 null（页面改为显示原文）', () => {
  assert.equal(parseDetails('Plugin "x" not found.'), null);
  assert.equal(parseDetails(''), null);
});

test('changelogBetween：已装版本（不含）到最新版本（含）之间的说明，新的在前', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ccpm-cl-'));
  writeFileSync(join(dir, 'CHANGELOG.md'), '# Changelog\n\n## [1.10.0]\n\n- ten\n\n## [1.2.0] - 2026-01-02\n\n- two\n\n## 1.1.0\n\n- one\n\n## [1.0.0]\n\n- zero\n\n## [Unreleased]\n\n- wip\n');
  const meta = { dir };
  assert.deepEqual(changelogBetween(meta, '1.0.0', '1.10.0').map((e) => e.version), ['1.10.0', '1.2.0', '1.1.0']);
  assert.equal(changelogBetween(meta, '1.0.0', '1.2.0')[0].text, '- two');
  assert.deepEqual(changelogBetween(meta, undefined, '1.1.0').map((e) => e.version), ['1.1.0']);
  assert.deepEqual(changelogBetween({ dir: join(dir, 'none') }, '1.0.0', '2.0.0'), []);
});

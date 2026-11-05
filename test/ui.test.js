import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SYMBOLS, box, brief, colorEnabled, setColor, strip, table, width } from '../src/ui.js';
import { summarize } from '../src/flow.js';
import { setMarketplace as useMarketplace } from '../src/claude.js';
useMarketplace('acme-plugins'); // 单元测试不走 loadContext，直接指定

test('width：中文/全角算 2 列，ANSI 不计', () => {
  assert.equal(width('abc'), 3);
  assert.equal(width('已装'), 4);
  assert.equal(width('ａ，'), 4); // 全角字母、全角逗号
  assert.equal(width('한글'), 4);
  assert.equal(width('\x1b[1m插件\x1b[22m x'), 6);
  assert.equal(width('✔ ↑ ▲ ○ ⏸ + − › ●'), 17);
});

test('table：按显示宽度对齐，单格行不参与', () => {
  assert.deepEqual(table([['插件', 'x'], ['ab', 'y'], ['很长很长很长的一格']]), ['  插件  x', '  ab    y', '  很长很长很长的一格']);
});

test('颜色：非 TTY / NO_COLOR / TERM=dumb 关闭；FORCE_COLOR 强制', () => {
  const tty = { isTTY: true };
  assert.equal(colorEnabled(tty, {}), true);
  assert.equal(colorEnabled({ isTTY: false }, {}), false);
  assert.equal(colorEnabled(tty, { NO_COLOR: '1' }), false);
  assert.equal(colorEnabled(tty, { TERM: 'dumb' }), false);
  assert.equal(colorEnabled({ isTTY: false }, { FORCE_COLOR: '1' }), true);
  assert.equal(colorEnabled(tty, { FORCE_COLOR: '0' }), false);
});

test('颜色关闭时 box 是纯文本，宽度按显示宽度', () => {
  setColor(false);
  const b = box('完成', ['✔ 1 个插件已就绪', 'abc']);
  assert.equal(new Set(b.map(width)).size, 1); // 四行一样宽
  assert.equal(b[0], '╭─ 完成 ─────────────╮');
  assert.equal(b[1], '│  ✔ 1 个插件已就绪  │');
  assert.equal(b[3], '╰────────────────────╯');
  assert.equal(b.join(''), strip(b.join('')));
});

test('结果卡片边框颜色：成功绿、只有跳过黄、有失败红', () => {
  setColor(true);
  try {
    const card = (report) => {
      const lines = [];
      summarize({ out: (l) => lines.push(l), scope: 'user' }, { ok: [], skipped: [], failed: [], ...report });
      return lines[1];
    };
    assert.match(card({ ok: ['a'] }), /^\x1b\[32m╭/);
    assert.match(card({ ok: ['a'], skipped: [{ name: 'b', reason: 'x' }] }), /^\x1b\[33m╭/);
    assert.match(card({ ok: ['a'], skipped: [{ name: 'b', reason: 'x' }], failed: [{ name: 'c', error: 'e' }] }), /^\x1b\[31m╭/);
  } finally {
    setColor(false);
  }
});

test('brief：第一句，最多 40 字', () => {
  assert.equal(brief('第一句。第二句'), '第一句');
  assert.equal(brief('x'.repeat(50)), 'x'.repeat(40) + '…');
});

test('符号表本身不含 emoji 呈现', () => {
  for (const ch of SYMBOLS) assert.ok(!/\p{Emoji_Presentation}/u.test(ch), ch);
  const EMOJI = new RegExp(`(?![${SYMBOLS}])\\p{Extended_Pictographic}|\\uFE0F`, 'u');
  for (const e of ['✅', '⚠️', '❌', '⬆️', '⏸️', '➕', '🔧', '🗑️', 'ℹ️']) assert.match(e, EMOJI, e);
  for (const ch of SYMBOLS) assert.doesNotMatch(ch, EMOJI, ch);
});

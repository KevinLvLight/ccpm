import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { createPrompter } from '../src/prompt.js';
import { setColor, strip } from '../src/ui.js';
import { setMarketplace as useMarketplace } from '../src/claude.js';
useMarketplace('acme-plugins'); // 单元测试不走 loadContext，直接指定

test('confirm 后 readline 已关闭，stdin 无残留监听', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const p = createPrompter({ input, output, interactive: true });
  for (let i = 0; i < 12; i++) {
    const pending = p.confirm('ok?');
    input.write('y\n');
    assert.equal(await pending, true);
  }
  for (const ev of ['data', 'end', 'keypress', 'error']) assert.equal(input.listenerCount(ev), 0, ev);
});

// 假终端：readline 以 terminal 模式工作（逐字回显）
const fakeTty = () => {
  const output = new PassThrough();
  Object.assign(output, { isTTY: true, columns: 80 });
  let text = '';
  output.on('data', (d) => { text += d; });
  return { output, text: () => text };
};

test('敏感输入：每个字符回显为 •（退格生效），屏幕和日志里都没有原文', async () => {
  setColor(false);
  const input = new PassThrough();
  const { output, text } = fakeTty();
  const logged = [];
  const p = createPrompter({ input, output, interactive: true, log: (l) => logged.push(l) });
  const pending = p.ask('QualityHub Token', { secret: true, hint: '在 My Account 生成' });
  for (const ch of 'sekret-X') input.write(ch);
  input.write('\x7f'); // 退格
  input.write('\r');
  assert.equal(await pending, 'sekret-');
  assert.match(strip(text()), /^\? QualityHub Token 输入内容已隐藏 · 在 My Account 生成\n  › ••••••••  › •••••••\r\n$/); // 退格后整行重绘
  assert.match(text(), /••••••••/);
  assert.doesNotMatch(text(), /sekret/);
  assert.doesNotMatch(logged.join('\n'), /sekret/);
});

test('confirm：回车默认 Y；卸载类 default:false 回车为 N', async () => {
  setColor(false);
  const input = new PassThrough();
  const { output, text } = fakeTty();
  const p = createPrompter({ input, output, interactive: true });
  let pending = p.confirm('继续？');
  input.write('\r');
  assert.equal(await pending, true);
  assert.match(text(), /\? 继续？ \(Y\/n\) /);
  pending = p.confirm('确认卸载？', { default: false });
  input.write('\r');
  assert.equal(await pending, false);
  assert.match(text(), /\? 确认卸载？ \(y\/N\) /);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gatherPlan, loadContext } from '../src/context.js';
import { buildModel } from '../src/model.js';
import { initialState, reduce, render } from '../src/tui/view.js';
import { createTuiPrompter } from '../src/tui/prompter.js';
import { runTui } from '../src/tui/app.js';
import { TERM, setColor, strip, width } from '../src/ui.js';
import { setMarketplace as useMarketplace } from '../src/claude.js';
useMarketplace('acme-plugins'); // 单元测试不走 loadContext，直接指定

setColor(false);
const here = dirname(fileURLToPath(import.meta.url));
const mkt = mkdtempSync(join(tmpdir(), 'ccpm-mkt-'));
cpSync(join(here, 'fixtures/marketplace'), mkt, { recursive: true });
writeFileSync(join(mkt, 'presets.json'), JSON.stringify({ formatVersion: 1, presets: {
  base: { description: '基础', plugins: ['b'] },
  data: { description: '全套', plugins: ['base', 'a'] },
} }));
const inst = (name, o = {}) => ({ id: `${name}@acme-plugins`, name, marketplace: 'acme-plugins', version: '1.0.0', scope: 'user', enabled: true, ...o });

function fakeClaude(installed, calls = []) {
  const rec = (n, f) => async (...a) => { calls.push([n, ...a]); return f?.(...a); };
  return {
    checkCapabilities: async () => ({ ok: true, missing: [] }),
    listMarketplaces: async () => [{ name: 'acme-plugins', installLocation: mkt }],
    updateMarketplace: async () => {},
    listInstalled: async () => [...installed],
    getUnconfigured: async (id) => (id.startsWith('a@') ? ['token'] : []),
    listUserMcp: async () => [],
    install: rec('install', (id) => installed.push(inst(id.split('@')[0], { version: id.startsWith('a@') ? '1.1.0' : '1.0.0' }))),
    configure: rec('configure'),
    enable: rec('enable'),
    disable: rec('disable'),
    update: rec('update'),
    uninstall: rec('uninstall'),
    prune: async () => ({ ids: [] }),
  };
}
const newState = () => {
  const f = join(mkdtempSync(join(tmpdir(), 'ccpm-state-')), 'ccpm.json');
  writeFileSync(f, JSON.stringify({ current: 'acme-plugins', marketplaces: { 'acme-plugins': { presets: ['data'], excluded: [] } } }));
  return f;
};

// a 已装（可更新、缺配置、缺依赖 b），选了 data
async function model(scope = 'user') {
  const installed = [inst('a'), inst('b', { scope: 'project', projectPath: process.cwd() })];
  const ctx = await loadContext({ scope, readOnly: true }, { claude: fakeClaude(installed), prompter: {}, out() {}, stateFile: newState() });
  return buildModel(ctx, await gatherPlan(ctx));
}
const screen = (state, size = { cols: 100, rows: 24 }) => render(state, size).map(strip);
const key = (k) => (k.length === 1 ? { name: /[a-z]/.test(k) ? k : undefined, ch: k } : { name: k });
const press = (state, ...keys) => keys.reduce((r, k) => reduce(r.state, key(k)), { state }).state;

test('render：分组、光标、勾选、详情、按键栏', async () => {
  const s = { ...initialState(), model: await model(), cursor: 'a', selected: ['c'] };
  const lines = screen(s);
  assert.equal(lines.length, 24);
  assert.match(lines[0], /^ccpm · acme-plugins · 全局 +● 1 已装  ↑ 1 可更新  ▲ 1 需配置  ○ 3 未装$/);
  const t = lines.join('\n');
  assert.match(t, /\n 预设  一组常用插件\n +▲ base +已选（data 包含） · 缺 1 个 +基础\n +▲ data +已选 · 缺 1 个 +全套\n 已安装\n▸ +▲ a +1\.0\.0 → 1\.1\.0 +可更新 · 缺少配置：Token · 缺少依赖 b/);
  assert.match(t, /\n 还没装的  可选，按需安装\n +○ b +1\.0\.0 +plugin b\n \[x\] ○ c/);
  assert.match(t, /\na  已装 1\.0\.0 · 最新 1\.1\.0 · 依赖 b\n  plugin a\n  可更新 · 缺少配置：Token · 缺少依赖 b\n/);
  assert.match(lines.at(-1), /^ i 安装 u 更新 .*\? 帮助 q 退出$/); // 100 列放不下完整按键栏，用短版
  assert.match(strip(render(s, { cols: 130, rows: 24 }).at(-1)), /^ ↑↓ 移动  空格 勾选  i 安装 .*\? 帮助  q 退出$/);
});

test('render：项目范围显示全局安装的；列表过长时滚动保持光标可见；窄窗口截断', async () => {
  const m = await model('project');
  let t = screen({ ...initialState({ scope: 'project' }), model: m }).join('\n');
  assert.match(t, /本项目 +● 1 本项目已装  ● 1 全局已装/);
  assert.match(t, /\n 本项目安装的\n▸ +✔ b[^\n]*\n 全局安装的  本项目也能用\n +✔ a +1\.0\.0 +装在全局\n/);
  assert.doesNotMatch(t, /预设/);

  const s = { ...initialState(), model: await model(), cursor: 'd' };
  const small = screen(s, { cols: 100, rows: 12 }); // 列表区只有 4 行
  assert.ok(small.some((l) => /^▸ +○ d/.test(l)));
  assert.ok(!small.some((l) => /^ 预设/.test(l)));
  assert.match(small.join('\n'), /── \d+-\d+ \/ 9/);

  const narrow = render({ ...s, cursor: 'a' }, { cols: 30, rows: 20 });
  for (const l of narrow) assert.ok(width(l) <= 29, l);
  assert.ok(narrow.map(strip).some((l) => l.endsWith('…')));
});

test('render：确认弹窗、敏感输入只显示 •、操作记录区', async () => {
  const m = await model();
  let t = screen({ ...initialState(), model: m, dialog: { kind: 'confirm', title: '确认卸载？', def: false } }).join('\n');
  assert.match(t, /╭─ 确认 ─+╮\n *│  确认卸载？ +│\n *│ +│\n *│  \(y\/N\)  y 是/);
  const ask = { kind: 'ask', title: 'Token', secret: true, hint: '在 My Account 生成', text: '' };
  const typed = press({ ...initialState(), model: m, dialog: ask }, ...'sek r3t');
  assert.equal(typed.dialog.text, 'sek r3t');
  t = screen(typed).join('\n');
  assert.match(t, /Token[\s\S]*输入内容已隐藏 · 在 My Account 生成[\s\S]*› •••••••/);
  assert.doesNotMatch(t, /sek|r3t/);
  const log = { title: '安装 b', lines: ['  将要执行', '  + b  1.0.0'], running: true };
  t = screen({ ...initialState(), model: m, log, spinner: '⠋ 正在安装 b' }).join('\n');
  assert.match(t, /── 安装 b ─+\n  将要执行\n  \+ b  1\.0\.0\n⠋ 正在安装 b\n/);
});

test('reduce：移动跳过分组标题、勾选、Esc 先关弹窗', async () => {
  let s = { ...initialState(), model: await model() };
  s = press(s, 'down');
  assert.equal(s.cursor, 'data');
  s = press(s, 'down');
  assert.equal(s.cursor, 'a'); // 跳过“已安装”标题
  s = press(s, 'end');
  assert.equal(s.cursor, 'd');
  s = press(s, 'home', 'j', 'k');
  assert.equal(s.cursor, 'base');
  s = press(s, 'space', 'down', 'space');
  assert.deepEqual(s.selected, ['base', 'data']);
  s = press(s, 'space');
  assert.deepEqual(s.selected, ['base']);
  assert.deepEqual(press(s, 'a').selected, []);
  s = press(s, '?');
  assert.equal(s.overlay, 'help');
  const r = reduce(s, { name: 'escape' });
  assert.equal(r.state.overlay, null);
  assert.equal(r.effect, undefined); // 没有退出
  assert.deepEqual(reduce(r.state, { name: 'escape' }).effect, { type: 'quit' });
  assert.deepEqual(reduce(r.state, key('q')).effect, { type: 'quit' });
  assert.deepEqual(reduce(r.state, { name: 'c', ctrl: true }).effect, { type: 'quit', force: true });
});

test('reduce：动作键 → 运行命令；不适用时给出说明', async () => {
  const s = { ...initialState(), model: await model() };
  const eff = (cursor, k, selected = []) => reduce({ ...s, cursor, selected }, key(k));
  assert.deepEqual(eff('a', 'u').effect, { type: 'run', cmd: 'update', names: ['a'] });
  assert.deepEqual(eff('b', 'u').effect, { type: 'run', cmd: 'update', names: [] }); // 光标处不可更新 → 全部
  assert.deepEqual(eff('a', 'c').effect, { type: 'run', cmd: 'config', names: ['a'] });
  assert.deepEqual(eff('a', 'e').effect, { type: 'run', cmd: 'disable', names: ['a'] });
  assert.deepEqual(eff('a', 'r').effect, { type: 'run', cmd: 'remove', names: ['a'] });
  assert.deepEqual(eff('data', 'i').effect, { type: 'run', cmd: 'install', names: ['data'] });
  assert.deepEqual(eff('data', 'r').effect, { type: 'run', cmd: 'remove', names: ['data'] });
  assert.deepEqual(eff('a', 'i', ['b', 'c']).effect, { type: 'run', cmd: 'install', names: ['b', 'c'] });
  assert.deepEqual(eff('a', 's').effect, { type: 'run', cmd: 'sync', names: [] });
  assert.deepEqual(eff('a', 'p').effect, { type: 'scope' });
  assert.deepEqual(eff('a', 'R').effect, { type: 'rescan' });
  assert.match(eff('a', 'i').state.message, /a 已经装好了/);
  assert.match(eff('b', 'e').state.message, /b 还没装，按 i 安装/);
  assert.match(eff('data', 'c').state.message, /data 是预设/);
  assert.match(eff('a', 'c', ['a', 'b']).state.message, /一次只能配置一个插件/);
  assert.equal(eff('b', 'e').effect, undefined);
  // 项目范围：全局装的只能再装一份到本项目
  const p = { ...initialState({ scope: 'project' }), model: await model('project'), cursor: 'a' };
  assert.match(reduce(p, key('e')).state.message, /a 装在全局，按 p 切到全局再操作/);
  assert.deepEqual(reduce(p, key('i')).effect, { type: 'run', cmd: 'install', names: ['a'] });
  // 没读到列表：报错一直留着，动作键提示重新扫描
  const failed = { ...initialState(), log: { title: '准备', lines: ['✖ 未找到 claude 命令'], running: false } };
  const r = press(failed, 'j', 'i');
  assert.match(screen(r).join('\n'), /没有读到插件列表，按 R 重新扫描[\s\S]*✖ 未找到 claude 命令[\s\S]*\n 还没有读到插件列表，按 R 重新扫描\n/);
  // 执行中：只提示
  assert.match(reduce({ ...s, busy: true }, key('i')).state.message, /正在执行/);
});

test('弹窗按键：确认默认值、Esc = 否、选择、输入退格与 Esc 跳过', async () => {
  const answer = (dialog, ...keys) => {
    let r = { state: { ...initialState(), dialog } };
    for (const k of keys) r = reduce(r.state, key(k));
    return r.effect?.value;
  };
  assert.equal(answer({ kind: 'confirm', def: true }, 'return'), true);
  assert.equal(answer({ kind: 'confirm', def: false }, 'return'), false);
  assert.equal(answer({ kind: 'confirm', def: true }, 'escape'), false);
  assert.equal(answer({ kind: 'confirm', def: false }, 'y'), true);
  assert.equal(answer({ kind: 'choose', options: ['x', 'y'], index: 0 }, 'down', 'return'), 'y');
  assert.equal(answer({ kind: 'ask', text: '' }, 'a', 'b', 'backspace', 'return'), 'a');
  assert.equal(answer({ kind: 'ask', text: 'abc' }, 'escape'), '');
  // 粘贴：一次多个字符，换行去掉
  assert.equal(reduce({ ...initialState(), dialog: { kind: 'ask', text: '' } }, { ch: 'tok\r\nen' }).state.dialog.text, 'token');
});

test('TUI 提问：回车取默认值；敏感回答不进日志', async () => {
  const logged = [];
  // open：用 reduce 处理按键，模拟界面
  const typing = (keys) => (dialog) => {
    let r = { state: { ...initialState(), dialog } };
    for (const k of keys) {
      r = reduce(r.state, key(k));
      if (r.state.dialog) assert.doesNotMatch(screen(r.state).join('\n'), /sekret/);
    }
    return Promise.resolve(r.effect.value);
  };
  assert.equal(await createTuiPrompter({ open: typing(['return']) }).confirm('继续？'), true);
  assert.equal(await createTuiPrompter({ open: typing(['return']) }).confirm('确认卸载？', { default: false }), false);
  assert.equal(await createTuiPrompter({ open: typing(['return']) }).ask('地址', { default: 'http://x' }), 'http://x');
  const p = createTuiPrompter({ open: typing([...'sekret', 'return']), log: (l) => logged.push(l) });
  assert.equal(await p.ask('Token', { secret: true }), 'sekret');
  assert.doesNotMatch(logged.join('\n'), /sekret/);
});

// 假终端：stdin 可写入按键，stdout 收集输出
function fakeTerm() {
  const stdin = new PassThrough();
  const raw = [];
  Object.assign(stdin, { isTTY: true, setRawMode: (v) => raw.push(v) });
  const stdout = Object.assign(new EventEmitter(), { isTTY: true, columns: 100, rows: 30, text: '', write(s) { this.text += s; return true; } });
  const frame = () => strip(stdout.text.slice(stdout.text.lastIndexOf(TERM.home))).replace(/\r\n/g, '\n');
  return { stdin, stdout, raw, frame };
}
const until = async (fn, what) => {
  for (let i = 0; i < 400; i++) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  assert.fail(`等待超时：${what}`);
};

test('冒烟：打开 → 移动 → 勾选 → i → 确认 → 填配置 → 结果 → q 还原终端', async () => {
  const { stdin, stdout, raw, frame } = fakeTerm();
  const calls = [];
  const logged = [];
  const stateFile = newState();
  const handlers = process.listenerCount('uncaughtException');
  const done = runTui({ stdin, stdout, flags: { scope: 'user' }, log: (l) => logged.push(l), context: { claude: fakeClaude([], calls), stateFile } });
  assert.ok(stdout.text.startsWith(TERM.enter));
  await until(() => /还没装的/.test(frame()), '列表');
  assert.match(frame(), /── 准备 ─+\n✔ 准备就绪/);
  stdin.write('\x1b[B'); // ↓ 到 data
  stdin.write(' ');
  assert.match(frame(), /▸\[x\] ▲ data/);
  stdin.write('i');
  await until(() => /\(Y\/n\)/.test(frame()), '确认弹窗');
  assert.match(frame(), /── 安装 data ─+\n[\s\S]*将要执行/);
  stdin.write('y');
  await until(() => /请填写/.test(frame()), '配置弹窗');
  stdin.write('sekret\r');
  await until(() => /安装 data：完成/.test(frame()), '结果');
  const f = frame();
  assert.match(f, /╰─+╯/); // 结果卡片在记录区里
  assert.match(f, /✔ data +已选 · 已装齐/); // 列表已刷新
  assert.deepEqual(calls.map((c) => c[0]), ['install', 'install', 'configure']);
  assert.deepEqual(JSON.parse(readFileSync(stateFile, 'utf8')).marketplaces['acme-plugins'].presets, ['data']);
  assert.doesNotMatch(stdout.text + logged.join('\n'), /sekret/);
  stdin.write('?');
  assert.match(frame(), /╭─ 帮助/);
  stdin.write('\x1b'); // 单按 Esc：关掉帮助，不退出
  await until(() => !/╭─ 帮助/.test(frame()), 'Esc 关闭帮助');
  stdin.write('q');
  assert.equal(await done, 0);
  assert.ok(stdout.text.endsWith(TERM.leave));
  assert.deepEqual(raw, [true, false]);
  assert.equal(stdin.listenerCount('keypress'), 0);
  assert.equal(process.listenerCount('uncaughtException'), handlers);
});

test('插件列表更新失败：不在旧数据上执行改动，提示按 R', async () => {
  const { stdin, stdout, frame } = fakeTerm();
  const calls = [];
  const claude = { ...fakeClaude([], calls), updateMarketplace: async () => { throw new Error('offline'); } };
  const done = runTui({ stdin, stdout, flags: { scope: 'user' }, context: { claude, stateFile: newState() } });
  await until(() => /还没装的/.test(frame()), '列表');
  stdin.write('\x1b[B');
  stdin.write('i');
  await until(() => /按 R 重新扫描后再/.test(frame()), '提示');
  assert.deepEqual(calls, []);
  stdin.write('q');
  assert.equal(await done, 0);
});

test('render：详情区写全描述和预设成员，按窗口宽度折行', async () => {
  const m = await model();
  m.plugins.find((p) => p.name === 'c').description = '很长的说明'.repeat(12);
  const preset = screen({ ...initialState(), model: m, cursor: 'data' }).join('\n');
  assert.match(preset, /\ndata  已选 · 已装 1\/2\n  全套\n  包含：\n    含 base 全部  ✔ a\n  i 装齐整个预设 · r 卸掉整个预设\n/);
  const lines = screen({ ...initialState(), model: m, cursor: 'c' }, { cols: 40, rows: 30 });
  const body = lines.slice(lines.findIndex((l) => /^c$|^c  /.test(l)) + 1);
  assert.ok(body.filter((l) => l.includes('很长的说明')).length >= 3, '长描述折成多行');
  assert.ok(lines.every((l) => width(l) < 40));
});

test('卸载时回车 = 否：提示已取消，不卸载也不显示“完成”', async () => {
  const { stdin, stdout, frame } = fakeTerm();
  const calls = [];
  const done = runTui({ stdin, stdout, flags: { scope: 'user' }, context: { claude: fakeClaude([inst('a')], calls), stateFile: newState() } });
  await until(() => /还没装的/.test(frame()), '列表');
  stdin.write('\x1b[B');
  stdin.write('\x1b[B'); // ↓↓ 到 a
  stdin.write('r');
  await until(() => /\(y\/N\)/.test(frame()), '确认弹窗');
  stdin.write('\r');
  await until(() => /卸载 a：已取消，没有改动/.test(frame()), '取消提示');
  assert.doesNotMatch(frame(), /完成/);
  assert.deepEqual(calls, []);
  stdin.write('q');
  assert.equal(await done, 0);
});

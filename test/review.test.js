process.env.CCPM_LANG ??= 'zh';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSafeArgs, setMarketplace } from '../src/claude.js';
import { redact, hideCredentials } from '../src/log.js';
import { findMarketplace } from '../src/marketplace.js';
import { run as use } from '../src/commands/use.js';
import { initialState, reduce, render } from '../src/tui/view.js';
import { runTui } from '../src/tui/app.js';
import { TERM, strip } from '../src/ui.js';
import { computePlan } from '../src/plan.js';

// 最终评审发现的问题：每条一个回归测试
const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/marketplace');

test('Windows 参数检查：放行本地路径、中文目录、#ref；仍拦截 cmd 元字符', () => {
  assert.doesNotThrow(() => assertSafeArgs(['plugin', 'marketplace', 'add', 'C:\\Users\\me\\mkt']));
  assert.doesNotThrow(() => assertSafeArgs(['D:/张三/mkt', 'https://git.example.com/o/r.git#v1', '~/mkt', 'a+b']));
  for (const bad of ['a&b', 'a|b', 'a<b', 'a>b', '^', '%PATH%', '"x"', 'a!b']) assert.throws(() => assertSafeArgs([bad]), /参数含不安全字符/, bad);
});

test('URL 里的账号和 token 不进日志、不上屏幕', async () => {
  const url = 'https://oauth2:glpat-SECRET@git.example.com/o/r.git';
  assert.equal(hideCredentials(url), 'https://***@git.example.com/o/r.git');
  assert.doesNotMatch(redact(`argv=["use","${url}"] claude plugin marketplace add ${url}`), /glpat-SECRET|oauth2/);
  const lines = [];
  const steps = [];
  const claude = {
    checkCapabilities: async () => ({ ok: true, missing: [] }),
    listMarketplaces: async () => [],
    addMarketplace: async () => { throw new Error(`failed to clone ${url}`); },
  };
  const progress = { step: async (label, fn) => { steps.push(label); return fn(); } };
  const ctx = { claude, out: (l) => lines.push(l), prompter: { interactive: true }, progress, stateFile: join(mkdtempSync(join(tmpdir(), 'ccpm-r-')), 'ccpm.json') };
  const err = await use(ctx, [url]).catch((e) => e);
  assert.doesNotMatch([...steps, ...lines, err.message].join('\n'), /glpat-SECRET|oauth2/);
});

test('findMarketplace：同一个 GitHub 仓库的不同写法都能认出来；UNC 路径按路径比较', () => {
  const byUrl = [{ name: 'm', url: 'https://github.com/Acme/Plugins' }];
  for (const s of ['acme/plugins', 'https://github.com/acme/plugins.git', 'git@github.com:acme/plugins.git', 'github.com/acme/plugins']) assert.equal(findMarketplace(byUrl, s)?.name, 'm', s);
  const byRepo = [{ name: 'm', repo: 'acme/plugins' }];
  assert.equal(findMarketplace(byRepo, 'git@github.com:acme/plugins.git')?.name, 'm');
  assert.equal(findMarketplace([{ name: 'x', url: 'https://git.example.com/acme/plugins.git' }], 'acme/plugins'), undefined); // 不是 GitHub，不能当成同一个
});

test('交互界面：标题在选定 marketplace 之前不显示 null；没读到列表时按 s 只提示', () => {
  setMarketplace(null);
  const top = strip(render(initialState(), { cols: 80, rows: 12 })[0]);
  assert.doesNotMatch(top, /null/);
  const r = reduce(initialState(), { name: 's', ch: 's' });
  assert.equal(r.effect, undefined);
  assert.match(r.state.message, /R 重新扫描/);
});

test('交互界面：--marketplace 生效', async () => {
  const stdin = Object.assign(new PassThrough(), { isTTY: true, setRawMode() {} });
  const stdout = Object.assign(new EventEmitter(), { isTTY: true, columns: 100, rows: 30, text: '', write(s) { this.text += s; return true; } });
  const frame = () => strip(stdout.text.slice(stdout.text.lastIndexOf(TERM.home)));
  const claude = {
    checkCapabilities: async () => ({ ok: true, missing: [] }),
    listMarketplaces: async () => [{ name: 'first', installLocation: fixture }, { name: 'second', installLocation: fixture }],
    updateMarketplace: async () => {},
    listInstalled: async () => [],
    getUnconfigured: async () => [],
    listUserMcp: async () => [],
  };
  const done = runTui({ stdin, stdout, flags: { scope: 'user', marketplace: 'second' }, context: { claude, stateFile: join(mkdtempSync(join(tmpdir(), 'ccpm-r-')), 'ccpm.json') } });
  for (let i = 0; i < 400 && !/还没装的|请选择/.test(frame()); i++) await new Promise((r) => setTimeout(r, 5));
  assert.match(frame(), /^ccpm · second · 全局/);
  stdin.write('q');
  assert.equal(await done, 0);
});

test('预设已不存在的提示指向现在的 ccpm.json 结构', () => {
  setMarketplace('acme-plugins');
  const plan = computePlan({ installed: [], catalog: new Map(), state: { presets: ['gone'], excluded: [] }, presets: {}, unconfigured: new Map(), userMcp: [] });
  const fix = JSON.stringify(plan.warnings);
  assert.match(fix, /marketplaces\.acme-plugins\.presets/);
});

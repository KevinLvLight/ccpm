process.env.CCPM_LANG ??= 'zh';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectLang, setLang, t } from '../src/i18n/index.js';
import { EN } from '../src/i18n/en.js';
import { loadContext, gatherPlan } from '../src/context.js';
import { buildModel } from '../src/model.js';
import { initialState, render } from '../src/tui/view.js';
import { strip } from '../src/ui.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = join(root, 'test/fixtures/marketplace');
const CJK_RE = /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/;
// 这些文件本身就是中文文案；help.js 在双语帮助完成前暂时例外
const CJK_OK = (f) => /^src\/i18n\//.test(f) || f === 'src/help.js';
// 允许保留的中文（源码原样）：确认时可以回答“是”；按中英文句号截取第一句
const ALLOWED = [String.raw`/^(y|yes|是)$/i`, String.raw`/[。！？；\n]|\. /`];

function* files(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (p.endsWith('.js')) yield p;
  }
}
const sources = () => [...files(join(root, 'src')), join(root, 'bin/ccpm.js')].map((p) => [relative(root, p).split('\\').join('/'), readFileSync(p, 'utf8')]);
const KEY_RE = /\bt\('((?:[^'\\]|\\.)*)'/g;
const unescape = (k) => k.replace(/\\'/g, "'").replace(/\\n/g, '\n').replace(/\\\\/g, '\\');

test('detectLang：CCPM_LANG 优先，其次 LC_ALL / LC_MESSAGES / LANG，最后系统区域', () => {
  assert.equal(detectLang({ CCPM_LANG: 'en', LANG: 'zh_CN.UTF-8' }), 'en');
  assert.equal(detectLang({ LANG: 'zh_CN.UTF-8' }), 'zh');
  assert.equal(detectLang({}, 'zh-CN'), 'zh'); // Windows 没有 LANG、系统是中文
  assert.equal(detectLang({}, 'en-US'), 'en');
  assert.equal(detectLang({ LC_ALL: 'C' }, 'zh-CN'), 'en'); // 第一个有值的说了算
});

test('t：英文取译文，缺失退回中文；{0} 依次替换', () => {
  setLang('en');
  try {
    assert.equal(t('已安装 {0}', 'x'), 'Installed x');
    assert.equal(t('没有这条译文 {0}', 1), '没有这条译文 1');
  } finally { setLang('zh'); }
  assert.equal(t('已安装 {0}', 'x'), '已安装 x');
});

test('代码里每条 t() 文案都有英文，且占位符一致；英文表里没有多余的', () => {
  const used = new Set();
  for (const [f, s] of sources()) for (const m of s.matchAll(KEY_RE)) used.add(unescape(m[1]));
  const missing = [...used].filter((k) => !(k in EN));
  assert.deepEqual(missing, []);
  assert.deepEqual(Object.keys(EN).filter((k) => !used.has(k)), []);
  const ph = (s) => (s.match(/\{\d+\}/g) ?? []).sort().join();
  assert.deepEqual(Object.keys(EN).filter((k) => ph(k) !== ph(EN[k])), []);
  assert.deepEqual(Object.values(EN).filter((v) => CJK_RE.test(v.replace(/[、，。：（）]/g, ''))), []);
});

test('src 里除了 t() 文案和注释，没有写死的中文', () => {
  const hits = [];
  for (const [f, s] of sources()) {
    if (CJK_OK(f)) continue;
    let code = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(KEY_RE, "t(''");
    for (const a of ALLOWED) code = code.split(a).join('');
    code.split('\n').forEach((l, i) => {
      const line = l.replace(/(^|\s)\/\/.*$/, '');
      if (CJK_RE.test(line)) hits.push(`${f}:${i + 1}: ${l.trim().slice(0, 80)}`);
    });
  }
  assert.deepEqual(hits, []);
});

async function ctxEn() {
  const claude = {
    checkCapabilities: async () => ({ ok: true, missing: [] }),
    listMarketplaces: async () => [{ name: 'acme-plugins', installLocation: fixture }],
    updateMarketplace: async () => {},
    listInstalled: async () => [{ id: 'a@acme-plugins', name: 'a', marketplace: 'acme-plugins', version: '0.9.0', scope: 'user', enabled: true }],
    getUnconfigured: async () => [],
    listUserMcp: async () => [],
  };
  const lines = [];
  const ctx = await loadContext({ readOnly: true, marketplace: 'acme-plugins' }, { claude, prompter: {}, out: (l) => lines.push(strip(l)) });
  return { ctx, lines };
}

test('英文：status 完整输出没有中文', async () => {
  setLang('en');
  try {
    const { ctx, lines } = await ctxEn();
    await (await import('../src/commands/status.js')).run(ctx);
    const text = lines.join('\n');
    assert.match(text, /Next steps/);
    assert.match(text, /Ready/);
    assert.doesNotMatch(text, CJK_RE);
  } finally { setLang('zh'); }
});

test('英文：交互界面一帧没有中文，按键栏有 q quit', async () => {
  setLang('en');
  try {
    const { ctx } = await ctxEn();
    const model = buildModel(ctx, await gatherPlan(ctx));
    const frame = render({ ...initialState(), model, cursor: 'a' }, { cols: 160, rows: 30 }).map(strip).join('\n');
    assert.match(frame, /q quit/);
    assert.doesNotMatch(frame, CJK_RE);
  } finally { setLang('zh'); }
});

test('模块顶层不调用 t()（否则在设置语言之前就定死了）', () => {
  const hits = [];
  for (const [f, s] of sources()) {
    if (CJK_OK(f)) continue;
    s.split('\n').forEach((l, i) => { if (/^(export )?(const|let) \w+ = (\[|\{)?\s*t\(/.test(l) || /^ {2}t\('/.test(l)) hits.push(`${f}:${i + 1}`); });
  }
  assert.deepEqual(hits, []);
});

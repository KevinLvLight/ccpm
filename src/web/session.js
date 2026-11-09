// 网页界面的“会话”：和交互界面（tui/app.js）做同样的事——准备、按需执行命令、刷新——
// 但不受“一次一个 marketplace、项目 = 当前目录”的限制：页面上随时切换范围（全局 / 任意项目目录）
// 和来源（全部已安装 / 某个 marketplace）。输出、转圈和提问都变成状态推给浏览器。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { failLines, gatherPlan, loadContext, refreshInstalled, samePath } from '../context.js';
import { createClaude, setMarketplace } from '../claude.js';
import { loadCatalog } from '../catalog.js';
import { buildModel } from '../model.js';
import { compareVersions } from '../plan.js';
import { createProgress } from '../progress.js';
import { pluginNotes } from '../render.js';
import { loadFile } from '../state.js';
import { createTuiPrompter } from '../tui/prompter.js';
import { findOrAdd } from '../commands/use.js';
import { t } from '../i18n/index.js';
import { I, strip } from '../ui.js';

export const RUNNABLE = ['install', 'update', 'config', 'enable', 'disable', 'remove', 'sync'];
export const ALL = '*'; // “全部已安装”这个视图
const VERB = () => ({ install: t('安装'), update: t('更新'), config: t('配置'), enable: t('启用'), disable: t('停用'), remove: t('卸载'), sync: t('同步') });
const MAX_LOG = 500;
const home = homedir();
const label = (p) => (p === home ? '~' : p.startsWith(home + '/') || p.startsWith(home + '\\') ? `~${p.slice(home.length)}` : p);
const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };

// Claude Code 记下的项目目录（只读 projects 的键，不读其他内容）
function claudeProjects() {
  const files = [process.env.CLAUDE_CONFIG_DIR && join(process.env.CLAUDE_CONFIG_DIR, '.claude.json'), join(home, '.claude.json')].filter(Boolean);
  for (const f of files) {
    try { return Object.keys(JSON.parse(readFileSync(f, 'utf8')).projects ?? {}); } catch {}
  }
  return [];
}

// 目录浏览：只列出子文件夹的名字（不读文件内容），不列以 . 开头的
export function listDirs(path) {
  const dir = resolve(path || home);
  if (!isDir(dir)) return null;
  let dirs = [];
  try {
    dirs = readdirSync(dir, { withFileTypes: true })
      .filter((d) => !d.name.startsWith('.') && (d.isDirectory() || (d.isSymbolicLink() && isDir(join(dir, d.name)))))
      .map((d) => d.name).sort((a, b) => a.localeCompare(b));
  } catch {}
  const parent = resolve(dir, '..');
  return { path: dir, label: label(dir), parent: parent === dir ? null : parent, dirs };
}

export function createWebSession({ context = {}, flags = {}, log = () => {} } = {}) {
  const listeners = new Set();
  const contexts = new Map(); // `${marketplace}|${scope}|${dir}` → ctx（切换回来不用重新拉取）
  const catalogs = new Map(); // marketplace → catalog（只读本地文件）
  let pending = null; // 当前提问 { id, resolve }
  let dialogSeq = 0;
  let declined = false;
  let lists = { markets: [], listing: [] }; // 最近一次读到的 marketplace 列表和已装列表
  const state = {
    dryRun: Boolean(flags['dry-run']),
    selection: { scope: flags.scope === 'project' ? 'project' : 'user', dir: resolve(process.cwd()), market: null },
    sidebar: null, // { markets: [{ name, total, installed }], projects: [{ path, label }], allInstalled }
    model: null, // 某个 marketplace 的完整视图（和交互界面同一份数据）
    all: null, // “全部已安装”：[{ name, marketplace, version, latest, update, enabled, where, description, hasConfig, known }]
    busy: false,
    op: null, // { title, lines, spinner, running }
    dialog: null, // { id, kind, title, options?, def?, hint?, secret? }
    message: null, // { kind: 'ok'|'warn'|'fail', text }
  };
  const snapshot = () => ({
    ...state,
    selection: { ...state.selection, dirLabel: label(state.selection.dir) },
    marketplace: state.selection.market === ALL ? null : state.selection.market,
    model: state.model && { ...state.model, plugins: state.model.plugins.map((p) => ({ ...p, notes: pluginNotes(p) })) },
  });
  const emit = () => { const s = snapshot(); for (const fn of listeners) fn(s); };
  const set = (patch) => { Object.assign(state, patch); emit(); };
  const msg = (kind, text) => ({ kind, text: strip(text) }); // 提示条是纯文字

  const append = (l) => {
    log(`out: ${l}`);
    if (!state.op) return;
    state.op.lines.push(...String(l).split('\n'));
    if (state.op.lines.length > MAX_LOG) state.op.lines.splice(0, state.op.lines.length - MAX_LOG);
    emit();
  };
  const spinner = { // 转圈：只在步骤名变化时推送
    write: (s) => {
      const text = strip(String(s)).replace(/^\r?\s*\S\s/, '').trim();
      if (state.op && text && text !== state.op.spinner) { state.op.spinner = text; emit(); }
    },
  };
  const progress = createProgress({ out: append, stream: spinner, animate: true, prep: true });
  const open = (dialog) => new Promise((done) => { const id = ++dialogSeq; pending = { id, resolve: done }; set({ dialog: { id, ...dialog } }); });
  const tuiPrompter = createTuiPrompter({ log, open });
  const prompter = { ...tuiPrompter, confirm: async (...a) => { const ok = await tuiPrompter.confirm(...a); if (!ok) declined = true; return ok; } };
  const deps = { ...context, out: append, log, progress, prompter };
  const bare = context.claude ?? createClaude({ log }); // 列表类调用不需要目录

  // 一次只做一件事；出错时把原因写进记录区。keepLog=false：顺利完成后不留记录区（切换、扫描）
  const task = async (title, fn, { keepLog = true } = {}) => {
    if (state.busy) return { busy: true };
    set({ busy: true, message: null, op: { title, lines: [], spinner: '', running: true } });
    try {
      const r = await fn();
      if (!keepLog) state.op = null;
      return r;
    } catch (e) {
      log(`exception: ${e?.stack ?? e}`);
      failLines(e).forEach(append);
      state.message = msg('fail', t('{0} {1}没有完成', I.fail, title));
      return { error: e };
    } finally {
      progress.pause();
      if (pending) { pending.resolve(''); pending = null; }
      set({ busy: false, dialog: null, op: state.op && { ...state.op, running: false, spinner: '' } });
    }
  };

  // ---------- 数据 ----------
  const catalogOf = (name) => {
    if (!catalogs.has(name)) {
      const m = lists.markets.find((x) => x.name === name);
      catalogs.set(name, m?.installLocation ? loadCatalog(m.installLocation, () => {}) : new Map());
    }
    return catalogs.get(name);
  };
  const inScope = (p) => (state.selection.scope === 'user' ? p.scope === 'user'
    : p.scope === 'project' && Boolean(p.projectPath) && samePath(p.projectPath, state.selection.dir));

  async function readLists() {
    const [markets, listing] = await Promise.all([bare.listMarketplaces(), bare.listInstalled()]);
    lists = { markets, listing };
    const projects = [...new Set([...claudeProjects(), ...listing.filter((p) => p.projectPath).map((p) => p.projectPath)].map((p) => resolve(p)))]
      .filter(isDir).sort((a, b) => label(a).localeCompare(label(b)));
    const mine = listing.filter(inScope);
    state.sidebar = {
      markets: markets.map((m) => ({ name: m.name, total: catalogOf(m.name).size, installed: mine.filter((p) => p.marketplace === m.name).length })),
      projects: projects.map((p) => ({ path: p, label: label(p) })),
      allInstalled: mine.length,
    };
  }

  // “全部已安装”：当前范围里所有来源的插件；项目范围下全局装的也列出来（只读）
  function buildAll() {
    const project = state.selection.scope === 'project';
    state.all = lists.listing.filter((p) => inScope(p) || (project && p.scope === 'user')).map((p) => {
      const meta = catalogOf(p.marketplace).get(p.name);
      const latest = meta?.version;
      return {
        name: p.name, marketplace: p.marketplace, version: p.version, latest,
        update: Boolean(latest && p.version && compareVersions(latest, p.version) > 0),
        enabled: p.enabled !== false, where: inScope(p) ? 'here' : 'global',
        description: meta?.description ?? '', hasConfig: Object.keys(meta?.userConfig ?? {}).length > 0, known: Boolean(meta),
      };
    }).sort((a, b) => (a.where === b.where ? a.name.localeCompare(b.name) : a.where === 'here' ? -1 : 1));
  }

  // 某个 marketplace 在当前范围下的 ctx；同一组合只准备一次（准备时会拉取一次插件列表）
  async function ctxFor(market) {
    const { scope, dir } = state.selection;
    const key = `${market}|${scope}|${dir}`;
    // ponytail: MARKETPLACE 是全局变量，靠“一次只做一件事”保证不串；要并发操作时改成每个 ctx 自带 marketplace
    setMarketplace(market);
    let ctx = contexts.get(key);
    if (ctx) { await refreshInstalled(ctx); return ctx; }
    ctx = await loadContext({ scope, cwd: dir, marketplace: market, yes: false, dryRun: state.dryRun, readOnly: true }, deps);
    contexts.set(key, ctx);
    return ctx;
  }

  async function rebuild() {
    await readLists();
    const sel = state.selection;
    if (!sel.market || (sel.market !== ALL && !lists.markets.some((m) => m.name === sel.market))) {
      const current = loadFile(context.stateFile, { readOnly: true }).current;
      sel.market = lists.markets.some((m) => m.name === current) ? current : lists.markets.length === 1 ? lists.markets[0].name : ALL;
    }
    buildAll();
    if (sel.market === ALL) { state.model = null; return; }
    const ctx = await ctxFor(sel.market);
    progress.ready();
    state.model = buildModel(ctx, await gatherPlan(ctx));
  }

  // ---------- 操作 ----------
  const select = ({ scope, dir, market } = {}) => {
    const sel = state.selection;
    const next = {
      scope: scope === 'project' || scope === 'user' ? scope : sel.scope,
      dir: dir ? resolve(String(dir)) : sel.dir,
      market: market === ALL || lists.markets.some((m) => m.name === market) ? market : sel.market,
    };
    if (dir && !isDir(next.dir)) return Promise.resolve({ invalid: true });
    return task(t('准备'), async () => { state.selection = next; await rebuild(); }, { keepLog: false });
  };

  const run = ({ cmd, names = [], market }) => {
    const m = market ?? state.selection.market;
    if (!RUNNABLE.includes(cmd) || !m || m === ALL || !lists.markets.some((x) => x.name === m)) return Promise.resolve({ invalid: true });
    const title = [VERB()[cmd], ...(names.length ? names : cmd === 'update' ? [t('全部')] : [])].join(' ');
    return task(title, async () => {
      const ctx = await ctxFor(m);
      // 和命令行一致：插件列表没更新成功时，不在旧数据上改动环境
      if (ctx.refreshError && !state.dryRun) {
        state.message = msg('warn', t('{0} 插件列表没有更新成功（检查网络 / VPN），按 R 重新扫描后再{1}', I.warn, title));
        return { refused: true };
      }
      const mod = await import(`../commands/${cmd}.js`);
      let rc;
      declined = false;
      try {
        rc = await mod.run(ctx, names, flags);
      } finally {
        if (!declined) { await refreshInstalled(ctx, names); await rebuild(); }
      }
      state.message = declined ? msg('warn', t('{0}：已取消，没有改动', title))
        : rc ? msg('warn', t('{0} {1}：没有全部完成，详见上方记录', I.warn, title))
          : msg('ok', t('{0} {1}：{2}', I.ok, title, state.dryRun ? t('预览完成，没有改动') : t('完成')));
      return { rc };
    });
  };

  // 页面上添加 marketplace：添加并切过去，不改 ccpm.json 里命令行用的“当前 marketplace”
  const addMarketplace = (source) => task(t('添加 marketplace'), async () => {
    const target = await findOrAdd(bare, await bare.listMarketplaces(), String(source).trim(), progress);
    catalogs.delete(target.name);
    state.selection = { ...state.selection, market: target.name };
    await rebuild();
  });

  return {
    state: snapshot,
    subscribe(fn) { listeners.add(fn); fn(snapshot()); return () => listeners.delete(fn); },
    load: () => task(t('准备'), rebuild, { keepLog: false }),
    rescan: () => task(t('重新扫描'), async () => { contexts.clear(); catalogs.clear(); await rebuild(); }, { keepLog: false }),
    select,
    run,
    addMarketplace,
    // 浏览器回答当前的提问；id 对不上（旧弹窗）就忽略
    answer(id, value) {
      if (!pending || pending.id !== id) return false;
      const { resolve: done } = pending;
      pending = null;
      set({ dialog: null });
      done(value);
      return true;
    },
  };
}

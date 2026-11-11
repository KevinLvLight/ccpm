// 网页界面的“会话”：和交互界面（tui/app.js）做同样的事——准备、按需执行命令、刷新——
// 但不受“一次一个 marketplace、项目 = 当前目录”的限制：所有插件市场同时准备好，
// 页面上随时切换“插件装在哪里”（全局 / 任意项目目录）。输出、转圈和提问都变成状态推给浏览器。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { failLines, gatherPlan, loadContext, refreshInstalled, samePath } from '../context.js';
import { createClaude, setMarketplace } from '../claude.js';
import { changelogBetween, loadCatalog } from '../catalog.js';
import { parseDetails } from '../details.js';
import { buildModel } from '../model.js';
import { createProgress } from '../progress.js';
import { pluginNotes } from '../render.js';
import { createTuiPrompter } from '../tui/prompter.js';
import { findOrAdd } from '../commands/use.js';
import { t } from '../i18n/index.js';
import { I, strip } from '../ui.js';

export const RUNNABLE = ['install', 'update', 'config', 'enable', 'disable', 'remove', 'sync'];
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
    selection: { scope: flags.scope === 'project' ? 'project' : 'user', dir: resolve(process.cwd()) }, // 插件装在哪里
    markets: null, // [{ name, source, total, installed, error? }]
    projects: [], // [{ path, label, installed }]
    models: {}, // marketplace → 完整数据（和交互界面同一份：插件、预设、问题）
    busy: false,
    checking: false, // 后台正在联网检查插件市场更新
    op: null, // { title, lines, spinner, running }
    dialog: null, // { id, kind, title, options?, def?, hint?, secret? }
    message: null, // { kind: 'ok'|'warn'|'fail', text }
  };
  const snapshot = () => ({
    ...state,
    selection: { ...state.selection, dirLabel: label(state.selection.dir) },
    models: Object.fromEntries(Object.entries(state.models).map(([k, m]) => [k, { ...m, plugins: m.plugins.map((p) => ({ ...p, notes: pluginNotes(p) })) }])),
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
  const bare = context.claude ?? createClaude({ log }); // 列表类调用不需要目录

  // 打开页面要快：准备数据时不联网（插件市场更新、MCP 检查放到后台，见 checkUpdates），
  // 同一轮准备里各插件市场共用一次查询结果（已装列表、市场列表、各插件缺的配置）
  let userMcp = null; // 后台查到的“你自己配置的 MCP”；查到之前当作没有
  let failed = new Map(); // 后台更新失败的插件市场 → 原因
  let sharing = false; // 只在准备数据时共用查询结果；执行命令时每次都真实查询
  const wrappers = new Map();
  const claudeFor = (dir) => {
    if (wrappers.has(dir)) return wrappers.get(dir);
    const real = context.claude ?? createClaude({ log, cwd: dir });
    const memo = new Map();
    const share = (key, f) => (args) => {
      if (!sharing) return f(args);
      const k = `${key}|${args ?? ''}`;
      if (!memo.has(k)) memo.set(k, f(args));
      return memo.get(k);
    };
    const w = {
      ...real,
      checkCapabilities: share('cap', () => real.checkCapabilities()),
      listMarketplaces: share('mk', () => real.listMarketplaces()),
      listInstalled: share('li', () => real.listInstalled()),
      getUnconfigured: share('uc', (id) => real.getUnconfigured(id)),
      listUserMcp: async () => userMcp ?? [],
      updateMarketplace: async () => {}, // 后台统一拉取
      reset: () => memo.clear(),
    };
    wrappers.set(dir, w);
    return w;
  };
  const shared = async (fn) => {
    for (const w of wrappers.values()) w.reset();
    sharing = true;
    try { return await fn(); } finally { sharing = false; for (const w of wrappers.values()) w.reset(); }
  };

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
    const c = claudeFor(state.selection.dir);
    const [markets, listing] = await Promise.all([c.listMarketplaces(), c.listInstalled()]);
    lists = { markets, listing };
    const byDir = new Map();
    for (const p of listing) {
      if (p.scope === 'project' && p.projectPath) { const d = resolve(p.projectPath); byDir.set(d, (byDir.get(d) ?? 0) + 1); }
    }
    const projects = [...new Set([...claudeProjects().map((p) => resolve(p)), ...byDir.keys()])].filter(isDir)
      .sort((a, b) => (byDir.get(b) ?? 0) - (byDir.get(a) ?? 0) || label(a).localeCompare(label(b)));
    const mine = listing.filter(inScope);
    state.projects = projects.map((p) => ({ path: p, label: label(p), installed: byDir.get(p) ?? 0 }));
    state.markets = markets.map((m) => ({
      name: m.name, source: m.repo ?? m.url ?? (m.path ? label(m.path) : ''), total: catalogOf(m.name).size,
      installed: mine.filter((p) => p.marketplace === m.name).length,
    }));
  }

  // 某个 marketplace 在当前位置下的 ctx；同一组合只准备一次（准备时会拉取一次插件列表）
  async function ctxFor(market) {
    const { scope, dir } = state.selection;
    const key = `${market}|${scope}|${dir}`;
    // ponytail: MARKETPLACE 是全局变量，靠“一次只做一件事”保证不串；要并发操作时改成每个 ctx 自带 marketplace
    setMarketplace(market);
    let ctx = contexts.get(key);
    if (ctx) { await refreshInstalled(ctx); return ctx; }
    ctx = await loadContext({ scope, cwd: dir, marketplace: market, yes: false, dryRun: state.dryRun, readOnly: true },
      { ...context, claude: claudeFor(dir), out: append, log, progress, prompter });
    contexts.set(key, ctx);
    return ctx;
  }

  // 每个插件市场一份完整数据。某个市场出错（比如网络不通）不影响其他的
  const rebuild = () => shared(async () => {
    await readLists();
    const models = {};
    for (const m of lists.markets) {
      try {
        const ctx = await ctxFor(m.name);
        models[m.name] = buildModel(ctx, await gatherPlan(ctx));
      } catch (e) {
        log(`exception: ${e?.stack ?? e}`);
        const row = state.markets.find((x) => x.name === m.name);
        if (row) row.error = strip(String(e.message).split('\n')[0]);
      }
    }
    progress.ready();
    for (const [name, why] of failed) { const row = state.markets.find((x) => x.name === name); if (row) row.error = why; }
    state.models = models;
  });

  // ---------- 操作 ----------
  // 切换“插件装在哪里”：全局，或某个项目目录
  const select = ({ scope, dir } = {}) => {
    const next = {
      scope: scope === 'project' || scope === 'user' ? scope : state.selection.scope,
      dir: dir ? resolve(String(dir)) : state.selection.dir,
    };
    if (dir && !isDir(next.dir)) return Promise.resolve({ invalid: true });
    return task(t('准备'), async () => { state.selection = next; await rebuild(); }, { keepLog: false });
  };

  const run = ({ cmd, names = [], market }) => {
    if (!RUNNABLE.includes(cmd) || !market || !lists.markets.some((x) => x.name === market)) return Promise.resolve({ invalid: true });
    const title = [VERB()[cmd], ...(names.length ? names : cmd === 'update' ? [t('全部')] : [])].join(' ');
    return task(title, async () => {
      const ctx = await ctxFor(market);
      // 和命令行一致：插件列表没更新成功时，不在旧数据上改动环境
      if (failed.has(market) && !state.dryRun) {
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

  // 页面上添加插件市场：不改 ccpm.json 里命令行用的“当前 marketplace”
  const addMarketplace = (source) => task(t('添加 marketplace'), async () => {
    const target = await findOrAdd(bare, await bare.listMarketplaces(), String(source).trim(), progress);
    catalogs.delete(target.name);
    await rebuild();
    state.message = msg('ok', t('{0} {1}：{2}', I.ok, target.name, t('完成')));
  });

  // 后台联网：各插件市场同时拉取更新、同时查 MCP；拉完再用新数据刷新一次（页面照常可用）
  const idle = () => new Promise((done) => { const tick = () => (state.busy ? setTimeout(tick, 100) : done()); tick(); });
  async function checkUpdates() {
    if (state.checking) return;
    set({ checking: true });
    try {
      const markets = await bare.listMarketplaces();
      const [results, mcp] = await Promise.all([
        Promise.all(markets.map((m) => bare.updateMarketplace(m.name).then(() => null, (e) => [m.name, strip(String(e.brief ?? e.message).split('\n')[0])]))),
        bare.listUserMcp().catch(() => []),
      ]);
      userMcp = mcp;
      failed = new Map(results.filter(Boolean));
      for (const [name, why] of failed) log(`marketplace update failed: ${name}: ${why}`);
      catalogs.clear();
      contexts.clear(); // 插件市场内容可能变了：下次准备时重新读取
      await idle();
      await task(t('重新扫描'), rebuild, { keepLog: false });
    } catch (e) {
      log(`exception: ${e?.stack ?? e}`);
    } finally {
      set({ checking: false });
    }
  }

  // 插件在 GitHub 上的提交记录（没有 CHANGELOG 时给个去处）；不是 GitHub 上的市场就没有
  function historyUrl(market, meta) {
    const m = lists.markets.find((x) => x.name === market);
    const gh = m?.repo ?? String(m?.url ?? '').match(/^https:\/\/github\.com\/([^/]+\/[^/.]+?)(?:\.git)?\/?$/)?.[1];
    if (!gh || !/^[\w.-]+\/[\w.-]+$/.test(gh)) return null;
    const rel = meta?.dir && m.installLocation ? relative(m.installLocation, meta.dir).split('\\').join('/') : '';
    return `https://github.com/${gh}/commits/HEAD${rel && !rel.startsWith('..') ? `/${rel.split('/').map(encodeURIComponent).join('/')}` : ''}`;
  }

  // 插件详情：里面有什么（claude plugin details）和这次更新改了什么（CHANGELOG）。按版本缓存
  const infoCache = new Map();
  async function pluginInfo(market, name) {
    const meta = catalogOf(market).get(name);
    const p = state.models[market]?.plugins.find((x) => x.name === name);
    if (!meta && !p) return null;
    const installed = p && p.where !== 'none';
    const key = `${market}|${name}|${p?.version ?? ''}|${meta?.version ?? ''}`;
    if (!infoCache.has(key)) {
      infoCache.set(key, (async () => {
        let text = '';
        try {
          text = installed
            ? await claudeFor(state.selection.dir).details(`${name}@${market}`)
            : meta ? await bare.details(`${name}@${market}`, { dir: meta.dir }) : '';
        } catch (e) { log(`details failed: ${name}@${market}: ${e.message}`); }
        const changelog = meta && p?.update ? changelogBetween(meta, p.update.from, p.update.to) : [];
        return { contents: parseDetails(text), raw: parseDetails(text) ? '' : text.trim(), changelog, history: historyUrl(market, meta) };
      })().catch((e) => { infoCache.delete(key); throw e; }));
    }
    return infoCache.get(key);
  }

  return {
    pluginInfo,
    state: snapshot,
    subscribe(fn) { listeners.add(fn); fn(snapshot()); return () => listeners.delete(fn); },
    load: async () => { const r = await task(t('准备'), rebuild, { keepLog: false }); checkUpdates(); return r; },
    rescan: async () => { checkUpdates(); },
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

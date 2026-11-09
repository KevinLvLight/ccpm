// 网页界面的“会话”：和交互界面（tui/app.js）做同样的事——准备一次、按需执行命令、刷新列表——
// 只是输出、转圈和提问都变成状态，推给浏览器。浏览器通过 server.js 的接口回答提问。
import { failLines, gatherPlan, loadContext, refreshInstalled, setScope } from '../context.js';
import { MARKETPLACE, createClaude } from '../claude.js';
import { buildModel } from '../model.js';
import { createProgress } from '../progress.js';
import { pluginNotes } from '../render.js';
import { createTuiPrompter } from '../tui/prompter.js';
import { run as useCmd } from '../commands/use.js';
import { t } from '../i18n/index.js';
import { I, strip } from '../ui.js';

export const RUNNABLE = ['install', 'update', 'config', 'enable', 'disable', 'remove', 'sync'];
const VERB = () => ({ install: t('安装'), update: t('更新'), config: t('配置'), enable: t('启用'), disable: t('停用'), remove: t('卸载'), sync: t('同步') });
const MAX_LOG = 500;

export function createWebSession({ context = {}, flags = {}, log = () => {} } = {}) {
  const listeners = new Set();
  let ctx = null;
  let pending = null; // { id, resolve }
  let dialogSeq = 0;
  let declined = false;
  const state = {
    scope: flags.scope === 'project' ? 'project' : 'user',
    dryRun: Boolean(flags['dry-run']),
    marketplace: null,
    model: null,
    busy: false,
    op: null, // { title, lines, spinner, running }
    dialog: null, // { id, kind, title, options?, def?, hint?, secret? }
    message: null, // { kind: 'ok'|'warn'|'fail', text }
    picker: null, // 还没选 marketplace：{ names }
  };
  // 推给浏览器的快照：插件附上已翻译的状态说明
  const snapshot = () => ({
    ...state,
    marketplace: MARKETPLACE,
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
  // 转圈：只在步骤名变化时推送（不推每一帧）
  const spinner = {
    write: (s) => {
      const label = strip(String(s)).replace(/^\r?\s*\S\s/, '').trim();
      if (state.op && label && label !== state.op.spinner) { state.op.spinner = label; emit(); }
    },
  };
  const progress = createProgress({ out: append, stream: spinner, animate: true, prep: true });
  const open = (dialog) => new Promise((resolve) => {
    const id = ++dialogSeq;
    pending = { id, resolve };
    set({ dialog: { id, ...dialog } });
  });
  const tuiPrompter = createTuiPrompter({ log, open });
  const prompter = { ...tuiPrompter, confirm: async (...a) => { const ok = await tuiPrompter.confirm(...a); if (!ok) declined = true; return ok; } };
  const deps = { ...context, out: append, log, logFile: context.logFile, progress, prompter };
  const opts = () => ({ scope: state.scope, marketplace: flags.marketplace, yes: false, dryRun: state.dryRun, readOnly: true });
  const rebuild = async () => { state.model = buildModel(ctx, await gatherPlan(ctx)); state.scope = ctx.scope; };

  // 一次只做一件事；出错时把原因写进记录区
  const task = async (title, fn) => {
    if (state.busy) return { busy: true };
    set({ busy: true, message: null, op: { title, lines: [], spinner: '', running: true } });
    try {
      return await fn();
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

  // 还没选 marketplace：交给浏览器选择（answer 送回名字或地址）
  const pick = async () => {
    const claude = context.claude ?? ctx?.claude ?? createClaude({ log });
    const list = await claude.listMarketplaces();
    state.picker = { names: list.map((m) => m.name) };
    const source = String(await open({ kind: 'marketplace', title: t('要管理哪个 marketplace？'), options: state.picker.names })).trim();
    state.picker = null;
    if (!source) return false;
    return (await useCmd({ claude, prompter, out: append, progress, stateFile: context.stateFile }, [source])) === 0;
  };

  const load = (title = t('准备')) => task(title, async () => {
    try {
      ctx = await loadContext(opts(), deps);
    } catch (err) {
      if (err.code !== 'NO_MARKETPLACE' || !(await pick())) throw err;
      ctx = await loadContext(opts(), deps);
    }
    progress.ready();
    await rebuild();
    state.op = null; // 准备顺利完成：不留下准备过程的记录
  });

  const run = ({ cmd, names = [] }) => {
    if (!RUNNABLE.includes(cmd)) return Promise.resolve({ invalid: true });
    if (!ctx || !state.model) return Promise.resolve({ invalid: true });
    const title = [VERB()[cmd], ...(names.length ? names : cmd === 'update' ? [t('全部')] : [])].join(' ');
    // 和命令行一致：插件列表没更新成功时，不在旧数据上改动环境
    if (ctx.refreshError && !state.dryRun) {
      set({ message: msg('warn', t('{0} 插件列表没有更新成功（检查网络 / VPN），按 R 重新扫描后再{1}', I.warn, title)) });
      return Promise.resolve({ refused: true });
    }
    return task(title, async () => {
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

  return {
    state: snapshot,
    subscribe(fn) { listeners.add(fn); fn(snapshot()); return () => listeners.delete(fn); },
    load,
    run,
    rescan: () => load(t('重新扫描')),
    toggleScope: () => {
      if (!ctx) return Promise.resolve({ invalid: true });
      const to = state.scope === 'project' ? 'user' : 'project';
      return task(to === 'project' ? t('切换到本项目') : t('切换到全局'), async () => { await setScope(ctx, to); await rebuild(); });
    },
    // 浏览器回答当前的提问；id 对不上（旧弹窗）就忽略
    answer(id, value) {
      if (!pending || pending.id !== id) return false;
      const { resolve } = pending;
      pending = null;
      set({ dialog: null });
      resolve(value);
      return true;
    },
  };
}


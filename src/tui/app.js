// 全屏交互界面：读按键、画屏幕、调用现有命令。界面怎么画、按键怎么处理见 view.js。
import { t } from '../i18n/index.js';
import { emitKeypressEvents } from 'node:readline';
import { PreconditionError, failLines, gatherPlan, loadContext, refreshInstalled, setScope } from '../context.js';
import { buildModel } from '../model.js';
import { createProgress } from '../progress.js';
import { I, TERM } from '../ui.js';
import { initialState, reduce, render, runTitle } from './view.js';
import { createTuiPrompter } from './prompter.js';
import { createClaude } from '../claude.js';
import { run as useCmd } from '../commands/use.js';

const MAX_LOG = 500;

// 返回 Promise<退出码>。终端在退出、Ctrl+C、未捕获的异常、进程结束时一律还原。
export function runTui({ stdin = process.stdin, stdout = process.stdout, flags = {}, log = () => {}, logFile, context = {}, exit = (c) => process.exit(c) } = {}) {
  return new Promise((done) => {
    let state = initialState({ scope: flags.scope, dryRun: Boolean(flags['dry-run']) });
    let ctx = null;
    let pending = null; // 弹窗的回答
    let closed = false;
    let code = 0; // 最近一次读取插件列表失败时非 0

    const draw = () => {
      if (closed) return;
      const lines = render(state, { cols: stdout.columns || 80, rows: stdout.rows || 24 });
      stdout.write(TERM.home + lines.join(`${TERM.eol}\r\n`) + TERM.eol + TERM.below);
    };
    // 命令的输出都进下方的记录区（也写诊断日志）
    const append = (l) => {
      log(`out: ${l}`);
      state.log ??= { title: '', lines: [], running: false };
      state.log.lines.push(...String(l).split('\n'));
      if (state.log.lines.length > MAX_LOG) state.log.lines.splice(0, state.log.lines.length - MAX_LOG);
      draw();
    };
    // 转圈行：progress 写给“终端”的 \r 重写，改为更新记录区的最后一行
    const spinner = { write: (s) => { state = { ...state, spinner: String(s).replace(/^\r\x1b\[K/, '') }; draw(); } };
    const progress = createProgress({ out: append, stream: spinner, animate: true, prep: true });
    const openDialog = (dialog) => new Promise((resolve) => { pending = resolve; state = { ...state, dialog }; draw(); });
    const tuiPrompter = createTuiPrompter({ log, open: openDialog });
    let declined = false; // 本次操作在确认框里选了“否”
    const prompter = { ...tuiPrompter, confirm: async (...a) => { const ok = await tuiPrompter.confirm(...a); if (!ok) declined = true; return ok; } };
    const deps = { ...context, out: append, log, logFile, progress, prompter };
    const opts = () => ({ scope: state.scope, marketplace: flags.marketplace, yes: Boolean(flags.yes), dryRun: state.dryRun, readOnly: true });

    const rebuild = async () => { state = { ...state, model: buildModel(ctx, await gatherPlan(ctx)), scope: ctx.scope }; };
    const task = async (title, fn) => {
      state = { ...state, busy: true, message: '', spinner: '', log: { title, lines: [], running: true } };
      draw();
      try {
        await fn();
      } catch (e) {
        log(`exception: ${e?.stack ?? e}`);
        failLines(e).forEach(append);
        state = { ...state, message: t('{0} {1}没有完成 · R 重新扫描 · q 退出', I.fail, title) };
        return e;
      } finally {
        progress.pause();
        state = { ...state, busy: false, spinner: '', log: { ...state.log, running: false } };
        draw();
      }
    };
    const load = async (title) => {
      const e = await task(title, async () => {
        try {
          ctx = await loadContext(opts(), deps);
        } catch (err) {
          if (err.code !== 'NO_MARKETPLACE') throw err;
          const ok = await pickMarketplace();
          if (quitting) return;
          if (!ok) throw err;
          ctx = await loadContext(opts(), deps);
        }
        progress.ready(); // 第一次：打印“准备就绪”一行
        await rebuild();
      });
      if (quitting) { restore(); done(0); return; }
      code = !e ? 0 : e instanceof PreconditionError ? 2 : 1;
    };
    // 还没选 marketplace：弹框选一个已添加的，或输入地址添加；Esc = 退出
    const ENTER = t('输入地址…');
    let quitting = false;
    const pickMarketplace = async () => {
      const claude = context.claude ?? (ctx?.claude) ?? createClaude({ log });
      const list = await claude.listMarketplaces();
      const choice = await openDialog({ kind: 'choose', title: t('要管理哪个 marketplace？'), options: [...list.map((m) => m.name), ENTER], index: 0, cancel: null });
      if (choice === null) { quitting = true; return false; }
      const source = choice === ENTER
        ? (await openDialog({ kind: 'ask', title: t('marketplace 地址'), hint: t('GitHub owner/repo、git 地址或本地路径'), text: '' })).trim()
        : choice;
      if (!source) { quitting = true; return false; }
      const rc = await useCmd({ claude, prompter, out: append, progress, stateFile: context.stateFile }, [source]);
      return rc === 0;
    };
    const run = (effect) => {
      const title = runTitle(effect);
      // 和命令行一致：插件列表没更新成功时，不在旧数据上改动环境
      if (ctx?.refreshError && !state.dryRun) {
        state = { ...state, message: t('{0} 插件列表没有更新成功（检查网络 / VPN），按 R 重新扫描后再{1}', I.warn, title) };
        draw();
        return;
      }
      return task(title, async () => {
        const mod = await import(`../commands/${effect.cmd}.js`);
        let rc;
        declined = false;
        try {
          rc = await mod.run(ctx, effect.names, flags);
        } finally {
          if (!declined) {
            state = { ...state, selected: [] };
            await refreshInstalled(ctx, effect.names);
            await rebuild();
          }
        }
        state = { ...state, message: declined ? t('{0}：已取消，没有改动', title) : rc ? t('{0} {1}：没有全部完成，详见上方记录', I.warn, title) : t('{0} {1}：{2}', I.ok, title, state.dryRun ? t('预览完成，没有改动') : t('完成')) };
      });
    };

    const perform = (e) => {
      if (e.type === 'answer') {
        const r = pending;
        pending = null;
        r?.(e.value);
      } else if (e.type === 'quit') {
        const busy = state.busy;
        restore();
        if (busy) exit(130); // 操作进行中强制退出：不等 claude 子进程
        else done(code);
      } else if (e.type === 'rescan') load(t('重新扫描'));
      else if (e.type === 'scope') {
        const to = state.scope === 'project' ? 'user' : 'project';
        task(to === 'project' ? t('切换到本项目') : t('切换到全局'), async () => {
          await setScope(ctx, to);
          await rebuild();
        });
      } else if (e.type === 'run') run(e);
    };

    const onKey = (ch, key = {}) => {
      if (closed) return;
      const r = reduce(state, { name: key.name, ch, ctrl: key.ctrl, meta: key.meta });
      state = r.state;
      if (r.effect) perform(r.effect);
      draw();
    };
    const onResize = () => draw();
    function restore() {
      if (closed) return;
      closed = true;
      progress.pause();
      stdin.off('keypress', onKey);
      stdout.off('resize', onResize);
      process.off('exit', restore);
      process.off('uncaughtException', fatal);
      process.off('unhandledRejection', fatal);
      try { stdin.setRawMode?.(false); } catch {}
      stdin.pause();
      stdout.write(TERM.leave);
    }
    function fatal(e) {
      restore();
      log(`exception: ${e?.stack ?? e}`);
      process.stderr.write(`${e?.stack ?? e}\n`);
      exit(1);
    }

    process.on('exit', restore);
    process.on('uncaughtException', fatal);
    process.on('unhandledRejection', fatal);
    emitKeypressEvents(stdin, { escapeCodeTimeout: 50 }); // 不传时单按 Esc 要等下一个键才送达
    stdin.setRawMode?.(true);
    stdin.on('keypress', onKey);
    stdin.resume();
    stdout.on('resize', onResize);
    stdout.write(TERM.enter);
    draw();
    load(t('准备'));
  });
}

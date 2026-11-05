import { MARKETPLACE, toId } from '../claude.js';
import { emptyReport, summarize, tryStep } from '../flow.js';
import { I, dim } from '../ui.js';

// ccpm enable / ccpm disable：启用或停用已装的插件，不改配置也不卸载
export const toggle = (on) => async (ctx, args) => {
  const { out } = ctx;
  const cmd = on ? 'enable' : 'disable';
  const word = on ? '启用' : '停用';
  const names = args.map((a) => a.replace(`@${MARKETPLACE}`, ''));
  if (!names.length) {
    out(`用法：ccpm ${cmd} <插件...>（详见 ccpm help ${cmd}）`);
    return 1;
  }
  const mine = new Map(ctx.installed.filter((p) => p.marketplace === MARKETPLACE).map((p) => [p.name, p]));
  const report = emptyReport();
  out('');
  for (const n of names) {
    const p = mine.get(n);
    if (!p) {
      out(`  ${I.warn} ${n}  ${dim(`没有安装，先运行 ccpm install ${n}`)}`);
      report.skipped.push({ name: n });
    } else if ((p.enabled !== false) === on) {
      out(`  ${on ? I.ok : I.off} ${n}  ${dim(`已经是${word}状态`)}`);
    } else if (ctx.dryRun) {
      out(`  ${on ? I.ok : I.off} ${n}  ${dim(`将${word}（预览，未改动）`)}`);
    } else {
      await tryStep(report, n, () => ctx.progress.step(`正在${word} ${n}`, () => ctx.claude[cmd](toId(n), { scope: ctx.scope }), {
        done: `已${word} ${n}`, fail: `${word}失败 ${n}`,
      }));
    }
  }
  if (!report.ok.length && !report.skipped.length && !report.failed.length) return 0;
  return summarize(ctx, report, { okText: (n) => `${n} 个插件已${word}` }) || (report.skipped.length ? 1 : 0);
};

export const run = toggle(true);

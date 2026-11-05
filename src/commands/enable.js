import { t } from '../i18n/index.js';
import { MARKETPLACE, toId } from '../claude.js';
import { emptyReport, summarize, tryStep } from '../flow.js';
import { I, dim } from '../ui.js';

// ccpm enable / ccpm disable：启用或停用已装的插件，不改配置也不卸载
export const toggle = (on) => async (ctx, args) => {
  const { out } = ctx;
  const cmd = on ? 'enable' : 'disable';
  const word = on ? t('启用') : t('停用');
  const names = args.map((a) => a.replace(`@${MARKETPLACE}`, ''));
  if (!names.length) {
    out(t('用法：ccpm {0} <插件...>（详见 ccpm help {1}）', cmd, cmd));
    return 1;
  }
  const mine = new Map(ctx.installed.filter((p) => p.marketplace === MARKETPLACE).map((p) => [p.name, p]));
  const report = emptyReport();
  out('');
  for (const n of names) {
    const p = mine.get(n);
    if (!p) {
      out(`  ${I.warn} ${n}  ${dim(t('没有安装，先运行 ccpm install {0}', n))}`);
      report.skipped.push({ name: n });
    } else if ((p.enabled !== false) === on) {
      out(`  ${on ? I.ok : I.off} ${n}  ${dim(t('已经是{0}状态', word))}`);
    } else if (ctx.dryRun) {
      out(`  ${on ? I.ok : I.off} ${n}  ${dim(t('将{0}（预览，未改动）', word))}`);
    } else {
      await tryStep(report, n, () => ctx.progress.step(t('正在{0} {1}', word, n), () => ctx.claude[cmd](toId(n), { scope: ctx.scope }), {
        done: t('已{0} {1}', word, n), fail: t('{0}失败 {1}', word, n),
      }));
    }
  }
  if (!report.ok.length && !report.skipped.length && !report.failed.length) return 0;
  return summarize(ctx, report, { okText: (n) => t('{0} 个插件已{1}', n, word) }) || (report.skipped.length ? 1 : 0);
};

export const run = toggle(true);

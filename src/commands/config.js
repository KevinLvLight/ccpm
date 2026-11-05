import { t } from '../i18n/index.js';
import { MARKETPLACE } from '../claude.js';
import { configureKeys } from '../apply.js';
import { emptyReport, isInteractive, summarize, tryStep } from '../flow.js';
import { dim, error } from '../ui.js';

export async function run(ctx, [arg]) {
  const { out, catalog } = ctx;
  const name = arg?.replace(`@${MARKETPLACE}`, '');
  if (!name) {
    out(t('用法：ccpm config <插件名>（详见 ccpm help config）'));
    return 1;
  }
  if (!ctx.installed.some((p) => p.name === name && p.marketplace === MARKETPLACE)) {
    error(t('{0} 没有安装', name), t('先运行 ccpm install {0}', name)).forEach(out);
    return 1;
  }
  const meta = catalog.get(name);
  const keys = Object.keys(meta?.userConfig ?? {});
  if (!keys.length) {
    out(`  ${name} ${dim(t('没有需要填写的配置'))}`);
    return 0;
  }
  if (ctx.dryRun) {
    out(t('  将重新填写 {0} 的配置：{1}', name, keys.map((k) => meta.userConfig[k]?.title ?? k).join(t('、'))));
    out(`  ${dim(t('（--dry-run：只是预览，没有做任何改动）'))}`);
    return 0;
  }
  if (!isInteractive(ctx)) {
    error(t('ccpm config 需要一问一答，不能和 --yes 一起用，也不能在脚本里运行'), t('在命令行窗口里直接运行 ccpm config {0}', name)).forEach(out);
    return 1;
  }
  const report = emptyReport();
  let changed = false;
  await tryStep(report, name, async () => { changed = await configureKeys(ctx, meta, keys, { editing: true }); });
  if (!changed && !report.failed.length) {
    out(`  ${dim(t('未修改，没有做任何改动'))}`);
    return 0;
  }
  return summarize(ctx, report);
}

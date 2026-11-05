import { t } from './i18n/index.js';
import { ClaudeError } from './claude.js';
import { applyPlan } from './apply.js';
import { scoped } from './context.js';
import { planRows } from './render.js';
import { I, bold, box, dim } from './ui.js';

export { isInteractive } from './apply.js';

// 记录一个可能失败的 claude 调用（ClaudeError 归入 failed，其余异常上抛）
export async function tryStep(report, name, fn) {
  try {
    await fn();
    if (!report.ok.includes(name)) report.ok.push(name);
  } catch (e) {
    if (!(e instanceof ClaudeError)) throw e;
    report.failed.push({ name, error: e.brief });
  }
}

export const emptyReport = () => ({ ok: [], skipped: [], failed: [] });

// 结果卡片：成功绿框，只有跳过黄框，有失败红框
export function summarize(ctx, report, { okText = (n) => t('{0} 个插件已就绪', n) } = {}) {
  const { ok, skipped, failed } = report;
  const lines = [];
  if (ok.length) lines.push(`${I.ok} ${okText(ok.length)}`);
  if (skipped.length) lines.push(t('{0} {1} 个跳过：{2}', I.warn, skipped.length, skipped.map((s) => s.name).join(t('、'))));
  if (failed.length) lines.push(t('{0} {1} 个失败：{2}', I.fail, failed.length, failed.map((f) => f.name).join(t('、'))));
  if (ok.length) lines.push(t('重启 Claude Code 后生效'));
  if (failed.length) {
    lines.push(dim(t('按上面的报错处理后，重新运行这条命令')));
    if (ctx.logFile) lines.push(dim(t('详细日志：{0}', ctx.logFile)));
  }
  lines.push(dim(t('查看整体状态：{0}', scoped(ctx, 'ccpm status'))));
  ctx.out('');
  box(t('完成'), lines, failed.length ? 'red' : skipped.length ? 'yellow' : 'green').forEach((l) => ctx.out(l));
  return failed.length ? 1 : 0;
}

// 公共流程：将要执行 → dry-run 结束 → 确认 → before → applyPlan → act → 结果卡片
// remove：将卸载的行；notes：▲/⏸ 提示行（已排版）；info：一行灰色说明
export async function execute(ctx, plan, { remove = [], notes = [], info, before, act, confirm = t('继续？'), confirmDefault = true, okText } = {}) {
  const { out } = ctx;
  const rows = planRows(plan, ctx.catalog, remove);
  out('');
  if (rows.length) {
    out(`  ${bold(t('将要执行'))}`);
    rows.forEach(out);
  }
  notes.forEach(out);
  if (info) out(`  ${dim(info)}`);
  if (!rows.length) {
    out(t('  {0} 已是最新，无需操作', I.ok));
    return 0;
  }
  if (ctx.dryRun) {
    out(`  ${dim(t('（--dry-run：只是预览，没有做任何改动）'))}`);
    return 0;
  }
  out('');
  if (!(await ctx.prompter.confirm(confirm, { default: confirmDefault }))) {
    out(`  ${dim(t('已取消，没有做任何改动'))}`);
    return 0;
  }
  out('');
  await before?.();
  const report = await applyPlan(ctx, plan);
  await act?.(report);
  return summarize(ctx, report, { okText });
}

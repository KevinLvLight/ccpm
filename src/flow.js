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
export function summarize(ctx, report, { okText = (n) => `${n} 个插件已就绪` } = {}) {
  const { ok, skipped, failed } = report;
  const lines = [];
  if (ok.length) lines.push(`${I.ok} ${okText(ok.length)}`);
  if (skipped.length) lines.push(`${I.warn} ${skipped.length} 个跳过：${skipped.map((s) => s.name).join('、')}`);
  if (failed.length) lines.push(`${I.fail} ${failed.length} 个失败：${failed.map((f) => f.name).join('、')}`);
  if (ok.length) lines.push('重启 Claude Code 后生效');
  if (failed.length) {
    lines.push(dim('按上面的报错处理后，重新运行这条命令'));
    if (ctx.logFile) lines.push(dim(`详细日志：${ctx.logFile}`));
  }
  lines.push(dim(`查看整体状态：${scoped(ctx, 'ccpm status')}`));
  ctx.out('');
  box('完成', lines, failed.length ? 'red' : skipped.length ? 'yellow' : 'green').forEach((l) => ctx.out(l));
  return failed.length ? 1 : 0;
}

// 公共流程：将要执行 → dry-run 结束 → 确认 → before → applyPlan → act → 结果卡片
// remove：将卸载的行；notes：▲/⏸ 提示行（已排版）；info：一行灰色说明
export async function execute(ctx, plan, { remove = [], notes = [], info, before, act, confirm = '继续？', confirmDefault = true, okText } = {}) {
  const { out } = ctx;
  const rows = planRows(plan, ctx.catalog, remove);
  out('');
  if (rows.length) {
    out(`  ${bold('将要执行')}`);
    rows.forEach(out);
  }
  notes.forEach(out);
  if (info) out(`  ${dim(info)}`);
  if (!rows.length) {
    out(`  ${I.ok} 已是最新，无需操作`);
    return 0;
  }
  if (ctx.dryRun) {
    out(`  ${dim('（--dry-run：只是预览，没有做任何改动）')}`);
    return 0;
  }
  out('');
  if (!(await ctx.prompter.confirm(confirm, { default: confirmDefault }))) {
    out(`  ${dim('已取消，没有做任何改动')}`);
    return 0;
  }
  out('');
  await before?.();
  const report = await applyPlan(ctx, plan);
  await act?.(report);
  return summarize(ctx, report, { okText });
}

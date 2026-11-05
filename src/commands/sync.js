import { MARKETPLACE } from '../claude.js';
import { gatherPlan } from '../context.js';
import { saveState } from '../state.js';
import { execute, isInteractive, tryStep } from '../flow.js';
import { planIssues } from '../model.js';
import { issueCells } from '../render.js';
import { I, dim, table } from '../ui.js';

const short = (id) => id.replace(`@${MARKETPLACE}`, '');

// 第一次 sync：记住要用的预设（写 ccpm.json）
async function adopt(ctx, plan) {
  const { out } = ctx;
  const rec = plan.inferredPresets;
  const why = 'ccpm 会记住你选的预设，以后 ccpm sync 会自动补装预设里缺的插件。';
  ctx.state = { presets: [], excluded: [] };
  if (!Object.keys(ctx.presets ?? {}).length) { // 没有预设：只记下开始管理，不解释预设
    if (!ctx.dryRun) saveState(ctx.state, ctx.stateFile);
    return;
  }
  out('');
  out(`  ${dim(`第一次运行 ccpm sync，开始用 ccpm 管理你的 ${MARKETPLACE} 插件。`)}`);
  let chosen = rec;
  if (!rec.length) out(`  ${dim(`${why}根据你已装的插件，暂无推荐的预设（全部预设见 ccpm status）`)}`);
  else {
    const q = `${why}根据你已装的插件，推荐：${rec.join(', ')}`;
    if (!ctx.dryRun && isInteractive(ctx)) {
      const a = await ctx.prompter.choose(q, [`采用推荐（${rec.join(', ')}）`, '暂不选择预设']);
      if (a === '暂不选择预设') chosen = [];
    } else {
      out(`  ${dim(q)}`);
      out(`  ${I.ok} ${ctx.dryRun ? '将采用' : '已采用'}推荐：${rec.join(', ')}`);
    }
  }
  ctx.state = { presets: chosen, excluded: [] };
  if (!ctx.dryRun) saveState(ctx.state, ctx.stateFile);
}

export async function run(ctx, _pos, _flags) {
  // 多余依赖检查与 plan 并发；检查失败或无法确定（别的 marketplace 出问题）→ 静默跳过
  const pruning = ctx.progress.step('检查不再需要的插件', () => ctx.claude.prune({ scope: ctx.scope }).catch(() => ({ ids: [] })));
  let [plan, prune] = await Promise.all([gatherPlan(ctx), pruning]);
  if (!ctx.state && ctx.scope !== 'project') {
    await adopt(ctx, plan);
    plan = await gatherPlan(ctx);
  }

  const rows = [];
  for (const n of plan.disabled) rows.push([`${I.off} ${n}`, `已停用，ccpm 不会自动启用  ${dim(`要启用就运行 ccpm enable ${n}`)}`]);
  for (const it of planIssues(plan)) {
    const cells = issueCells(it);
    rows.push(it.cmd ? [...cells.slice(0, -1), `${cells.at(-1)}  ${dim(it.cmd)}`] : cells);
  }
  // 只清理当前 marketplace 的，逐个 uninstall（不跑全局 prune -y）
  const ids = prune.note ? [] : prune.ids.filter((id) => id.endsWith(`@${MARKETPLACE}`));
  const version = (n) => ctx.installed.find((p) => p.name === n && p.marketplace === MARKETPLACE)?.version;

  return execute(ctx, plan, {
    remove: ids.map((id) => ({ name: short(id), version: version(short(id)), note: '已没有插件需要它' })),
    notes: table(rows),
    act: async (report) => {
      if (ids.length && (await ctx.prompter.confirm('同时卸载这些不再需要的插件？', { default: false }))) {
        for (const id of ids) {
          await tryStep(report, short(id), () => ctx.progress.step(`正在卸载 ${short(id)}`, () => ctx.claude.uninstall(id, { scope: ctx.scope }), {
            done: `已卸载 ${short(id)}`, fail: `卸载失败 ${short(id)}`,
          }));
        }
      }
    },
  });
}

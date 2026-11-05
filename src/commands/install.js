import { MARKETPLACE } from '../claude.js';
import { resolveDeps, unknownPlugin } from '../plan.js';
import { expandPreset } from '../presets.js';
import { saveState } from '../state.js';
import { execute } from '../flow.js';
import { error } from '../ui.js';

const short = (n) => n.replace(`@${MARKETPLACE}`, '');

export async function run(ctx, positionals) {
  const { out, presets, catalog } = ctx;
  if (!positionals.length) {
    out('用法：ccpm install <插件或预设>...（例如 ccpm install dev-base；详见 ccpm help install）');
    return 1;
  }
  const state = { presets: [...(ctx.state?.presets ?? [])], excluded: [...(ctx.state?.excluded ?? [])] };
  const wanted = [];
  const warnings = [];
  let touched = false;
  for (const raw of positionals.map(short)) {
    if (Object.hasOwn(presets, raw) && ctx.scope === 'project') {
      error('预设只能装到全局，去掉 --scope project', `运行 ccpm install ${raw} --scope user`).forEach(out);
      return 1;
    }
    if (Object.hasOwn(presets, raw)) {
      wanted.push(...expandPreset(presets, raw));
      if (!state.presets.includes(raw)) state.presets.push(raw);
      touched = true;
    } else if (catalog.has(raw)) {
      wanted.push(raw);
    } else {
      error(`没有叫 ${raw} 的插件或预设`, '检查拼写；全部插件见 ccpm list，预设见 ccpm status').forEach(out);
      return 1;
    }
  }
  const before = state.excluded.length;
  state.excluded = state.excluded.filter((n) => !wanted.includes(n));
  touched ||= state.excluded.length !== before;

  const { order, unknown } = resolveDeps(wanted, catalog);
  unknown.forEach((n) => warnings.push(unknownPlugin(n)));
  const have = new Set(ctx.installed.filter((p) => p.marketplace === MARKETPLACE).map((p) => p.name));
  const skip = order.filter((n) => have.has(n));
  const plan = { install: order.filter((n) => !have.has(n)), update: [], configure: [], warnings, duplicateMcp: [], orphans: [] };
  const save = () => touched && !ctx.dryRun && saveState(state, ctx.stateFile);
  if (!plan.install.length) save(); // 无需安装也要记录预设/取消排除
  return execute(ctx, plan, {
    info: skip.length ? `已装好，跳过：${skip.join('、')}` : undefined,
    before: save,
  });
}

import { gatherPlan, scoped } from '../context.js';
import { buildModel } from '../model.js';
import { counterCells, issueCells, memberText, pluginCells, presetCells } from '../render.js';
import { I, bold, dim, hints, table } from '../ui.js';

export async function run(ctx) {
  const { out } = ctx;
  const plan = await gatherPlan(ctx);
  const m = buildModel(ctx, plan);
  const user = m.scope !== 'project';
  const next = m.next;
  const of = (where) => m.plugins.filter((p) => p.where === where);

  out('');
  out(`  ${counterCells(m).join('   ')}`);
  if (!user) out(`  ${dim('预设  只对全局生效')}`);

  out('');
  out(`  ${bold(user ? '已安装' : '本项目安装的')}`);
  if (of('here').length) table(of('here').map(pluginCells)).forEach(out);
  else out(`  ${dim(user ? '还没有安装任何 ai-efficiency 插件' : '这个项目里还没有单独安装插件')}`);
  if (of('global').length) {
    out('');
    out(`  ${bold('全局安装的')}  ${dim('本项目也能用')}`);
    table(of('global').map((p) => [dim(`${I.ok} ${p.name}`), dim(p.version ?? '')])).forEach(out);
  }
  if (of('none').length) {
    out('');
    out(`  ${bold('还没装的')}  ${dim('可选，按需安装')}`);
    out(`  ${I.none} ${dim(of('none').map((p) => p.name).join('、'))}`);
    hints(user
      ? [['ccpm install <插件名>', '安装，依赖会一起装']]
      : [['ccpm install --scope project <插件名>', '只装到本项目'], ['ccpm install --scope user <插件名>', '装到全局，所有项目都能用']]).forEach(out);
  }
  if (m.presets.length) {
    out('');
    out(`  ${bold('预设')}  ${dim(`一组常用插件 · 共 ${m.counters.presets} 个，已选 ${m.counters.presetsChosen} 个`)}`);
    table(m.presets.flatMap((p) => [presetCells(p), [`    ${p.members.map(memberText).join('  ')}`]])).forEach(out);
    if (m.presets.some((p) => p.got < p.want)) hints([['ccpm install <预设名>', '装齐整个预设，并记为你选的预设'], ['ccpm remove <预设名>', '卸掉整个预设']]).forEach(out);
  }
  if (m.issues.length) {
    out('');
    out(`  ${bold('需要注意')}`);
    table(m.issues.map(issueCells)).forEach(out);
  }
  out('');
  if (!next.length) {
    out(`  ${I.ok} 一切正常，无需操作`);
    return 0;
  }
  out(`  ${bold('下一步')}`);
  hints(next.map(({ cmd, why }) => [scoped(ctx, cmd), why])).forEach(out);
  return 0;
}

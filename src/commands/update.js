import { t } from '../i18n/index.js';
import { MARKETPLACE } from '../claude.js';
import { gatherPlan } from '../context.js';
import { execute } from '../flow.js';
import { I, dim, error } from '../ui.js';

export async function run(ctx, positionals) {
  const { out } = ctx;
  const names = positionals.map((n) => n.replace(`@${MARKETPLACE}`, ''));
  const all = (await gatherPlan(ctx)).update;
  const update = names.length ? all.filter((u) => names.includes(u.name)) : all;
  let code = 0;
  for (const n of names) {
    if (update.some((u) => u.name === n)) continue;
    if (ctx.installed.some((p) => p.name === n && p.marketplace === MARKETPLACE)) out(`  ${I.ok} ${n} ${dim(t('已是最新'))}`);
    else {
      error(t('{0} 没有安装', n), t('运行 ccpm install {0}', n)).forEach(out);
      code = 1;
    }
  }
  if (!update.length) {
    if (!names.length) out(t('  {0} 已是最新，无需操作', I.ok));
    return code;
  }
  const plan = { install: [], update, configure: [], warnings: [], duplicateMcp: [], orphans: [] };
  return (await execute(ctx, plan)) || code;
}

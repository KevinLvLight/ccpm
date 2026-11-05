import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadCatalog, checkManifest } from '../catalog.js';
import { loadPresets, validatePresets } from '../presets.js';
import { I, bold, dim, error } from '../ui.js';

// ccpm check [目录]：给 marketplace 作者用，校验插件写法和 presets.json（不调用 claude）
export async function run(ctx, [dir = process.cwd()] = []) {
  const { out } = ctx;
  const root = resolve(dir);
  if (!existsSync(join(root, '.claude-plugin', 'marketplace.json'))) {
    error(`${root} 不是 marketplace 目录`, '目录下要有 .claude-plugin/marketplace.json').forEach(out);
    return 1;
  }
  const catalog = loadCatalog(root, () => {});
  const problems = [];
  for (const [name, meta] of catalog) for (const e of checkManifest(meta.raw)) problems.push(`${name}: ${e}`);
  const { presets, warning } = loadPresets(process.env.CCPM_PRESETS_FILE || join(root, 'presets.json'));
  if (warning) problems.push(`presets.json: ${warning}`);
  for (const e of validatePresets(presets, new Set(catalog.keys()))) problems.push(`presets.json: ${e}`);
  if (problems.length) {
    problems.forEach((p) => out(`${I.fail} ${p}`));
    out(dim(`共 ${problems.length} 个问题`));
    return 1;
  }
  const n = Object.keys(presets).length;
  out(`${I.ok} ${bold('校验通过')} ${dim(`· ${catalog.size} 个插件${n ? ` · ${n} 个预设` : ''}`)}`);
  return 0;
}

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog, checkManifest } from '../src/catalog.js';
import { loadPresets, validatePresets } from '../src/presets.js';

const repo = join(dirname(fileURLToPath(import.meta.url)), '../..');
const catalog = loadCatalog(process.env.CCPM_MARKETPLACE_DIR || repo);
const errors = [];
for (const [name, meta] of catalog) for (const e of checkManifest(meta.raw)) errors.push(`${name}: ${e}`);

const { presets, warning } = loadPresets(process.env.CCPM_PRESETS_FILE || join(repo, 'presets.json'));
if (warning) errors.push(warning);
errors.push(...validatePresets(presets, new Set(catalog.keys())));

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('校验通过');

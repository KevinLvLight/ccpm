process.env.CCPM_LANG ??= 'zh'; // 断言按中文文案写
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadCatalog, checkManifest, readChangelogEntry } from '../src/catalog.js';
import { setMarketplace as useMarketplace } from '../src/claude.js';
useMarketplace('acme-plugins'); // 单元测试不走 loadContext，直接指定

const here = dirname(fileURLToPath(import.meta.url));
const fx = join(here, 'fixtures/marketplace');
const warn = console.warn;
console.warn = () => {};
const cat = loadCatalog(fx);
console.warn = warn;

test('loadCatalog 读取依赖、userConfig、mcpServers，缺 plugin.json 的跳过', () => {
  assert.deepEqual([...cat.keys()], ['a', 'b', 'c', 'd']);
  assert.equal(cat.get('d').name, 'd'); // plugin.json name 'other' 不同，以条目名为准
  assert.deepEqual(cat.get('a').dependencies, ['b']);
  assert.equal(cat.get('a').userConfig.token.sensitive, true);
  assert.equal(cat.get('a').raw.version, '1.1.0');
  assert.deepEqual(cat.get('b').mcpServers, ['svc']);
  const c = cat.get('c');
  assert.deepEqual([c.dependencies, c.userConfig, c.mcpServers], [[], {}, []]);
});

test('loadCatalog 支持对象形式的 source.path，并跳过未知 source', () => {
  const root = mkdtempSync(join(tmpdir(), 'ccpm-catalog-'));
  mkdirSync(join(root, '.claude-plugin'));
  mkdirSync(join(root, 'plugins', 'object-source', '.claude-plugin'), { recursive: true });
  writeFileSync(join(root, '.claude-plugin', 'marketplace.json'), JSON.stringify({ plugins: [
    { name: 'object-source', source: { type: 'directory', path: './plugins/object-source' } },
    { name: 'invalid-source', source: { type: 'github', repo: 'owner/repo' } },
  ] }));
  writeFileSync(join(root, 'plugins', 'object-source', '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'object-source', version: '1.0.0' }));
  const warnings = [];
  const objectCatalog = loadCatalog(root, (m) => warnings.push(m));
  assert.deepEqual([...objectCatalog.keys()], ['object-source']);
  assert.match(warnings.join('\n'), /invalid-source.*source 不是有效路径/);
});

test('readChangelogEntry', () => {
  assert.equal(readChangelogEntry(cat.get('a'), '1.1.0'), '- new thing');
  assert.equal(readChangelogEntry(cat.get('a'), '1.0.0'), '- first');
  assert.equal(readChangelogEntry(cat.get('a'), '9.9.9'), null);
  assert.equal(readChangelogEntry(cat.get('b'), '1.0.0'), null);
});

test('checkManifest', () => {
  assert.match(checkManifest({ dependencies: [{ name: 'x' }] })[0], /dependencies 第 1 项不是字符串/);
  assert.match(checkManifest({ userConfig: { flag: { type: 'boolean' } } })[0], /userConfig\.flag 的 type 为 boolean，ccpm 不支持/);
  assert.match(checkManifest({ userConfig: { x: { choices: [] } } })[0], /userConfig\.x 含未知属性 choices/);
  assert.deepEqual(checkManifest({ userConfig: { d: { type: 'directory' } } }), []);
});

test('示例 marketplace 的插件通过 checkManifest', () => {
  const real = cat;
  assert.ok(real.size > 0);
  for (const [name, m] of real) assert.deepEqual(checkManifest(m.raw), [], name);
});

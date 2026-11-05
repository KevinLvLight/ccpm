import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// 仓库里不能出现来源项目的内部信息（地址、插件名、注册表）
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['.git', 'node_modules', 'CHANGELOG.md', 'clean.test.js']);
const FORBIDDEN = /hillstone|ai-efficiency|\baie\b|nexus|10\.10\.|gitlab-sz|dsgp|sonar/i;

function* files(dir) {
  for (const f of readdirSync(dir)) {
    if (SKIP.has(f)) continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) yield* files(p);
    else yield p;
  }
}

test('仓库不含内部信息', () => {
  const hits = [];
  for (const f of files(root)) {
    const lines = readFileSync(f, 'utf8').split('\n');
    lines.forEach((l, i) => { if (FORBIDDEN.test(l)) hits.push(`${relative(root, f)}:${i + 1}: ${l.trim().slice(0, 100)}`); });
  }
  assert.deepEqual(hits, []);
});

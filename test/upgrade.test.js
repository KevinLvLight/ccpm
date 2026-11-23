process.env.CCPM_LANG ??= 'zh';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/commands/upgrade.js';

const ctx = (responses, extra = {}) => {
  const calls = [];
  const lines = [];
  const sys = { npm: async (args) => { calls.push(args); return responses.shift() ?? { code: 0, stdout: '', stderr: '' }; } };
  return {
    calls, lines,
    value: { out: (line) => lines.push(line), log: () => {}, prompter: { confirm: async () => true }, progress: { step: async (_a, fn) => fn() }, pkg: { name: '@kikilight/ccpm', version: '0.2.1' }, sys, ...extra },
  };
};

test('upgrade：已经是最新版本时不安装', async () => {
  const r = ctx([{ code: 0, stdout: '0.2.1\n', stderr: '' }]);
  assert.equal(await run(r.value), 0);
  assert.deepEqual(r.calls, [['view', '@kikilight/ccpm', 'version', '--fetch-timeout=15000', '--fetch-retries=0']]);
  assert.match(r.lines.join('\n'), /已是最新版本/);
});

test('upgrade：确认后安装 npm 包的新版本', async () => {
  const r = ctx([{ code: 0, stdout: '0.2.2\n', stderr: '' }, { code: 0, stdout: '', stderr: '' }]);
  assert.equal(await run(r.value), 0);
  assert.deepEqual(r.calls.at(-1), ['install', '-g', '@kikilight/ccpm@0.2.2']);
  assert.match(r.lines.join('\n'), /0\.2\.2/);
});

test('upgrade：预览和取消都不安装', async () => {
  const dry = ctx([{ code: 0, stdout: '0.2.2\n', stderr: '' }], { dryRun: true });
  assert.equal(await run(dry.value), 0);
  assert.equal(dry.calls.length, 1);
  const cancelled = ctx([{ code: 0, stdout: '0.2.2\n', stderr: '' }], { prompter: { confirm: async () => false } });
  assert.equal(await run(cancelled.value), 0);
  assert.equal(cancelled.calls.length, 1);
});

test('upgrade：查询或安装失败时返回 1', async () => {
  const query = ctx([{ code: 1, stdout: '', stderr: 'offline' }]);
  assert.equal(await run(query.value), 1);
  const install = ctx([{ code: 0, stdout: '0.2.2\n', stderr: '' }, { code: 1, stdout: '', stderr: 'denied' }]);
  assert.equal(await run(install.value), 1);
  assert.match(install.lines.join('\n'), /更新失败/);
});

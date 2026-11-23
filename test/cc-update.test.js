process.env.CCPM_LANG ??= 'zh';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/commands/cc-update.js';

const versions = ['1.0.0', '1.1.0', '1.0.0'];
const setup = ({ versionResults = versions, npmResults = [] } = {}) => {
  const lines = [], calls = [];
  const sys = {
    npm: async (args) => {
      calls.push(args);
      if (args[0] === 'root') return { code: 0, stdout: '/global/node_modules\n', stderr: '' };
      if (args[0] === 'view') return { code: 0, stdout: JSON.stringify({ versions: ['1.0.0', '1.1.0'], 'dist-tags': { latest: '1.1.0' } }), stderr: '' };
      return npmResults.shift() ?? { code: 0, stdout: '', stderr: '' };
    },
    packageVersion: () => '1.0.0',
    claudeVersion: async () => {
      const next = versionResults.shift() ?? '1.0.0';
      return typeof next === 'string' ? { ok: true, version: next } : next;
    },
  };
  return { calls, lines, ctx: { out: (line) => lines.push(line), log: () => {}, prompter: { confirm: async () => true }, progress: { step: async (_a, fn) => fn() }, sys } };
};

test('cc-update：安装候选版本并验证', async () => {
  const r = setup();
  assert.equal(await run(r.ctx), 0);
  assert.deepEqual(r.calls.at(-1), ['install', '-g', '@anthropic-ai/claude-code@1.1.0']);
  assert.match(r.lines.join('\n'), /更新到 1\.1\.0/);
});

test('cc-update：候选无法启动时回退到原版本', async () => {
  const r = setup({ versionResults: ['1.0.0', { ok: false, error: 'bad binary' }, '1.0.0'] });
  assert.equal(await run(r.ctx), 1);
  assert.deepEqual(r.calls.filter((x) => x[0] === 'install').map((x) => x.at(-1)), ['@anthropic-ai/claude-code@1.1.0', '@anthropic-ai/claude-code@1.0.0']);
  assert.match(r.lines.join('\n'), /装回原来的 1\.0\.0/);
});

test('cc-update：预览、版本和 tries 参数均不触发安装', async () => {
  const dry = setup();
  assert.equal(await run({ ...dry.ctx, dryRun: true }), 0);
  assert.equal(dry.calls.some((x) => x[0] === 'install'), false);
  const invalid = setup();
  assert.equal(await run(invalid.ctx, [], { tries: 'zero' }), 1);
  assert.equal(invalid.calls.length, 0);
  const target = setup();
  assert.equal(await run(target.ctx, ['bad']), 1);
  assert.equal(target.calls.length, 0);
});

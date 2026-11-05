import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMMAND_NAMES, helpText } from '../src/help.js';

const bin = fileURLToPath(new URL('../bin/ccpm.js', import.meta.url));
// PATH 置空：任何 claude 调用都会失败（退出码 2），从而证明帮助不调用 claude
const ccpm = (...args) => spawnSync(process.execPath, [bin, ...args], {
  encoding: 'utf8', env: { ...process.env, PATH: '/nonexistent', CLAUDE_CONFIG_DIR: mkdtempSync(join(tmpdir(), 'ccpm-cfg-')) },
});

test('每个命令都有完整的帮助页', () => {
  for (const c of ['ui', 'status', 'install', 'config', 'enable', 'disable', 'remove', 'update', 'sync', 'log', 'help']) {
    assert.ok(COMMAND_NAMES.includes(c), c);
    const t = helpText(c);
    for (const sec of ['用途', '用法', '参数', '选项', '示例', '会做什么', '不会做什么', '常见问题']) assert.match(t, new RegExp(`\n${sec}:`), `${c} ${sec}`);
  }
  for (const t of ['concepts', 'troubleshooting']) assert.ok(helpText(t));
});

test('help 入口不调用 claude；未知主题退出 1', () => {
  for (const args of [['help'], ['-h'], ['--help'], ['help', 'install'], ['install', '--help'], ['help', 'troubleshooting']]) {
    const r = ccpm(...args);
    assert.equal(r.status, 0, args.join(' '));
  }
  assert.match(ccpm('install', '--help').stdout, /^ccpm install — /);
  assert.match(ccpm('help').stdout, /一键安装 \/ 配置 \/ 更新 acme-plugins 插件/);
  assert.equal(ccpm('help', 'xyz').status, 1);
});


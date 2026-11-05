import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLogger, redact } from '../src/log.js';
import { createClaude } from '../src/claude.js';

const tmp = () => mkdtempSync(join(tmpdir(), 'ccpm-log-'));

test('configure 只记 stdin 键名；输出里的 token 值被脱敏', async () => {
  const logger = createLogger({ dir: tmp() });
  const run = async () => ({ code: 0, stdout: '{"SONARQUBE_TOKEN": "abc", "url": "http://x"} api_key=zzz', stderr: '' });
  const claude = createClaude({ run, log: logger.write });
  await claude.configure('a@ai-efficiency', { url: 'http://u', token: 'sekret-value' });
  const text = readFileSync(logger.file, 'utf8');
  assert.match(text, /stdin keys: url, token/);
  assert.doesNotMatch(text, /sekret-value|"abc"|zzz/);
  assert.match(text, /"SONARQUBE_TOKEN": "REDACTED"/);
  assert.match(text, /"url": "http:\/\/x"/);
  assert.match(text, /api_key=REDACTED/);
});

test('redact 两种写法', () => {
  assert.equal(redact('{"authToken":"a\\"b","x":"1"}'), '{"authToken":"REDACTED","x":"1"}');
  assert.equal(redact('password=hunter2 user=bob'), 'password=REDACTED user=bob');
});

test('日志失败被吞掉；删除 14 天前的文件', () => {
  const f = join(tmp(), 'file');
  writeFileSync(f, '');
  const bad = createLogger({ dir: join(f, 'sub') }); // 父路径是文件 → mkdir/append 都失败
  assert.doesNotThrow(() => bad.write('x'));
  const dir = tmp();
  const now = new Date('2026-11-20T12:00:00Z');
  writeFileSync(join(dir, 'ccpm-2026-11-01.log'), '');
  writeFileSync(join(dir, 'ccpm-2026-11-10.log'), '');
  createLogger({ dir, now });
  assert.equal(existsSync(join(dir, 'ccpm-2026-11-01.log')), false);
  assert.equal(existsSync(join(dir, 'ccpm-2026-11-10.log')), true);
});

import { appendFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { strip } from './ui.js';

const KEEP_DAYS = 14;
const SENSITIVE = 'token|password|secret|key|auth';
const JSONISH = new RegExp(`("[^"]*(?:${SENSITIVE})[^"]*"\\s*:\\s*)"(?:[^"\\\\]|\\\\.)*"`, 'gi');
const KV = new RegExp(`\\b([\\w.-]*(?:${SENSITIVE})[\\w.-]*)=([^\\s&"',]+)`, 'gi');

export const logDir = () => join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'ccpm', 'logs');
const day = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; // 本地日期
export const logFile = (dir = logDir(), now = new Date()) => join(dir, `ccpm-${day(now)}.log`);

// URL 里的 user:token@ 部分换成 ***@（git 地址常把 token 写在这里）
export const hideCredentials = (s) => String(s).replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^/\s@]+@/gi, '$1***@');
export const redact = (s) => hideCredentials(s.replace(JSONISH, '$1"REDACTED"').replace(KV, '$1=REDACTED'));

// 日志失败绝不影响命令本身：所有 fs 错误吞掉
export function createLogger({ dir = logDir(), now = new Date(), mirror } = {}) {
  const file = logFile(dir, now);
  try {
    mkdirSync(dir, { recursive: true });
    const cutoff = `ccpm-${day(new Date(now - KEEP_DAYS * 86400e3))}.log`;
    for (const f of readdirSync(dir)) if (/^ccpm-\d{4}-\d\d-\d\d\.log$/.test(f) && f < cutoff) unlinkSync(join(dir, f));
  } catch {}
  return {
    file,
    dir,
    write(line) {
      const l = redact(strip(`${new Date().toISOString()} ${line}`)); // 日志只要纯文本
      try {
        appendFileSync(file, l + '\n');
      } catch {}
      mirror?.(l);
    },
  };
}

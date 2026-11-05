import { EN } from './en.js';

// 界面语言：CCPM_LANG > LC_ALL > LC_MESSAGES > LANG > 系统区域设置；zh 开头用中文，其他用英文
export const CMD = 'ccpm';
export function detectLang(env = process.env, locale = Intl.DateTimeFormat().resolvedOptions().locale) {
  const v = [env.CCPM_LANG, env.LC_ALL, env.LC_MESSAGES, env.LANG].find((x) => x) ?? locale ?? '';
  return /^zh/i.test(v) ? 'zh' : 'en';
}
let current = null; // 第一次用到时再判断（测试会先设置 CCPM_LANG）
export const lang = () => (current ??= detectLang());
export function setLang(l) { current = l; }

// 文案以中文原文为 key；英文从 EN 取，缺失时退回中文。{0} {1} 依次替换为参数
export function t(text, ...args) {
  const s = lang() === 'en' ? EN[text] ?? text : text;
  return args.length ? s.replace(/\{(\d+)\}/g, (m, i) => (i < args.length ? String(args[i]) : m)) : s;
}

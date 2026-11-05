// 帮助：按界面语言选用 src/i18n/help.zh.js 或 help.en.js（纯字符串）
import { lang } from './i18n/index.js';
import * as zh from './i18n/help.zh.js';
import * as en from './i18n/help.en.js';

const pick = () => (lang() === 'en' ? en : zh);
const page = (h, o) => [
  `ccpm ${o.name} — ${o.summary}`,
  ...['purpose', 'usage', 'args', 'options', 'examples', 'does', 'doesNot', 'faq'].map((k, i) => `\n${h.LABELS[i]}:\n${o[k]}`),
].join('\n');

export const COMMAND_NAMES = Object.keys(zh.COMMANDS);

// 返回帮助文本；未知主题返回 null
export function helpText(topic, h = pick()) {
  if (!topic) return h.OVERVIEW;
  if (Object.hasOwn(h.COMMANDS, topic)) return page(h, h.COMMANDS[topic]);
  return { concepts: h.CONCEPTS, troubleshooting: h.TROUBLE }[topic] ?? null;
}

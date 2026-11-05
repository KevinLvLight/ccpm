import { t } from './i18n/index.js';
import { createInterface } from 'node:readline';
import { I, bold, dim } from './ui.js';

export const SECRET_HINT = () => t('输入内容已隐藏');
const answer = () => `  ${I.cmd} `;
const mask = (s) => s.replace(/[^\r\n]/gu, '•');

// onPrompt：提问前调用（停掉转圈）；log：诊断日志，敏感答案不记录
export function createPrompter({ input, output, interactive, onPrompt = () => {}, log = () => {} }) {
  // 每个问题一个 readline，答完即关，避免挂住 stdin 导致进程不退出
  const read = (q, secret) =>
    new Promise((resolve, reject) => {
      onPrompt();
      const r = createInterface({ input, output, terminal: Boolean(output.isTTY) });
      const orig = r._writeToOutput?.bind(r);
      // 敏感输入：提示照常，键入的每个字符显示为 •（readline 重绘时会整行重写 提示+内容）
      if (secret && orig) r._writeToOutput = (s) => orig(s.startsWith(q) ? q + mask(s.slice(q.length)) : mask(s));
      const onClose = () => reject(new Error(t('输入已结束')));
      r.once('close', onClose);
      const done = (a) => { r.off('close', onClose); r.close(); resolve(a); };
      r.question(q, done);
    });
  // 说明行直接写出，readline 只负责最后一行短提示（重绘不出错）
  const say = (text) => { onPrompt(); output.write(text + '\n'); log(`ask: ${text}`); };
  const need = () => { if (!interactive) throw new Error('NON_INTERACTIVE'); };

  return {
    interactive: Boolean(interactive),
    // ? 标题 说明，然后 “  › ” 输入
    async ask(title, { secret = false, default: def, hint } = {}) {
      if (!interactive) {
        if (def !== undefined) return String(def);
        throw new Error('NON_INTERACTIVE');
      }
      const tips = [secret && SECRET_HINT(), hint, def !== undefined && t('直接回车使用 {0}', def)].filter(Boolean).join(' · ');
      say(`${I.ask} ${bold(title)}${tips ? ` ${dim(tips)}` : ''}`);
      const a = await read(answer(), secret);
      log(secret ? 'answer: (sensitive, not logged)' : `answer: ${a}`);
      return a.trim() === '' && def !== undefined ? String(def) : a;
    },
    // 默认 Y；卸载类操作传 default: false
    async confirm(q, { default: def = true } = {}) {
      if (!interactive) return true;
      const a = (await read(`${I.ask} ${bold(q)} ${dim(def ? '(Y/n)' : '(y/N)')} `, false)).trim();
      log(`confirm: ${q} → ${a || '(enter)'}`);
      return a === '' ? def : /^(y|yes|是)$/i.test(a);
    },
    async choose(q, options) {
      need();
      say(`${I.ask} ${bold(q)}\n${options.map((o, i) => `  ${i + 1}) ${o}`).join('\n')}`);
      for (;;) {
        const a = (await read(`${answer()}${dim(t('选择 1-{0}：', options.length))}`, false)).trim();
        const i = Number(a);
        log(`choose: ${a}`);
        if (Number.isInteger(i) && i >= 1 && i <= options.length) return options[i - 1];
        if (options.includes(a)) return a;
      }
    },
  };
}

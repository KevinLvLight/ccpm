import { t } from '../i18n/index.js';
// 交互界面里的提问：与 prompt.js 同样的 ask / confirm / choose，问题以弹窗显示。
// open(dialog) → Promise<答案>：由界面显示弹窗，按键交给 view.js 的 reduce 处理。
export function createTuiPrompter({ open, log = () => {} }) {
  return {
    interactive: true,
    async ask(title, { secret = false, default: def, hint } = {}) {
      log(`ask: ${title}`);
      const a = await open({ kind: 'ask', title, secret, def, hint, text: '' });
      log(secret ? 'answer: (sensitive, not logged)' : `answer: ${a}`);
      return a.trim() === '' && def !== undefined ? String(def) : a;
    },
    // 默认 Y；卸载类操作传 default: false（回车取默认，Esc = 否）
    async confirm(q, { default: def = true } = {}) {
      const a = await open({ kind: 'confirm', title: q, def });
      log(`confirm: ${q} → ${a ? 'yes' : 'no'}`);
      return a;
    },
    async choose(q, options) {
      log(`ask: ${q}`);
      const a = await open({ kind: 'choose', title: q, options, index: 0 });
      log(`choose: ${a}`);
      return a;
    },
  };
}

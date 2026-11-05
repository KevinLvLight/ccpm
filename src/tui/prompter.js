// 交互界面里的提问：与 prompt.js 同样的 ask / confirm / choose，问题以弹窗显示。
// open(dialog) → Promise<答案>：由界面显示弹窗，按键交给 view.js 的 reduce 处理。
export function createTuiPrompter({ open, log = () => {} }) {
  return {
    interactive: true,
    async ask(title, { secret = false, default: def, hint } = {}) {
      log(`提问: ${title}`);
      const a = await open({ kind: 'ask', title, secret, def, hint, text: '' });
      log(secret ? '回答: （敏感，未记录）' : `回答: ${a}`);
      return a.trim() === '' && def !== undefined ? String(def) : a;
    },
    // 默认 Y；卸载类操作传 default: false（回车取默认，Esc = 否）
    async confirm(q, { default: def = true } = {}) {
      const a = await open({ kind: 'confirm', title: q, def });
      log(`确认: ${q} → ${a ? '是' : '否'}`);
      return a;
    },
    async choose(q, options) {
      log(`提问: ${q}`);
      const a = await open({ kind: 'choose', title: q, options, index: 0 });
      log(`选择: ${a}`);
      return a;
    },
  };
}

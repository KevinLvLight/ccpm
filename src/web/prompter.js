// Web 对话框适配为与命令行一致的提问接口；敏感回答绝不写入日志。
export function createWebPrompter({ open, log = () => {} }) {
  return {
    interactive: true,
    async ask(title, { secret = false, default: def, hint } = {}) {
      log(`ask: ${title}`);
      const answer = await open({ kind: 'ask', title, secret, def, hint });
      log(secret ? 'answer: (sensitive, not logged)' : `answer: ${answer}`);
      return answer.trim() === '' && def !== undefined ? String(def) : answer;
    },
    async confirm(title, { default: def = true } = {}) {
      const answer = await open({ kind: 'confirm', title, def });
      log(`confirm: ${title} → ${answer ? 'yes' : 'no'}`);
      return answer;
    },
    async choose(title, options) {
      log(`ask: ${title}`);
      const answer = await open({ kind: 'choose', title, options, index: 0 });
      log(`choose: ${answer}`);
      return answer;
    },
  };
}

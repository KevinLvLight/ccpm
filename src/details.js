// 解析 `claude plugin details` 的文字输出：插件包含哪些技能 / 代理 / hooks / MCP 服务，以及 token 占用。
// 格式对不上时返回 null，页面就直接显示原文。
const KINDS = { Skills: 'skills', Commands: 'commands', Agents: 'agents', Hooks: 'hooks', 'MCP servers': 'mcp', 'LSP servers': 'lsp' };

export function parseDetails(text) {
  const lines = String(text).split(/\r?\n/);
  const components = [];
  let alwaysOn = null;
  const perComponent = [];
  let section = '';
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^Component inventory/.test(line)) { section = 'inv'; continue; }
    if (/^Projected token cost/.test(line)) { section = 'cost'; continue; }
    if (/^Per-component/.test(line)) { section = 'per'; continue; }
    if (section === 'inv') {
      const m = line.match(/^\s+([A-Za-z][A-Za-z ]*?)\s+\((\d+)\)\s*(.*)$/);
      if (m && KINDS[m[1]]) {
        const names = m[3].replace(/\s*\(.*\)\s*$/, '').split(',').map((s) => s.trim()).filter(Boolean);
        components.push({ kind: KINDS[m[1]], count: Number(m[2]), names, contextFree: /no model context cost/.test(m[3]) });
      }
    } else if (section === 'cost') {
      const m = line.match(/Always-on:\s+(~?[\d.]+k?)\s*tok/);
      if (m) alwaysOn = m[1];
    } else if (section === 'per') {
      const m = line.match(/^\s+(\S+)\s+(~?[\d.]+k?)\s+(~?[\d.]+k?|-|—)\s*$/);
      if (m && m[1] !== 'component') perComponent.push({ name: m[1], alwaysOn: m[2], onInvoke: m[3] });
    }
  }
  return components.length ? { components, alwaysOn, perComponent } : null;
}

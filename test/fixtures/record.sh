#!/usr/bin/env bash
# Task 0：录制 claude 命令的真实输出，作为 ccpm 的测试夹具。
# 前提：已执行
#   claude plugin marketplace add https://gitlab-sz.hillstonedev.com:4433/cloudservice/AI-Efficiency.git
# 本脚本会卸载并重装 hs-rd@ai-efficiency（rd_token 留空），用来观察缺必填敏感配置时的安装行为。
# 输出写到本脚本所在目录；跑完把整个目录发回即可。
set -u
cd "$(dirname "$0")"
M=ai-efficiency
P=hs-rd@$M

echo "== (a) 非 TTY 下安装缺必填 sensitive 配置的插件"
claude plugin uninstall "$P" -y >/dev/null 2>&1
claude plugin install "$P" -y --json </dev/null >install-missing-secret.out 2>&1
echo "exit=$?" >>install-missing-secret.out
cat install-missing-secret.out

echo "== 录制 JSON 输出"
claude plugin list --json >list.json 2>&1
claude plugin list --available --json >list-available.full.json 2>&1
python3 - <<'EOF'
import json
d = json.load(open('list-available.full.json'))
ours = [a for a in d['available'] if a.get('marketplaceName') == 'ai-efficiency']
other = [a for a in d['available'] if a.get('marketplaceName') != 'ai-efficiency'][:1]
json.dump({'installed': d['installed'], 'available': ours + other}, open('list-available.json', 'w'), ensure_ascii=False, indent=2)
EOF
rm -f list-available.full.json
claude plugin marketplace list --json >marketplace-list.json 2>&1
claude plugin configure "$P" --json >configure-unset.json 2>&1
claude plugin prune --dry-run >prune-dry-run.txt 2>&1
claude mcp list >mcp-list.txt 2>&1

echo "== 脱敏检查：以下输出若含真实 token，请手工替换为 REDACTED"
grep -n -i -E 'token|password|secret|bearer' ./*.json ./*.txt ./*.out || echo "未发现可疑字段"
echo "完成。文件：$(ls)"

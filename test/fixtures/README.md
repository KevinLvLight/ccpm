# 测试夹具

`marketplace/`：迷你 marketplace，供 catalog/presets/plan 测试使用。

其余文件是 2026-11-05 在 Windows（npm 安装的 claude，入口 `claude.ps1`/`claude.cmd`）上用 `record.ps1 -Plugin sonarqube-mcp` 录制的真实输出，已脱敏（`REDACTED`）。

| 文件 | 命令 |
|---|---|
| `install-missing-secret.out` | `claude plugin install sonarqube-mcp@ai-efficiency -y --json`（required 配置全留空，stdin 为空）+ `exit=<code>` |
| `list.json` | `claude plugin list --json` |
| `list-available.json` | `claude plugin list --available --json`（裁剪为 ai-efficiency + 1 个其他 marketplace） |
| `marketplace-list.json` | `claude plugin marketplace list --json` |
| `configure-unset.json` | `claude plugin configure sonarqube-mcp@ai-efficiency --json` |
| `prune-dry-run.txt` | `claude plugin prune --dry-run` |
| `mcp-list.txt` | `claude mcp list` |

## 结论

**(a) 缺必填敏感配置时非交互安装：成功。** `outcome:"ok"`，退出码 0，message 提示 `2 userConfig options not yet set (2 required)`。
因此“先 `install --config` 写普通配置，再 `configure --values-stdin` 写敏感配置”的方案成立。
另：manifest 里 `defaultEnabled: false` 的插件装完是**禁用**的（message 含 `This plugin is disabled by default — enable it with: claude plugin enable <id>`）。

**(b) `claude mcp list` 格式：** 首行 `Checking MCP server health…` 后空行，之后每行 `<name>: <command|url> - <status>`。
插件提供的服务名为 `plugin:<plugin>:<server>`；用户级/项目级配置的是裸名字（如 `chrome-devtools`、`sonar-mcp`）。
重复 MCP 判定：裸名字 == 某已装 ai-efficiency 插件 `mcpServers` 里的 server 名。

**(c) `list --json` 没有“作为依赖自动安装”的标记。** 字段只有 `id,version,scope,enabled,installPath,installedAt,lastUpdated,mcpServers,projectEnabled,hasUserConfig,readFromFolder,folderVersion,projectPath`。status 不显示“自动安装”列。

**其他观察：**
- 同一插件可在多个 scope 各装一份（`dsgp-deploy` user 1.5.0 + project 1.4.0，project 条目带 `projectPath`）。
- `list --available --json` 的 `available` 只含**未安装**的插件，且 `version` 可能缺失。
- `prune --dry-run` 可能输出 `Skipped — cannot determine orphans: ...`（别的 marketplace 的插件加载失败时），此时无法得知孤儿列表。
- `install --json` 失败时：stdout 为 `{"command":"install","outcome":"failed",...,"failureCode":"not_found"}`，退出码 1。

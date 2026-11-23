// 中文帮助文本。help.js 按界面语言选用；README.zh-CN.md 的“用法”一节由它生成。

export const LABELS = ['用途', '用法', '参数', '选项', '示例', '会做什么', '不会做什么', '常见问题'];

const SCENARIOS = `常用场景:
  管理插件：        ccpm                         打开本机 Web 管理器
  第一次使用：      ccpm use owner/repo          添加或选择 marketplace
  查看当前状态：    ccpm status
  查看插件清单：    ccpm list
  更新管理器：      ccpm upgrade
  更新 Claude Code：ccpm cc-update`;

export const OVERVIEW = `Claude Code Plugin Manager

ccpm 通过本机 Web 管理器统一管理 Claude Code 的插件市场、插件和配置。
直接运行 ccpm 会打开浏览器；所有插件变更都在 Web 中确认并执行。

用法: ccpm [命令] [选项]

${SCENARIOS}

命令:
  web                    打开本机 Web 管理器（默认）
  use [marketplace]      添加或选择 status/list 使用的 marketplace
  status                 查看当前 marketplace 的完整状态
  list                   列出当前 marketplace 的插件
  upgrade                更新 Claude Code Plugin Manager（ccpm 自身）
  cc-update [version]    安全更新 Claude Code 本体
  check [目录]           校验 marketplace 的插件写法和 presets.json
  log                    显示诊断日志的位置
  help [命令|主题]       显示帮助，例如 ccpm help cc-update

选项:
  --dry-run              仅预览，不执行更新或 Web 中的变更
  -y, --yes              非交互模式；不写命令时等同 ccpm status
  --scope user|project   status/list 的全局（user，默认）或当前项目范围
  --marketplace <名字>   本次 status/list 使用另一个已添加的 marketplace
  --port <端口>          Web 服务端口（默认自动选择）
  --no-open              Web 启动后不自动打开浏览器
  --tries <1-50>         cc-update 最多尝试的稳定版本数（默认 5）
  --verbose              同时把诊断日志打印到屏幕
  -h, --help             显示帮助；ccpm <命令> --help 显示命令详情

安全:
  敏感配置只通过 --values-stdin 传递，不出现在命令行、日志或页面中。
  Web 仅监听 127.0.0.1，并为每次启动生成新的访问口令。

更多帮助:
  ccpm help concepts         marketplace、全局/当前项目与更新语义
  ccpm help troubleshooting  常见报错和解决办法`;

export const COMMANDS = {
  web: {
    name: 'web', summary: '打开本机 Web 管理器',
    purpose: '  在浏览器中管理 marketplace、插件和配置；这是所有插件变更的唯一入口。',
    usage: '  ccpm web [--port <端口>] [--no-open]', args: '  无',
    options: '  --port <端口>          指定端口（默认随机空闲端口）\n  --no-open              不自动打开浏览器，只打印链接\n  --dry-run              页面中的变更只预览\n  --scope user|project   页面初始范围',
    examples: '  ccpm\n  ccpm web --no-open\n  ccpm web --dry-run',
    does: '  1. 仅在 127.0.0.1 启动带一次性口令的网页\n  2. 显示插件、活动过程和结果\n  3. 在页面内确认安装、更新、配置、启停、卸载或删除 marketplace',
    doesNot: '  - 不向局域网或外网开放\n  - 不显示或记录 token、密码等敏感配置\n  - 不修改命令行默认 marketplace',
    faq: '  问：浏览器没有自动打开？\n  答：复制终端打印的链接到浏览器；链接含访问口令，勿分享。',
  },
  use: {
    name: 'use', summary: '添加或选择命令行查询的 marketplace',
    purpose: '  为 ccpm status 和 ccpm list 设置默认 marketplace。Web 内的选择不会修改该默认值。',
    usage: '  ccpm use <地址或名字>\n  ccpm use\n  ccpm use --show', args: '  <地址或名字>   GitHub owner/repo、git 地址、本地路径，或已添加的 marketplace 名字',
    options: '  --show                 只显示当前选定的 marketplace',
    examples: '  ccpm use owner/repo\n  ccpm use ./my-marketplace\n  ccpm use --show',
    does: '  1. 必要时添加 marketplace\n  2. 保存 status/list 的默认选择',
    doesNot: '  - 不安装、更新或卸载插件\n  - 不删除其他 marketplace',
    faq: '  问：只想浏览和管理插件？\n  答：直接运行 ccpm，在 Web 中选择即可。',
  },
  status: {
    name: 'status', summary: '查看当前 marketplace 的完整状态',
    purpose: '  以纯文本报告已安装插件、可更新项、配置问题和预设状态，适合脚本和诊断。',
    usage: '  ccpm status', args: '  无', options: '  --scope user|project\n  --marketplace <名字>\n  --verbose',
    examples: '  ccpm status\n  ccpm status --scope project\n  ccpm --yes',
    does: '  1. 读取 marketplace 和已安装插件\n  2. 输出状态与下一步建议', doesNot: '  - 不修改插件、配置或 marketplace',
    faq: '  问：如何处理报告中的问题？\n  答：运行 ccpm，随后在 Web 管理器中处理。',
  },
  list: {
    name: 'list', summary: '列出当前 marketplace 的插件', purpose: '  以纯文本列出插件、版本与安装状态，适合脚本查询。',
    usage: '  ccpm list', args: '  无', options: '  --scope user|project\n  --marketplace <名字>\n  --verbose', examples: '  ccpm list\n  ccpm list --scope project',
    does: '  只读取并输出当前 marketplace 的插件清单。', doesNot: '  - 不安装、更新或修改任何插件',
    faq: '  问：如何安装或更新？\n  答：运行 ccpm，在 Web 管理器中执行。',
  },
  upgrade: {
    name: 'upgrade', summary: '更新 Claude Code Plugin Manager', purpose: '  查询 npm 中 ccpm 的最新版本；确认后全局安装该版本。仅更新管理器自身，不更新 Claude Code。',
    usage: '  ccpm upgrade', args: '  无', options: '  --dry-run              仅显示将安装的版本\n  -y, --yes              使用默认确认', examples: '  ccpm upgrade\n  ccpm upgrade --dry-run',
    does: '  1. 查询当前 npm 包的最新版本\n  2. 确认后执行 npm install -g', doesNot: '  - 不更新 Claude Code 本体\n  - 不管理插件',
    faq: '  问：要更新 Claude Code？\n  答：使用 ccpm cc-update，或 Web 中的“更新 Claude Code”。',
  },
  'cc-update': {
    name: 'cc-update', summary: '安全更新 Claude Code', purpose: '  更新由 npm 全局安装的 Claude Code。安装后验证能否启动；候选版本失败时会尝试装回原可用版本。',
    usage: '  ccpm cc-update [version] [--tries <1-50>]', args: '  [version]   指定稳定版本（x.y.z）；不写则从最新稳定版本开始尝试',
    options: '  --tries <1-50>         最多尝试的稳定版本数，默认 5\n  --dry-run              只显示候选版本，不安装\n  -y, --yes              使用默认确认', examples: '  ccpm cc-update\n  ccpm cc-update 2.1.112\n  ccpm cc-update --tries 3 --dry-run',
    does: '  1. 查询 npm 中的可用稳定版本\n  2. 安装并执行 claude --version 验证\n  3. 候选版本都不能启动时，尝试装回原版本',
    doesNot: '  - 不更新 ccpm 自身（使用 ccpm upgrade）\n  - 不删除 npm 目录或修改 Claude Code 自动更新配置',
    faq: '  问：页面上也能更新吗？\n  答：可以，在 Web 的“更新中心”选择“更新 Claude Code”。',
  },
  check: {
    name: 'check', summary: '校验 marketplace 的写法', purpose: '  面向 marketplace 作者，校验 plugin.json 和 presets.json 是否符合 ccpm 支持的格式。',
    usage: '  ccpm check [目录]', args: '  [目录]   marketplace 仓库根目录，默认当前目录', options: '  无', examples: '  ccpm check\n  ccpm check ../my-marketplace',
    does: '  校验元数据、插件引用和预设循环；有问题返回 1。', doesNot: '  - 不调用 Claude Code\n  - 不修改文件', faq: '  问：没有 presets.json 会失败吗？\n  答：不会，预设是可选的。',
  },
  log: {
    name: 'log', summary: '显示诊断日志的位置', purpose: '  显示今天的日志文件和日志目录，便于排查问题。', usage: '  ccpm log', args: '  无', options: '  无', examples: '  ccpm log',
    does: '  只打印路径。', doesNot: '  - 不上传日志\n  - 不记录敏感配置的值', faq: '  问：日志保留多久？\n  答：每天一个文件，保留 14 天。',
  },
  help: {
    name: 'help', summary: '显示帮助', purpose: '  查看总览、命令详情、概念说明或排错指南。', usage: '  ccpm help\n  ccpm help <命令>\n  ccpm help concepts\n  ccpm help troubleshooting',
    args: '  <命令>   web、use、status、list、upgrade、cc-update、check、log、help', options: '  无', examples: '  ccpm help cc-update\n  ccpm help troubleshooting',
    does: '  只打印帮助。', doesNot: '  - 不调用 Claude Code\n  - 不修改任何内容', faq: '  问：插件操作的帮助在哪里？\n  答：运行 ccpm，在页面中直接操作。',
  },
};

export const CONCEPTS = `ccpm 概念说明

Web-first
  ccpm 是本机 Web 管理器。插件安装、更新、配置、启停、卸载和 marketplace 删除都在 Web 内完成；
  命令行保留 status、list、check、log 和更新等适合脚本或维护的操作。

ccpm upgrade 与 ccpm cc-update
  ccpm upgrade 更新 Plugin Manager（ccpm）自身。
  ccpm cc-update 更新 npm 全局安装的 Claude Code；它会验证新版本，失败时尝试恢复原版本。

全局 vs 当前项目（--scope）
  user（默认）查看全局安装；project 查看当前目录项目的插件。

敏感配置
  token、密码等只经 --values-stdin 传递，永不出现在命令行参数、日志或 Web 活动记录中。`;

export const TROUBLE = `ccpm 排错指南（报错 → 原因 → 解决）

未找到 claude 命令
  安装 Claude Code，重新打开终端，再运行 claude --version 确认。

无法启动 Web 页面
  确认运行 ccpm 的终端仍在运行；复制终端中的本机链接重新打开。

cc-update 找不到 Claude Code
  cc-update 只管理 npm 全局安装的 Claude Code。检查 npm root -g 和 npm 包安装位置。

更新失败
  检查网络与 npm 源；可先用 --dry-run 查看候选版本。cc-update 会在候选版本失败后尝试恢复原版本。

反馈问题
  运行 ccpm log 找到日志文件；日志不含 token、密码。`;

// 中文帮助文本。help.js 按界面语言选用；README.zh-CN.md 的“用法”一节由它生成

export const LABELS = ['用途', '用法', '参数', '选项', '示例', '会做什么', '不会做什么', '常见问题'];

const SCENARIOS = `常用场景:
  边看边操作：      ccpm                      直接运行 ccpm 进入交互界面，查看和操作都在一个界面里
  第一次使用：      ccpm use owner/repo       选定要管理的 marketplace
  装好一组插件：    ccpm install <预设名>
  看有哪些插件：    ccpm list
  查看当前状态：    ccpm status
  保持最新：        ccpm sync                 补装、更新、补配置，一条命令搞定
  改某个插件配置：  ccpm config <插件名>`;

export const OVERVIEW = `ccpm — 一键安装 / 配置 / 更新 Claude Code 插件的工具

ccpm 帮你管理 Claude Code 里来自你选定的插件市场（marketplace，用 ccpm use 选择）的插件：
装插件时自动补上它依赖的插件、一项项问你要填的配置、提醒你更新。
它只管选定的 marketplace 的插件，其他来源的插件一概不碰。

用法: ccpm [命令] [选项]

直接运行 ccpm（不写命令）进入全屏交互界面：一次扫描，边看边装、更新、配置。
在脚本里或加了 --yes 时，ccpm 等同 ccpm status。

${SCENARIOS}

命令:
  use [marketplace]      选择要管理的 marketplace（没添加过会先添加）
  ui                     打开全屏交互界面（直接运行 ccpm 时默认进入）
  status                 查看插件和预设的完整状态（脚本里不写命令时默认就是它）
  list                   列出当前 marketplace 的全部插件，标出已装 / 未装 / 可更新
  install <插件或预设>   安装插件或预设，自动补装依赖、询问配置
  sync                   补装、更新、补配置，让环境和你选的预设保持一致
  update [插件...]       把插件更新到最新版
  config <插件>          重新填写某个插件的配置
  enable <插件...>       启用停用的插件
  disable <插件...>      停用插件（保留安装和配置）
  remove <插件或预设...> 卸载插件或整个预设（之后 ccpm sync 不会再装回来）
  check [目录]           校验 marketplace 的插件写法和 presets.json（给 marketplace 作者用）
  log                    显示诊断日志的位置（反馈问题时用）
  help [命令|主题]       显示帮助，例如 ccpm help install

图例：✔ 正常  ↑ 可更新  ▲ 需要处理  ⏸ 已停用  ○ 未安装  + 将安装  − 将卸载

选项（会改动环境的命令都支持）:
  --dry-run              只预览要做什么，不做任何改动
  -y, --yes              不提问，全部按默认处理（缺必填配置的插件会被跳过）
  --scope user|project   装到全局（user，默认）或当前项目（project）
  --marketplace <名字>   这一次改用另一个已添加的 marketplace（不改默认）
  --verbose              把诊断日志同时打印到屏幕（排查问题用）
  -h, --help             显示帮助；ccpm <命令> --help 显示该命令的详细说明

文件位置:
  选定的 marketplace 和预设：~/.claude/ccpm.json
  诊断日志：        ~/.claude/ccpm/logs/ccpm-<日期>.log（保留 14 天）
  （设置了 CLAUDE_CONFIG_DIR 时，~/.claude 换成该目录）

更多帮助:
  ccpm help concepts         预设、全局/当前项目、为何要重启等概念说明
  ccpm help troubleshooting  常见报错和解决办法
  完整说明见 README`;

const MUTATING_OPTS = `  --dry-run              只预览，不做任何改动
  -y, --yes              不提问，全部按默认处理
  --scope user|project   全局（默认）或当前项目
  --verbose              同时把诊断日志打印到屏幕`;
const READ_OPTS = `  --scope user|project   看全局（默认）还是当前项目的插件
  --verbose              同时把诊断日志打印到屏幕`;

export const COMMANDS = {
  use: ({
    name: 'use', summary: '选择要管理的 marketplace',
    purpose: '  告诉 ccpm 要管理哪个插件市场。没添加过的会先用 claude plugin marketplace add 添加，\n  之后所有命令都针对它，直到你再 use 一个。',
    usage: '  ccpm use <地址或名字>\n  ccpm use            （列出已添加的 marketplace，选一个）\n  ccpm use --show     （只显示当前用的是哪个）',
    args: '  <地址或名字>   GitHub owner/repo、git 地址、本地路径，或已添加的 marketplace 名字',
    options: '  --show                 只显示当前选定的 marketplace\n  --verbose              同时把诊断日志打印到屏幕',
    examples: `  ccpm use owner/repo                     添加并切换到 GitHub 上的 marketplace
  ccpm use https://git.example.com/x.git  用 git 地址
  ccpm use ./my-marketplace               用本地目录
  ccpm use                                从已添加的里选一个`,
    does: '  1. 找到这个 marketplace；没添加过就先添加\n  2. 记到 ~/.claude/ccpm.json 的 current\n  3. 显示它有多少个插件和预设',
    doesNot: '  - 不安装任何插件\n  - 不删除其他 marketplace，也不改它们的记录（切回来时预设还在）',
    faq: `  问：只添加了一个 marketplace，还要 use 吗？
  答：不用，ccpm 会直接用它。
  问：想临时看另一个？
  答：任意命令加 --marketplace <名字>，只对这一次生效。`,
  }),
  ui: ({
    name: 'ui', summary: '全屏交互界面：边看边操作',
    purpose: '  一个界面里看全部预设和插件的状态，用方向键选中、空格勾选，\n  按一个键就能安装、更新、配置、启用/停用、卸载，不用反复运行命令、重复扫描。',
    usage: '  ccpm ui\n  ccpm            （在命令行窗口里、没有 --yes 时等同 ccpm ui）',
    args: '  无',
    options: `  --dry-run              只预览，每个操作都不做改动
  --scope user|project   从全局（默认）还是当前项目开始看；界面里按 p 切换
  --verbose              同时把诊断日志打印到屏幕`,
    examples: `  ccpm                          进入交互界面
  ccpm ui --scope project       从当前项目开始看
  ccpm --dry-run                试试各个操作会做什么，不做改动`,
    does: `  1. 检查 Claude Code、拉取插件列表、读取已装插件（只做一次）
  2. 列出预设、已安装、还没装的插件；下方显示光标所在项的详情
  3. 按键操作（操作对象 = 勾选的项，没有勾选时 = 光标所在项）：
     ↑↓ 移动   空格 勾选   a 取消全部勾选
     i 安装   u 更新   c 配置   e 启用/停用   r 卸载   s 同步
     p 切换 全局 / 本项目   R 重新扫描   ? 帮助   q 退出
  4. 操作时下方显示执行过程和结果，确认、选择、填写配置都在界面里弹窗完成；
     做完自动刷新列表`,
    doesNot: `  - 不离开全屏界面（退出后终端恢复原样）
  - 敏感配置输入时只显示 •，不会写进日志
  - 不在脚本里运行：没有命令行窗口时请用 ccpm status 等命令`,
    faq: `  问：按键没反应？
  答：底部那行会说明原因，例如“装在全局，按 p 切到全局再操作”；按 ? 查看全部按键。
  问：想看到和以前一样的文字报告？
  答：运行 ccpm status。`,
  }),
  list: ({
    name: 'list', summary: '列出当前 marketplace 的全部插件',
    purpose: '  看看插件市场里有哪些插件、每个是干什么的、你装了哪些、哪些能更新。',
    usage: '  ccpm list',
    args: '  无',
    options: READ_OPTS,
    examples: `  ccpm list                     全部插件，已装的在前
  ccpm list --scope project     看当前项目装了哪些`,
    does: '  只读，打印插件清单：\n  ✔ 已装  ↑ 可更新（旧版本 → 新版本）  ⏸ 已停用  ○ 未装',
    doesNot: '  - 不安装、不更新任何东西\n  - 不列出其他来源（非当前 marketplace）的插件',
    faq: `  问：想装其中一个？
  答：运行 ccpm install <插件名>，它依赖的插件会一起装上。
  问：清单和 Claude Code 里的 /plugin 不一样？
  答：ccpm list 只列当前 marketplace 的插件；其他来源的插件 ccpm 不管。`,
  }),
  status: ({
    name: 'status', summary: '查看插件和预设的完整状态',
    purpose: '  完整状态一览：每个已装插件的版本和状态（可更新、缺配置、已停用等）、\n  还没装的插件、全部预设（选了哪些、各包含哪些插件、装齐没有），\n  以及需要注意的问题（如重复的 MCP 服务），\n  最后列出“下一步”该运行的命令。',
    usage: '  ccpm status\n  ccpm            （在脚本里或加 --yes 时等同 ccpm status；在命令行窗口里进入交互界面）',
    args: '  无',
    options: READ_OPTS,
    examples: `  ccpm status                   看全局插件的状态
  ccpm status --scope project   看当前项目里装的插件
  ccpm --yes                    同 ccpm status（不进入交互界面）`,
    does: '  1. 检查 Claude Code 是否可用\n  2. 从 marketplace 仓库拉取最新插件列表\n  3. 读取已装插件、检查配置和 MCP 服务\n  4. 打印报告和“下一步”',
    doesNot: '  - 不安装、不卸载、不修改任何东西\n  - 不显示其他来源的插件\n  - 不显示插件说明（用 ccpm list 查看）',
    faq: `  问：最后显示“一切正常，无需操作”是什么意思？
  答：没有需要你处理的事情。
  问：拉取插件列表失败怎么办？
  答：status 仍会用上次的本地副本出报告；检查网络 / VPN 后重试。`,
  }),
  install: ({
    name: 'install', summary: '安装插件或预设',
    purpose: '  安装一个或多个插件，或者一整个预设。依赖的插件会自动一起装，\n  必填配置会一项项问你。',
    usage: '  ccpm install <插件或预设>...',
    args: '  <插件或预设>   插件名（如 data-scan）或预设名（如 dev），可写多个',
    options: MUTATING_OPTS,
    examples: `  ccpm install dev            装好 dev 预设里的全部插件
  ccpm install data-scan     只装一个插件（及它依赖的插件）
  ccpm install data --dry-run      先看看会装哪些，不真正安装
  ccpm install data-deploy verify-requirement   一次装多个插件
  ccpm install quality-mcp --scope project   只装到当前项目`,
    does: '  1. 列出将安装的插件，问你“确认执行以上操作？”\n  2. 逐个询问必填配置（敏感信息输入时不显示）\n  3. 安装插件、写入配置\n  4. 装的是预设时，记到 ccpm.json，以后 ccpm sync 会自动补装\n  5. 打印“完成”汇总；重启 Claude Code 后生效',
    doesNot: '  - 不重装已经装好的插件\n  - 不把预设装到当前项目（预设只对全局生效）\n  - 敏感配置不会出现在命令行参数和日志里',
    faq: `  问：用了 --yes，有的插件被“跳过”了？
  答：它有必填配置，--yes 下没法问你。去掉 --yes 再运行一次 ccpm install <插件名>。
  问：提示“没有叫 xx 的插件或预设”？
  答：检查拼写；全部预设见 ccpm status。`,
  }),
  sync: ({
    name: 'sync', summary: '补装、更新、补配置，一条命令搞定',
    purpose: '  让环境和你选的预设保持一致：补装预设里缺的插件和依赖、\n  更新有新版本的插件、补填缺的必填配置、清理不再需要的依赖。',
    usage: '  ccpm sync',
    args: '  无',
    options: MUTATING_OPTS,
    examples: `  ccpm sync              日常保持最新，推荐每周跑一次
  ccpm sync --dry-run    只看会做什么
  ccpm sync --yes        不提问（缺必填配置的插件会跳过）`,
    does: '  1. 第一次运行时，根据已装插件推荐预设并记住你的选择\n  2. 列出将安装 / 更新 / 需要填写配置的插件，问你确认\n  3. 逐项执行，显示进度\n  4. 如有不再需要的依赖，再问一次是否卸载\n  5. 打印“完成”汇总',
    doesNot: '  - 不碰其他来源的插件\n  - 不装回你用 ccpm remove 卸载过的插件\n  - 不自动启用你停用的插件\n  - 发现重复的 MCP 服务只提示，不替你卸载',
    faq: `  问：sync 把我卸载的插件又装回来了？
  答：另一个已装插件依赖它。把依赖它的插件也卸载即可。
  问：--scope project 时为什么不按预设补装？
  答：预设只对全局生效；当前项目只补依赖、更新和配置。`,
  }),
  update: ({
    name: 'update', summary: '把插件更新到最新版',
    purpose: '  更新指定插件；不写插件名时更新所有有新版本的插件。\n  更新后会显示更新内容，并补问新增的必填配置。',
    usage: '  ccpm update [插件...]',
    args: '  [插件...]   要更新的插件名，可不写',
    options: MUTATING_OPTS,
    examples: `  ccpm update                    更新所有有新版本的插件
  ccpm update data-scan    只更新这一个
  ccpm update --dry-run          看看哪些可以更新`,
    does: '  1. 列出可更新的插件和版本，问你确认\n  2. 逐个更新，显示更新内容\n  3. 新版本新增了依赖或必填配置时，补装 / 补问',
    doesNot: '  - 不安装新插件（用 ccpm install）\n  - 不降级',
    faq: `  问：显示“已是最新”？
  答：你装的已经是 marketplace 里的最新版本。`,
  }),
  config: ({
    name: 'config', summary: '重新填写某个插件的配置',
    purpose: '  修改已装插件的配置，例如更换 token、改服务地址。',
    usage: '  ccpm config <插件名>',
    args: '  <插件名>   已安装的插件名',
    options: '  --dry-run              只显示会问哪些配置\n  --scope user|project   全局（默认）或当前项目\n  --verbose              同时把诊断日志打印到屏幕',
    examples: `  ccpm config quality-mcp    重新填服务地址和 token
  ccpm config data-deploy      修改部署插件的配置`,
    does: '  1. 一项项问你（直接回车 = 保留原值）\n  2. 保存配置\n  3. 插件是停用状态时，问你要不要启用',
    doesNot: '  - 不能和 --yes 一起用（必须一问一答）\n  - 敏感信息输入时不显示，也不会写进日志',
    faq: `  问：粘贴 token 后屏幕上什么都没有？
  答：正常，敏感信息输入时不显示，粘贴后直接回车即可。`,
  }),
  enable: ({
    name: 'enable', summary: '启用停用的插件',
    purpose: '  重新启用被停用的插件。ccpm status 里标着 ⏸ 的就是停用的插件。',
    usage: '  ccpm enable <插件名...>',
    args: '  <插件名...>   一个或多个已安装的插件',
    options: MUTATING_OPTS,
    examples: `  ccpm enable quality-mcp                  启用这个插件
  ccpm enable quality-mcp mysql-mcp        一次启用多个
  ccpm enable quality-mcp --scope project  启用当前项目里装的那份`,
    does: '  1. 对停用的插件运行 claude plugin enable\n  2. 已经启用的跳过不动',
    doesNot: '  - 不安装插件（没装的先 ccpm install）\n  - 不改配置',
    faq: `  问：启用后没有效果？
  答：重启 Claude Code（关闭后重新打开）。`,
  }),
  disable: ({
    name: 'disable', summary: '停用插件',
    purpose: '  暂时停用插件：保留安装和配置，Claude Code 不再加载它。之后用 ccpm enable 恢复。',
    usage: '  ccpm disable <插件名...>',
    args: '  <插件名...>   一个或多个已安装的插件',
    options: MUTATING_OPTS,
    examples: `  ccpm disable browser-mcp   暂时不用这个插件
  ccpm disable a b                   一次停用多个`,
    does: '  1. 对启用中的插件运行 claude plugin disable\n  2. 已经停用的跳过不动',
    doesNot: '  - 不卸载、不删配置\n  - ccpm sync / update 不会自动把它重新启用',
    faq: `  问：停用和卸载有什么区别？
  答：停用保留安装和配置，随时 ccpm enable 恢复；卸载用 ccpm remove。`,
  }),
  remove: ({
    name: 'remove', summary: '卸载插件或整个预设',
    purpose: '  卸载一个插件。如果它属于你选的预设，ccpm 会记住，以后 ccpm sync 不再装回。\n  也可以卸载整个预设：卸掉预设里的插件，并把它从你选的预设里去掉。',
    usage: '  ccpm remove <插件名或预设名...>',
    args: '  <插件名或预设名...>   一个或多个，可以混写；预设只对全局生效',
    options: MUTATING_OPTS,
    examples: `  ccpm remove browser-mcp     卸载这个插件
  ccpm remove data-deploy --dry-run   看看会发生什么
  ccpm remove data                    卸载整个 data 预设
  ccpm remove data --dry-run          先看看预设里哪些会卸、哪些会保留
  ccpm remove mysql-mcp prd-builder   一次卸载多个，只确认一次`,
    does: '  卸载插件：\n  1. 提示有哪些插件依赖它，问你确认\n  2. 卸载\n  3. 属于预设时记到 ccpm.json，sync 不再装回\n  卸载预设：\n  1. 列出要卸载和要保留的插件，问你确认（默认否）\n  2. 卸载预设里的插件及其依赖\n  3. 把预设从 ccpm.json 里去掉',
    doesNot: '  - 不连带卸载依赖它的插件\n  - 卸载预设时，不卸你选的其他预设也包含的插件，也不卸还被其他插件依赖的插件\n  - 不碰其他来源的插件',
    faq: `  问：卸了还会被装回来？
  答：还有已装插件依赖它，ccpm sync 会补装。把依赖它的插件也卸载即可。
  问：想重新装回来？
  答：运行 ccpm install <插件名>，ccpm 会自动忘掉“不再装回”的记录。`,
  }),
  check: ({
    name: 'check', summary: '校验 marketplace 的写法',
    purpose: '  给 marketplace 作者用：检查每个插件的 plugin.json 和 presets.json 是否是 ccpm 支持的写法，\n  适合放进 marketplace 仓库的 CI。',
    usage: '  ccpm check [目录]',
    args: '  [目录]   marketplace 仓库的根目录，默认当前目录',
    options: '  无',
    examples: `  ccpm check                在 marketplace 仓库根目录里运行
  ccpm check ../my-plugins  校验另一个目录`,
    does: '  1. 读取 .claude-plugin/marketplace.json 和每个插件的 plugin.json\n  2. 校验 presets.json（引用的插件是否存在、有无循环、是否与插件重名）\n  3. 有问题逐条列出并返回 1，否则返回 0',
    doesNot: '  - 不调用 Claude Code\n  - 不修改任何文件',
    faq: `  问：没有 presets.json 会报错吗？
  答：不会，预设是可选的。`,
  }),
  log: ({
    name: 'log', summary: '显示诊断日志的位置',
    purpose: '  遇到奇怪的问题时，把日志文件发给维护者，就能看到当时发生了什么。',
    usage: '  ccpm log',
    args: '  无',
    options: '  无',
    examples: `  ccpm log                  打印今天的日志文件和日志目录
  ccpm sync --verbose       运行时把日志同时打印到屏幕`,
    does: '  只打印路径，不调用 Claude Code',
    doesNot: '  - 日志里不记录敏感配置的值（token、密码等）\n  - 不上传日志，需要你自己发给维护者',
    faq: `  问：日志保留多久？
  答：每天一个文件，保留 14 天，旧的自动删除。`,
  }),
  help: ({
    name: 'help', summary: '显示帮助',
    purpose: '  查看总览、某个命令的详细说明、概念说明或排错指南。',
    usage: '  ccpm help\n  ccpm help <命令>\n  ccpm help concepts\n  ccpm help troubleshooting\n  ccpm <命令> --help',
    args: '  <命令>   use、ui、status、list、install、sync、update、config、enable、disable、remove、check、log、help',
    options: '  无',
    examples: `  ccpm help install     install 的详细说明
  ccpm help concepts           预设、全局/当前项目等概念
  ccpm help troubleshooting    常见报错和解决办法`,
    does: '  只打印帮助，不调用 Claude Code',
    doesNot: '  - 不改动任何东西',
    faq: `  问：帮助太长看不完？
  答：先看 ccpm help 里的“常用场景”，用到哪个命令再看 ccpm help <命令>。`,
  }),
};

export const CONCEPTS = `ccpm 概念说明

预设
  预设 = 一组常用插件，由 marketplace 作者写在仓库根目录的 presets.json 里。
  marketplace 没有 presets.json 时，ccpm 不显示预设，其余功能照常。
  ccpm install dev 会把里面的插件一次装好，并记住你选了这个预设；
  以后预设里加了新插件，ccpm sync 会自动补装。查看全部预设和装齐没有：ccpm status。

全局 vs 当前项目（--scope）
  全局（--scope user，默认）：插件在所有项目里都能用。
  当前项目（--scope project）：插件只在当前目录这个项目里生效。
  预设只对全局生效；--scope project 时 ccpm 只处理当前项目已装插件的依赖、更新和配置。

ccpm.json 记什么
  文件：~/.claude/ccpm.json。记三件事：
  current  当前管理的 marketplace；每个 marketplace 各记一份：
  presets  你选的预设；excluded  你用 ccpm remove 卸载、不想被装回的插件。
  文件损坏时 ccpm 会备份成 ccpm.json.bak，当作第一次使用处理。

依赖自动补装
  插件可以声明依赖别的插件。安装时 ccpm 会先装依赖；
  依赖缺失时 ccpm sync 会补装；依赖不再需要时 ccpm sync 会问你是否清理。

敏感配置为何不显示
  token、密码这类配置输入时屏幕上不显示，粘贴后直接回车即可。
  它们只通过标准输入交给 Claude Code，不会出现在命令行参数和诊断日志里。

为何需要重启 Claude Code
  Claude Code 启动时才加载插件。装完 / 更新 / 改配置后，
  关闭 Claude Code 再重新打开，改动才会生效。

什么情况下 ccpm 会跳过插件
  - 用了 --yes 或在脚本里运行，而插件有必填配置 → 跳过，提示你运行 ccpm install / ccpm config
  - 必填配置问了两次都留空 → 跳过
  - 它依赖的插件没装上 → 跳过
  - 预设里写的插件已从 marketplace 下架 → 跳过并提示
  被跳过的插件会列在最后的“完成”汇总里，并写明怎么办。`;

export const TROUBLE = `ccpm 排错指南（报错 → 原因 → 解决）

未找到 claude 命令
  原因：没装 Claude Code，或装了但命令行窗口没重新打开。
  解决：安装 Claude Code，关掉命令行窗口重新打开，再运行 claude --version 确认。

Claude Code 版本太旧，请升级 Claude Code
  原因：ccpm 需要较新的 claude plugin configure --values-stdin。
  解决：运行 claude update。

无法添加 marketplace <名字>
  原因：git 访问 marketplace 仓库没有凭证（报错含 unable to get password / Authentication failed），或网络不通。
  解决：macOS 运行 git config --global credential.helper osxkeychain，
        Windows 安装 Git Credential Manager；然后手动 git clone 一次
        marketplace 的仓库，输入账号密码后重试。网络问题请检查 VPN。

还没选择要管理的 marketplace / marketplace 已从 Claude Code 中移除
  原因：第一次使用，或者 Claude Code 里添加了多个 marketplace。
  解决：运行 ccpm use <地址或名字>；不带参数的 ccpm use 会列出已添加的让你选。

拉取最新插件列表失败
  原因：网络 / VPN 不通，或 git 凭证过期。
  解决：检查网络后重试。ccpm status 仍可用本地副本查看状态。

参数含不安全字符
  原因：Windows 上插件名或参数里有特殊字符（如 & | " 等）。
  解决：检查命令里插件名的拼写，只用字母、数字、- _ . @。

缺必填配置，已跳过
  原因：用了 --yes 或在脚本里运行，没法问你配置；或配置留空。
  解决：在命令行窗口里运行汇总里提示的命令，如 ccpm install <插件> 或 ccpm config <插件>。

命令很慢
  原因：每一步都要调用 claude，Windows 上每次 1–2 秒；检查 MCP 服务时最慢。
  解决：正常现象，屏幕上会显示当前进度。网络慢时拉取插件列表也会慢。

反馈问题
  运行 ccpm log 找到今天的日志文件，发给维护者。日志里不含 token、密码。`;


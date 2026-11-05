// English help text. help.js picks it for the English UI; README.md's "Usage" section is generated from it.

export const LABELS = ['Purpose', 'Usage', 'Arguments', 'Options', 'Examples', 'What it does', 'What it does not do', 'FAQ'];

const SCENARIOS = `Common tasks:
  Browse and act:      ccpm                      run ccpm with no command to open the interactive view
  First time:          ccpm use owner/repo       choose the marketplace to manage
  Install a set:       ccpm install <preset>
  See what's there:    ccpm list
  Check the state:     ccpm status
  Stay up to date:     ccpm sync                 install missing, update, fill in settings
  Change settings:     ccpm config <plugin>`;

export const OVERVIEW = `ccpm — install, configure and update Claude Code plugins in one go

ccpm manages the Claude Code plugins that come from one plugin marketplace you choose (with ccpm use):
it installs the plugins a plugin depends on, asks for each setting it needs, and tells you about updates.
It only touches plugins from the chosen marketplace; plugins from anywhere else are left alone.

Usage: ccpm [command] [options]

Run ccpm with no command to open the full-screen interactive view: one scan, then browse, install, update and configure.
In scripts, or with --yes, ccpm is the same as ccpm status.

${SCENARIOS}

Commands:
  use [marketplace]         choose the marketplace to manage (adds it first if needed)
  ui                        open the full-screen interactive view (the default when you just run ccpm)
  status                    full state of plugins and presets (the default in scripts)
  list                      every plugin in the current marketplace: installed / not installed / updatable
  install <plugin|preset>   install plugins or presets, with dependencies and settings
  sync                      install missing, update, fill in settings so you match your presets
  update [plugin...]        update plugins to the latest version
  config <plugin>           fill in a plugin's settings again
  enable <plugin...>        enable disabled plugins
  disable <plugin...>       disable plugins (keeps them installed and configured)
  remove <plugin|preset...> remove plugins or a whole preset (ccpm sync will not bring them back)
  check [folder]            check a marketplace's plugins and presets.json (for marketplace authors)
  log                       show where the diagnostic log is (for bug reports)
  help [command|topic]      show help, e.g. ccpm help install

Legend: ✔ ok  ↑ updatable  ▲ needs action  ⏸ disabled  ○ not installed  + will install  − will remove

Options (for commands that change things):
  --dry-run              preview only, change nothing
  -y, --yes              ask nothing, use defaults (plugins with required settings are skipped)
  --scope user|project   install globally (user, default) or into the current project (project)
  --marketplace <name>   use another added marketplace for this run only (default unchanged)
  --verbose              also print the diagnostic log to the screen (for troubleshooting)
  -h, --help             show help; ccpm <command> --help shows that command in detail

Files:
  Chosen marketplace and presets: ~/.claude/ccpm.json
  Diagnostic log:  ~/.claude/ccpm/logs/ccpm-<date>.log (kept 14 days)
  (with CLAUDE_CONFIG_DIR set, that folder replaces ~/.claude)

More help:
  ccpm help concepts         presets, global vs project, why restart, and more
  ccpm help troubleshooting  common errors and how to fix them
  Full documentation: README`;

const MUTATING_OPTS = `  --dry-run              preview only, change nothing
  -y, --yes              ask nothing, use defaults
  --scope user|project   global (default) or the current project
  --verbose              also print the diagnostic log to the screen`;
const READ_OPTS = `  --scope user|project   look at global (default) or current-project plugins
  --verbose              also print the diagnostic log to the screen`;

export const COMMANDS = {
  use: ({
    name: 'use', summary: 'choose the marketplace to manage',
    purpose: '  Tell ccpm which plugin marketplace to manage. One that is not added yet is added first with\n  claude plugin marketplace add; every command then works on it until you use another one.',
    usage: '  ccpm use <source or name>\n  ccpm use            (lists the added marketplaces so you can pick one)\n  ccpm use --show     (only shows the current one)',
    args: '  <source or name>   GitHub owner/repo, git URL, local path, or the name of an added marketplace',
    options: '  --show                 only show the chosen marketplace\n  --verbose              also print the diagnostic log to the screen',
    examples: `  ccpm use owner/repo                     add and switch to a marketplace on GitHub
  ccpm use https://git.example.com/x.git  use a git URL
  ccpm use ./my-marketplace               use a local folder
  ccpm use                                pick one of the added marketplaces`,
    does: '  1. Find the marketplace; add it if it is not added yet\n  2. Save it as current in ~/.claude/ccpm.json\n  3. Show how many plugins and presets it has',
    doesNot: '  - Install any plugin\n  - Remove other marketplaces or forget their records (your presets are still there when you switch back)',
    faq: `  Q: Only one marketplace is added. Do I need use?
  A: No, ccpm uses it directly.
  Q: How do I look at another one just once?
  A: Add --marketplace <name> to any command; it applies to that run only.`,
  }),
  ui: ({
    name: 'ui', summary: 'full-screen interactive view',
    purpose: '  See every preset and plugin in one screen, move with the arrow keys, select with space,\n  and install, update, configure, enable/disable or remove with one key — no repeated commands or rescans.',
    usage: '  ccpm ui\n  ccpm            (in a terminal window without --yes, same as ccpm ui)',
    args: '  none',
    options: `  --dry-run              preview only; no action changes anything
  --scope user|project   start with global (default) or the current project; press p to switch
  --verbose              also print the diagnostic log to the screen`,
    examples: `  ccpm                          open the interactive view
  ccpm ui --scope project       start with the current project
  ccpm --dry-run                try the actions without changing anything`,
    does: `  1. Check Claude Code, fetch the plugin list, read installed plugins (once)
  2. List presets, installed and not-installed plugins; details of the item under the cursor below
  3. Keys (actions apply to the selected items, or to the item under the cursor):
     ↑↓ move   space select   a clear selection
     i install   u update   c config   e enable/disable   r remove   s sync
     p switch global / this project   R rescan   ? help   q quit
  4. Progress and results show below; confirmations, choices and settings open as dialogs;
     the list refreshes when an action finishes`,
    doesNot: `  - Leave the full screen (the terminal is restored when you quit)
  - Show or log sensitive settings: they appear as •
  - Run in scripts: without a terminal window, use ccpm status and friends`,
    faq: `  Q: A key does nothing?
  A: The bottom line says why, e.g. "installed globally; press p to switch to global first". Press ? for all keys.
  Q: I want the plain text report?
  A: Run ccpm status.`,
  }),
  list: ({
    name: 'list', summary: 'every plugin in the current marketplace',
    purpose: '  See which plugins the marketplace has, what each one does, which you installed and which can be updated.',
    usage: '  ccpm list',
    args: '  none',
    options: READ_OPTS,
    examples: `  ccpm list                     all plugins, installed first
  ccpm list --scope project     what this project has installed`,
    does: '  Read-only; prints the plugin list:\n  ✔ installed  ↑ updatable (old → new)  ⏸ disabled  ○ not installed',
    doesNot: '  - Install or update anything\n  - List plugins from other sources (outside the current marketplace)',
    faq: `  Q: How do I install one?
  A: Run ccpm install <plugin>; its dependencies come along.
  Q: The list differs from /plugin in Claude Code?
  A: ccpm list shows only the current marketplace; ccpm ignores other sources.`,
  }),
  status: ({
    name: 'status', summary: 'full state of plugins and presets',
    purpose: '  Everything at a glance: each installed plugin with its version and state (updatable, missing settings,\n  disabled…), plugins not installed yet, all presets (chosen or not, their plugins, complete or not),\n  problems to look at (such as duplicate MCP servers),\n  and finally the commands to run next.',
    usage: '  ccpm status\n  ccpm            (in scripts or with --yes, same as ccpm status; in a terminal window it opens the interactive view)',
    args: '  none',
    options: READ_OPTS,
    examples: `  ccpm status                   global plugins
  ccpm status --scope project   plugins installed in the current project
  ccpm --yes                    same as ccpm status (no interactive view)`,
    does: '  1. Check that Claude Code works\n  2. Fetch the latest plugin list from the marketplace repository\n  3. Read installed plugins, check settings and MCP servers\n  4. Print the report and the next steps',
    doesNot: '  - Install, remove or change anything\n  - Show plugins from other sources\n  - Show plugin descriptions (use ccpm list)',
    faq: `  Q: What does "All good, nothing to do" mean?
  A: There is nothing for you to handle.
  Q: Fetching the plugin list failed?
  A: status still reports from the last local copy; check your network / VPN and retry.`,
  }),
  install: ({
    name: 'install', summary: 'install plugins or presets',
    purpose: '  Install one or more plugins, or a whole preset. Dependencies are installed too,\n  and required settings are asked one by one.',
    usage: '  ccpm install <plugin or preset>...',
    args: '  <plugin or preset>   a plugin name (e.g. data-scan) or a preset name (e.g. dev); several allowed',
    options: MUTATING_OPTS,
    examples: `  ccpm install dev            install every plugin in the dev preset
  ccpm install data-scan     just one plugin (and what it depends on)
  ccpm install data --dry-run      see what would be installed
  ccpm install data-deploy verify-requirement   several plugins at once
  ccpm install quality-mcp --scope project   only for the current project`,
    does: '  1. List what will be installed and ask you to confirm\n  2. Ask each required setting (sensitive input is hidden)\n  3. Install the plugins and save their settings\n  4. For a preset, remember it in ccpm.json so ccpm sync keeps it complete\n  5. Print a summary; restart Claude Code to apply',
    doesNot: '  - Reinstall plugins that are already installed\n  - Install presets into a project (presets are global only)\n  - Put sensitive settings on the command line or in logs',
    faq: `  Q: With --yes some plugins were "skipped"?
  A: They have required settings, which --yes cannot ask. Run ccpm install <plugin> again without --yes.
  Q: "no plugin or preset named xx"?
  A: Check the spelling; ccpm status lists all presets.`,
  }),
  sync: ({
    name: 'sync', summary: 'install missing, update, fill in settings',
    purpose: '  Keep your setup in line with your presets: install missing preset plugins and dependencies,\n  update plugins with new versions, ask for missing required settings, clean up unused dependencies.',
    usage: '  ccpm sync',
    args: '  none',
    options: MUTATING_OPTS,
    examples: `  ccpm sync              keep up to date; once a week is a good habit
  ccpm sync --dry-run    only see what it would do
  ccpm sync --yes        ask nothing (plugins with required settings are skipped)`,
    does: '  1. On the first run, suggest presets from what you have installed and remember your choice\n  2. List what will be installed / updated / configured and ask you to confirm\n  3. Run each step with progress\n  4. If some dependencies are no longer needed, ask whether to remove them\n  5. Print a summary',
    doesNot: '  - Touch plugins from other sources\n  - Reinstall plugins you removed with ccpm remove\n  - Enable plugins you disabled\n  - Remove duplicate MCP servers for you (it only tells you)',
    faq: `  Q: sync reinstalled a plugin I removed?
  A: Another installed plugin depends on it. Remove that plugin too.
  Q: Why does --scope project not follow my presets?
  A: Presets are global only; for a project, sync only handles dependencies, updates and settings.`,
  }),
  update: ({
    name: 'update', summary: 'update plugins to the latest version',
    purpose: '  Update the plugins you name; with no names, update every plugin that has a new version.\n  Shows what changed and asks for any new required settings.',
    usage: '  ccpm update [plugin...]',
    args: '  [plugin...]   plugins to update (optional)',
    options: MUTATING_OPTS,
    examples: `  ccpm update                    update everything that has a new version
  ccpm update data-scan          just this one
  ccpm update --dry-run          see what can be updated`,
    does: '  1. List updatable plugins and versions and ask you to confirm\n  2. Update them one by one and show what changed\n  3. Install new dependencies / ask new required settings',
    doesNot: '  - Install new plugins (use ccpm install)\n  - Downgrade',
    faq: `  Q: It says "up to date"?
  A: You already have the latest version in the marketplace.`,
  }),
  config: ({
    name: 'config', summary: "fill in a plugin's settings again",
    purpose: '  Change the settings of an installed plugin, e.g. a new token or a different server address.',
    usage: '  ccpm config <plugin>',
    args: '  <plugin>   an installed plugin',
    options: '  --dry-run              only show which settings would be asked\n  --scope user|project   global (default) or the current project\n  --verbose              also print the diagnostic log to the screen',
    examples: `  ccpm config quality-mcp    enter the server address and token again
  ccpm config data-deploy    change the deploy plugin's settings`,
    does: '  1. Ask each setting (Enter = keep the current value)\n  2. Save the settings\n  3. If the plugin is disabled, ask whether to enable it',
    doesNot: '  - Work with --yes (it has to ask)\n  - Show or log sensitive values',
    faq: `  Q: Nothing appears when I paste a token?
  A: That is expected: sensitive input is hidden. Paste and press Enter.`,
  }),
  enable: ({
    name: 'enable', summary: 'enable disabled plugins',
    purpose: '  Enable plugins that were disabled. In ccpm status they are marked ⏸.',
    usage: '  ccpm enable <plugin...>',
    args: '  <plugin...>   one or more installed plugins',
    options: MUTATING_OPTS,
    examples: `  ccpm enable quality-mcp                  enable this plugin
  ccpm enable quality-mcp mysql-mcp        several at once
  ccpm enable quality-mcp --scope project  the copy installed in this project`,
    does: '  1. Run claude plugin enable for disabled plugins\n  2. Leave already-enabled ones alone',
    doesNot: '  - Install plugins (use ccpm install first)\n  - Change settings',
    faq: `  Q: Enabled but nothing changed?
  A: Restart Claude Code (close it and open it again).`,
  }),
  disable: ({
    name: 'disable', summary: 'disable plugins',
    purpose: '  Turn plugins off for now: they stay installed and configured, but Claude Code does not load them. Use ccpm enable to bring them back.',
    usage: '  ccpm disable <plugin...>',
    args: '  <plugin...>   one or more installed plugins',
    options: MUTATING_OPTS,
    examples: `  ccpm disable browser-mcp   stop using this plugin for now
  ccpm disable a b           several at once`,
    does: '  1. Run claude plugin disable for enabled plugins\n  2. Leave already-disabled ones alone',
    doesNot: '  - Remove plugins or delete settings\n  - Get undone by ccpm sync / update',
    faq: `  Q: Disable or remove?
  A: Disable keeps the plugin and its settings (ccpm enable brings it back); ccpm remove uninstalls it.`,
  }),
  remove: ({
    name: 'remove', summary: 'remove plugins or a whole preset',
    purpose: '  Remove a plugin. If it belongs to one of your presets, ccpm remembers, so ccpm sync will not reinstall it.\n  You can also remove a whole preset: its plugins are removed and it is no longer one of your presets.',
    usage: '  ccpm remove <plugin or preset...>',
    args: '  <plugin or preset...>   one or more, mixed freely; presets are global only',
    options: MUTATING_OPTS,
    examples: `  ccpm remove browser-mcp             remove this plugin
  ccpm remove data-deploy --dry-run   see what would happen
  ccpm remove data                    remove the whole data preset
  ccpm remove data --dry-run          see which preset plugins go and which stay
  ccpm remove mysql-mcp prd-builder   several at once, one confirmation`,
    does: "  Removing plugins:\n  1. Show which plugins depend on them and ask you to confirm\n  2. Remove them\n  3. Remember preset plugins in ccpm.json so sync does not reinstall them\n  Removing a preset:\n  1. List what will be removed and what stays, and ask (default no)\n  2. Remove the preset's plugins and their dependencies\n  3. Drop the preset from ccpm.json",
    doesNot: '  - Remove the plugins that depend on what you remove\n  - When removing a preset, remove plugins another chosen preset includes, or that other plugins still need\n  - Touch plugins from other sources',
    faq: `  Q: It came back after I removed it?
  A: An installed plugin still depends on it, so ccpm sync reinstalls it. Remove that plugin too.
  Q: I want it back?
  A: Run ccpm install <plugin>; ccpm forgets that you removed it.`,
  }),
  check: ({
    name: 'check', summary: 'check a marketplace',
    purpose: "  For marketplace authors: check that every plugin's plugin.json and presets.json use what ccpm supports.\n  Good for the marketplace repository's CI.",
    usage: '  ccpm check [folder]',
    args: '  [folder]   root of the marketplace repository, defaults to the current folder',
    options: '  none',
    examples: `  ccpm check                run it in the marketplace repository root
  ccpm check ../my-plugins  check another folder`,
    does: '  1. Read .claude-plugin/marketplace.json and each plugin.json\n  2. Check presets.json (plugins exist, no loops, no name clash with plugins)\n  3. List every problem and exit 1, or exit 0',
    doesNot: '  - Call Claude Code\n  - Change any file',
    faq: `  Q: Is a missing presets.json an error?
  A: No, presets are optional.`,
  }),
  log: ({
    name: 'log', summary: 'show where the diagnostic log is',
    purpose: '  When something odd happens, send the log file to the maintainers so they can see what went on.',
    usage: '  ccpm log',
    args: '  none',
    options: '  none',
    examples: `  ccpm log                  print today's log file and the log folder
  ccpm sync --verbose       also print the log to the screen while running`,
    does: '  Prints paths only; does not call Claude Code',
    doesNot: '  - Log sensitive values (tokens, passwords…)\n  - Upload anything; you send the file yourself',
    faq: `  Q: How long are logs kept?
  A: One file per day, kept 14 days; older ones are deleted automatically.`,
  }),
  help: ({
    name: 'help', summary: 'show help',
    purpose: '  The overview, a command in detail, the concepts or the troubleshooting guide.',
    usage: '  ccpm help\n  ccpm help <command>\n  ccpm help concepts\n  ccpm help troubleshooting\n  ccpm <command> --help',
    args: '  <command>   use, ui, status, list, install, sync, update, config, enable, disable, remove, check, log, help',
    options: '  none',
    examples: `  ccpm help install            install in detail
  ccpm help concepts           presets, global vs project, and more
  ccpm help troubleshooting    common errors and fixes`,
    does: '  Prints help only; does not call Claude Code',
    doesNot: '  - Change anything',
    faq: `  Q: Too much to read?
  A: Start with "Common tasks" in ccpm help, then ccpm help <command> when you need it.`,
  }),
};

export const CONCEPTS = `ccpm concepts

Presets
  A preset is a group of plugins, written by the marketplace author in presets.json at the repository root.
  Without presets.json, ccpm shows no presets and everything else works as usual.
  ccpm install <preset> installs all its plugins and remembers that you chose it;
  when the preset gains plugins later, ccpm sync installs them. ccpm status shows every preset and whether it is complete.

Global vs current project (--scope)
  Global (--scope user, default): the plugin works in every project.
  Current project (--scope project): the plugin works only in the project in the current folder.
  Presets are global only; with --scope project, ccpm only handles dependencies, updates and settings of the project's plugins.

What ccpm.json records
  File: ~/.claude/ccpm.json. Three things:
  current  the marketplace being managed; and for each marketplace:
  presets  the presets you chose; excluded  plugins you removed with ccpm remove and do not want back.
  If the file is damaged, ccpm backs it up as ccpm.json.bak and starts fresh.

Dependencies
  Plugins can depend on other plugins. ccpm installs dependencies first;
  ccpm sync installs missing ones and offers to remove the ones nothing needs any more.

Why sensitive settings are hidden
  Tokens and passwords are not shown while you type; paste and press Enter.
  They go to Claude Code only through standard input, never on the command line or in the diagnostic log.

Why restart Claude Code
  Claude Code loads plugins when it starts. After installing, updating or changing settings,
  close Claude Code and open it again.

When ccpm skips a plugin
  - With --yes or in a script, a plugin with required settings → skipped; you are told to run ccpm install / ccpm config
  - A required setting left empty twice → skipped
  - A dependency failed to install → skipped
  - A preset lists a plugin that was removed from the marketplace → skipped with a note
  Skipped plugins are listed in the final summary with what to do.`;

export const TROUBLE = `ccpm troubleshooting (error → cause → fix)

claude command not found
  Cause: Claude Code is not installed, or the terminal window was opened before it was.
  Fix: install Claude Code, open a new terminal window, and check with claude --version.

Claude Code is too old; please upgrade it
  Cause: ccpm needs a recent claude plugin configure --values-stdin.
  Fix: run claude update.

could not add marketplace <name>
  Cause: git has no credentials for the marketplace repository (the error mentions unable to get password /
         Authentication failed), or the network is down.
  Fix: on macOS run git config --global credential.helper osxkeychain;
       on Windows install Git Credential Manager; then git clone the marketplace repository once by hand,
       enter your credentials and retry. For network problems, check your VPN.

no marketplace chosen yet / marketplace was removed from Claude Code
  Cause: first use, or several marketplaces are added to Claude Code.
  Fix: run ccpm use <source or name>; ccpm use with no argument lists the added ones to pick from.

could not fetch the latest plugin list
  Cause: network / VPN is down, or git credentials expired.
  Fix: check the network and retry. ccpm status still works from the local copy.

argument contains unsafe characters
  Cause: on Windows, a plugin name or argument contains special characters (such as & | ").
  Fix: check the spelling; use only letters, digits, - _ . @.

missing required setting, skipped
  Cause: --yes or a script could not ask for the setting, or it was left empty.
  Fix: in a terminal window run the command the summary suggests, e.g. ccpm install <plugin> or ccpm config <plugin>.

Commands are slow
  Cause: each step calls claude, which takes 1–2 s per call on Windows; checking MCP servers is the slowest.
  Fix: this is normal; the screen shows progress. A slow network also slows down fetching the plugin list.

Reporting a problem
  Run ccpm log to find today's log file and send it to the maintainers. It contains no tokens or passwords.`;

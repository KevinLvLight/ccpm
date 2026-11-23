// English help text. help.js picks it for the English UI; README.md's usage section is generated from it.

export const LABELS = ['Purpose', 'Usage', 'Arguments', 'Options', 'Examples', 'What it does', 'What it does not do', 'FAQ'];

const SCENARIOS = `Common tasks:
  Manage plugins:       ccpm                         open the local Web manager
  First time:           ccpm use owner/repo          add or select a marketplace
  Check the state:      ccpm status
  List plugins:         ccpm list
  Update the manager:   ccpm upgrade
  Update Claude Code:   ccpm cc-update`;

export const OVERVIEW = `Claude Code Plugin Manager

ccpm manages Claude Code marketplaces, plugins, and settings through a local Web manager.
Run ccpm with no command to open it in a browser; all plugin changes are confirmed and run there.

Usage: ccpm [command] [options]

${SCENARIOS}

Commands:
  web                    open the local Web manager (default)
  use [marketplace]      add or select the marketplace used by status/list
  status                 full state for the current marketplace
  list                   list plugins in the current marketplace
  upgrade                update Claude Code Plugin Manager (ccpm itself)
  cc-update [version]    safely update Claude Code itself
  check [folder]         check marketplace plugins and presets.json
  log                    show the diagnostic-log location
  help [command|topic]   show help, e.g. ccpm help cc-update

Options:
  --dry-run              preview updates or Web changes only
  -y, --yes              non-interactive; with no command, same as ccpm status
  --scope user|project   global (user, default) or current-project status/list scope
  --marketplace <name>   use another added marketplace for this status/list run
  --port <port>          Web server port (defaults to an available port)
  --no-open              do not open the browser after starting Web
  --tries <1-50>         maximum stable versions cc-update attempts (default: 5)
  --verbose              also print diagnostic logs to the screen
  -h, --help             show help; ccpm <command> --help shows command details

Safety:
  Sensitive settings travel only through --values-stdin, never argv, logs, or the page.
  Web listens only on 127.0.0.1 and creates a new access token every time it starts.

More help:
  ccpm help concepts         marketplaces, scopes, and update semantics
  ccpm help troubleshooting  common errors and fixes`;

export const COMMANDS = {
  web: {
    name: 'web', summary: 'open the local Web manager',
    purpose: '  Manage marketplaces, plugins, and settings in a browser. It is the only entry point for plugin changes.',
    usage: '  ccpm web [--port <port>] [--no-open]', args: '  none',
    options: '  --port <port>          use this port (default: a random free port)\n  --no-open              do not open the browser; print the link\n  --dry-run              preview page changes only\n  --scope user|project   initial page scope',
    examples: '  ccpm\n  ccpm web --no-open\n  ccpm web --dry-run',
    does: '  1. Starts a token-protected page on 127.0.0.1 only\n  2. Shows plugins, live activity, and results\n  3. Confirms plugin changes and marketplace removal in the page',
    doesNot: '  - Open anything to your network\n  - Show or log tokens, passwords, or other sensitive settings\n  - Change the CLI default marketplace',
    faq: '  Q: The browser did not open?\n  A: Copy the printed link into a browser. It contains an access token, so do not share it.',
  },
  use: {
    name: 'use', summary: 'add or select the marketplace used by CLI queries',
    purpose: '  Set the default marketplace for ccpm status and ccpm list. A Web-page choice does not change it.',
    usage: '  ccpm use <source or name>\n  ccpm use\n  ccpm use --show', args: '  <source or name>   GitHub owner/repo, git URL, local path, or an added marketplace name',
    options: '  --show                 show only the selected marketplace', examples: '  ccpm use owner/repo\n  ccpm use ./my-marketplace\n  ccpm use --show',
    does: '  1. Adds a marketplace when needed\n  2. Saves the default used by status/list', doesNot: '  - Install, update, or remove plugins\n  - Delete other marketplaces',
    faq: '  Q: I only want to browse and manage plugins.\n  A: Run ccpm and select a marketplace in the Web manager.',
  },
  status: {
    name: 'status', summary: 'full state for the current marketplace', purpose: '  Print installed plugins, available updates, configuration issues, and preset state for scripts and diagnostics.',
    usage: '  ccpm status', args: '  none', options: '  --scope user|project\n  --marketplace <name>\n  --verbose', examples: '  ccpm status\n  ccpm status --scope project\n  ccpm --yes',
    does: '  1. Reads the marketplace and installed plugins\n  2. Prints state and next steps', doesNot: '  - Change plugins, settings, or marketplaces',
    faq: '  Q: How do I resolve a reported issue?\n  A: Run ccpm and resolve it in the Web manager.',
  },
  list: {
    name: 'list', summary: 'list plugins in the current marketplace', purpose: '  Print plugin names, versions, and installation state for scripts and quick inspection.',
    usage: '  ccpm list', args: '  none', options: '  --scope user|project\n  --marketplace <name>\n  --verbose', examples: '  ccpm list\n  ccpm list --scope project',
    does: '  Reads and prints the current marketplace plugin list.', doesNot: '  - Install, update, or change any plugin',
    faq: '  Q: How do I install or update a plugin?\n  A: Run ccpm and use the Web manager.',
  },
  upgrade: {
    name: 'upgrade', summary: 'update Claude Code Plugin Manager', purpose: '  Query npm for the latest ccpm version and, after confirmation, install it globally. This updates the manager, not Claude Code.',
    usage: '  ccpm upgrade', args: '  none', options: '  --dry-run              show the version without installing\n  -y, --yes              use the default confirmation', examples: '  ccpm upgrade\n  ccpm upgrade --dry-run',
    does: '  1. Queries npm for the latest package version\n  2. Runs npm install -g after confirmation', doesNot: '  - Update Claude Code itself\n  - Manage plugins',
    faq: '  Q: How do I update Claude Code?\n  A: Use ccpm cc-update or the Web Updates page.',
  },
  'cc-update': {
    name: 'cc-update', summary: 'safely update Claude Code', purpose: '  Update Claude Code installed globally by npm. The new version is verified; if all candidates fail, ccpm tries to restore the prior working version.',
    usage: '  ccpm cc-update [version] [--tries <1-50>]', args: '  [version]   an exact stable version (x.y.z); without one, start from the latest stable release',
    options: '  --tries <1-50>         maximum stable versions to attempt; default: 5\n  --dry-run              show candidates without installing\n  -y, --yes              use the default confirmation', examples: '  ccpm cc-update\n  ccpm cc-update 2.1.112\n  ccpm cc-update --tries 3 --dry-run',
    does: '  1. Queries npm for stable versions\n  2. Installs each candidate and validates it with claude --version\n  3. Tries to restore the original version if no candidate works',
    doesNot: '  - Update ccpm itself (use ccpm upgrade)\n  - Delete npm directories or change Claude Code auto-update settings',
    faq: '  Q: Can I do this from the page?\n  A: Yes. Select Update Claude Code in the Web Updates page.',
  },
  check: {
    name: 'check', summary: 'check a marketplace', purpose: '  For marketplace authors: validate plugin.json and presets.json against the format ccpm supports.',
    usage: '  ccpm check [folder]', args: '  [folder]   marketplace repository root; defaults to the current directory', options: '  none', examples: '  ccpm check\n  ccpm check ../my-marketplace',
    does: '  Validates metadata, plugin references, and preset cycles; exits 1 for problems.', doesNot: '  - Call Claude Code\n  - Change files', faq: '  Q: Is a missing presets.json an error?\n  A: No. Presets are optional.',
  },
  log: {
    name: 'log', summary: 'show the diagnostic-log location', purpose: '  Print today’s log file and its directory for troubleshooting.', usage: '  ccpm log', args: '  none', options: '  none', examples: '  ccpm log',
    does: '  Prints paths only.', doesNot: '  - Upload logs\n  - Record sensitive-setting values', faq: '  Q: How long are logs retained?\n  A: One file per day, for 14 days.',
  },
  help: {
    name: 'help', summary: 'show help', purpose: '  Show the overview, command details, concepts, or troubleshooting guide.', usage: '  ccpm help\n  ccpm help <command>\n  ccpm help concepts\n  ccpm help troubleshooting',
    args: '  <command>   web, use, status, list, upgrade, cc-update, check, log, help', options: '  none', examples: '  ccpm help cc-update\n  ccpm help troubleshooting',
    does: '  Prints help only.', doesNot: '  - Call Claude Code\n  - Change anything', faq: '  Q: Where is help for plugin actions?\n  A: Run ccpm and perform the action in the page.',
  },
};

export const CONCEPTS = `ccpm concepts

Web-first
  ccpm is a local Web manager. Plugin installation, updates, configuration, enable/disable, removal, and marketplace removal happen in Web;
  the command line keeps status, list, check, log, and maintenance commands for scripts and diagnostics.

ccpm upgrade vs ccpm cc-update
  ccpm upgrade updates Plugin Manager (ccpm) itself.
  ccpm cc-update updates Claude Code installed globally by npm. It verifies a new version and tries to restore the original version if needed.

Global vs current project (--scope)
  user (default) sees global installation; project sees plugins for the project in the current directory.

Sensitive settings
  Tokens and passwords travel only through --values-stdin, never through command-line arguments, logs, or Web activity.`;

export const TROUBLE = `ccpm troubleshooting (error → cause → fix)

claude command not found
  Install Claude Code, open a new terminal, and confirm with claude --version.

Cannot open the Web page
  Keep the terminal that runs ccpm open, then reopen the local link printed there.

cc-update cannot find Claude Code
  cc-update manages only globally npm-installed Claude Code. Check npm root -g and the npm package location.

Update failed
  Check the network and npm registry. Use --dry-run to inspect candidates first. cc-update tries to restore the prior version after candidate failures.

Reporting a problem
  Run ccpm log to find the log file. It contains no tokens or passwords.`;

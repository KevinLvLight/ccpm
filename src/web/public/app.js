// ccpm web page. Data from the server is inserted with textContent only (marketplace text is untrusted);
// innerHTML is used solely for the constant icon set below.
(() => {
  // ---------- token: comes in the URL once, kept for this tab ----------
  const q = new URLSearchParams(location.search);
  let token = q.get('t');
  try {
    if (token) sessionStorage.setItem('ccpm-token', token);
    else token = sessionStorage.getItem('ccpm-token');
  } catch {}
  if (q.has('t')) history.replaceState(null, '', location.pathname);

  // ---------- helpers ----------
  const $ = (id) => document.getElementById(id);
  const ICONS = {
    package: '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
    compass: '<circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z"/>',
    layers: '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
    store: '<path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v11h16V9"/><path d="M3 9h18"/><path d="M9 20v-6h6v6"/>',
    refresh: '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/>',
    updown: '<path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>',
    chevronUp: '<path d="m18 15-6-6-6 6"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    folderOpen: '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    dots: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    up: '<circle cx="12" cy="12" r="10"/><path d="m16 12-4-4-4 4"/><path d="M12 16V8"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    power: '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    sliders: '<path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    chevronLeft: '<path d="m15 18-6-6 6-6"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  };
  const icon = (name) => {
    const t = document.createElement('template');
    t.innerHTML = `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] ?? ''}</svg>`;
    return t.content.firstChild;
  };
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') n.className = v;
      else if (k === 'on') Object.entries(v).forEach(([e, f]) => n.addEventListener(e, f));
      else if (k === 'vars') Object.entries(v).forEach(([p, val]) => n.style.setProperty(p, val));
      else if (v !== undefined && v !== false && v !== null) n.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat(Infinity)) if (c != null && c !== false) n.append(c instanceof Node ? c : String(c));
    return n;
  };
  let T = {};
  const fmt = (s, ...a) => String(s ?? '').replace(/\{(\d+)\}/g, (m, i) => (i < a.length ? a[i] : m));
  const stop = (f) => (e) => { e.stopPropagation(); f(e); };

  const post = (path, body = {}) => fetch(path, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-ccpm-token': token }, body: JSON.stringify(body),
  });
  const answer = (id, value) => post('/api/answer', { id, value });

  // ---------- state ----------
  let S = null; // latest state from the server
  const ui = { page: 'installed', query: '', market: '', tab: 'plugins', drawer: null, menu: null, modal: null, logOpen: false, dismissedOp: null, shownMessage: null };
  // several actions in a row (e.g. update in every marketplace): the server does one at a time
  const queue = [];
  let sending = false;
  const run = (cmd, names = [], market) => { queue.push({ cmd, names, market }); pump(); };
  async function pump() {
    if (sending || !S || S.busy || S.dialog || !queue.length) return;
    sending = true;
    ui.current = queue.shift();
    try { await post('/api/run', ui.current); } finally { sending = false; }
  }
  const go = (page, market = '') => { Object.assign(ui, { page, market, query: '', tab: 'plugins' }); render(); };
  const select = (sel) => { closeMenu(); post('/api/select', sel); };

  // ---------- derived data ----------
  const markets = () => S?.markets ?? [];
  const plugins = () => Object.entries(S?.models ?? {}).flatMap(([market, m]) => m.plugins.map((p) => ({ ...p, market })));
  const presets = () => Object.entries(S?.models ?? {}).flatMap(([market, m]) => m.presets.map((p) => ({ ...p, market })));
  const project = () => S?.selection.scope === 'project';
  const folderName = (p) => String(p).split(/[\\/]/).filter(Boolean).pop() ?? p;
  const placeName = () => (project() ? folderName(S.selection.dirLabel) : T.allProjects);
  const loading = () => !S?.markets || (S.busy && !Object.keys(S.models ?? {}).length);
  const statusOf = (p) => (p.delisted ? 'removed' : p.missingConfig?.length ? 'config' : p.missingDeps?.length ? 'deps' : p.update ? 'update' : p.enabled === false ? 'off' : 'ok');
  const STATUS = () => ({
    update: ['blue', 'up', T.sUpdate], config: ['amber', 'alert', T.sConfig], deps: ['amber', 'alert', T.sDeps],
    off: ['', 'power', T.sOff], removed: ['red', 'alert', T.sRemoved],
  });
  const matches = (x) => {
    const f = ui.query.trim().toLowerCase();
    return !f || `${x.name} ${x.description ?? ''}`.toLowerCase().includes(f);
  };
  // a stable colour per name
  const hue = (s) => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const tile = (name, lg) => el('div', { class: `tile${lg ? ' lg' : ''}`, vars: { '--h': hue(name) }, 'aria-hidden': 'true' }, String(name).replace(/[^a-z0-9]/gi, '').charAt(0) || '?');

  // ---------- sidebar ----------
  function renderSide() {
    const plist = plugins();
    const installed = plist.filter((p) => p.where === 'here');
    const issues = installed.filter((p) => ['config', 'deps', 'update', 'removed'].includes(statusOf(p))).length;
    const nav = (page, ico, label, count, dot, market = '') => el('button', {
      class: `nav${market ? ' sub' : ''}`, 'aria-current': ui.page === page && ui.market === market ? 'page' : null,
      on: { click: () => go(page, market) },
    }, ico ? icon(ico) : null, el('span', { class: 'label' }, label), dot ? el('span', { class: 'dot', title: T.needsAttention }) : null, count != null ? el('span', { class: 'count' }, count) : null);
    $('side').replaceChildren(
      el('div', { class: 'logo' }, el('span', { class: 'mark' }, icon('package')), 'ccpm', S?.dryRun ? el('small', {}, T.dryRun) : null),
      el('div', { class: 'place' },
        el('button', { class: 'place-btn', 'aria-haspopup': 'menu', on: { click: (e) => openPlaceMenu(e.currentTarget) } },
          el('span', { class: 'ico' }, icon(project() ? 'folder' : 'globe')),
          el('span', { class: 'txt' },
            el('span', { class: 'k' }, T.placeIn),
            el('span', { class: 'v' }, S ? placeName() : '…'),
            el('span', { class: 's' }, S ? (project() ? S.selection.dirLabel : T.allProjectsHint) : '')),
          icon('updown'))),
      nav('installed', 'package', T.installed, installed.length, issues > 0),
      nav('markets', 'store', T.markets, markets().length),
      ...markets().map((m) => nav('market', null, m.name, m.total, false, m.name)),
      el('div', { class: 'side-foot' }, S?.checking ? el('span', { class: 'spin', vars: { width: '12px', height: '12px', 'border-width': '1.5px' } }) : null,
        el('span', {}, S?.checking ? T.checking : S?.busy ? T.working : T.upToDate),
        el('button', { class: 'btn ghost sm', disabled: !S || S.busy || S.checking, on: { click: () => post('/api/rescan') } }, icon('refresh'), T.recheck)),
    );
  }

  // ---------- menus ----------
  function closeMenu() { ui.menu = null; renderLayer(); }
  function openMenu(anchor, items) {
    const r = anchor.getBoundingClientRect();
    ui.menu = { items, x: r.left, y: r.bottom + 6 };
    renderLayer();
  }
  function openPlaceMenu(anchor) {
    const sel = S?.selection;
    const two = (a, b) => el('span', { class: 'two' }, el('span', {}, a), b ? el('small', {}, b) : null);
    openMenu(anchor, [
      el('div', { class: 'label' }, T.placeWhere),
      el('button', { role: 'menuitemradio', 'aria-checked': String(!project()), on: { click: () => (project() ? select({ scope: 'user' }) : closeMenu()) } },
        icon('globe'), two(T.allProjectsLong, T.allProjectsHint)),
      el('hr'),
      el('div', { class: 'label' }, T.projectOnly),
      ...(S?.projects ?? []).slice(0, 12).map((p) => el('button', {
        role: 'menuitemradio', 'aria-checked': String(project() && sel.dir === p.path), title: p.path,
        on: { click: () => select({ scope: 'project', dir: p.path }) },
      }, icon('folder'), two(folderName(p.label), p.label), p.installed ? el('span', { class: 'n' }, fmt(T.installedN, p.installed)) : null)),
      el('button', { on: { click: () => { closeMenu(); openFolder(project() ? sel.dir : ''); } } }, icon('folderOpen'), two(T.otherFolder)),
    ]);
  }
  function pluginMenu(anchor, p) {
    const item = (ico, label, f, cls) => el('button', { class: cls, on: { click: () => { closeMenu(); f(); } } }, icon(ico), label);
    const items = [item('info', T.details, () => openDrawer(p))];
    if (p.where === 'here') {
      if (p.hasConfig) items.push(item('sliders', T.changeConfig, () => run('config', [p.name], p.market)));
      items.push(p.enabled === false ? item('power', T.enable, () => run('enable', [p.name], p.market)) : item('power', T.disable, () => run('disable', [p.name], p.market)));
      items.push(el('hr'), item('trash', T.remove, () => run('remove', [p.name], p.market), 'danger'));
    }
    openMenu(anchor, items);
  }

  // ---------- the action a plugin most needs ----------
  function primaryAction(p, { sm = true } = {}) {
    const b = (label, cmd, names = [p.name], cls = '') => el('button', {
      class: `btn ${sm ? 'sm ' : ''}${cls}`, disabled: S.busy, on: { click: stop(() => run(cmd, names, p.market)) },
    }, label);
    if (p.where === 'none') return b(T.install, 'install', [p.name], 'primary');
    if (p.where === 'global') return project() ? b(T.installHere, 'install') : null;
    return {
      update: () => b(T.update, 'update', [p.name], 'primary'), config: () => b(T.fillConfig, 'config', [p.name], 'primary'),
      deps: () => b(T.fixDeps, 'sync', []), off: () => b(T.enable, 'enable'), removed: () => b(T.remove, 'remove', [p.name], 'danger'), ok: () => null,
    }[statusOf(p)]();
  }
  const statusBadge = (p) => {
    if (p.where !== 'here') return null;
    const s = STATUS()[statusOf(p)];
    return s ? el('span', { class: `badge ${s[0]}` }, icon(s[1]), s[2]) : null;
  };
  const src = (market) => el('span', { class: 'src' }, icon('store'), market);

  // ---------- pages ----------
  const head = (title, sub, tools = []) => el('div', { class: 'page-head' }, el('div', {}, el('h1', {}, title), sub ? el('p', {}, sub) : null), el('div', { class: 'tools' }, tools));
  const searchBox = (placeholder) => {
    const input = el('input', { type: 'search', placeholder, value: ui.query, 'aria-label': placeholder });
    input.addEventListener('input', () => { ui.query = input.value; renderMain({ keepFocus: true }); });
    return el('div', { class: 'search' }, icon('search'), input);
  };
  const empty = (ico, title, hint, action) => el('div', { class: 'empty' }, el('div', { class: 'ico' }, icon(ico)), el('b', {}, title), hint ? el('span', {}, hint) : null, action);
  const loadingList = () => el('div', { class: 'list' }, [1, 2, 3, 4].map(() => el('div', { class: 'skeleton' })));

  function pluginItem(p, { market = true } = {}) {
    const readonly = p.where === 'global';
    return el('div', { class: `item${readonly ? ' readonly' : ''}`, on: { click: () => openDrawer(p) } },
      tile(p.name),
      el('div', { class: 'main' },
        el('div', { class: 'title' }, el('span', { class: 'name' }, p.name), statusBadge(p)),
        el('div', { class: 'desc' }, p.description || '')),
      el('div', { class: 'meta' },
        market ? src(p.market) : null,
        el('span', { class: 'ver' }, p.update && p.where === 'here' ? `${p.update.from} → ${p.update.to}` : p.version ?? p.latest ?? ''),
        el('div', { class: 'acts' },
          primaryAction(p),
          p.where === 'here' ? el('button', { class: 'btn ghost sm icon', 'aria-label': T.more, disabled: S.busy, on: { click: stop((e) => pluginMenu(e.currentTarget, p)) } }, icon('dots')) : null)));
  }

  function pageInstalled() {
    const all = plugins();
    const here = all.filter((p) => p.where === 'here');
    const global = project() ? all.filter((p) => p.where === 'global') : [];
    const out = [head(T.installed, loading() ? '' : fmt(T.installedSub, placeName(), here.length), [searchBox(T.searchInstalled)])];
    if (loading()) return [...out, loadingList()];

    // what needs attention, across every marketplace
    const alerts = [];
    const updates = here.filter((p) => p.update);
    if (updates.length) {
      const byMarket = [...new Set(updates.map((p) => p.market))];
      alerts.push(el('div', { class: 'alert blue' }, el('div', { class: 'ico' }, icon('up')),
        el('div', { class: 'body' }, el('b', {}, fmt(T.updatesN, updates.length)), el('span', {}, updates.map((p) => p.name).join(', '))),
        el('button', { class: 'btn primary sm', disabled: S.busy, on: { click: () => byMarket.forEach((m) => run('update', [], m)) } }, T.updateAll)));
    }
    const needConfig = here.filter((p) => p.missingConfig?.length);
    if (needConfig.length) {
      const one = needConfig[0];
      alerts.push(el('div', { class: 'alert amber' }, el('div', { class: 'ico' }, icon('sliders')),
        el('div', { class: 'body' }, el('b', {}, needConfig.length === 1 ? fmt(T.configOne, one.name, one.missingConfig.length) : fmt(T.configMany, needConfig.length)), el('span', {}, T.configHint)),
        el('button', { class: 'btn sm', disabled: S.busy, on: { click: () => needConfig.forEach((p) => run('config', [p.name], p.market)) } }, T.fillIn)));
    }
    const needDeps = here.filter((p) => p.missingDeps?.length);
    if (needDeps.length) {
      alerts.push(el('div', { class: 'alert amber' }, el('div', { class: 'ico' }, icon('alert')),
        el('div', { class: 'body' }, el('b', {}, fmt(T.depsN, needDeps.length)), el('span', {}, needDeps.map((p) => `${p.name} → ${p.missingDeps.join(', ')}`).join(' · '))),
        el('button', { class: 'btn sm', disabled: S.busy, on: { click: () => [...new Set(needDeps.map((p) => p.market))].forEach((m) => run('sync', [], m)) } }, T.fixDeps)));
    }
    if (alerts.length && !ui.query) out.push(el('div', { class: 'alerts' }, alerts));

    const shown = here.filter(matches);
    const g = global.filter(matches);
    if (!here.length && !global.length) {
      out.push(empty('package', T.emptyInstalled, T.emptyInstalledHint, el('button', { class: 'btn primary', on: { click: () => go(markets().length === 1 ? 'market' : 'markets', markets().length === 1 ? markets()[0].name : '') } }, icon('store'), T.browseMarkets)));
    } else if (!shown.length && !g.length) {
      out.push(empty('search', T.noMatch));
    } else {
      if (shown.length) {
        out.push(el('section', { class: 'group' },
          project() ? el('div', { class: 'group-head' }, el('h2', {}, T.inThisProject)) : null,
          el('div', { class: 'list' }, shown.map(pluginItem))));
      } else if (project() && !ui.query) {
        out.push(el('section', { class: 'group' }, el('div', { class: 'group-head' }, el('h2', {}, T.inThisProject)),
          empty('folder', T.emptyProject, T.emptyProjectHint, el('button', { class: 'btn primary', on: { click: () => go(markets().length === 1 ? 'market' : 'markets', markets().length === 1 ? markets()[0].name : '') } }, icon('store'), T.browseMarkets))));
      }
      if (g.length) {
        out.push(el('section', { class: 'group' }, el('div', { class: 'group-head' }, el('h2', {}, T.globalAlso), el('span', {}, T.globalAlsoHint)),
          el('div', { class: 'list' }, g.map(pluginItem))));
      }
    }
    return out;
  }

  function bundleGrid(list) {
    return el('div', { class: 'grid' }, list.map((b) => {
      const done = b.got >= b.want;
      const on = b.chosen || b.via;
      const acts = [];
      if (!done) acts.push(el('button', { class: 'btn primary sm', disabled: S.busy, on: { click: () => run('install', [b.name], b.market) } }, icon('download'), T.installBundle));
      if (on || b.got) acts.push(el('button', { class: 'btn ghost sm danger', disabled: S.busy, on: { click: () => run('remove', [b.name], b.market) } }, T.removeBundle));
      return el('div', { class: 'card bundle' },
        el('div', { class: 'top' }, el('div', { class: 'tile', vars: { '--h': hue(b.name) } }, icon('layers')),
          el('div', { vars: { flex: '1', 'min-width': '0' } }, el('div', { class: 'name' }, b.name), el('div', { class: 'muted' }, b.description || '')),
          on ? el('span', { class: 'badge accent', title: b.via ? fmt(T.viaBundle, b.via) : '' }, icon('check'), T.bundleChosen) : null),
        el('div', {}, el('div', { class: `progress${done ? ' done' : ''}` }, el('i', { vars: { width: `${b.want ? Math.round((b.got / b.want) * 100) : 0}%` } })),
          el('div', { class: 'muted', vars: { 'font-size': '12px', 'margin-top': '6px' } }, fmt(T.bundleProgress, b.got, b.want))),
        el('div', { class: 'members' }, b.members.map((m) => (m.kind === 'preset'
          ? el('span', { class: 'member' }, icon('layers'), fmt(T.includesBundle, m.name))
          : el('span', { class: `member${m.installed ? ' on' : ''}`, title: m.excluded ? T.removedByYou : '' }, m.installed ? icon('check') : null, m.name)))),
        acts.length ? el('div', { class: 'foot' }, el('span', { vars: { 'margin-left': 'auto', display: 'flex', gap: '6px' } }, acts)) : null);
    }));
  }

  // one marketplace: what it is, its plugins, its bundles
  function pageMarket() {
    const m = markets().find((x) => x.name === ui.market);
    if (!m) { ui.page = 'markets'; ui.market = ''; return pageMarkets(); }
    const list = plugins().filter((p) => p.market === m.name && !(p.delisted && p.where === 'none'));
    const bundles = presets().filter((b) => b.market === m.name);
    const stat = (n, label) => el('div', {}, el('b', {}, n), el('span', {}, label));
    const out = [
      el('button', { class: 'btn ghost sm back', on: { click: () => go('markets') } }, icon('chevronLeft'), T.markets),
      el('div', { class: 'market-head' },
        el('div', { class: 'tile lg', vars: { '--h': hue(m.name) } }, icon('store')),
        el('div', { class: 'main' }, el('h1', {}, m.name), m.source ? el('p', { class: 'mono' }, m.source) : null),
        el('div', { class: 'stats' }, stat(m.installed, T.mInstalled), stat(m.total, T.mTotal), bundles.length ? stat(bundles.length, T.bundles) : null)),
    ];
    if (m.error) out.push(el('div', { class: 'alerts' }, el('div', { class: 'alert red' }, el('div', { class: 'ico' }, icon('alert')), el('div', { class: 'body' }, el('b', {}, fmt(T.marketError, m.error))))));
    const tab = (key, label, n) => el('button', { role: 'tab', 'aria-selected': String(ui.tab === key), on: { click: () => { ui.tab = key; ui.query = ''; renderMain(); } } }, label, el('span', { class: 'count' }, n));
    out.push(el('div', { class: 'tabs-row' },
      el('div', { class: 'tabs', role: 'tablist' }, tab('plugins', T.tabPlugins, list.length), tab('bundles', T.bundles, bundles.length)),
      ui.tab === 'plugins' || !project() ? searchBox(ui.tab === 'plugins' ? T.searchAll : T.searchBundles) : null));
    if (loading()) return [...out, loadingList()];
    if (ui.tab === 'plugins') {
      const shown = list.filter(matches);
      out.push(!list.length ? empty('package', T.emptyMarketPlugins) : !shown.length ? empty('search', T.noMatch)
        : el('div', { class: 'list' }, shown.map((p) => pluginItem(p, { market: false }))));
      return out;
    }
    out.push(el('p', { class: 'muted tab-hint' }, T.bundlesSub));
    if (project()) {
      out.push(el('div', { class: 'alerts' }, el('div', { class: 'alert blue' }, el('div', { class: 'ico' }, icon('info')),
        el('div', { class: 'body' }, el('b', {}, T.bundlesGlobalOnly), el('span', {}, T.allProjectsHint)),
        el('button', { class: 'btn sm', on: { click: () => select({ scope: 'user' }) } }, T.switchToAll))));
      return out;
    }
    const shown = bundles.filter(matches);
    out.push(!bundles.length ? empty('layers', T.emptyBundles, T.emptyBundlesHint) : !shown.length ? empty('search', T.noMatch) : bundleGrid(shown));
    return out;
  }

  function pageMarkets() {
    const out = [head(T.markets, T.marketsSub, [el('button', { class: 'btn primary', disabled: S?.busy, on: { click: openAdd } }, icon('plus'), T.addMarket)])];
    if (loading()) return [...out, loadingList()];
    if (!markets().length) return [...out, empty('store', T.emptyMarkets, T.emptyMarketsHint)];
    out.push(el('div', { class: 'list' }, markets().map((m) => el('div', { class: 'market item', on: { click: () => go('market', m.name) } },
      el('div', { class: 'tile', vars: { '--h': hue(m.name) } }, icon('store')),
      el('div', { class: 'main' }, el('div', { class: 'name' }, m.name),
        m.error ? el('div', { class: 'desc', vars: { color: 'var(--red)' } }, fmt(T.marketError, m.error)) : el('div', { class: 'desc mono' }, m.source || '')),
      el('div', { class: 'stats' }, el('div', {}, el('b', {}, m.installed), el('span', {}, T.mInstalled)), el('div', {}, el('b', {}, m.total), el('span', {}, T.mTotal)))))));
    return out;
  }

  function renderMain({ keepFocus = false } = {}) {
    const main = $('main');
    const focused = keepFocus && document.activeElement?.type === 'search' ? document.activeElement.selectionStart : null;
    const page = { installed: pageInstalled, market: pageMarket, markets: pageMarkets }[ui.page];
    main.replaceChildren(...(S ? page() : [head(''), loadingList()]));
    if (focused != null) { const s = main.querySelector('input[type="search"]'); s?.focus(); s?.setSelectionRange(focused, focused); }
  }

  // ---------- plugin info: what's inside, what changed (fetched on demand, cached) ----------
  const infos = new Map();
  function infoOf(market, name, onReady) {
    const key = `${market}|${name}|${S.models?.[market]?.plugins.find((p) => p.name === name)?.version ?? ''}`;
    const hit = infos.get(key);
    if (hit && hit !== 'loading') return hit;
    if (!hit) {
      infos.set(key, 'loading');
      fetch(`/api/plugin?t=${encodeURIComponent(token)}&market=${encodeURIComponent(market)}&name=${encodeURIComponent(name)}`)
        .then((r) => (r.ok ? r.json() : { error: true })).catch(() => ({ error: true }))
        .then((v) => { infos.set(key, v); onReady(); });
    }
    return null;
  }
  const KIND = () => ({ skills: T.kSkills, commands: T.kCommands, agents: T.kAgents, hooks: T.kHooks, mcp: T.kMcp, lsp: T.kLsp });
  function contentsSection(info) {
    const box = el('section', { class: 'section' }, el('h4', {}, T.whatsInside));
    if (!info) { box.append(el('div', { class: 'skeleton line' }), el('div', { class: 'skeleton line short' })); return box; }
    if (info.error || (!info.contents && !info.raw)) { box.append(el('p', { class: 'muted small' }, T.noDetails)); return box; }
    if (!info.contents) { box.append(el('pre', { class: 'raw' }, info.raw)); return box; }
    const c = info.contents;
    const kinds = c.components.filter((k) => k.count);
    box.append(el('div', { class: 'kinds' }, kinds.length ? kinds.map((k) => el('div', { class: 'kind' },
      el('div', { class: 'kind-head' }, el('b', {}, fmt(KIND()[k.kind] ?? k.kind, k.count)), k.contextFree ? el('span', { class: 'muted small' }, T.hooksFree) : null),
      el('div', { class: 'names' }, k.names.map((n) => el('span', { class: 'name-chip' }, n))))) : el('p', { class: 'muted small' }, T.noComponents)));
    if (c.alwaysOn) {
      box.append(el('div', { class: 'cost' }, el('span', { class: 'cost-num' }, `${c.alwaysOn}`), el('span', {}, T.alwaysOn)));
    }
    if (c.perComponent.length) {
      box.append(el('details', { class: 'per' }, el('summary', {}, T.perComponent),
        el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, T.component), el('th', {}, T.colAlways), el('th', {}, T.colInvoke))),
          el('tbody', {}, c.perComponent.map((r) => el('tr', {}, el('td', {}, r.name), el('td', {}, r.alwaysOn), el('td', {}, r.onInvoke)))))));
    }
    return box;
  }
  // CHANGELOG text: a light reading of markdown (bullets, sub-headings) as text nodes
  const notes = (text) => {
    const out = [];
    let list = null;
    for (const raw of String(text).split('\n')) {
      const line = raw.trim();
      if (!line) { list = null; continue; }
      const b = line.match(/^[-*]\s+(.*)$/);
      if (b) { if (!list) out.push(list = el('ul', {})); list.append(el('li', {}, b[1].replace(/\*\*|`/g, ''))); continue; }
      list = null;
      out.push(/^#{3,}\s/.test(line) ? el('h5', {}, line.replace(/^#+\s*/, '')) : el('p', {}, line.replace(/\*\*|`/g, '')));
    }
    return out;
  };
  function changelogSection(p, info) {
    if (!(p.where === 'here' && p.update)) return null;
    const box = el('section', { class: 'section' }, el('h4', {}, fmt(T.whatsNew, p.update.from, p.update.to)));
    if (!info) box.append(el('div', { class: 'skeleton line' }));
    else if (!info.changelog?.length) {
      box.append(el('p', { class: 'muted small' }, T.noChangelog));
      if (info.history) box.append(el('a', { class: 'link small', href: info.history, target: '_blank', rel: 'noopener noreferrer' }, T.seeCommits, ' ↗'));
    } else {
      box.append(...info.changelog.map((e) => el('div', { class: 'release' },
        el('div', { class: 'release-v' }, e.unreleased ? T.unreleased : e.version),
        el('div', { class: 'release-notes' }, notes(e.text)))));
    }
    return box;
  }

  // ---------- drawer and menus ----------
  function openDrawer(p) { ui.drawer = { market: p.market, name: p.name }; renderLayer(); }
  function renderLayer() {
    const layer = $('layer');
    const parts = [];
    const p = ui.drawer && plugins().find((x) => x.market === ui.drawer.market && x.name === ui.drawer.name);
    if (ui.drawer && !p) ui.drawer = null;
    if (p) {
      const info = infoOf(p.market, p.name, () => { if (ui.drawer?.name === p.name && !ui.menu) renderLayer(); });
      const close = () => { ui.drawer = null; renderLayer(); };
      const callouts = [];
      if (p.where === 'here' && p.update) callouts.push(el('div', { class: 'callout blue' }, icon('up'), el('span', {}, fmt(T.updateCallout, p.update.to))));
      if (p.missingConfig?.length) callouts.push(el('div', { class: 'callout amber' }, icon('sliders'), el('span', {}, fmt(T.configCallout, p.missingConfig.join(', ')))));
      if (p.missingDeps?.length) callouts.push(el('div', { class: 'callout amber' }, icon('alert'), el('span', {}, fmt(T.depsCallout, p.missingDeps.join(', ')))));
      if (p.where === 'global' && project()) callouts.push(el('div', { class: 'callout blue' }, icon('globe'), el('span', {}, T.globalReadonly)));
      const fact = (k, v) => (v ? [el('dt', {}, k), el('dd', {}, v)] : []);
      const foot = [primaryAction(p, { sm: false })];
      if (p.where === 'here') {
        if (p.hasConfig && statusOf(p) !== 'config') foot.push(el('button', { class: 'btn', disabled: S.busy, on: { click: () => run('config', [p.name], p.market) } }, icon('sliders'), T.changeConfig));
        if (statusOf(p) !== 'off') foot.push(el('button', { class: 'btn', disabled: S.busy, on: { click: () => run(p.enabled === false ? 'enable' : 'disable', [p.name], p.market) } }, icon('power'), p.enabled === false ? T.enable : T.disable));
        if (statusOf(p) !== 'removed') foot.push(el('button', { class: 'btn ghost danger', disabled: S.busy, on: { click: () => run('remove', [p.name], p.market) } }, icon('trash'), T.remove));
      }
      const drawer = el('aside', { class: 'drawer', role: 'dialog', 'aria-label': p.name, tabindex: '-1', on: { keydown: (e) => e.key === 'Escape' && close() } },
        el('header', {}, tile(p.name, true),
          el('div', {}, el('h2', {}, p.name), el('p', {}, [p.market, p.version ?? p.latest].filter(Boolean).join(' · '))),
          el('button', { class: 'btn ghost icon', 'aria-label': T.close, on: { click: close } }, icon('x'))),
        el('div', { class: 'content' },
          p.description ? el('p', { class: 'lead' }, p.description) : null,
          callouts,
          el('dl', { class: 'facts' },
            fact(T.from, p.market),
            fact(T.placeLabel, p.where === 'none' ? T.notInstalled : p.where === 'global' ? T.allProjectsLong : placeName()),
            fact(T.versionInstalled, p.where !== 'none' ? p.version : null),
            fact(T.versionLatest, p.latest),
            fact(T.dependsOn, p.dependencies?.length ? p.dependencies.join(', ') : null)),
          changelogSection(p, info),
          contentsSection(info)),
        foot.some(Boolean) ? el('footer', {}, foot) : null);
      parts.push(el('div', { class: 'scrim', on: { click: close } }), drawer);
      requestAnimationFrame(() => { if (!$('modal').firstChild && !drawer.contains(document.activeElement)) drawer.focus(); }); // 有对话框时不抢焦点
    }
    if (ui.menu) {
      const m = el('div', { class: 'menu', role: 'menu' }, ui.menu.items);
      m.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
      parts.push(el('div', { class: 'scrim', vars: { background: 'transparent' }, on: { click: closeMenu } }), m);
      requestAnimationFrame(() => {
        if (!ui.menu) return;
        m.style.left = `${Math.max(8, Math.min(ui.menu.x, innerWidth - m.offsetWidth - 8))}px`;
        m.style.top = `${Math.max(8, Math.min(ui.menu.y, innerHeight - m.offsetHeight - 8))}px`;
        m.querySelector('button')?.focus();
      });
    }
    layer.replaceChildren(...parts);
  }

  // ---------- activity (what ccpm is doing) ----------
  function ansi(line) {
    const frag = document.createDocumentFragment();
    let cls = new Set();
    for (const part of String(line).split(/(\x1b\[[0-9;]*m)/)) {
      const m = part.match(/^\x1b\[([0-9;]*)m$/);
      if (m) {
        for (const c of (m[1] || '0').split(';')) {
          if (c === '0') cls = new Set();
          else if (c === '1') cls.add('a-b'); else if (c === '2') cls.add('a-d');
          else if (c === '22') { cls.delete('a-b'); cls.delete('a-d'); }
          else if (c === '39') ['a-31', 'a-32', 'a-33', 'a-36'].forEach((x) => cls.delete(x));
          else if (['31', '32', '33', '36'].includes(c)) cls.add(`a-${c}`);
        }
        continue;
      }
      if (part) frag.append(cls.size ? el('span', { class: [...cls].join(' ') }, part) : part);
    }
    return frag;
  }
  // the CLI's result box (╭─ … ─╮ │ … │ ╰─╯) becomes a bordered block so CJK widths can't misalign it
  function logNodes(lines) {
    const out = [];
    let card = null;
    for (const l of lines) {
      const plain = l.replace(/\x1b\[[0-9;]*m/g, '');
      if (/^\s*╭/.test(plain)) { card = el('div', { class: `result ${/\x1b\[31m/.test(l) ? 'fail' : /\x1b\[33m/.test(l) ? 'warn' : 'ok'}` }); out.push(card); continue; }
      if (card && /^\s*╰/.test(plain)) { card = null; continue; }
      if (card) { card.append(el('div', {}, ansi(l.replace(/^(\s*(?:\x1b\[[0-9;]*m)*)│\s?/, '$1').replace(/\s*(?:\x1b\[[0-9;]*m)*│(?:\x1b\[[0-9;]*m)*\s*$/, '')))); continue; }
      out.push(ansi(l), '\n');
    }
    return out;
  }
  const opKey = (op) => `${op.title}|${op.lines.length}|${op.running}`;
  function renderActivity() {
    const box = $('activity');
    const op = S?.op;
    if (!op || ui.dismissedOp === opKey(op)) { box.replaceChildren(); return; }
    const kind = op.running ? 'run' : S.message?.kind ?? 'ok';
    const stateIco = kind === 'run' ? el('span', { class: 'spin' }) : icon(kind === 'ok' ? 'check' : 'alert');
    const pre = ui.logOpen || kind === 'fail' ? el('pre', {}, logNodes(op.lines)) : null;
    box.replaceChildren(el('div', { class: 'activity', role: 'status' },
      el('header', {}, el('span', { class: `state ${kind}` }, stateIco),
        el('div', { class: 't' }, el('b', {}, op.title), el('small', {}, op.running ? (op.spinner || T.running) : (S.message?.text ?? '').replace(/^[✔▲✖]\s*/, ''))),
        el('button', { class: 'btn ghost sm', on: { click: () => { ui.logOpen = !ui.logOpen; renderActivity(); } } }, ui.logOpen ? T.hideLog : T.showLog, icon(ui.logOpen ? 'chevronDown' : 'chevronUp')),
        op.running ? null : el('button', { class: 'btn ghost sm icon', 'aria-label': T.close, on: { click: () => { ui.dismissedOp = opKey(op); renderActivity(); } } }, icon('x'))),
      pre));
    if (pre) pre.scrollTop = pre.scrollHeight;
  }

  function renderToast() {
    const m = S?.message;
    const box = $('toast');
    if (!m || (ui.shownMessage && m.kind === ui.shownMessage.kind && m.text === ui.shownMessage.text)) return;
    ui.shownMessage = m;
    box.replaceChildren(el('div', { class: `toast ${m.kind}`, role: 'status' }, icon(m.kind === 'ok' ? 'check' : 'alert'), m.text.replace(/^[✔▲✖]\s*/, '')));
    clearTimeout(renderToast.t);
    renderToast.t = setTimeout(() => box.replaceChildren(), m.kind === 'ok' ? 3500 : 8000);
  }

  // ---------- dialogs: questions from ccpm, plus the page's own folder / marketplace pickers ----------
  let shownDialog = 0;
  function renderModal() {
    const modal = $('modal');
    const d = S?.dialog;
    if (d) {
      if (shownDialog === d.id) return;
      shownDialog = d.id;
      const done = (value) => { modal.replaceChildren(); answer(d.id, value); };
      let input = null;
      let primary = null;
      const body = [];
      const foot = [];
      if (d.kind === 'confirm') {
        const plan = (S.op?.lines ?? []).filter((l) => l.trim());
        if (plan.length) body.push(el('div', { class: 'plan' }, logNodes(plan)));
        const cur = ui.current;
        if (cur?.cmd === 'update') {
          const targets = plugins().filter((x) => x.market === cur.market && x.where === 'here' && x.update && (!cur.names.length || cur.names.includes(x.name)));
          const notesBox = el('div', { class: 'dialog-notes' });
          const fill = () => {
            notesBox.replaceChildren(...targets.map((x) => {
              const info = infoOf(x.market, x.name, fill);
              return changelogSection(x, info);
            }));
          };
          fill();
          if (targets.length) body.push(notesBox);
        }
        const no = el('button', { class: `btn${d.def ? '' : ' primary'}`, on: { click: () => done(false) } }, T.no);
        const yes = el('button', { class: `btn${d.def ? ' primary' : ' danger'}`, on: { click: () => done(true) } }, T.yes);
        foot.push(no, yes);
        primary = d.def ? yes : no;
      } else if (d.kind === 'choose') {
        body.push(el('div', { class: 'opts' }, d.options.map((o) => el('button', { on: { click: () => done(o) } }, o))));
      } else {
        const tips = [d.secret && T.secretHint, d.hint, d.def !== undefined && d.def !== '' && fmt(T.defaultHint, d.def)].filter(Boolean).join(' · ');
        if (tips) body.push(el('p', { class: 'hint' }, tips));
        input = el('input', { type: d.secret ? 'password' : 'text', autocomplete: d.secret ? 'new-password' : 'off', 'aria-label': d.title });
        body.push(input);
        foot.push(el('button', { class: 'btn', on: { click: () => done('') } }, T.skip), primary = el('button', { class: 'btn primary', on: { click: () => done(input.value) } }, T.ok));
      }
      const box = el('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true' },
        el('div', { class: 'eyebrow' }, S.op?.title ?? (d.kind === 'confirm' ? T.confirm : d.kind === 'ask' ? T.fill : T.choose)),
        el('h3', {}, d.title), body, foot.length ? el('div', { class: 'foot' }, foot) : null);
      box.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); done(d.kind === 'confirm' ? false : d.kind === 'choose' ? d.options[0] : ''); }
        else if (e.key === 'Enter' && primary && (e.target === input || !input)) { e.preventDefault(); primary.click(); }
      });
      modal.replaceChildren(el('div', { class: 'modal' }, box));
      (input ?? primary ?? box.querySelector('button'))?.focus();
      return;
    }
    shownDialog = 0;
    if (!ui.modal) { modal.replaceChildren(); return; }
    if (modal.firstChild?.dataset.own === ui.modal.key) return;
    const wrap = el('div', { class: 'modal', 'data-own': ui.modal.key, on: { click: (e) => e.target === e.currentTarget && closeModal() } }, ui.modal.node);
    wrap.addEventListener('keydown', (e) => e.key === 'Escape' && closeModal());
    modal.replaceChildren(wrap);
    ui.modal.focus?.focus();
  }
  const closeModal = () => { ui.modal = null; renderModal(); };
  let modalSeq = 0;
  const showModal = (node, focus) => { ui.modal = { key: String(++modalSeq), node, focus }; renderModal(); };

  async function openFolder(path) {
    const r = await fetch(`/api/dirs?t=${encodeURIComponent(token)}&path=${encodeURIComponent(path || '')}`);
    if (!r.ok) return path ? openFolder('') : undefined;
    const d = await r.json();
    const join = (n) => `${d.path}${/[\\/]$/.test(d.path) ? '' : d.path.includes('\\') ? '\\' : '/'}${n}`;
    const input = el('input', { type: 'text', value: d.path, 'aria-label': T.folderPath });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') openFolder(input.value); });
    const use = el('button', { class: 'btn primary', on: { click: () => { closeModal(); select({ scope: 'project', dir: d.path }); } } }, T.useFolder);
    showModal(el('div', { class: 'dialog wide', role: 'dialog', 'aria-modal': 'true' },
      el('div', { class: 'eyebrow' }, T.pickFolder),
      el('h3', {}, folderName(d.label)), el('div', { class: 'path' }, d.label),
      el('div', { class: 'dirs' },
        d.parent ? el('button', { on: { click: () => openFolder(d.parent) } }, icon('chevronUp'), T.up) : null,
        d.dirs.map((n) => el('button', { on: { click: () => openFolder(join(n)) } }, icon('folder'), n))),
      input,
      el('div', { class: 'foot' }, el('button', { class: 'btn', on: { click: closeModal } }, T.cancel), el('button', { class: 'btn', on: { click: () => openFolder(input.value) } }, T.go), use)), use);
  }
  function openAdd() {
    const input = el('input', { type: 'text', placeholder: 'owner/repo', 'aria-label': T.source });
    const err = el('p', { class: 'hint', vars: { color: 'var(--red)', margin: '8px 0 0' }, hidden: true }, T.sourceRequired);
    const go = () => {
      const v = input.value.trim();
      if (!v) { err.hidden = false; input.focus(); return; }
      closeModal(); ui.page = 'markets'; post('/api/marketplace', { source: v });
    };
    input.addEventListener('input', () => { err.hidden = true; });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    showModal(el('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true' },
      el('div', { class: 'eyebrow' }, T.addMarket), el('h3', {}, T.source), el('p', { class: 'hint' }, T.sourceHint), input, err,
      el('div', { class: 'foot' }, el('button', { class: 'btn', on: { click: closeModal } }, T.cancel), el('button', { class: 'btn primary', on: { click: go } }, T.add))), input);
  }

  // ---------- render ----------
  function render() {
    renderSide();
    renderMain();
    renderLayer();
    renderActivity();
    renderToast();
    renderModal();
    pump();
  }

  fetch(`/api/strings?t=${encodeURIComponent(token)}`).then((r) => { if (!r.ok) throw new Error(); return r.json(); }).then(({ lang, strings }) => {
    T = strings;
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    render();
    const es = new EventSource(`/api/events?t=${encodeURIComponent(token)}`);
    es.onmessage = (e) => {
      const prev = S;
      S = JSON.parse(e.data);
      if (prev?.op?.running && S.op && !S.op.running) ui.logOpen = false;
      // keep an open menu / drawer while data refreshes; re-render everything else
      renderSide(); renderMain({ keepFocus: true }); if (!ui.menu) renderLayer(); renderActivity(); renderToast(); renderModal(); pump();
    };
    es.onerror = () => { if (!S) return; const b = $('banner'); b.textContent = T.disconnected; b.hidden = false; };
    es.onopen = () => { $('banner').hidden = true; };
  }).catch(() => { const b = $('banner'); b.textContent = 'ccpm: open the link printed in the terminal'; b.hidden = false; });
})();

// ccpm web page. All data from the server is inserted with textContent (marketplace text is untrusted).
(() => {
  // The access token comes in the URL once; keep it for this tab and drop it from the address bar.
  const q = new URLSearchParams(location.search);
  let token = q.get('t');
  try {
    if (token) sessionStorage.setItem('ccpm-token', token);
    else token = sessionStorage.getItem('ccpm-token');
  } catch {}
  if (q.has('t')) history.replaceState(null, '', location.pathname);

  const $ = (id) => document.getElementById(id);
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') n.className = v;
      else if (k === 'on') Object.entries(v).forEach(([e, f]) => n.addEventListener(e, f));
      else if (v !== undefined && v !== false) n.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) n.append(c instanceof Node ? c : String(c));
    return n;
  };
  let T = {};
  const fmt = (s, ...a) => String(s ?? '').replace(/\{(\d+)\}/g, (m, i) => (i < a.length ? a[i] : m));

  const post = (path, body = {}) => fetch(path, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-ccpm-token': token }, body: JSON.stringify(body),
  });
  const run = (cmd, names = []) => post('/api/run', { cmd, names });
  const answer = (id, value) => post('/api/answer', { id, value });

  let S = null; // latest state from the server
  const selected = new Set();
  const open = new Set(); // expanded rows
  let shownDialog = 0;
  let shownMessage = null;
  let opDismissed = null;

  // ---------- ANSI → spans (log lines from the CLI) ----------
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

  // ---------- header ----------
  function renderHeader() {
    $('market').textContent = S.marketplace ? `· ${S.marketplace}` : '';
    const c = S.model?.counters;
    const counters = $('counters');
    counters.replaceChildren();
    if (c) {
      const item = (cls, sym, n, label) => n ? counters.append(el('span', {}, el('span', { class: cls }, sym), ' ', el('b', {}, n), ' ', label)) : null;
      item('s-ok', '●', c.installed, T.cInstalled);
      item('s-up', '↑', c.update, T.cUpdate);
      item('s-warn', '▲', c.configure, T.cConfigure);
      item('s-off', '⏸', c.disabled, T.cDisabled);
      item('s-none', '○', c.notInstalled, T.cNone);
      if (S.dryRun) counters.append(el('span', { class: 'tag warn' }, T.dryRun));
    }
    const scope = $('scope');
    scope.replaceChildren(
      ...[['user', T.user], ['project', T.project]].map(([v, label]) => el('button', {
        'aria-pressed': String(S.scope === v), disabled: S.busy || !S.model,
        on: { click: () => S.scope !== v && post('/api/scope') },
      }, label)),
    );
    $('rescan').disabled = S.busy;
    $('sync').disabled = S.busy || !S.model;
    $('updateAll').disabled = S.busy || !S.model?.counters.update;
  }

  // ---------- lists ----------
  const matches = (x) => {
    const f = $('search').value.trim().toLowerCase();
    return !f || `${x.name} ${x.description ?? ''}`.toLowerCase().includes(f);
  };
  const symOf = (p) => (p.where === 'none' ? ['s-none', '○'] : p.where === 'global' ? ['s-ok', '✔']
    : p.delisted || p.missingConfig.length || p.missingDeps.length ? ['s-warn', '▲'] : p.update ? ['s-up', '↑'] : p.enabled === false ? ['s-off', '⏸'] : ['s-ok', '✔']);
  const btn = (label, cmd, names, cls = '') => el('button', {
    class: `btn small ${cls}`, disabled: S.busy, on: { click: (e) => { e.stopPropagation(); run(cmd, names); } },
  }, label);
  const check = (name) => el('input', {
    type: 'checkbox', checked: selected.has(name), disabled: S.busy, 'aria-label': name,
    on: { click: (e) => e.stopPropagation(), change: (e) => { e.target.checked ? selected.add(name) : selected.delete(name); renderSelection(); } },
  });
  const toggle = (name) => { open.has(name) ? open.delete(name) : open.add(name); renderLists(); };

  function pluginRow(p) {
    const [cls, sym] = symOf(p);
    const acts = [];
    if (p.where === 'here') {
      if (p.update) acts.push(btn(T.update, 'update', [p.name], 'primary'));
      if (p.hasConfig) acts.push(btn(T.config, 'config', [p.name]));
      acts.push(p.enabled === false ? btn(T.enable, 'enable', [p.name]) : btn(T.disable, 'disable', [p.name]));
      acts.push(btn(T.remove, 'remove', [p.name], 'danger'));
    } else acts.push(btn(T.install, 'install', [p.name], 'primary'));
    const ver = p.where === 'none' ? p.latest ?? '' : p.update ? `${p.update.from} → ${p.update.to}` : p.version ?? '';
    const notes = p.where === 'here' ? p.notes : p.where === 'global' ? [T.installedGlobally] : [];
    const row = el('div', { class: `row${p.where === 'here' ? '' : ' dim'}`, on: { click: () => toggle(p.name) } },
      check(p.name),
      el('span', { class: `sym ${cls}` }, sym),
      el('span', { class: 'name' }, p.name),
      el('span', { class: 'ver' }, ver),
      notes.length ? el('span', { class: 'notes' }, notes.map((n) => el('span', { class: `tag ${p.update && n === notes[0] ? 'up' : 'warn'}` }, n)))
        : el('span', { class: 'desc' }, p.description),
      el('span', { class: 'acts' }, acts),
    );
    if (open.has(p.name)) {
      row.append(el('div', { class: 'detail', on: { click: (e) => e.stopPropagation() } },
        el('p', {}, p.description),
        p.latest && p.where !== 'none' && p.latest !== p.version ? el('div', {}, fmt(T.latest, p.latest)) : null,
        p.dependencies.length ? el('div', {}, `${T.dependsOn}: ${p.dependencies.join(', ')}`) : null,
      ));
    }
    return row;
  }

  function presetRow(p) {
    const on = p.chosen || p.via;
    const short = p.got < p.want;
    const state = on ? `${p.chosen ? T.chosen : fmt(T.via, p.via)} · ${short ? fmt(T.missingN, p.want - p.got) : T.complete}`
      : `${T.notChosen} · ${fmt(T.gotOf, p.got, p.want)}`;
    const acts = [];
    if (short) acts.push(btn(T.installPreset, 'install', [p.name], 'primary'));
    if (on || p.got) acts.push(btn(T.remove, 'remove', [p.name], 'danger'));
    const [cls, sym] = on ? (short ? ['s-warn', '▲'] : ['s-ok', '✔']) : ['s-none', '○'];
    const row = el('div', { class: `row${on ? '' : ' dim'}`, on: { click: () => toggle(`preset:${p.name}`) } },
      check(p.name),
      el('span', { class: `sym ${cls}` }, sym),
      el('span', { class: 'name' }, p.name),
      el('span', { class: 'ver' }, state),
      el('span', { class: 'desc' }, p.description),
      el('span', { class: 'acts' }, acts),
    );
    if (open.has(`preset:${p.name}`) || short) {
      row.append(el('div', { class: 'detail members', on: { click: (e) => e.stopPropagation() } }, p.members.map((m) => (
        m.kind === 'preset' ? el('span', { class: 'tag' }, fmt(T.allOf, m.name))
          : m.delisted ? el('span', { class: 'tag warn' }, `▲ ${m.name}${T.delisted}`)
            : m.installed ? el('span', { class: 'tag ok' }, `✔ ${m.name}`)
              : m.excluded ? el('span', { class: 'tag' }, `− ${m.name} (${T.removedByYou})`) : el('span', { class: 'tag' }, `○ ${m.name}`)
      ))));
    }
    return row;
  }

  function section(title, sub, rows) {
    if (!rows.length) return [];
    return [el('h2', {}, el('b', {}, title), sub ? el('span', {}, sub) : null), el('div', { class: 'list' }, rows)];
  }

  function renderLists() {
    const lists = $('lists');
    if (!S.model) {
      lists.replaceChildren(el('div', { class: 'empty' }, S.busy ? T.loading : ''));
      return;
    }
    const m = S.model;
    const user = S.scope !== 'project';
    const of = (where) => m.plugins.filter((p) => p.where === where && matches(p)).map(pluginRow);
    const parts = [
      ...(user ? section(T.presets, T.presetsSub, m.presets.filter(matches).map(presetRow)) : []),
      ...section(user ? T.installed : T.installedHere, '', of('here')),
      ...section(T.global, T.globalSub, of('global')),
      ...section(T.notInstalled, T.notInstalledSub, of('none')),
    ];
    if (!m.plugins.length) parts.push(el('div', { class: 'empty' }, fmt(T.empty, S.marketplace)));
    else if (!parts.length) parts.push(el('div', { class: 'empty' }, T.noMatch));
    if (m.next?.length) {
      parts.push(el('h2', {}, el('b', {}, T.next)), el('div', { class: 'list' }, m.next.map((n) => el('div', { class: 'row next' },
        el('span'), el('span', { class: 'sym s-up' }, '›'), el('span', { class: 'name cmd' }, n.cmd), el('span'), el('span', { class: 'desc' }, n.why), el('span')))));
    }
    lists.replaceChildren(...parts);
  }

  function renderSelection() {
    const box = $('selection');
    for (const n of [...selected]) if (!S.model?.plugins.some((p) => p.name === n) && !S.model?.presets.some((p) => p.name === n)) selected.delete(n);
    if (!selected.size) { box.hidden = true; return; }
    const names = [...selected];
    const plugins = new Map((S.model?.plugins ?? []).map((p) => [p.name, p]));
    const canInstall = names.filter((n) => !plugins.has(n) || plugins.get(n).where !== 'here');
    const canUpdate = names.filter((n) => plugins.get(n)?.update);
    const canRemove = names.filter((n) => !plugins.has(n) || plugins.get(n).where === 'here');
    box.hidden = false;
    box.replaceChildren(
      el('span', {}, fmt(T.selected, names.length)),
      canInstall.length ? btn(`${T.install} (${canInstall.length})`, 'install', canInstall, 'primary') : null,
      canUpdate.length ? btn(`${T.update} (${canUpdate.length})`, 'update', canUpdate) : null,
      canRemove.length ? btn(`${T.remove} (${canRemove.length})`, 'remove', canRemove, 'danger') : null,
      el('span', { class: 'spacer' }),
      el('button', { class: 'btn ghost small', on: { click: () => { selected.clear(); renderSelection(); renderLists(); } } }, T.clear),
    );
  }

  // ---------- operation log ----------
  function renderOp() {
    const op = S.op;
    const box = $('op');
    if (!op || opDismissed === op) { box.hidden = true; return; }
    box.hidden = false;
    $('opTitle').textContent = op.title;
    $('opSpin').textContent = op.running ? (op.spinner || T.running) : '';
    $('opClose').textContent = T.close;
    $('opClose').disabled = op.running;
    const pre = $('opLog');
    const stick = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 4;
    // 命令行的结果卡片（╭─ 完成 ─╮ │ … │ ╰─╯）在网页里换成一块带边线的区域，避免中文宽度让边框错位
    const out = [];
    let card = null;
    for (const l of op.lines) {
      const plain = l.replace(/\x1b\[[0-9;]*m/g, '');
      if (/^\s*╭/.test(plain)) { card = el('div', { class: `result ${/\x1b\[31m/.test(l) ? 'fail' : /\x1b\[33m/.test(l) ? 'warn' : 'ok'}` }); out.push(card); continue; }
      if (card && /^\s*╰/.test(plain)) { card = null; continue; }
      if (card) { card.append(el('div', {}, ansi(l.replace(/^(\s*(?:\x1b\[[0-9;]*m)*)│\s?/, '$1').replace(/\s*(?:\x1b\[[0-9;]*m)*│(?:\x1b\[[0-9;]*m)*\s*$/, '')))); continue; }
      out.push(ansi(l), '\n');
    }
    pre.replaceChildren(...out);
    if (stick) pre.scrollTop = pre.scrollHeight;
  }

  function renderToast() {
    const m = S.message;
    const box = $('toast');
    if (!m || m === shownMessage) return;
    shownMessage = m;
    box.className = `toast ${m.kind}`;
    box.textContent = m.text;
    box.hidden = false;
    clearTimeout(renderToast.timer);
    renderToast.timer = setTimeout(() => { box.hidden = true; }, m.kind === 'ok' ? 4000 : 9000);
  }

  // ---------- dialogs ----------
  function renderDialog() {
    const d = S.dialog;
    const modal = $('modal');
    if (!d) { modal.hidden = true; shownDialog = 0; return; }
    if (shownDialog === d.id) return;
    shownDialog = d.id;
    const card = $('dialog');
    const done = (value) => { modal.hidden = true; answer(d.id, value); };
    let input = null;
    let primary = null;
    const foot = [];
    const body = [];
    const kind = d.kind;
    const heading = kind === 'confirm' ? T.confirm : kind === 'ask' ? T.fill : T.choose;
    if (kind === 'confirm') {
      const no = el('button', { class: `btn${d.def ? '' : ' primary'}`, on: { click: () => done(false) } }, T.no);
      const yes = el('button', { class: `btn${d.def ? ' primary' : ''}`, on: { click: () => done(true) } }, T.yes);
      foot.push(no, yes);
      primary = d.def ? yes : no;
    } else if (kind === 'choose') {
      body.push(el('div', { class: 'opts' }, d.options.map((o) => el('button', { class: 'btn', on: { click: () => done(o) } }, o))));
    } else if (kind === 'marketplace') {
      body.push(el('div', { class: 'opts' }, d.options.map((o) => el('button', { class: 'btn', on: { click: () => done(o) } }, o))));
      input = el('input', { type: 'text', placeholder: T.sourceHint, 'aria-label': T.source });
      body.push(el('p', { class: 'hint' }, T.source), input);
      foot.push(el('button', { class: 'btn', on: { click: () => done('') } }, T.close), primary = el('button', { class: 'btn primary', on: { click: () => done(input.value) } }, T.use));
    } else {
      const tips = [d.secret && T.secretHint, d.hint, d.def !== undefined && d.def !== '' && fmt(T.defaultHint, d.def)].filter(Boolean).join(' · ');
      if (tips) body.push(el('p', { class: 'hint' }, tips));
      input = el('input', { type: d.secret ? 'password' : 'text', autocomplete: d.secret ? 'new-password' : 'off', 'aria-label': d.title });
      body.push(input);
      foot.push(el('button', { class: 'btn', on: { click: () => done('') } }, T.skip), primary = el('button', { class: 'btn primary', on: { click: () => done(input.value) } }, T.ok));
    }
    card.replaceChildren(el('div', { class: 'hint' }, heading), el('h3', {}, d.title), ...body, foot.length ? el('div', { class: 'foot' }, foot) : null);
    card.onkeydown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); done(kind === 'confirm' ? false : kind === 'choose' ? d.options[0] : ''); }
      else if (e.key === 'Enter' && primary && (e.target === input || !input)) { e.preventDefault(); primary.click(); }
      else if (kind === 'confirm' && /^[yn]$/i.test(e.key)) done(/y/i.test(e.key));
    };
    modal.hidden = false;
    (input ?? primary ?? card.querySelector('button'))?.focus();
  }

  function render() {
    renderHeader();
    renderLists();
    renderSelection();
    renderOp();
    renderToast();
    renderDialog();
  }

  // ---------- wiring ----------
  $('search').addEventListener('input', () => S && renderLists());
  $('sync').addEventListener('click', () => run('sync'));
  $('updateAll').addEventListener('click', () => run('update'));
  $('rescan').addEventListener('click', () => post('/api/rescan'));
  $('opClose').addEventListener('click', () => { opDismissed = S.op; renderOp(); });

  fetch(`/api/strings?t=${encodeURIComponent(token)}`).then((r) => r.json()).then(({ lang, strings }) => {
    T = strings;
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    $('search').placeholder = T.search;
    $('sync').textContent = T.sync;
    $('updateAll').textContent = T.updateAll;
    $('rescan').textContent = T.rescan;
    const es = new EventSource(`/api/events?t=${encodeURIComponent(token)}`);
    es.onmessage = (e) => { S = JSON.parse(e.data); render(); };
    es.onerror = () => { if (es.readyState === EventSource.CLOSED || !S) return; const b = $('banner'); b.textContent = T.disconnected; b.hidden = false; };
    es.onopen = () => { $('banner').hidden = true; };
  }).catch(() => { const b = $('banner'); b.textContent = 'ccpm: unauthorized — open the link printed in the terminal'; b.hidden = false; });
})();

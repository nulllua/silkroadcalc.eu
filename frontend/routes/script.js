// Main client runtime for the trading calculator.
// Organized as: static data -> pricing engine -> UI/state -> network sync.

const BUDGET_KEY = 'silkroad_budget';

function getBudgetCap() {
  const el = document.getElementById('budgetCap');
  if (!el) return 0;
  const raw = String(el.value).trim();
  if (raw === '') return 0;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Recompute outbound trip profit/min when capital is capped (early-game). Ignores return leg. */
function applyOutboundBudget(routes, budgetCap) {
  for (const r of routes) {
    delete r._budgetExcluded;
    delete r.capacitySlots;
    delete r.slotBudgetLimited;
    const capacitySlots = r.slots;
    if (!(budgetCap > 0)) continue;
    const bp = Number(r.buyPrice);
    if (!(bp > 0)) {
      r._budgetExcluded = true;
      continue;
    }
    r.capacitySlots = capacitySlots;
    const affordable = Math.floor(budgetCap / bp);
    const usable = Math.min(capacitySlots, Math.max(0, affordable));
    if (usable < 1) {
      r._budgetExcluded = true;
      continue;
    }
    if (usable < capacitySlots) r.slotBudgetLimited = true;
    r.slots = usable;
    r.profitPerTrip = r.profitPerUnit * usable;
    r.profitPerMin = r.time > 0 ? Math.round(r.profitPerTrip / r.time) : 0;
    r.profitPerHour = r.profitPerMin * 60;
  }
  return routes;
}

function routesEmptyMessage(cap, narrowedByTextSearch, preBudgetCount) {
  if (cap > 0 && preBudgetCount > 0)
    return 'No routes match your filters within this buy budget.';
  if (narrowedByTextSearch) return '⚔ No routes match your search ⚔';
  if (cap > 0) return 'No route is affordable at this budget.';
  return '⚔ No routes match your search ⚔';
}

function getPlayerState() {
  return {
    culture: document.getElementById('culture').value,
    religion: document.getElementById('religion').value,
    religionLevel: parseInt(document.getElementById('religionLevel').value),
    langLevel: parseInt(document.getElementById('langLevel').value),
    backpack: document.getElementById('backpack').value,
    extraStorage: document.getElementById('extraStorage').checked,
    caravanGamepass: document.getElementById('caravanGamepass').checked,
    autoWalk: document.getElementById('autoWalk').checked,
    byzantineRank: parseInt(document.getElementById('byzantineRank').value) || 1,
    sassanidRank: parseInt(document.getElementById('sassanidRank').value) || 1,
    currentCity: document.getElementById('currentCity')?.value || '',
    sellInCity: document.getElementById('sellInCity')?.value || '',
    animals: [0, 1, 2, 3, 4].map((i) => document.getElementById('animal' + i)?.value || 'None'),
    saddlebags: [0, 1, 2, 3, 4].map((i) => document.getElementById('saddle' + i)?.checked || false),
  };
}

function updateStats() {
  const ps = getPlayerState();
  const slots = calculateStorage(ps);
  const speed = calculateWalkspeed(ps);
  const auto = ps.autoWalk ? 4 : 0;
  const active = ps.animals.filter((a) => a !== 'None');
  const animalBonus =
    active.length > 0
      ? Math.round(
          (active.reduce((s, a) => s + (ANIMALS_DATA[a]?.speed || 0), 0) / active.length) * 100
        ) / 100
      : 0;
  document.getElementById('statSlots').textContent = slots;
  document.getElementById('statSpeed').textContent = speed.toFixed(2);
  document.getElementById('statBaseSpeed').textContent = '16';
  document.getElementById('statAutoBonus').textContent = '+' + auto;
  document.getElementById('statAnimalBonus').textContent = animalBonus;
}

function updateAll() {
  const ps = getPlayerState();
  let routes = generateRoutes(ps);
  routes = enrichRoutes(routes, ps);
  routes = attachReturnTrade(routes);
  applyOutboundBudget(routes, getBudgetCap());
  routes.forEach((r, i) => {
    r._idx = i;
  });
  allRoutes = routes;
  updateStats();
  renderTable();
  renderBestLoop();
  if (document.getElementById('pricesPanel')?.style.display !== 'none') renderPricesTab();
  autoSave();
}

function renderTable() {
  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  const limitEl = document.getElementById('rowLimit');
  const limit = limitEl ? parseInt(limitEl.value, 10) : 0;
  const currentCity = document.getElementById('currentCity')?.value || '';
  const sellInCity = document.getElementById('sellInCity')?.value || '';
  const budgetCap = getBudgetCap();

  let rows = allRoutes.slice();
  if (q) {
    rows = rows.filter(
      (r) =>
        r.good.toLowerCase().includes(q) ||
        r.buyCity.toLowerCase().includes(q) ||
        r.sellCity.toLowerCase().includes(q) ||
        r.goodType.toLowerCase().includes(q)
    );
  }
  if (sellInCity) {
    rows = rows.filter((r) => r.sellCity === sellInCity);
  }
  const preBudgetCount = rows.length;
  if (budgetCap > 0) rows = rows.filter((r) => !r._budgetExcluded);
  rows.sort((a, b) => {
    // routes from current city pin to top (when not alphabetic sort)
    if (currentCity) {
      const aHere = a.buyCity === currentCity ? 0 : 1;
      const bHere = b.buyCity === currentCity ? 0 : 1;
      if (aHere !== bHere) return aHere - bHere;
    }
    const va = a[sortKey],
      vb = b[sortKey];
    const cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
    if (cmp !== 0) return cmp * sortDir;
    return b.profitPerTrip - a.profitPerTrip;
  });

  if (limit > 0) rows = rows.slice(0, limit);

  document.querySelectorAll('th').forEach((th) => (th.className = ''));
  const hEl = document.getElementById('h-' + sortKey);
  if (hEl) hEl.className = (sortDir < 0 ? 'sort-desc' : 'sort-asc') + ' featured';

  const sb = document.getElementById('sortBy');
  if (sb && sb.value !== sortKey) sb.value = sortKey;

  const tbody = document.getElementById('tableBody');
  if (!rows.length) {
    const narrowedByTextSearch = !!(q || sellInCity);
    const msg = routesEmptyMessage(budgetCap, narrowedByTextSearch, preBudgetCount);
    tbody.innerHTML = `<tr><td colspan="10" class="no-rows">${msg}</td></tr>`;
    renderMobileCards([], msg);
    return;
  }

  const FEAT = {
    buyCity: 0,
    good: 1,
    sellCity: 2,
    buyPrice: 3,
    sellPrice: 4,
    profitPerUnit: 5,
    profitPerTrip: 6,
    time: 7,
    profitPerMin: 8,
  };
  const featCol = FEAT[sortKey];
  const ALPHA_SORTS = new Set(['good', 'buyCity', 'sellCity']);
  const showTopRow = !ALPHA_SORTS.has(sortKey);

  const frag = document.createDocumentFragment();
  rows.forEach((r, idx) => {
    const pu = r.profitPerUnit;
    const puc = pu > 0 ? 'profit' : pu < 0 ? 'loss' : 'zero';
    const pm = r.profitPerMin;
    const pmc = pm > 0 ? 'profit' : pm < 0 ? 'loss' : 'zero';
    const cls = (i, extra = '') => (i === featCol ? 'featured ' : '') + extra;
    const isTop = showTopRow && idx === 0;
    const isHere = currentCity && r.buyCity === currentCity;
    const tr = document.createElement('tr');
    const trClasses = [];
    if (isTop) trClasses.push('top-row');
    if (isHere) trClasses.push('here-row');
    if (trClasses.length) tr.className = trClasses.join(' ');
    const topMark = isTop ? '<span class="top-marker" title="Best by current sort">★</span>' : '';
    const hereMark =
      isHere && !isTop ? '<span class="here-marker" title="You are here">⌂</span>' : '';
    const routeIdx = r._idx;
    tr.dataset.routeIdx = routeIdx;
    tr.innerHTML =
      `<td class="${cls(0)}">${topMark}${hereMark}${badge(r.buyCity)}</td>` +
      `<td class="${cls(1)}">${goodCell(r.good, r.goodType)}</td>` +
      `<td class="${cls(2)}">${badge(r.sellCity)}</td>` +
      `<td class="${cls(3)}"><span class="price-cell" data-route-idx="${routeIdx}" data-price-kind="buy">$${r.buyPrice}</span></td>` +
      `<td class="${cls(4)}"><span class="price-cell" data-route-idx="${routeIdx}" data-price-kind="sell">$${r.sellPrice}</span></td>` +
      `<td class="${cls(5, puc)}">${pu >= 0 ? '+$' : '-$'}${Math.abs(pu)}</td>` +
      `<td class="${cls(6, puc)}">${pu >= 0 ? '+$' : '-$'}${Math.abs(r.profitPerTrip)}</td>` +
      `<td class="${cls(7)}">${fmtTime(r.time)}</td>` +
      `<td class="${cls(8, pmc)}">${pm >= 0 ? '+$' : '-$'}${Math.abs(pm)}</td>` +
      `<td class="retcell">${returnCard(r.returnObj)}</td>`;
    frag.appendChild(tr);
    const expTr = document.createElement('tr');
    expTr.className = 'expand-row';
    frag.appendChild(expTr);
  });
  tbody.innerHTML = '';
  tbody.appendChild(frag);
  const cardsEl = document.getElementById('routeCards');
  if (cardsEl && cardsEl.offsetParent !== null) renderMobileCards(rows, '');
}

let _searchTimer = 0;
function onSearchInput() {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(renderTable, 150);
}

function initTableEvents() {
  const tbody = document.getElementById('tableBody');
  if (!tbody || tbody._evtBound) return;
  tbody._evtBound = true;
  tbody.addEventListener('click', (e) => {
    if (e.target.closest('.price-cell')) return;
    const tr = e.target.closest('tr:not(.expand-row)');
    if (!tr) return;
    const expRow = tr.nextElementSibling;
    if (!expRow?.classList.contains('expand-row')) return;
    if (!expRow._rendered) {
      const idx = parseInt(tr.dataset.routeIdx);
      expRow.innerHTML = renderExpandCells(allRoutes[idx]);
      expRow._rendered = true;
    }
    const opening = !expRow.classList.contains('open');
    tbody.querySelector('.expand-row.open')?.classList.remove('open');
    tbody.querySelector('.row-expanded')?.classList.remove('row-expanded');
    expRow.classList.toggle('open', opening);
    tr.classList.toggle('row-expanded', opening);
  });
}

const ROUTE_CONTROLS_COLLAPSED_KEY = 'silkroad_routes_controls_collapsed';

function initRouteControlsCollapse() {
  const root = document.getElementById('routeControls');
  const btn = document.getElementById('routeControlsToggle');
  const body = document.getElementById('routeControlsBody');
  if (!root || !btn || !body) return;
  function apply(collapsed) {
    const c = !!collapsed;
    root.dataset.collapsed = c ? '1' : '0';
    btn.setAttribute('aria-expanded', c ? 'false' : 'true');
    try {
      localStorage.setItem(ROUTE_CONTROLS_COLLAPSED_KEY, c ? '1' : '0');
    } catch (_) {}
  }
  let startCollapsed = false;
  try {
    startCollapsed = localStorage.getItem(ROUTE_CONTROLS_COLLAPSED_KEY) === '1';
  } catch (_) {}
  apply(startCollapsed);
  btn.addEventListener('click', () => {
    apply(root.dataset.collapsed !== '1');
  });
}

function renderMobileCards(rows, emptyMsg) {
  const container = document.getElementById('routeCards');
  if (!container) return;
  if (!rows.length) {
    const msg = emptyMsg || '⚔ No routes match your search ⚔';
    container.innerHTML = `<div class="route-card" style="text-align:center;cursor:default;padding:16px"><span class="rc-empty-msg">${msg}</span></div>`;
    return;
  }
  const ALPHA_SORTS = new Set(['good', 'buyCity', 'sellCity']);
  const showTop = !ALPHA_SORTS.has(sortKey);
  const frag = document.createDocumentFragment();
  rows.forEach((r, idx) => {
    const isTop = showTop && idx === 0;
    const pm = r.profitPerMin;
    const pu = r.profitPerUnit;
    const pmc = pm > 0 ? 'profit' : pm < 0 ? 'loss' : 'zero';
    const puc = pu > 0 ? 'profit' : pu < 0 ? 'loss' : 'zero';
    const topMark = isTop ? '<span class="top-marker" title="Best by current sort">★</span>' : '';
    let retHtml = '';
    if (r.returnObj) {
      const ret = r.returnObj;
      const rpm = ret.profitPerMin,
        rpu = ret.profitPerUnit;
      const rpmc = rpm > 0 ? 'profit' : rpm < 0 ? 'loss' : 'zero';
      const rpuc = rpu > 0 ? 'profit' : rpu < 0 ? 'loss' : 'zero';
      const rpt = ret.profitPerTrip,
        rptc = rpt > 0 ? 'profit' : rpt < 0 ? 'loss' : 'zero';
      const totalTrip = r.profitPerTrip + ret.profitPerTrip;
      const totalTime = r.time + ret.time;
      const totalPerMin = totalTime > 0 ? Math.round(totalTrip / totalTime) : 0;
      const totalPerHour = totalPerMin * 60;
      const tc = totalTrip >= 0 ? 'profit' : 'loss';
      retHtml = `<div class="rc-expand">
        <div class="rc-ret-route">
          <span class="rc-ret-label">↩ Return</span>
          ${badge(ret.buyCity)}<span class="rc-arrow">→</span>${badge(ret.sellCity)}
          <span class="rc-ppm ${rpmc}" style="margin-left:auto">${rpm >= 0 ? '+$' : '-$'}${Math.abs(rpm)}/min</span>
        </div>
        <div class="rc-body">
          <div style="flex:1">${goodCell(ret.good, ret.goodType)}</div>
          <div class="rc-stats">
            <span class="rc-pu ${rpuc}">${rpu >= 0 ? '+$' : '-$'}${Math.abs(rpu)}/u</span>
            <span class="rc-time">${fmtTime(ret.time)}</span>
          </div>
        </div>
        <div class="rc-detail">
          <span class="rc-price">Buy $${ret.buyPrice}</span>
          <span class="rc-sep">·</span>
          <span class="rc-price">Sell $${ret.sellPrice}</span>
          <span class="rc-sep">·</span>
          <span class="rc-pt ${rptc}">${rpt >= 0 ? '+$' : '-$'}${Math.abs(rpt)}/trip</span>
        </div>
        <div class="rc-roundtrip">
          <span class="rc-rt-label">Round trip</span>
          <span class="rc-rt-val ${tc}">${totalTrip >= 0 ? '+$' : '-$'}${Math.abs(totalTrip)}</span>
          <span class="rc-rt-rate ${tc}">${totalPerMin >= 0 ? '+$' : '-$'}${Math.abs(totalPerMin)}/min · ${totalPerHour >= 0 ? '+$' : '-$'}${Math.abs(totalPerHour)}/h</span>
        </div>
      </div>`;
    } else {
      retHtml = `<div class="rc-expand"><span class="rc-empty-msg">No profitable return cargo for this route.</span></div>`;
    }
    const card = document.createElement('div');
    card.className = 'route-card' + (isTop ? ' is-top' : '');
    const pt = r.profitPerTrip;
    const ptc = pt > 0 ? 'profit' : pt < 0 ? 'loss' : 'zero';
    card.innerHTML = `
      <div class="rc-header">
        <div class="rc-route">${topMark}${badge(r.buyCity)}<span class="rc-arrow">→</span>${badge(r.sellCity)}</div>
        <span class="rc-ppm ${pmc}">${pm >= 0 ? '+$' : '-$'}${Math.abs(pm)}/min</span>
      </div>
      <div class="rc-body">
        <div style="flex:1">${goodCell(r.good, r.goodType)}</div>
        <div class="rc-stats">
          <span class="rc-pu ${puc}">${pu >= 0 ? '+$' : '-$'}${Math.abs(pu)}/u</span>
          <span class="rc-time">${fmtTime(r.time)}</span>
        </div>
      </div>
      <div class="rc-detail">
        <span class="rc-price">Buy $${r.buyPrice}</span>
        <span class="rc-sep">·</span>
        <span class="rc-price">Sell $${r.sellPrice}</span>
        <span class="rc-sep">·</span>
        <span class="rc-pt ${ptc}">${pt >= 0 ? '+$' : '-$'}${Math.abs(pt)}/trip</span>
      </div>
      ${retHtml}`;
    card.addEventListener('click', () => {
      const wasOpen = card.classList.contains('card-open');
      document
        .querySelectorAll('.route-card.card-open')
        .forEach((c) => c.classList.remove('card-open'));
      if (!wasOpen) card.classList.add('card-open');
    });
    frag.appendChild(card);
  });
  container.innerHTML = '';
  container.appendChild(frag);
}

function badge(city) {
  const c = CITY_BADGE_COLORS[city] || '#888';
  const ev = getActiveEvent(city);
  let tag = '';
  if (ev) {
    const def = EVENTS[ev.type];
    if (def) {
      const lvlLabel = EVENT_LEVELS[ev.level]?.label[ev.type] || `L${ev.level}`;
      const remaining = fmtRemaining(ev.remainingMs);
      const dirCls = def.dir < 0 ? 'event-tag dir-down' : 'event-tag';
      const title = `${def.label} (${lvlLabel}): ${def.desc}. ${remaining} remaining.`;
      tag = `<span class="${dirCls}" title="${title}">${def.glyph}</span>`;
    }
  }
  return `<span class="badge" style="background:${c}1a;border-color:${c}80;color:${c}">${city}</span>${tag}`;
}

const GOODS_WITH_ICON = new Set([
  'Barley',
  'Copper Ingot',
  'Cotton Yarn',
  'Dried Fish',
  'Earthenware',
  'Glassware',
  'Iron Ingot',
  'Leather',
  'Linen',
  'Olive Oil',
  'Sea Salt',
  'Tools',
  'Weapons',
  'Wheat',
  'Wool',
  'Coriander',
  'Sesame',
  'Saffron',
  'Byzantine Silk',
  'Persian Carpets',
]);
const GOODS_ICON_FILE = {
  Coriander: 'coriander',
  Sesame: 'sesame',
  Saffron: 'saffron',
  'Byzantine Silk': 'byzantinesilk',
  'Persian Carpets': 'persiancarpets',
};

function goodIconHTML(good) {
  if (!GOODS_WITH_ICON.has(good)) return '';
  const file = GOODS_ICON_FILE[good] || good;
  return `<img class="good-icon" src="/frontend/assets/icons/${file}.webp" alt="" loading="lazy">`;
}

function goodCell(good, type) {
  return `<span class="good-cell" data-tip="${type}">${goodIconHTML(good)}<span class="good-name">${good}</span></span>`;
}

function renderExpandCells(r) {
  const ret = r.returnObj;
  const sign = (v) => (v >= 0 ? '+$' : '-$') + Math.abs(v);

  if (!ret)
    return `<td class="expand-td exp-first exp-last" colspan="10"><span class="expand-label">↩ Return Leg</span><span class="expand-empty">No profitable return cargo for this route.</span></td>`;
  const puc = ret.profitPerUnit > 0 ? 'profit' : ret.profitPerUnit < 0 ? 'loss' : 'zero';
  const pmc = ret.profitPerMin > 0 ? 'profit' : ret.profitPerMin < 0 ? 'loss' : 'zero';
  const totalTrip = r.profitPerTrip + ret.profitPerTrip;
  const totalTime = r.time + ret.time;
  const totalPerMin = totalTime > 0 ? Math.round(totalTrip / totalTime) : 0;
  const tc = totalTrip >= 0 ? 'profit' : 'loss';
  const totalPerHour = totalPerMin * 60;
  return `
    <td class="expand-td exp-first"><span class="expand-label">↩ Return</span>${badge(ret.buyCity)}</td>
    <td class="expand-td">${goodCell(ret.good, ret.goodType)}</td>
    <td class="expand-td">${badge(ret.sellCity)}</td>
    <td class="expand-td">$${ret.buyPrice}</td>
    <td class="expand-td">$${ret.sellPrice}</td>
    <td class="expand-td ${puc}">${sign(ret.profitPerUnit)}</td>
    <td class="expand-td ${puc}">${sign(ret.profitPerTrip)}</td>
    <td class="expand-td">${fmtTime(ret.time)}</td>
    <td class="expand-td ${pmc}">${sign(ret.profitPerMin)}/min</td>
    <td class="expand-td exp-last exp-total"><span class="exp-total-label">Round trip</span><span class="exp-total-val ${tc}">${sign(totalTrip)}</span><span class="exp-total-rate ${tc}">${sign(totalPerMin)}/min · ${sign(totalPerHour)}/h</span></td>`;
}

function returnCard(ret) {
  if (!ret) return `<span class="retcard empty">None</span>`;
  return `<span class="retcard">${goodIconHTML(ret.good)}<span class="retcard-text"><span class="rname">${ret.good}</span><span class="rprofit">Profit / Unit: $${ret.profitPerUnit}</span></span></span>`;
}

function sortBy(key) {
  if (sortKey === key) sortDir *= -1;
  else {
    sortKey = key;
    sortDir = -1;
  }
  renderTable();
}

function onSortByChange() {
  const v = document.getElementById('sortBy').value;
  sortKey = v;
  sortDir = v === 'good' || v === 'buyCity' || v === 'sellCity' ? 1 : -1;
  renderTable();
}

function switchTab(tab) {
  const isRoutes = tab === 'routes';
  const isPrices = tab === 'prices';
  const isTools = tab === 'tools';
  const isEvents = tab === 'events';
  const isSettings = tab === 'settings';
  const isAbout = tab === 'about';
  document.getElementById('routesPanel').style.display = isRoutes ? 'flex' : 'none';
  const rc = document.getElementById('routeControls');
  if (rc) rc.style.display = isRoutes ? 'flex' : 'none';
  document.getElementById('pricesPanel').style.display = isPrices ? 'flex' : 'none';
  document.getElementById('toolsPanel').style.display = isTools ? 'block' : 'none';
  document.getElementById('eventsPanel').style.display = isEvents ? 'flex' : 'none';
  const sp = document.getElementById('settingsPanel');
  if (sp) sp.style.display = isSettings ? 'block' : 'none';
  document.getElementById('aboutPanel').style.display = isAbout ? 'block' : 'none';
  [
    ['tabRoutes', isRoutes],
    ['tabPrices', isPrices],
    ['tabTools', isTools],
    ['tabEvents', isEvents],
    ['tabSettings', isSettings],
    ['tabAbout', isAbout],
  ].forEach(([id, active]) => {
    const el = document.getElementById(id);
    if (el) el.className = 'tab' + (active ? ' active' : '');
  });
  if (isEvents) renderEventsTab();
  if (isPrices) renderPricesTab();
}

function fmtRemaining(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function renderEventsTab() {
  const panel = document.getElementById('eventsPanel');
  if (!panel) return;

  const legendHtml = Object.entries(EVENTS)
    .map(([, v]) => {
      const down = v.dir < 0;
      const affects = v.goodTypes.concat(v.goodNames || []).join(' & ') + (down ? ' ↓' : ' ↑');
      return `<div class="ev-chip${down ? ' dir-down' : ''}"><span class="ev-chip-glyph">${v.glyph}</span><span class="ev-chip-label">${v.label}</span><span class="ev-chip-sub">${affects}</span></div>`;
    })
    .join('');

  panel.innerHTML = `
    <div class="ev-desc">Events last <b>1 hour</b> and shift sell prices globally for matching goods. Set what is active in each city and the calculator updates automatically.</div>
    <div class="ev-legend">${legendHtml}</div>
    <div class="evlist" id="eventsGrid"></div>
  `;

  const grid = document.getElementById('eventsGrid');
  const eventOptions = ['<option value="">Pick event</option>']
    .concat(
      Object.entries(EVENTS).map(([k, v]) => `<option value="${k}">${v.glyph} ${v.label}</option>`)
    )
    .join('');

  for (const city of CITY_ORDER) {
    const ev = getActiveEvent(city);
    const def = ev ? EVENTS[ev.type] : null;
    const lvlLabel = ev && def ? EVENT_LEVELS[ev.level]?.label[ev.type] || `Level ${ev.level}` : '';
    const totalMs = ev ? ev.durationMs || EVENT_DURATION_MS : 0;
    const pct = ev ? Math.max(0, Math.min(100, (ev.remainingMs / totalMs) * 100)) : 0;
    const isLow = ev && ev.remainingMs <= 5 * 60 * 1000;
    const isDown = def && def.dir < 0;

    let cls = 'evrow';
    if (ev) cls += ' active';
    if (isDown) cls += ' dir-down';
    if (isLow) cls += ' is-low';

    const innerHtml = ev
      ? `
      <div class="evrow-accent"></div>
      <div class="evrow-city">${city}</div>
      <div class="evrow-mid">
        <span class="evrow-glyph">${def.glyph}</span>
        <div class="evrow-info">
          <span class="evrow-ename">${def.label}</span>
          <span class="evrow-elevel">${lvlLabel}</span>
        </div>
      </div>
      <div class="evrow-right">
        <span class="evc-timer" id="evt-${city}">${fmtRemaining(ev.remainingMs)}</span>
        <button class="evc-btn-clear" onclick="clearCityEvent('${city}')">Clear</button>
      </div>
      <div class="evrow-bar"><div class="evcard-progress-fill" style="width:${pct}%"></div></div>`
      : `
      <div class="evrow-accent"></div>
      <div class="evrow-city">${city}</div>
      <div class="evrow-mid">
        <div class="evrow-selects">
          <select id="evtype-${city}" onchange="updateLevelOptions('${city}')">${eventOptions}</select>
          <select id="evlvl-${city}" disabled><option value="">Level</option></select>
        </div>
        <div class="evrow-dur">
          <button class="btn-preset sel" onclick="evSetDur('${city}',30,this)">30m</button>
          <button class="btn-preset" onclick="evSetDur('${city}',60,this)">1h</button>
          <button class="btn-preset" onclick="evSetDur('${city}',120,this)">2h</button>
          <input type="hidden" id="evdur-${city}" value="30">
        </div>
        <button class="evrow-btn-start" onclick="startCityEventFromUI('${city}')">Start</button>
      </div>`;

    grid.insertAdjacentHTML(
      'beforeend',
      `<div class="${cls}" data-city="${city}">${innerHtml}</div>`
    );
  }
}

function evSetDur(city, mins, btn) {
  document.getElementById('evdur-' + city).value = mins;
  btn
    .closest('.evrow-dur')
    .querySelectorAll('.btn-preset')
    .forEach((b) => b.classList.remove('sel'));
  btn.classList.add('sel');
}

function updateLevelOptions(city) {
  const typeEl = document.getElementById('evtype-' + city);
  const lvlEl = document.getElementById('evlvl-' + city);
  if (!typeEl || !lvlEl) return;
  const type = typeEl.value;
  if (!type) {
    lvlEl.innerHTML = '<option value="">Pick event first</option>';
    lvlEl.disabled = true;
    return;
  }
  const cur = lvlEl.value || '2';
  lvlEl.disabled = false;
  lvlEl.innerHTML = [1, 2, 3]
    .map((n) => {
      const name = EVENT_LEVELS[n].label[type];
      return `<option value="${n}"${String(n) === cur ? ' selected' : ''}>${name}</option>`;
    })
    .join('');
}

function startCityEventFromUI(city) {
  const type = document.getElementById('evtype-' + city)?.value;
  const level = parseInt(document.getElementById('evlvl-' + city)?.value || '2');
  const mins = parseFloat(document.getElementById('evdur-' + city)?.value || '60');
  if (!type) return;
  setCityEvent(city, type, level, Math.max(1, mins) * 60 * 1000);
}

// Prices tab
function calculateLocalSellPrice(good, city, ps) {
  return calculateSellPrice(good, city, city, ps);
}

let pricesMode = 'buy';

function setPricesMode(mode) {
  pricesMode = mode;
  document.getElementById('pmtBuy').classList.toggle('active', mode === 'buy');
  document.getElementById('pmtSell').classList.toggle('active', mode === 'sell');
  const hint = document.getElementById('pricesModeDesc');
  if (hint)
    hint.textContent =
      mode === 'buy'
        ? 'What each good costs to buy in every city · dot = active event'
        : 'What you earn selling each good locally · dot = active event';
  renderPricesTab();
}

function renderPricesTab() {
  const grid = document.getElementById('pricesGrid');
  if (!grid) return;
  const ps = getPlayerState();
  const mode = pricesMode;
  const originCity = ps.currentCity;

  // Build table: thead + tbody rows grouped by good type
  const parts = [];
  parts.push(`<table class="pt2-table mode-${mode}"><thead><tr>`);
  parts.push(`<th class="pt2-th-good">Good</th>`);
  for (const city of CITY_ORDER) {
    const isO = city === originCity;
    parts.push(
      `<th class="pt2-th-city${isO ? ' pt2-origin-th' : ''}">${city}<span class="pt2-city-culture">${CITIES[city].culture}</span></th>`
    );
  }
  parts.push(`</tr></thead><tbody>`);

  let curType = null;
  for (const good of GOODS) {
    if (!isLuxuryAccessible(good, ps)) continue;

    if (good.type !== curType) {
      curType = good.type;
      parts.push(
        `<tr class="pt2-type-row"><td colspan="${1 + CITY_ORDER.length}">${good.type}</td></tr>`
      );
    }

    parts.push(
      `<tr class="pt2-row"><td class="pt2-td-good" title="${good.name} · base $${good.base}">${good.name}</td>`
    );

    for (const city of CITY_ORDER) {
      const isO = city === originCity;
      const luxuryCity = LUXURY_CITY[good.name];
      const canBuy = !luxuryCity || city === luxuryCity;
      const isProduced = CITIES[city].produced.includes(good.name);
      const ev = getActiveEvent(city);
      const evHits = ev && eventAffects(good, ev);
      const evDir = evHits ? (EVENTS[ev.type].dir > 0 ? 'up' : 'down') : '';

      let cls = 'pt2-price-cell';
      if (isO) cls += ' pt2-origin-col';

      let inner;
      if (mode === 'buy') {
        if (!canBuy) {
          cls += ' pt2-unavail';
          inner = `<span class="pt2-val">—</span>`;
        } else {
          if (isProduced) cls += ' pt2-produced';
          inner = `<span class="pt2-val">$${calculateBuyPrice(good, city, ps)}</span>`;
        }
      } else {
        if (isProduced) {
          cls += ' pt2-unavail';
          inner = `<span class="pt2-val">—</span>`;
        } else {
          inner = `<span class="pt2-val">$${calculateLocalSellPrice(good, city, ps)}</span>`;
        }
      }

      parts.push(
        `<td class="${cls}">${inner}${evHits ? `<span class="pt2-event-dot dir-${evDir}"></span>` : ''}</td>`
      );
    }

    parts.push(`</tr>`);
  }

  parts.push(`</tbody></table>`);
  grid.innerHTML = parts.join('');
}

// Event floater
function renderEventFloater() {
  const wrap = document.getElementById('eventFloater');
  if (!wrap) return;
  const active = [];
  for (const city of CITY_ORDER) {
    const ev = getActiveEvent(city);
    if (!ev) continue;
    const def = EVENTS[ev.type];
    if (!def) continue;
    active.push({ city, ev, def });
  }
  // Diff: keep nodes by data-city, only swap timer text on update
  const existing = new Map();
  wrap.querySelectorAll('.ef-pill').forEach((el) => existing.set(el.dataset.city, el));

  // Remove pills whose city no longer has an event
  for (const [city, el] of existing) {
    if (!active.find((a) => a.city === city)) el.remove();
  }

  for (const { city, ev, def } of active) {
    let pill = existing.get(city);
    if (!pill) {
      pill = document.createElement('div');
      pill.className = 'ef-pill';
      pill.dataset.city = city;
      pill.dataset.dir = def.dir > 0 ? 'up' : 'down';
      const lvlLabel = EVENT_LEVELS[ev.level]?.label[ev.type] || `Lv ${ev.level}`;
      pill.innerHTML = `
        <div class="ef-glyph" aria-hidden="true">${def.glyph}</div>
        <div class="ef-info">
          <div class="ef-row">
            <span class="ef-name" title="${def.label}">${def.label}</span>
          </div>
          <span class="ef-city" title="${city}">${city}</span>
          <div class="ef-meta">
            <span class="ef-time" data-time>--:--</span>
            <span class="ef-level">${lvlLabel}</span>
          </div>
        </div>
        <button class="ef-close" type="button" aria-label="Clear ${def.label} in ${city}" title="Clear event">✕</button>
        <div class="ef-progress"><div class="ef-progress-fill" data-fill style="width:100%"></div></div>
      `;
      pill.querySelector('.ef-close').addEventListener('click', (e) => {
        e.stopPropagation();
        clearCityEvent(city);
      });
      wrap.appendChild(pill);
    } else {
      // Keep dir up to date in case of a re-trigger with a different type
      pill.dataset.dir = def.dir > 0 ? 'up' : 'down';
    }
    // Refresh dynamic bits
    const totalMs = ev.durationMs || EVENT_DURATION_MS;
    const remaining = ev.remainingMs;
    const pct = Math.max(0, Math.min(100, (remaining / totalMs) * 100));
    const isLow = remaining <= 5 * 60 * 1000; // last 5 minutes
    pill.classList.toggle('is-low', isLow);
    const tEl = pill.querySelector('[data-time]');
    if (tEl) tEl.textContent = fmtRemaining(remaining);
    const fEl = pill.querySelector('[data-fill]');
    if (fEl) fEl.style.width = pct + '%';
  }
}

function tickEventFloater() {
  const wrap = document.getElementById('eventFloater');
  if (!wrap) return;
  // Update timers + progress in place; only re-render if a pill needs adding/removing
  const pills = wrap.querySelectorAll('.ef-pill');
  const seen = new Set();
  for (const pill of pills) {
    const city = pill.dataset.city;
    const ev = getActiveEvent(city);
    if (!ev) {
      pill.remove();
      continue;
    }
    seen.add(city);
    const totalMs = ev.durationMs || EVENT_DURATION_MS;
    const pct = Math.max(0, Math.min(100, (ev.remainingMs / totalMs) * 100));
    const isLow = ev.remainingMs <= 5 * 60 * 1000;
    pill.classList.toggle('is-low', isLow);
    const tEl = pill.querySelector('[data-time]');
    if (tEl) tEl.textContent = fmtRemaining(ev.remainingMs);
    const fEl = pill.querySelector('[data-fill]');
    if (fEl) fEl.style.width = pct + '%';
  }
  // Add any newly-active events not yet in DOM
  for (const city of CITY_ORDER) {
    if (seen.has(city)) continue;
    if (eventState[city]) renderEventFloater();
  }
}

function fireEventNotif(title, body) {
  if (localStorage.getItem('silkroad_notif_events') !== '1') return;
  if (Notification.permission !== 'granted') return;
  new Notification(title, { body, icon: '/frontend/assets/images/favicon-32.png' });
}

// Tick: refresh timers + auto-clear expired events
setInterval(() => {
  if (!Object.keys(eventState).length) {
    // Make sure the floater is empty if all events expired between ticks
    const wrap = document.getElementById('eventFloater');
    if (wrap && wrap.children.length) wrap.innerHTML = '';
    return;
  }
  let anyExpired = false;
  const expiredCities = [];
  for (const city of Object.keys(eventState)) {
    const ev = eventState[city];
    const remaining = (ev.durationMs || EVENT_DURATION_MS) - (Date.now() - ev.startTime);
    if (remaining <= 0) {
      expiredCities.push({ city, ev });
      delete eventState[city];
      anyExpired = true;
      continue;
    }
    if (remaining <= 5 * 60 * 1000 && !ev.notified5min) {
      ev.notified5min = true;
      fireEventNotif(
        `${city} event ending soon`,
        `${EVENTS[ev.type]?.label || ev.type} ends in under 5 minutes`
      );
      saveEventState();
    }
    const tEl = document.getElementById('evt-' + city);
    if (tEl) tEl.textContent = fmtRemaining(remaining);
    // Also update card progress bar + low-time class
    const card = document.querySelector(`.evrow[data-city="${city}"]`);
    if (card) {
      const totalMs = ev.durationMs || EVENT_DURATION_MS;
      const pct = Math.max(0, Math.min(100, (remaining / totalMs) * 100));
      const fill = card.querySelector('.evcard-progress-fill');
      if (fill) fill.style.width = pct + '%';
      card.classList.toggle('is-low', remaining <= 5 * 60 * 1000);
    }
  }
  for (const { city, ev } of expiredCities)
    fireEventNotif(`${city} event ended`, `${EVENTS[ev.type]?.label || ev.type} has ended`);
  tickEventFloater();
  if (anyExpired) {
    saveEventState();
    updateAll();
    if (document.getElementById('eventsPanel').style.display !== 'none') renderEventsTab();
    renderEventFloater();
  }
}, 1000);

function buildAnimalSlots(count) {
  count = count || 3;
  const wrap = document.getElementById('animalSlots');
  const saved = [0, 1, 2, 3, 4].map((i) => ({
    animal: document.getElementById('animal' + i)?.value || 'None',
    saddle: document.getElementById('saddle' + i)?.checked || false,
  }));
  wrap.innerHTML = '';
  const title = document.getElementById('animalSlotsTitle');
  if (title) title.textContent = `Animal Slots (${count})`;
  const animalOpts = Object.keys(ANIMALS_DATA)
    .map((a) => `<option value="${a}">${a}</option>`)
    .join('');
  for (let i = 0; i < count; i++) {
    const d = document.createElement('div');
    d.className = 'frow';
    d.innerHTML = `<label>Slot ${i + 1}</label><select id="animal${i}" onchange="onAnimalChange(${i})">${animalOpts}</select>`;
    wrap.appendChild(d);
    const sd = document.createElement('div');
    sd.id = 'sRow' + i;
    sd.style.cssText = 'display:none;margin:-2px 0 6px';
    sd.className = 'check-row';
    sd.innerHTML = `<input type="checkbox" id="saddle${i}" onchange="updateAll()"><label for="saddle${i}" data-tip="Adds 2 cargo slots to this animal">Saddlebags</label>`;
    wrap.appendChild(sd);
    const sel = document.getElementById('animal' + i);
    if (sel) sel.value = saved[i].animal;
    const show = ANIMALS_DATA[saved[i].animal]?.saddle || false;
    sd.style.display = show ? 'flex' : 'none';
    const saddleEl = document.getElementById('saddle' + i);
    if (saddleEl) saddleEl.checked = show ? saved[i].saddle : false;
  }
}

function onCaravanChange() {
  buildAnimalSlots(calculateCaravanSlots(getPlayerState()));
  updateAll();
}

function onAnimalChange(i) {
  const val = document.getElementById('animal' + i).value;
  const show = ANIMALS_DATA[val]?.saddle || false;
  document.getElementById('sRow' + i).style.display = show ? 'flex' : 'none';
  if (!show) {
    const el = document.getElementById('saddle' + i);
    if (el) el.checked = false;
  }
  updateAll();
}

[
  'culture',
  'religion',
  'religionLevel',
  'langLevel',
  'backpack',
  'extraStorage',
  'autoWalk',
].forEach((id) => document.getElementById(id).addEventListener('change', updateAll));
['caravanGamepass', 'byzantineRank', 'sassanidRank'].forEach((id) =>
  document.getElementById(id).addEventListener('change', onCaravanChange)
);

function csvField(v) {
  const s = String(v);
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? '"' + s.replace(/"/g, '""') + '"'
    : s;
}

function exportCSV() {
  if (!allRoutes.length) {
    alert('No routes to export.');
    return;
  }
  const headers = [
    'Buy City',
    'Good',
    'Type',
    'Sell City',
    'Buy Price',
    'Sell Price',
    'Profit/Unit',
    'Profit/Trip',
    'Time (min)',
    'Profit/Min',
    'Return Cargo',
  ];
  const lines = [headers.join(',')];
  const cap = getBudgetCap();
  for (const r of allRoutes) {
    if (cap > 0 && r._budgetExcluded) continue;
    const ret = r.returnObj ? `${r.returnObj.good} (+$${r.returnObj.profitPerUnit})` : 'None';
    lines.push(
      [
        r.buyCity,
        r.good,
        r.goodType,
        r.sellCity,
        r.buyPrice,
        r.sellPrice,
        r.profitPerUnit,
        r.profitPerTrip,
        r.time,
        r.profitPerMin,
        ret,
      ]
        .map(csvField)
        .join(',')
    );
  }
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(lines.join('\n'));
  a.download = 'silk-road-routes.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function openCalcDiscord(e) {
  try {
    const url = 'https://discord.gg/VaHJ2PbuXN';
    const w = window.open(url, '_blank', 'noopener,noreferrer');
    if (w) {
      e.preventDefault();
      return;
    }
  } catch (_) {}
}
function openDiscord(e) {
  try {
    const url = 'https://discord.gg/dEsV8QPqSU';
    const w = window.open(url, '_blank', 'noopener,noreferrer');
    if (w) {
      e.preventDefault();
      return;
    }
  } catch (_) {}
  // fall through to default <a target=_blank> behavior
}

function openWiki(e) {
  try {
    const url = 'https://srtsimulator.fandom.com/wiki/Silk_Road_Trading_Simulator_Wiki';
    const w = window.open(url, '_blank', 'noopener,noreferrer');
    if (w) {
      e.preventDefault();
      return;
    }
  } catch (_) {}
  // fall through to default <a target=_blank> behavior
}

const LS_KEY = 'silkroad_v1';
function stateToObj() {
  return getPlayerState();
}

function applyState(s) {
  if (!s) return;
  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el && v != null) el.value = v;
  };
  const chk = (id, v) => {
    const el = document.getElementById(id);
    if (el && v != null) el.checked = !!v;
  };
  set('culture', s.culture);
  set('religion', s.religion);
  set('religionLevel', s.religionLevel);
  set('langLevel', s.langLevel);
  set('backpack', s.backpack);
  set('currentCity', s.currentCity);
  set('sellInCity', s.sellInCity);
  chk('extraStorage', s.extraStorage);
  chk('caravanGamepass', s.caravanGamepass);
  chk('autoWalk', s.autoWalk);
  set('byzantineRank', s.byzantineRank);
  set('sassanidRank', s.sassanidRank);
  buildAnimalSlots(
    calculateCaravanSlots({
      caravanGamepass: !!s.caravanGamepass,
      byzantineRank: parseInt(s.byzantineRank) || 1,
      sassanidRank: parseInt(s.sassanidRank) || 1,
    })
  );
  if (s.animals)
    s.animals.forEach((a, i) => {
      const el = document.getElementById('animal' + i);
      if (!el) return;
      el.value = a;
      const show = ANIMALS_DATA[a]?.saddle || false;
      const sRow = document.getElementById('sRow' + i);
      if (sRow) sRow.style.display = show ? 'flex' : 'none';
      const sd = document.getElementById('saddle' + i);
      if (sd) sd.checked = show ? !!(s.saddlebags && s.saddlebags[i]) : false;
    });
  if (s.saddlebags)
    s.saddlebags.forEach((sb, i) => {
      const el = document.getElementById('saddle' + i);
      if (el) el.checked = !!sb;
    });
}

function autoSave() {
  lsSet(LS_KEY, JSON.stringify(stateToObj()));
}

const SETUPS_KEY = 'silkroad_setups';
function getSetups() {
  return lsGetJson(SETUPS_KEY, {});
}
function saveSetups(obj) {
  lsSet(SETUPS_KEY, JSON.stringify(obj));
}

function refreshSetupDropdowns() {
  const names = Object.keys(getSetups()).sort();
  ['loadSetupSelect', 'clearSetupSelect'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const placeholder = id === 'loadSetupSelect' ? 'Choose setup' : 'Choose setup';
    el.innerHTML =
      `<option value="">${placeholder}</option>` +
      names.map((n) => `<option value="${n}">${n}</option>`).join('');
  });
}

function saveNamedState() {
  const nameEl = document.getElementById('setupNameInput');
  if (!nameEl) return;
  const name = (nameEl.value || '').trim();
  if (!name) {
    return;
  }
  const setups = getSetups();
  setups[name] = stateToObj();
  saveSetups(setups);
  nameEl.value = '';
  const btnSv = document.getElementById('btnSaveSetup');
  if (btnSv) btnSv.disabled = true;
  refreshSetupDropdowns();
}

function loadNamedState() {
  const name = document.getElementById('loadSetupSelect')?.value;
  if (!name) {
    return;
  }
  const setups = getSetups();
  if (!setups[name]) {
    return;
  }
  applyState(setups[name]);
  updateAll();
}

function clearNamedState() {
  const name = document.getElementById('clearSetupSelect')?.value;
  if (!name) {
    return;
  }
  const setups = getSetups();
  delete setups[name];
  saveSetups(setups);
  refreshSetupDropdowns();
}

/* Best round-trip card */
const LS_LOOP_COLLAPSED = 'silkroad_loop_collapsed';
function isLoopCollapsed() {
  return lsGet(LS_LOOP_COLLAPSED, '0') === '1';
}
function toggleLoopCollapsed() {
  const next = !isLoopCollapsed();
  lsSet(LS_LOOP_COLLAPSED, next ? '1' : '0');
  renderBestLoop();
}
function renderBestLoop() {
  const card = document.getElementById('bestLoopCard');
  if (!card) return;
  if (!allRoutes.length) {
    card.innerHTML = '';
    return;
  }
  // For each pair (A,B), find the most profitable round trip:
  // best A->B + best B->A, summed by profit/min over total time.
  let best = null;
  const byPair = {};
  for (const r of allRoutes) {
    if (r._budgetExcluded) continue;
    const k = r.buyCity + '|' + r.sellCity;
    if (!byPair[k] || r.profitPerTrip > byPair[k].profitPerTrip) byPair[k] = r;
  }
  for (const k in byPair) {
    const out = byPair[k];
    const back = byPair[out.sellCity + '|' + out.buyCity];
    if (!back) continue;
    const totalProfit = out.profitPerTrip + back.profitPerTrip;
    const totalTime = out.time + back.time;
    const ppm = totalTime > 0 ? Math.round(totalProfit / totalTime) : 0;
    if (!best || ppm > best.ppm) best = { out, back, totalProfit, totalTime, ppm };
  }
  if (!best || best.totalProfit <= 0) {
    card.innerHTML = `<div class="loop-empty">No profitable loop.</div>`;
    return;
  }
  const collapsed = isLoopCollapsed();
  const { out, back, totalProfit, totalTime, ppm } = best;
  const headChevron = '<span class="rct-chevron" aria-hidden="true"></span>';
  const headBtnCls =
    'loop-head loop-head-inline loop-head-toggle' +
    (collapsed ? ' loop-head-collapsed is-collapsed' : '');
  if (collapsed) {
    card.innerHTML = `
      <button type="button" class="${headBtnCls}" onclick="toggleLoopCollapsed()" title="Expand" aria-expanded="false">
        <span class="loop-crown" aria-hidden="true">⚜</span>
        <span class="loop-title">Loop</span>
        <span class="loop-collapsed-summary">
          ${badge(out.buyCity)}<span class="loop-arrow">⇄</span>${badge(out.sellCity)}
          <span class="loop-collapsed-cargo">${goodIconHTML(out.good)}<span class="loop-collapsed-arrow">·</span>${goodIconHTML(back.good)}</span>
        </span>
        <span class="loop-ppm">+$${ppm}<span class="loop-unit">/m</span></span>
        ${headChevron}
      </button>
    `;
    return;
  }
  card.innerHTML = `
    <button type="button" class="${headBtnCls}" onclick="toggleLoopCollapsed()" title="Collapse" aria-expanded="true">
      <span class="loop-crown" aria-hidden="true">⚜</span>
      <span class="loop-title">Best loop</span>
      <span class="loop-ppm">+$${ppm}<span class="loop-unit">/min</span></span>
      ${headChevron}
    </button>
    <div class="loop-body loop-body-inline">
      <div class="loop-inline-grid">
        <div class="loop-mini-row">
          <span class="loop-mini-h">Out</span>
          <span class="loop-mini-route">${badge(out.buyCity)}<span class="loop-arrow">→</span>${badge(out.sellCity)}</span>
          <span class="loop-leg-cargo">${goodIconHTML(out.good)}<span>${out.good}</span></span>
          <span class="loop-mini-st">+$${out.profitPerTrip} · ${fmtTime(out.time)}</span>
        </div>
        <div class="loop-mini-row">
          <span class="loop-mini-h">Ret</span>
          <span class="loop-mini-route">${badge(back.buyCity)}<span class="loop-arrow">→</span>${badge(back.sellCity)}</span>
          <span class="loop-leg-cargo">${goodIconHTML(back.good)}<span>${back.good}</span></span>
          <span class="loop-mini-st">+$${back.profitPerTrip} · ${fmtTime(back.time)}</span>
        </div>
      </div>
      <div class="loop-inline-totals">
        <span>Σ <b class="profit">+$${totalProfit}</b></span>
        <span>${fmtTime(totalTime)}</span>
        <span>/h <b class="profit">+$${ppm * 60}</b></span>
      </div>
    </div>
  `;
}

/* Current city handler */
function onSellCityChange() {
  renderTable();
  autoSave();
}

function onCurrentCityChange() {
  const v = document.getElementById('currentCity').value;
  const cs = document.getElementById('courierStart');
  if (cs && (!cs.value || cs.dataset.auto === '1')) {
    cs.value = v || '';
    cs.dataset.auto = '1';
  }
  renderTable();
  autoSave();
}

/* Courier route planner */

function onCourierQuestChange() {
  document.getElementById('shortQuestDest').disabled =
    !document.getElementById('shortQuestCheck').checked;
  document.getElementById('longQuestDest').disabled =
    !document.getElementById('longQuestCheck').checked;
  document.getElementById('courierResult').innerHTML = '';
}

// Returns ordered city array for the shortest geographic path between two cities
function getActualPath(from, to) {
  if (from === to) return [from];
  const visited = new Set([from]);
  const queue = [[from, [from]]];
  while (queue.length) {
    const [city, path] = queue.shift();
    for (const nb of CITY_NEIGHBORS[city] || []) {
      if (nb === to) return [...path, nb];
      if (!visited.has(nb)) {
        visited.add(nb);
        queue.push([nb, [...path, nb]]);
      }
    }
  }
  return [from, to];
}

// Best single good to carry from->to with given slots; null if nothing profitable
function bestGoodForLeg(from, to, ps, slots) {
  if (slots <= 0) return null;
  let best = null;
  for (const good of GOODS) {
    if (!isLuxuryAccessible(good, ps)) continue;
    const luxuryCity = LUXURY_CITY[good.name];
    if (luxuryCity && from !== luxuryCity) continue;
    if (CITIES[to].produced.includes(good.name)) continue;
    const buyPrice = calculateBuyPrice(good, from, ps);
    const sellPrice = calculateSellPrice(good, from, to, ps);
    const profitPerUnit = sellPrice - buyPrice;
    if (profitPerUnit <= 0) continue;
    const profitPerTrip = profitPerUnit * slots;
    if (!best || profitPerTrip > best.profitPerTrip)
      best = {
        good: good.name,
        goodType: good.type,
        buyPrice,
        sellPrice,
        profitPerUnit,
        profitPerTrip,
        slots,
      };
  }
  return best;
}

let _courierData = null;

function confirmCourierDelivery() {
  if (!_courierData) return;
  _courierData.phase = 'delivered';
  renderCourierUI(document.getElementById('courierResult'), _courierData);
}

function runCourierPlanner() {
  const start = document.getElementById('courierStart').value;
  const mustReturn = document.getElementById('courierReturn').checked;
  const shortOn = document.getElementById('shortQuestCheck').checked;
  const longOn = document.getElementById('longQuestCheck').checked;
  const shortDest = shortOn ? document.getElementById('shortQuestDest').value : '';
  const longDest = longOn ? document.getElementById('longQuestDest').value : '';
  const out = document.getElementById('courierResult');

  if (!start) {
    out.innerHTML = `<div class="planner-empty">Pick a starting city first.</div>`;
    return;
  }
  if (!shortOn && !longOn) {
    out.innerHTML = `<div class="planner-empty">Enable at least one courier quest.</div>`;
    return;
  }
  if (shortOn && !shortDest) {
    out.innerHTML = `<div class="planner-empty">Pick a destination for the short quest.</div>`;
    return;
  }
  if (longOn && !longDest) {
    out.innerHTML = `<div class="planner-empty">Pick a destination for the long quest.</div>`;
    return;
  }
  if (shortOn && shortDest === start) {
    out.innerHTML = `<div class="planner-empty">Short quest destination can't be your starting city.</div>`;
    return;
  }
  if (longOn && longDest === start) {
    out.innerHTML = `<div class="planner-empty">Long quest destination can't be your starting city.</div>`;
    return;
  }

  const ps = getPlayerState();
  const totalSlots = calculateStorage(ps);
  const walkspeed = calculateWalkspeed(ps);

  // Build package list sorted by travel distance from start (closer first)
  const packages = [];
  if (shortOn) packages.push({ type: 'short', dest: shortDest });
  if (longOn) packages.push({ type: 'long', dest: longDest });
  packages.sort(
    (a, b) => (TRAVEL_TIMES[start]?.[a.dest] || 99) - (TRAVEL_TIMES[start]?.[b.dest] || 99)
  );

  // Build the full city sequence for the outbound trip
  let outboundCities = [start];
  let cur = start;
  for (const pkg of packages) {
    const path = getActualPath(cur, pkg.dest);
    outboundCities = outboundCities.concat(path.slice(1));
    cur = pkg.dest;
  }

  // Map delivery city -> packages being dropped off there
  const deliveryMap = {};
  for (const pkg of packages) {
    if (!deliveryMap[pkg.dest]) deliveryMap[pkg.dest] = [];
    deliveryMap[pkg.dest].push(pkg);
  }

  // Calculate outbound legs; slots shrink while carrying packages
  let packagesLeft = packages.length;
  const outboundLegs = [];
  let outboundTradeProfit = 0;

  for (let i = 0; i < outboundCities.length - 1; i++) {
    const from = outboundCities[i];
    const to = outboundCities[i + 1];
    const avail = Math.max(0, totalSlots - packagesLeft);
    const tTime = calculateTravelTime(from, to, walkspeed);
    const cargo = bestGoodForLeg(from, to, ps, avail);
    outboundLegs.push({ from, to, cargo, time: tTime, avail });
    if (cargo) outboundTradeProfit += cargo.profitPerTrip;
    if (deliveryMap[to]) packagesLeft -= deliveryMap[to].length;
  }

  // Build return legs (all packages delivered -> full slots)
  const returnLegs = [];
  let returnTradeProfit = 0;
  if (mustReturn) {
    const lastCity = outboundCities[outboundCities.length - 1];
    if (lastCity !== start) {
      const returnPath = getActualPath(lastCity, start);
      for (let i = 0; i < returnPath.length - 1; i++) {
        const from = returnPath[i];
        const to = returnPath[i + 1];
        const tTime = calculateTravelTime(from, to, walkspeed);
        const cargo = bestGoodForLeg(from, to, ps, totalSlots);
        returnLegs.push({ from, to, cargo, time: tTime, avail: totalSlots });
        if (cargo) returnTradeProfit += cargo.profitPerTrip;
      }
    }
  }

  _courierData = {
    start,
    packages,
    outboundCities,
    outboundLegs,
    returnLegs,
    outboundTradeProfit,
    returnTradeProfit,
    deliveryMap,
    totalSlots,
    mustReturn,
    ps,
    phase: 'outbound',
  };
  renderCourierUI(out, _courierData);
}

function renderCourierUI(out, data) {
  const {
    start,
    outboundLegs,
    returnLegs,
    outboundTradeProfit,
    returnTradeProfit,
    deliveryMap,
    mustReturn,
    phase,
  } = data;

  function legCard(leg, num) {
    let cargoHtml;
    if (leg.avail === 0) {
      cargoHtml = `<div class="trip-leg-hint">Slots full, packages only</div>`;
    } else if (!leg.cargo) {
      cargoHtml = `<div class="trip-leg-hint">Nothing profitable to carry</div>`;
    } else {
      cargoHtml = `<div class="trip-leg-cargo">${goodIconHTML(leg.cargo.good)}<span>${leg.cargo.good}</span></div>
                   <div class="trip-leg-stats">${leg.avail} slot${leg.avail !== 1 ? 's' : ''} · ${fmtTime(leg.time)}</div>`;
    }
    return `<div class="trip-leg">
      <div class="trip-leg-num">${num}</div>
      <div class="trip-leg-body">
        <div class="trip-leg-route">${badge(leg.from)} <span class="loop-arrow">→</span> ${badge(leg.to)}</div>
        ${cargoHtml}
      </div>
    </div>`;
  }

  function deliveryBadges(city) {
    const pkgs = deliveryMap[city];
    if (!pkgs) return '';
    return pkgs
      .map((pkg) => {
        const label = pkg.type === 'short' ? 'Short' : 'Long';
        return `<div class="courier-delivery-event">
        <div class="courier-delivery-badge">
          📦 Deliver <span class="courier-quest-badge ${pkg.type}" style="margin:0 6px">${label}</span> quest package
        </div>
      </div>`;
      })
      .join('');
  }

  // Build outbound HTML
  let legNum = 1;
  let outHtml = '';
  for (let i = 0; i < outboundLegs.length; i++) {
    const leg = outboundLegs[i];
    if (i > 0) outHtml += '<div class="trip-arrow">↓</div>';
    outHtml += legCard(leg, legNum++);
    if (deliveryMap[leg.to]) outHtml += deliveryBadges(leg.to);
  }

  // Build return HTML (only shown after delivery confirmed)
  let returnHtml = '';
  if (phase === 'delivered' && mustReturn && returnLegs.length > 0) {
    let rHtml = '';
    for (let i = 0; i < returnLegs.length; i++) {
      const leg = returnLegs[i];
      if (i > 0) rHtml += '<div class="trip-arrow">↓</div>';
      rHtml += legCard(leg, legNum++);
    }
    returnHtml = `
      <div class="courier-return-header">↩ Return to ${start}</div>
      <div class="trip-legs">${rHtml}</div>
    `;
  }

  const tradeProfitShown =
    phase === 'delivered' ? outboundTradeProfit + returnTradeProfit : outboundTradeProfit;
  const profitLabel =
    phase === 'delivered' ? 'Total trade profit' : 'Trade profit';

  const summaryHtml = `
    <div class="trip-summary" style="grid-template-columns:1fr">
      <div class="trip-stat big"><span>${profitLabel}</span><b class="profit">+$${tradeProfitShown}</b></div>
    </div>`;

  const deliverBtn =
    phase === 'outbound'
      ? `
    <div class="courier-deliver-wrap">
      <button class="btn btn-gold" onclick="confirmCourierDelivery()">✔ Confirm Package Delivered</button>
    </div>`
      : mustReturn && returnLegs.length > 0
        ? ''
        : `<div class="courier-complete-msg">✦ Journey complete. All packages delivered.</div>`;

  out.innerHTML = `
    <div class="trip-card" style="margin-top:16px">
      ${summaryHtml}
      <div class="courier-section-label">▼ Outbound Journey</div>
      <div class="trip-legs">${outHtml}</div>
      ${returnHtml}
      ${deliverBtn}
    </div>`;
}

/* Optimal setup finder */
function runOptimalFinder() {
  const out = document.getElementById('optimalResult');
  out.innerHTML = `<div class="planner-empty">Crunching combinations…</div>`;
  // brute force every (culture × religion × faithLevel × langLevel)
  const baseState = getPlayerState();
  const cultures = ['Byzantine', 'Syriac', 'Persian'];
  const religions = ['Christianity', 'Judaism', 'Zoroastrianism'];
  const faiths = [0, 1, 2, 3];
  const langs = [1, 2, 3];
  let best = null;
  // run async-ish so the UI can repaint
  setTimeout(() => {
    for (const c of cultures) {
      for (const r of religions) {
        for (const f of faiths) {
          for (const l of langs) {
            const ps = {
              ...baseState,
              culture: c,
              religion: r,
              religionLevel: f,
              langLevel: l,
            };
            let routes = generateRoutes(ps);
            routes = enrichRoutes(routes, ps);
            applyOutboundBudget(routes, getBudgetCap());
            // best round trip
            const byPair = {};
            for (const rt of routes) {
              if (rt._budgetExcluded) continue;
              const k = rt.buyCity + '|' + rt.sellCity;
              if (!byPair[k] || rt.profitPerTrip > byPair[k].profitPerTrip) byPair[k] = rt;
            }
            let bestLoop = null;
            for (const k in byPair) {
              const o = byPair[k];
              const b = byPair[o.sellCity + '|' + o.buyCity];
              if (!b) continue;
              const tp = o.profitPerTrip + b.profitPerTrip;
              const tt = o.time + b.time;
              const ppm = tt > 0 ? tp / tt : 0;
              if (!bestLoop || ppm > bestLoop.ppm) bestLoop = { out: o, back: b, tp, tt, ppm };
            }
            if (bestLoop && (!best || bestLoop.ppm > best.bestLoop.ppm)) {
              best = { culture: c, religion: r, faith: f, lang: l, bestLoop };
            }
          }
        }
      }
    }
    if (!best) {
      out.innerHTML = `<div class="planner-empty">No profitable setup found.</div>`;
      return;
    }
    const { culture, religion, faith, lang, bestLoop } = best;
    const langLabel = ['', 'Broken (−5%)', 'Proficient (0%)', 'Fluent (+5%)'][lang];
    const faithLabel = faith === 0 ? 'None' : 'Level ' + faith;
    out.innerHTML = `
      <div class="optimal-card">
        <div class="optimal-h">Recommended Setup</div>
        <div class="optimal-grid">
          <div class="optimal-row"><span>Culture</span><b>${culture}</b></div>
          <div class="optimal-row"><span>Religion</span><b>${religion}</b></div>
          <div class="optimal-row"><span>Faith Level</span><b>${faithLabel}</b></div>
          <div class="optimal-row"><span>Language</span><b>${langLabel}</b></div>
        </div>
        <div class="optimal-loop">
          <div class="optimal-loop-h">→ Yields best round trip</div>
          <div class="optimal-loop-body">
            <div class="optimal-loop-route">${badge(bestLoop.out.buyCity)} <span class="loop-arrow">→</span> ${badge(bestLoop.out.sellCity)} <span class="loop-arrow">→</span> ${badge(bestLoop.out.buyCity)}</div>
            <div class="optimal-loop-cargo">
              ${goodIconHTML(bestLoop.out.good)}<span>${bestLoop.out.good}</span>
              <span class="loop-arrow">+</span>
              ${goodIconHTML(bestLoop.back.good)}<span>${bestLoop.back.good}</span>
            </div>
            <div class="optimal-loop-stats">
              Profit / min: <b class="profit">+$${Math.round(bestLoop.ppm)}</b>
              · Round-trip profit: <b class="profit">+$${bestLoop.tp}</b>
              · Time: <b>${fmtTime(bestLoop.tt)}</b>
            </div>
          </div>
        </div>
        <div class="set-btns" style="justify-content:flex-start;margin-top:14px">
          <button class="btn btn-gold" onclick="applyOptimal('${culture}','${religion}',${faith},${lang})">⚜ Apply These Settings</button>
        </div>
      </div>
    `;
  }, 30);
}
function applyOptimal(culture, religion, faith, lang) {
  document.getElementById('culture').value = culture;
  document.getElementById('religion').value = religion;
  document.getElementById('religionLevel').value = String(faith);
  document.getElementById('langLevel').value = String(lang);
  updateAll();
}

function loadTheme() {
  document.body.dataset.theme = 'slate';
  lsSet('silkroad_theme', 'slate');
}

const WALKER_KEY = 'srtc-walker';
function applyWalker(enabled) {
  document.body.classList.toggle('no-walker', !enabled);
  lsSet(WALKER_KEY, enabled ? '1' : '0');
  const el = document.getElementById('walkerToggle');
  if (el) el.checked = enabled;
}
function loadWalker() {
  let enabled = true;
  const v = lsGet(WALKER_KEY, null);
  if (v !== null) enabled = v !== '0';
  applyWalker(enabled);
}

/* Math breakdown tooltip */
function buildPriceBreakdown(route, kind) {
  const ps = getPlayerState();
  const good = GOODS.find((g) => g.name === route.good);
  if (!good) return '';
  const city = kind === 'buy' ? route.buyCity : route.sellCity;
  const rawCityMod = calculateCityModifier(
    good,
    city,
    ps.culture,
    ps.religion,
    ps.religionLevel,
    kind
  );
  const cityMod = rawCityMod;
  const langMod = calculateLanguageModifier(
    city,
    ps.culture,
    ps.langLevel,
    ps.religion,
    ps.religionLevel
  );
  const relMod = calculateReligionModifier(good, city, ps.religion, ps.religionLevel);
  const repMod = kind === 'buy' ? calculateRepDiscount(city, ps) : 0;
  const importCost = kind === 'buy' ? Math.round(calculateDistanceValue(good, city)) : 0;
  const importHops = kind === 'buy' ? getMinHopsFromProducers(good, city) : 0;
  const distHops = kind === 'sell' ? getMinHopsFromProducers(good, route.sellCity) : 0;
  const distBonus = kind === 'sell' ? Math.floor(good.base * distHops * good.hopPct) : 0;
  const modSign = kind === 'buy' ? -1 : 1;
  const cityAmt = cityMod
    ? Math.floor(good.base * Math.abs(cityMod)) * (cityMod >= 0 ? modSign : -modSign)
    : 0;
  const langAmt = langMod
    ? Math.floor(good.base * Math.abs(langMod)) * (langMod >= 0 ? modSign : -modSign)
    : 0;
  const relAmt = relMod
    ? Math.floor(good.base * Math.abs(relMod)) * (relMod >= 0 ? modSign : -modSign)
    : 0;
  const lines = [];
  lines.push(
    `<div class="bk-title">${kind === 'buy' ? 'Buy' : 'Sell'} Price · ${good.name} in ${city}</div>`
  );
  lines.push(`<div class="bk-row"><span>Base price</span><b>$${good.base}</b></div>`);
  if (importCost > 0)
    lines.push(
      `<div class="bk-row"><span>Imported (${importHops} hop${importHops !== 1 ? 's' : ''} from producer)</span><b class="loss">+$${importCost}</b></div>`
    );
  if (distBonus > 0)
    lines.push(
      `<div class="bk-row"><span>Distance (${distHops} hop${distHops !== 1 ? 's' : ''} from producer)</span><b class="profit">+$${distBonus}</b></div>`
    );
  const modCls = (amt) =>
    kind === 'buy' ? (amt <= 0 ? 'profit' : 'loss') : amt >= 0 ? 'profit' : 'loss';
  const modFmt = (amt) => `${amt >= 0 ? '+' : ''}$${amt}`;
  if (cityMod)
    lines.push(
      `<div class="bk-row"><span>City modifier</span><b class="${modCls(cityAmt)}">${modFmt(cityAmt)}</b></div>`
    );
  if (langMod)
    lines.push(
      `<div class="bk-row"><span>Language</span><b class="${modCls(langAmt)}">${modFmt(langAmt)}</b></div>`
    );
  if (relMod)
    lines.push(
      `<div class="bk-row"><span>Religion</span><b class="${modCls(relAmt)}">${modFmt(relAmt)}</b></div>`
    );
  if (repMod)
    lines.push(
      `<div class="bk-row"><span>Reputation rank 6</span><b class="profit">-$${Math.floor(good.base * repMod)}</b></div>`
    );
  const evDelta = getActiveEventDelta(good, city);
  if (evDelta) {
    const ev = getActiveEvent(city);
    const def = EVENTS[ev.type];
    const lvlLabel = EVENT_LEVELS[ev.level]?.label[ev.type] || `L${ev.level}`;
    const sign = evDelta > 0 ? '+' : '−';
    lines.push(
      `<div class="bk-row"><span>${def.glyph} Event: ${def.label} (${lvlLabel})</span><b class="${evDelta > 0 ? 'profit' : 'loss'}">${sign}$${Math.abs(Math.round(evDelta))}</b></div>`
    );
  }
  if (!importCost && !cityMod && !langMod && !relMod && !repMod && !distBonus && !evDelta)
    lines.push(`<div class="bk-row"><span>No modifiers apply</span><b>-</b></div>`);
  const finalPrice = kind === 'buy' ? route.buyPrice : route.sellPrice;
  lines.push(`<div class="bk-row total"><span>Final</span><b>$${finalPrice}</b></div>`);
  return lines.join('');
}
let priceTip = null;
function ensurePriceTip() {
  if (priceTip) return priceTip;
  priceTip = document.createElement('div');
  priceTip.id = 'priceTip';
  priceTip.style.display = 'none';
  document.body.appendChild(priceTip);
  return priceTip;
}
document.addEventListener('mouseover', (e) => {
  const cell = e.target.closest('.price-cell');
  if (!cell) return;
  const idx = parseInt(cell.dataset.routeIdx);
  const kind = cell.dataset.priceKind;
  const r = allRoutes[idx];
  if (!r) return;
  const tip = ensurePriceTip();
  tip.innerHTML = buildPriceBreakdown(r, kind);
  tip.style.display = 'block';
  const rect = cell.getBoundingClientRect();
  tip.style.left = rect.left + window.scrollX + 'px';
  tip.style.top = rect.bottom + window.scrollY + 6 + 'px';
});
document.addEventListener('mouseout', (e) => {
  const cell = e.target.closest('.price-cell');
  if (!cell) return;
  if (priceTip) priceTip.style.display = 'none';
});

buildAnimalSlots();
loadTheme();
loadWalker();
loadEventState();
renderEventFloater();

// Sidebar collapse
const SIDEBAR_KEY = 'srtc-sidebar';
function applySidebarState(collapsed) {
  document.body.dataset.sidebar = collapsed ? 'collapsed' : 'open';
  const btn = document.getElementById('sidebarToggle');
  if (btn) {
    btn.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
    btn.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
  }
}
(function initSidebar() {
  const isMobile = window.innerWidth <= 768;
  let collapsed = isMobile; // default collapsed on mobile
  const stored = lsGet(SIDEBAR_KEY, null);
  if (stored !== null) collapsed = stored === '1';
  else if (isMobile) collapsed = true;
  applySidebarState(collapsed);
  const btn = document.getElementById('sidebarToggle');
  if (btn)
    btn.addEventListener('click', () => {
      const isOpen = document.body.dataset.sidebar !== 'collapsed';
      applySidebarState(isOpen);
      lsSet(SIDEBAR_KEY, isOpen ? '1' : '0');
    });
})();
refreshSetupDropdowns();
{
  const savedState = lsGetJson(LS_KEY, null);
  let charSetup = null;
  try { charSetup = JSON.parse(localStorage.getItem('srtc-char') || 'null'); } catch (_) {}
  const merged = (savedState || charSetup)
    ? Object.assign({}, savedState || {}, charSetup || {})
    : null;
  if (merged) applyState(merged);
}
(function initBudgetCapEarly() {
  const el = document.getElementById('budgetCap');
  if (!el) return;
  const saved = lsGet(BUDGET_KEY, '');
  if (saved !== '') el.value = saved;
  let t = 0;
  const persistAndRefresh = () => {
    lsSet(BUDGET_KEY, String(el.value).trim());
    updateAll();
  };
  el.addEventListener('change', persistAndRefresh);
  el.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(persistAndRefresh, 280);
  });
})();
updateAll();

const API_BASE = 'https://admin.silkroadcalc.eu';

function renderAboutChangelogs(logs) {
  const wrap = document.getElementById('aboutChangelogList');
  if (!wrap) return;
  if (!logs?.length) {
    wrap.innerHTML = `<div class="changelog-entry"><div class="changelog-ver">No updates yet</div></div>`;
    return;
  }

  wrap.innerHTML = logs
    .map((l, idx) => {
      const latestBadge = idx === 0 ? `<span class="changelog-date">Latest</span>` : '';
      const entries = (l.entries || []).map((e) => `<li>${escHtml(e)}</li>`).join('');
      const thanks = l.thanks
        ? `<div class="changelog-thanks">Special thanks: ${escHtml(l.thanks)}</div>`
        : '';
      return `
        <div class="changelog-entry">
          <div class="changelog-ver">${escHtml(l.version)}${latestBadge}</div>
          <ul>${entries}</ul>
          ${thanks}
        </div>
      `;
    })
    .join('');
}

async function syncFromApi() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const [gr, tr, mr, cr, nr, citr, evr, tefr, rpr] = await Promise.all([
      fetch(API_BASE + '/api/goods', { signal: ctrl.signal }),
      fetch(API_BASE + '/api/travel-times', { signal: ctrl.signal }),
      fetch(API_BASE + '/api/maintenance', { signal: ctrl.signal }),
      fetch(API_BASE + '/api/changelogs', { signal: ctrl.signal }),
      fetch(API_BASE + '/api/notices', { signal: ctrl.signal }),
      fetch(API_BASE + '/api/cities', { signal: ctrl.signal }),
      fetch(API_BASE + '/api/events', { signal: ctrl.signal }),
      fetch(API_BASE + '/api/trait-effects', { signal: ctrl.signal }),
      fetch(API_BASE + '/api/religion-perks', { signal: ctrl.signal }),
    ]);
    clearTimeout(t);
    let changed = false;
    let routeDataChanged = false;
    if (gr.ok) {
      const d = await gr.json();
      if (d.length) {
        GOODS = d.map((g) => ({
          name: g.name,
          base: g.base_price,
          type: g.type,
          hopPct: g.hop_pct,
          produced_in: g.produced_in,
        }));
        changed = true;
        routeDataChanged = true;
      }
    }
    if (tr.ok) {
      const d = await tr.json();
      if (Object.keys(d).length) {
        TRAVEL_TIMES = d;
        changed = true;
      }
    }
    if (citr.ok) {
      const d = await citr.json();
      if (d.length) {
        const c = {};
        for (const r of d)
          c[r.name] = {
            culture: r.culture,
            language: r.language,
            hasFireTemple: r.has_fire_temple,
            traits: r.traits,
            produced: r.produced,
          };
        CITIES = c;
        changed = true;
        routeDataChanged = true;
      }
    }
    if (evr.ok) {
      const d = await evr.json();
      if (d.length) {
        const em = {},
          lm = {};
        for (const e of d) {
          em[e.name] = {
            dir: e.dir,
            label: e.name,
            glyph: e.glyph,
            goodTypes: e.good_types,
            goodNames: e.good_names,
            desc: e.description,
          };
          for (const l of e.levels || []) {
            if (!lm[l.level]) lm[l.level] = { pct: l.pct, base: l.base_bonus, label: {} };
            lm[l.level].label[e.name] = l.label;
          }
        }
        EVENTS = em;
        EVENT_LEVELS = lm;
        changed = true;
      }
    }
    if (tefr.ok) {
      const d = await tefr.json();
      if (d.length) {
        TRAIT_EFFECTS = d.map((r) => ({
          trait_name: r.trait_name,
          kind: r.kind,
          bonus: parseFloat(r.bonus),
          cond_type: r.cond_type,
          cond_value: r.cond_value,
        }));
        changed = true;
      }
    }
    if (rpr.ok) {
      const d = await rpr.json();
      if (d.length) {
        RELIGION_PERKS = d.map((r) => ({
          religion: r.religion,
          min_level: r.min_level,
          perk_type: r.perk_type,
          multiplier: parseFloat(r.multiplier),
        }));
        changed = true;
      }
    }
    if (routeDataChanged) rebuildRouteCaches();
    if (changed) updateAll();
    if (mr.ok) {
      const m = await mr.json();
      const ov = document.getElementById('maintOverlay');
      if (ov) {
        ov.style.display = m.active ? 'flex' : 'none';
        const msg = document.getElementById('maintMsg');
        if (msg && m.message) msg.textContent = m.message;
      }
    }
    if (cr.ok) {
      const logs = await cr.json();
      renderAboutChangelogs(logs);
    }
    if (nr.ok) {
      const notices = await nr.json();
      const noticeBar = document.getElementById('noticeBar');
      if (noticeBar) {
        if (notices.length && notices[0].active) {
          noticeBar.style.display = 'flex';
          const noticeText = document.getElementById('noticeText');
          if (noticeText) noticeText.textContent = notices[0].message;
          const level = notices[0].level || 'info';
          const colors = {
            info: { bg: '#3a3a2e', border: '#5a5a4e', text: '#ddd' },
            warning: { bg: '#4a3a2e', border: '#8a6a3e', text: '#f0d080' },
            error: { bg: '#4a2a2e', border: '#8a3a3e', text: '#ff9999' },
          };
          const c = colors[level] || colors.info;
          noticeBar.style.background = c.bg;
          noticeBar.style.borderBottomColor = c.border;
          noticeBar.style.color = c.text;
        } else {
          noticeBar.style.display = 'none';
        }
      }
    }
  } catch (_) {}
}

function getSessionId() {
  let sid = lsGet('srtc-session-id', null);
  if (!sid) {
    sid = crypto.randomUUID();
    lsSet('srtc-session-id', sid);
  }
  return sid;
}

function pingSession() {
  const sid = getSessionId();
  const fpId = lsGet('srtc-fp', null);
  const pingBody = { sessionId: sid };
  if (fpId) pingBody.fpId = fpId;
  fetch(API_BASE + '/api/session/ping', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pingBody),
  }).then(r => r.ok ? r.json() : null).then(d => {
    if (d?.banned) window.location.replace('/frontend/banned/banned.html');
  }).catch(() => {});
}

syncFromApi();
pingSession();
setInterval(pingSession, 60000);

// Webhooks per feedback type
const FB_WEBHOOKS = {
  feedback:
    'https://discord.com/api/webhooks/1498685411936178340/zvZ2bQGi3KXsbljh-SHZbZwiP8Xlm6wtHvFXmYQUrgFv2-FGtwWh_v6gpQRu022RT6c3',
  suggestion:
    'https://discord.com/api/webhooks/1498685636780232839/Unhj-myxfubtYeT2u_vREIAbQI_2SpBeywcpPZz-id6d6u6KKeiJzLcb2WR510jucJnN',
  bug: 'https://discord.com/api/webhooks/1498685765171937290/hfq83Lh3NkJUkUiVf4mLKbJohmPscpfhkRCSkR3QAXLJZemajtbz4Hjn2LWhXiQbqbhW',
};
const FB_META = {
  feedback: {
    title: '💬 New Feedback',
    color: 0xd4a843,
    placeholder: "Tell us what's on your mind…",
    submit: 'Send Feedback',
  },
  suggestion: {
    title: '✨ New Suggestion',
    color: 0x9aef9a,
    placeholder: 'What would you like to see added or improved?',
    submit: 'Send Suggestion',
  },
  bug: {
    title: '🐞 New Bug Report',
    color: 0xd96b5a,
    placeholder: 'Describe the bug, what you expected, and how to reproduce it.',
    submit: 'Send Bug Report',
  },
};

function isTrollFeedbackMessage(message) {
  const text = String(message || '').trim();
  if (text.length < 24) return false;
  const compact = text.replace(/\s/g, '');
  if (!compact) return false;
  const letters = (text.match(/[A-Za-z]/g) || []).length;
  const symbols = (text.match(/[^A-Za-z0-9\s]/g) || []).length;
  const lines = text.split(/\r?\n/).filter(Boolean).length;
  return (
    (text.length >= 40 && letters < 3 && symbols / compact.length > 0.6) ||
    (text.length >= 80 && letters / compact.length < 0.05) ||
    (lines >= 4 && letters < 5 && symbols > 20)
  );
}

document.addEventListener('DOMContentLoaded', () => {
  initTableEvents();
  initRouteControlsCollapse();
  const feedbackBtn = document.getElementById('feedbackBtn');
  const modal = document.getElementById('feedbackModal');
  const closeBtn = document.getElementById('closeBtn');
  const form = document.getElementById('feedbackForm');
  const statusEl = document.getElementById('status');
  const messageEl = document.getElementById('message');
  const submitBtn = document.getElementById('sendBtn');
  const fbContainer = document.getElementById('feedbackContainer');
  if (
    feedbackBtn &&
    modal &&
    closeBtn &&
    form &&
    statusEl &&
    messageEl &&
    submitBtn
  ) {
  const typeRadios = form.querySelectorAll('input[name="fbType"]');

  function getType() {
    const r = form.querySelector('input[name="fbType"]:checked');
    return r ? r.value : 'feedback';
  }
  function applyType() {
    const meta = FB_META[getType()];
    if (!meta) return;
    messageEl.placeholder = meta.placeholder;
    submitBtn.textContent = meta.submit;
  }
  typeRadios.forEach((r) => r.addEventListener('change', applyType));
  applyType();

  function setStatus(text, kind) {
    statusEl.textContent = text || '';
    statusEl.classList.remove('ok', 'err', 'pending');
    if (kind) statusEl.classList.add(kind);
  }

  function openForm() {
    modal.style.display = 'flex';
    requestAnimationFrame(() => requestAnimationFrame(() => modal.classList.add('is-visible')));
    if (fbContainer) fbContainer.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  function closeForm() {
    modal.classList.remove('is-visible');
    setTimeout(() => {
      modal.style.display = 'none';
    }, 320);
    if (fbContainer) fbContainer.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  feedbackBtn.addEventListener('click', () => {
    modal.classList.contains('is-visible') ? closeForm() : openForm();
  });

  closeBtn.addEventListener('click', closeForm);

  // Click the overlay backdrop (not the box) to close
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeForm();
  });

  // Escape to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('is-visible')) closeForm();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = getType();
    const meta = FB_META[type];
    const url = FB_WEBHOOKS[type];
    if (!url) {
      setStatus('Unknown type.', 'err');
      return;
    }

    const username = document.getElementById('username').value.trim();
    const message = messageEl.value.trim();
    if (!message) return;

    if (isTrollFeedbackMessage(message)) {
      await fetch(API_BASE + '/api/feedback/abuse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: getSessionId(),
          fpId: lsGet('srtc-fp', null),
          type,
          message,
        }),
      }).catch(() => {});
      window.location.replace('/frontend/banned/banned.html');
      return;
    }

    setStatus('Sending…', 'pending');
    submitBtn.disabled = true;

    const payload = {
      embeds: [
        {
          title: meta.title + ' | silkroadcalc.eu',
          color: meta.color,
          timestamp: new Date().toISOString(),
          fields: [
            {
              name: 'Type',
              value: type.charAt(0).toUpperCase() + type.slice(1),
              inline: true,
            },
            { name: 'Username', value: username || 'Anonymous', inline: true },
            { name: 'Message', value: message },
          ],
          footer: { text: 'silkroadcalc.eu' },
        },
      ],
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setStatus('Thank you, sent!', 'ok');
        form.reset();
        applyType(); // restore default placeholder/submit copy
        setTimeout(() => {
          closeForm();
          setStatus('');
          submitBtn.disabled = false;
        }, 1800);
      } else {
        throw new Error();
      }
    } catch (err) {
      setStatus('Failed to send. Please try again.', 'err');
      submitBtn.disabled = false;
    }
  });
  }
});

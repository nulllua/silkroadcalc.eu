// Site + analytics feature area

async function loadSite() {
  const [mr, cr, nr] = await Promise.all([
    api('/api/maintenance'),
    api('/api/changelogs'),
    api('/api/notices'),
  ]);
  if (mr.ok) {
    const m = await mr.json();
    el('maint-active').checked = !!m.active;
    el('maint-msg').value = m.message || '';
  }
  if (cr.ok) renderChangelogs(await cr.json());
  if (nr.ok) {
    const notices = await nr.json();
    if (notices.length) {
      const notice = notices[0];
      el('notice-msg').value = notice.message || '';
      el('notice-level').value = notice.level || 'info';
      el('clear-notice-btn').style.display = notice.active ? 'inline-block' : 'none';
    }
  }
}

async function saveMaintenance() {
  const active = el('maint-active').checked;
  const message = el('maint-msg').value.trim();
  const res = await api('/api/admin/maintenance', {
    method: 'POST',
    body: JSON.stringify({ active, message }),
  });
  ss('maint-ss', res.ok, res.ok ? (active ? '⚠ Maintenance ON' : 'Maintenance off') : 'Error');
}

function renderChangelogs(logs) {
  el('changelogs-list').innerHTML =
    logs
      .map((l) => {
        const id = l.id;
        const entries = (l.entries || []).join('\n');
        const safeVersion = escHtml(l.version);
        const safeThanks = escHtml(l.thanks || '');
        return `
    <div style="background:#13151e;border:1px solid #2a2d3a;border-radius:5px;padding:16px;margin-bottom:10px;max-width:660px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <span class="hl" style="font-size:15px">${safeVersion}</span>
        <span style="font-size:12px;color:#666">${l.date ? new Date(l.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</span>
        <button class="btn btn-del" style="margin-left:auto;padding:3px 10px" data-id="${id}" onclick="delChangelog(this)">Delete</button>
        <span class="ss" id="cl-save-${id}"></span>
      </div>
      <div style="margin-bottom:8px">
        <label style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:3px">Bullet Points (one per line)</label>
        <textarea id="cl-ent-${id}" rows="5" style="width:100%;background:#0f1117;border:1px solid #2a2d3a;color:#ccc;padding:7px;border-radius:3px;font-size:12px;font-family:inherit;resize:vertical">${escHtml(entries)}</textarea>
      </div>
      <div style="display:flex;gap:10px;align-items:center">
        <input id="cl-ver-${id}" class="ifield" type="text" value="${safeVersion}" style="width:90px" placeholder="Version">
        <input id="cl-thanks-${id}" class="ifield" type="text" value="${safeThanks}" style="width:200px" placeholder="Thanks (optional)">
        <button class="btn btn-save" data-id="${id}" onclick="saveChangelog(this)">Save</button>
      </div>
    </div>`;
      })
      .join('') || '<span class="dim">No changelog entries yet.</span>';
}

async function addChangelog() {
  const version = v('cl-ver'),
    thanks = v('cl-thanks');
  const date = v('cl-date') || new Date().toISOString().slice(0, 10);
  const entries = el('cl-entries')
    .value.split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!version) return ss('cl-ss', false, 'Need version');
  const res = await api('/api/admin/changelogs', {
    method: 'POST',
    body: JSON.stringify({ version, date, entries, thanks }),
  });
  ss('cl-ss', res.ok);
  if (res.ok) {
    ['cl-ver', 'cl-date', 'cl-thanks'].forEach((i) => (el(i).value = ''));
    el('cl-entries').value = '';
    loadSite();
  }
}

async function saveChangelog(btn) {
  const id = btn.dataset.id;
  const version = el(`cl-ver-${id}`).value.trim();
  const thanks = el(`cl-thanks-${id}`).value.trim();
  const entries = el(`cl-ent-${id}`)
    .value.split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  const res = await api('/api/admin/changelogs/' + id, {
    method: 'PATCH',
    body: JSON.stringify({ version, thanks, entries }),
  });
  ss(`cl-save-${id}`, res.ok);
}

async function delChangelog(btn) {
  if (!confirm('Delete this changelog entry?')) return;
  const res = await api('/api/admin/changelogs/' + btn.dataset.id, { method: 'DELETE' });
  if (res.ok) loadSite();
}

async function loadAnalytics() {
  const res = await api('/api/analytics');
  if (!res.ok) return;
  const d = await res.json();
  el('stat-online').textContent = d.onlineNow;
  el('stat-today').textContent = d.todayVisits;
  el('week-body').innerHTML = d.last7Days
    .map(
      (r) =>
        `<tr><td>${new Date(r.date).toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' })}</td><td>${r.visits}</td></tr>`
    )
    .join('');
}

async function saveNotice() {
  const message = el('notice-msg').value.trim();
  const level = el('notice-level').value;
  if (!message) return ss('notice-ss', false, 'Need message');
  const res = await api('/api/admin/notices', {
    method: 'POST',
    body: JSON.stringify({ active: true, message, level }),
  });
  ss('notice-ss', res.ok, res.ok ? '✓ Notice ON' : 'Error');
  if (res.ok) {
    el('clear-notice-btn').style.display = 'inline-block';
    loadSite();
  }
}

async function loadData() {
  const [gr, cr, tr, er, rr, lr] = await Promise.all([
    api('/api/goods'), api('/api/cities'), api('/api/travel-times'),
    api('/api/events'), api('/api/religions'), api('/api/languages'),
  ]);
  if (gr.ok) {
    const goods = await gr.json();
    el('goods-body').innerHTML = goods.map(g =>
      `<tr><td class="hl">${escHtml(g.name)}</td><td>${g.base_price}</td><td>${escHtml(g.type)}</td><td>${g.hop_pct}</td></tr>`
    ).join('') || '<tr><td colspan="4" class="dim">None</td></tr>';
  }
  if (cr.ok) {
    const cities = await cr.json();
    el('cities-body').innerHTML = cities.map(c =>
      `<tr><td class="hl">${escHtml(c.name)}</td><td>${escHtml(c.culture)}</td><td>${escHtml(c.language)}</td><td>${c.has_fire_temple ? 'Yes' : 'No'}</td><td>${(c.traits||[]).map(escHtml).join(', ')||'—'}</td><td>${(c.produced||[]).map(escHtml).join(', ')||'—'}</td></tr>`
    ).join('') || '<tr><td colspan="6" class="dim">None</td></tr>';
  }
  if (tr.ok) {
    const times = await tr.json();
    const rows = [];
    for (const [from, tos] of Object.entries(times))
      for (const [to, mins] of Object.entries(tos))
        rows.push(`<tr><td>${escHtml(from)}</td><td>${escHtml(to)}</td><td>${mins}</td></tr>`);
    el('travel-body').innerHTML = rows.join('') || '<tr><td colspan="3" class="dim">None</td></tr>';
  }
  if (er.ok) {
    const events = await er.json();
    el('events-body').innerHTML = events.map(e =>
      `<tr><td class="hl">${escHtml(e.name)}</td><td>${escHtml(e.glyph)}</td><td>${e.dir > 0 ? '+1' : '-1'}</td><td>${(e.good_types||[]).map(escHtml).join(', ')||'—'}</td><td>${(e.good_names||[]).map(escHtml).join(', ')||'—'}</td></tr>`
    ).join('') || '<tr><td colspan="5" class="dim">None</td></tr>';
  }
  if (rr.ok) {
    const religions = await rr.json();
    el('religions-body').innerHTML = religions.map(r =>
      `<tr><td class="hl">${escHtml(r.name)}</td></tr>`
    ).join('') || '<tr><td class="dim">None</td></tr>';
  }
  if (lr.ok) {
    const languages = await lr.json();
    el('languages-body').innerHTML = languages.map(l =>
      `<tr><td class="hl">${escHtml(l.name)}</td></tr>`
    ).join('') || '<tr><td class="dim">None</td></tr>';
  }
}

async function clearNotice() {
  const res = await api('/api/admin/notices/disable', { method: 'POST' });
  ss('notice-ss', res.ok, res.ok ? '✓ Notice OFF' : 'Error');
  if (res.ok) {
    el('clear-notice-btn').style.display = 'none';
    loadSite();
  }
}

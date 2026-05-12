// Site + analytics feature area

async function loadFpBans() {
  const res = await api('/api/admin/fp-bans');
  if (!res.ok) { el('fp-bans-list').innerHTML = '<span class="dim">No access.</span>'; return; }
  const bans = await res.json();
  el('fp-bans-list').innerHTML = bans.length
    ? bans.map(b => `<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid #1e2030">
        <code style="font-size:11px;color:#9aef9a;flex:1;word-break:break-all">${escHtml(b.fp_id)}</code>
        <span style="font-size:11px;color:#888;white-space:nowrap">${escHtml(b.reason || '—')}</span>
        <span style="font-size:11px;color:#555;white-space:nowrap">${new Date(b.banned_at).toLocaleDateString()}</span>
        <button class="btn btn-del" style="padding:2px 8px;font-size:11px" data-fp="${escHtml(b.fp_id)}" onclick="unbanFp(this.dataset.fp)">Unban</button>
      </div>`).join('')
    : '<span class="dim">No fingerprint bans.</span>';
}

async function banFp() {
  const fpId = v('ban-fp');
  const reason = v('ban-fp-reason');
  if (!fpId) return ss('ban-fp-ss', false, 'Need fingerprint ID');
  const res = await api('/api/admin/fp-bans', { method: 'POST', body: JSON.stringify({ fpId, reason }) });
  ss('ban-fp-ss', res.ok);
  if (res.ok) { el('ban-fp').value = ''; el('ban-fp-reason').value = ''; loadFpBans(); }
}

async function unbanFp(fpId) {
  const res = await api('/api/admin/fp-bans/' + encodeURIComponent(fpId), { method: 'DELETE' });
  if (res.ok) loadFpBans();
}

async function loadIpBans() {
  const res = await api('/api/admin/ip-bans');
  if (!res.ok) { el('ip-bans-list').innerHTML = '<span class="dim">No access.</span>'; return; }
  const bans = await res.json();
  el('ip-bans-list').innerHTML = bans.length
    ? bans.map(b => `<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid #1e2030">
        <code style="font-size:11px;color:#9aef9a;flex:1">${escHtml(b.ip)}</code>
        <span style="font-size:11px;color:#888;white-space:nowrap">${escHtml(b.reason || '—')}</span>
        <span style="font-size:11px;color:#555;white-space:nowrap">${new Date(b.banned_at).toLocaleDateString()}</span>
        <button class="btn btn-del" style="padding:2px 8px;font-size:11px" data-ip="${escHtml(b.ip)}" onclick="unbanIp(this.dataset.ip)">Unban</button>
      </div>`).join('')
    : '<span class="dim">No IP bans.</span>';
}

async function banIp() {
  const ip = v('ban-ip');
  const reason = v('ban-ip-reason');
  if (!ip) return ss('ban-ip-ss', false, 'Need IP');
  const res = await api('/api/admin/ip-bans', { method: 'POST', body: JSON.stringify({ ip, reason }) });
  ss('ban-ip-ss', res.ok);
  if (res.ok) { el('ban-ip').value = ''; el('ban-ip-reason').value = ''; loadIpBans(); }
}

async function unbanIp(ip) {
  const res = await api('/api/admin/ip-bans/' + encodeURIComponent(ip), { method: 'DELETE' });
  if (res.ok) loadIpBans();
}

async function loadBans() {
  const res = await api('/api/admin/bans');
  if (!res.ok) { el('bans-list').innerHTML = '<span class="dim">No access.</span>'; return; }
  const bans = await res.json();
  el('bans-list').innerHTML = bans.length
    ? bans.map(b => `<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid #1e2030">
        <code style="font-size:11px;color:#9aef9a;flex:1;word-break:break-all">${escHtml(b.session_id)}</code>
        <span style="font-size:11px;color:#888;white-space:nowrap">${escHtml(b.reason || '—')}</span>
        <span style="font-size:11px;color:#555;white-space:nowrap">${new Date(b.banned_at).toLocaleDateString()}</span>
        <button class="btn btn-del" style="padding:2px 8px;font-size:11px" data-sid="${escHtml(b.session_id)}" onclick="unbanSession(this.dataset.sid)">Unban</button>
      </div>`).join('')
    : '<span class="dim">No bans.</span>';
}

async function banSession() {
  const sid = v('ban-sid');
  const reason = v('ban-reason');
  if (!sid) return ss('ban-ss', false, 'Need session ID');
  const res = await api('/api/admin/bans', { method: 'POST', body: JSON.stringify({ sessionId: sid, reason }) });
  ss('ban-ss', res.ok);
  if (res.ok) { el('ban-sid').value = ''; el('ban-reason').value = ''; loadBans(); }
}

async function unbanSession(sid) {
  const res = await api('/api/admin/bans/' + encodeURIComponent(sid), { method: 'DELETE' });
  if (res.ok) loadBans();
}

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
  loadBans();
  loadIpBans();
  loadFpBans();
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

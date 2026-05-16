// Site + analytics feature area

function banMessageHtml(b) {
  return b.feedback_message
    ? `<pre class="ban-msg">${escHtml(b.feedback_message)}</pre>`
    : `<span class="ban-msg ban-reason">${escHtml(b.reason || 'Manual ban')}</span>`;
}

function banDate(b) {
  return b.banned_at ? new Date(b.banned_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'Unknown time';
}

function renderBanRow(b, buttonHtml, target) {
  return `<div class="ban-row">
    <div class="ban-meta">${banDate(b)} · ${escHtml(target)}</div>
    <div class="ban-body">
      ${banMessageHtml(b)}
      ${buttonHtml}
    </div>
  </div>`;
}

async function loadFpBans() {
  const res = await api('/api/admin/fp-bans');
  if (!res.ok) return [];
  return (await res.json()).map(b => ({ ...b, _kind: 'Fingerprint', _id: b.fp_id, _unban: 'unbanFp' }));
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
  if (res.ok) { loadBans(); loadIpBans(); loadFpBans(); }
}

async function loadIpBans() {
  const res = await api('/api/admin/ip-bans');
  if (!res.ok) return [];
  return (await res.json()).map(b => ({ ...b, _kind: 'IP', _id: b.ip, _unban: 'unbanIp' }));
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
  if (res.ok) { loadBans(); loadIpBans(); loadFpBans(); }
}

async function loadBans() {
  const res = await api('/api/admin/bans');
  if (!res.ok) { el('bans-list').innerHTML = '<span class="dim">No access.</span>'; return; }
  const sessionBans = (await res.json()).map(b => ({ ...b, _kind: 'Session', _id: b.session_id, _unban: 'unbanSession' }));
  const bans = [...sessionBans, ...(await loadIpBans()), ...(await loadFpBans())]
    .sort((a, b) => new Date(b.banned_at || 0) - new Date(a.banned_at || 0));
  el('bans-list').innerHTML = bans.length
    ? bans.map(b => renderBanRow(
        b,
        `<button class="btn btn-del mini-btn" data-id="${escHtml(b._id)}" onclick="${b._unban}(this.dataset.id)">Unban</button>`,
        `${b._kind}: ${b._id}`
      )).join('')
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
  if (res.ok) { loadBans(); loadIpBans(); loadFpBans(); }
}

async function loadSite() {
  const mr = await api('/api/maintenance');
  if (mr.ok) {
    const m = await mr.json();
    el('maint-active').checked = !!m.active;
    el('maint-msg').value = m.message || '';
  }
  loadBans();
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

async function loadChangelog() {
  const res = await api('/api/changelogs');
  if (res.ok) renderChangelogs(await res.json());
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
    loadChangelog();
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
  if (res.ok) loadChangelog();
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
        `<tr><td>${new Date(r.date).toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' })}</td><td>${r.visits}</td><td>${r.peakOnline || '—'}</td></tr>`
    )
    .join('');
}

async function loadData() {
  const [gr, er, tefr, rpr] = await Promise.all([
    api('/api/goods'),
    api('/api/events'),
    api('/api/trait-effects'),
    api('/api/religion-perks'),
  ]);

  if (gr.ok) {
    const goods = await gr.json();
    const hopBonus = (base, pct, hops) => Math.round(base * (Math.pow(1 + pct, hops) - 1));
    el('data-goods-body').innerHTML = goods.map(g =>
      `<tr>
        <td class="hl">${escHtml(g.name)}</td>
        <td>$${g.base_price}</td>
        <td>${escHtml(g.type)}</td>
        <td>${(g.hop_pct * 100).toFixed(2)}%</td>
        <td style="color:var(--green)">+$${hopBonus(g.base_price, g.hop_pct, 1)}</td>
        <td style="color:var(--green)">+$${hopBonus(g.base_price, g.hop_pct, 2)}</td>
        <td style="color:var(--green)">+$${hopBonus(g.base_price, g.hop_pct, 3)}</td>
      </tr>`
    ).join('') || '<tr><td colspan="7" class="dim">None</td></tr>';
  }

  if (tefr.ok) {
    const effects = await tefr.json();
    const condFmt = (t, v) => {
      if (!t) return '<span class="dim">Any good</span>';
      if (t === 'good_type') return `Type: ${escHtml(v)}`;
      if (t === 'good_type_food') return `Type: Food (Agricultural)`;
      if (t === 'good_name') return `Good: ${escHtml(v)}`;
      if (t === 'culture_mismatch') return `Culture mismatch`;
      if (t === 'religion') return `Player religion: ${escHtml(v)}`;
      return escHtml(t);
    };
    el('data-traits-body').innerHTML = effects.map(e =>
      `<tr>
        <td class="hl">${escHtml(e.trait_name)}</td>
        <td>${escHtml(e.kind || 'both')}</td>
        <td style="color:${e.bonus >= 0 ? 'var(--green)' : 'var(--red)'}">${e.bonus >= 0 ? '+' : ''}${(e.bonus * 100).toFixed(1)}%</td>
        <td>${condFmt(e.cond_type, e.cond_value)}</td>
      </tr>`
    ).join('') || '<tr><td colspan="4" class="dim">None</td></tr>';
  }

  if (er.ok) {
    const events = await er.json();
    const lvlFmt = (lvls, n) => {
      const l = lvls.find(x => x.level === n);
      if (!l) return '<span class="dim">—</span>';
      return `base +$${l.base_bonus}, ×${(l.pct * 100).toFixed(1)}%`;
    };
    el('data-events-body').innerHTML = events.map(e => {
      const lvls = e.levels || [];
      const typesStr = (e.good_types || []).join(', ') || '—';
      const goodsStr = (e.good_names || []).join(', ') || '—';
      return `<tr>
        <td class="hl">${escHtml(e.name)}</td>
        <td>${escHtml(e.glyph)}</td>
        <td style="color:${e.dir > 0 ? 'var(--green)' : 'var(--red)'}">${e.dir > 0 ? '+1 (raises)' : '−1 (lowers)'}</td>
        <td>${escHtml(typesStr)}</td>
        <td>${escHtml(goodsStr)}</td>
        <td>${lvlFmt(lvls, 1)}</td>
        <td>${lvlFmt(lvls, 2)}</td>
        <td>${lvlFmt(lvls, 3)}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="8" class="dim">None</td></tr>';
  }

  if (rpr.ok) {
    const perks = await rpr.json();
    const perkDesc = (type, mult) => {
      if (type === 'reduce_negative') return `Negative city mod × ${mult} (reduced penalty)`;
      if (type === 'amplify_negative') return `Negative city mod × ${mult} (amplified penalty)`;
      if (type === 'amplify_positive') return `Positive city mod × ${mult} (amplified bonus)`;
      if (type === 'byzantine_penalty') return `Negative city mod in Byzantine city × ${mult}`;
      return escHtml(type);
    };
    el('data-perks-body').innerHTML = perks.map(p =>
      `<tr>
        <td class="hl">${escHtml(p.religion)}</td>
        <td>${p.min_level}</td>
        <td>${escHtml(p.perk_type)}</td>
        <td>${p.multiplier}×</td>
        <td class="dim">${perkDesc(p.perk_type, p.multiplier)}</td>
      </tr>`
    ).join('') || '<tr><td colspan="5" class="dim">None</td></tr>';
  }
}

// ── Projects tab ──────────────────────────────────────────────────────────────

let projCurrentUser = null;
let projSubtab = 'unclaimed';

const CLAIM_COLORS = ['#3d8eff','#34d399','#f59e0b','#f87171','#a78bfa','#fb923c','#22d3ee','#e879f9'];
function claimColor(username) {
  let h = 0;
  for (let i = 0; i < username.length; i++) h = (h * 31 + username.charCodeAt(i)) & 0xffff;
  return CLAIM_COLORS[h % CLAIM_COLORS.length];
}

function timeAgo(dateStr) {
  const sec = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (sec < 60) return sec + 's ago';
  if (sec < 3600) return Math.floor(sec / 60) + 'm ago';
  if (sec < 86400) return Math.floor(sec / 3600) + 'h ago';
  return Math.floor(sec / 86400) + 'd ago';
}

async function loadProjects() {
  const meRes = await api('/api/admin/me');
  if (meRes.ok) { const me = await meRes.json(); projCurrentUser = me.username; }
  loadCommits();
  loadActivity();
  loadSections();
}

function switchProjSubtab(tab) {
  projSubtab = tab;
  document.querySelectorAll('.proj-subtab').forEach(t => {
    t.classList.toggle('active', t.dataset.subtab === tab);
  });
  loadSections();
}

async function loadCommits() {
  const r = await api('/api/github/commits?repo=nulllua/silkroadcalc.eu');
  const container = el('proj-commits');
  if (!r.ok) { container.innerHTML = '<span class="dim">Could not load commits.</span>'; return; }
  const commits = await r.json();
  container.innerHTML = commits.map(c => `
    <div class="proj-commit">
      <div class="proj-commit-msg">${escHtml(c.message)}</div>
      <div class="proj-commit-meta">
        <a href="${escHtml(c.url)}" target="_blank" class="proj-commit-sha">${escHtml(c.sha)}</a>
        · ${escHtml(c.author)} · ${timeAgo(c.date)}
      </div>
    </div>
  `).join('') || '<span class="dim">No commits.</span>';
}

async function loadActivity() {
  const r = await api('/api/admin/activity');
  const container = el('proj-activity');
  if (!r.ok) { container.innerHTML = '<span class="dim">Could not load.</span>'; return; }
  const rows = await r.json();
  container.innerHTML = rows.map(a => `
    <div class="proj-act-row">
      <span class="proj-act-actor">${escHtml(a.actor)}</span>
      ${escHtml(a.action)}
      <span class="proj-act-time">${timeAgo(a.created_at)}</span>
    </div>
  `).join('') || '<span class="dim">No activity yet.</span>';
}

let _sectionsCache = [];

async function loadSections() {
  const r = await api('/api/admin/sections');
  const container = el('proj-sections');
  if (!r.ok) { container.innerHTML = '<span class="dim">Could not load sections.</span>'; return; }
  const all = await r.json();
  _sectionsCache = all;

  let sections;
  if (projSubtab === 'unclaimed') {
    sections = all.filter(s => !s.claimed_by && !s.done);
  } else if (projSubtab === 'claimed') {
    sections = all.filter(s => s.claimed_by === projCurrentUser);
  } else {
    sections = all.filter(s => s.claimed_by);
  }

  if (!sections.length) {
    const msgs = { unclaimed: 'No unclaimed tasks.', claimed: 'You have no claimed tasks.', all: 'No claimed tasks.' };
    container.innerHTML = `<span class="dim">${msgs[projSubtab]}</span>`;
    return;
  }
  container.innerHTML = sections.map(s => renderSection(s)).join('');
}

function renderSection(s) {
  const mine = s.claimed_by === projCurrentUser;
  const claimedByOther = s.claimed_by && !mine;
  const unclaimed = !s.claimed_by;
  const canEdit = mine;
  const color = s.claimed_by ? claimColor(s.claimed_by) : null;

  const todosHtml = s.todos.map(t => `
    <div class="proj-todo">
      <input type="checkbox" ${t.done ? 'checked' : ''} ${canEdit ? `onchange="toggleTodo(${t.id}, this.checked)"` : 'disabled'} />
      <div style="flex:1">
        <div class="proj-todo-text${t.done ? ' done' : ''}">${escHtml(t.text)}</div>
        <div class="proj-todo-meta">by ${escHtml(t.created_by)}${t.done_by ? ' · done by ' + escHtml(t.done_by) : ''}</div>
      </div>
      ${canEdit ? `<button class="proj-icon-btn del" onclick="deleteTodo(${t.id})" title="Remove">×</button>` : ''}
    </div>
  `).join('');

  const commentsHtml = s.comments.map(c => `
    <div class="proj-comment">
      <span class="proj-comment-author">${escHtml(c.created_by)}</span>
      <span class="proj-comment-text">${escHtml(c.text)}</span>
      ${canEdit ? `<button class="proj-icon-btn del" onclick="deleteComment(${c.id})" title="Remove">×</button>` : ''}
    </div>
  `).join('');

  let claimBadge = '';
  if (mine) {
    claimBadge = `<span class="proj-claim-badge" style="color:${color}">Claimed by you</span>`;
  } else if (claimedByOther) {
    claimBadge = `<span class="proj-claim-badge" style="color:${color}">Claimed by ${escHtml(s.claimed_by)}</span>`;
  }

  let claimBtn = '';
  if (unclaimed) {
    claimBtn = `<button class="btn btn-add mini-btn" onclick="claimSection(${s.id})">Claim</button>`;
  } else if (mine) {
    claimBtn = `<button class="btn mini-btn" onclick="unclaimSection(${s.id})">Release</button>`;
  }

  const sectionClass = mine ? 'proj-section claimed-mine' : claimedByOther ? 'proj-section claimed-other' : 'proj-section';
  const colorStyle = color ? `style="--claim-color:${color}"` : '';

  return `
    <div class="${sectionClass}" id="section-${s.id}" ${colorStyle}>
      <div class="proj-section-head">
        <div style="flex:1">
          <div class="proj-section-title" style="${s.done ? 'text-decoration:line-through;opacity:.5' : ''}">${escHtml(s.title)}</div>
          ${s.description ? `<div class="proj-section-desc">${escHtml(s.description)}</div>` : ''}
          <div class="proj-section-meta">created by ${escHtml(s.created_by)} · ${timeAgo(s.created_at)}</div>
          ${claimBadge ? `<div style="margin-top:5px">${claimBadge}</div>` : ''}
          ${unclaimed ? '<div class="proj-readonly-note">Unclaimed — claim to edit</div>' : ''}
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-shrink:0">
          ${mine ? `<button class="btn mini-btn" onclick="copyAsPrompt(${s.id})" id="copy-btn-${s.id}" title="Copy as AI prompt">Copy prompt</button>` : ''}
          ${mine && !s.done ? `<button class="btn btn-save mini-btn" onclick="doneSection(${s.id})">Done</button>` : ''}
          ${s.done ? `<span class="proj-claim-badge" style="color:var(--green)">Completed</span>` : ''}
          ${claimBtn}
          ${!claimedByOther ? `<button class="btn btn-del mini-btn" onclick="deleteSection(${s.id})">Delete</button>` : ''}
        </div>
      </div>
      <div class="proj-section-body">
        <div class="proj-todos">
          ${todosHtml || `<div class="dim" style="font-size:12px;padding:4px 0">No todos yet.</div>`}
        </div>
        ${canEdit ? `
        <div class="proj-add-row">
          <input class="ifield" id="todo-input-${s.id}" placeholder="Add todo..." onkeydown="if(event.key==='Enter')addTodo(${s.id})" />
          <button class="btn btn-add mini-btn" onclick="addTodo(${s.id})">Add</button>
        </div>` : ''}
        <div class="proj-comments">
          ${commentsHtml}
          ${canEdit ? `
          <div class="proj-add-row" style="margin-top:${s.comments.length ? '8px' : '0'}">
            <textarea class="tfield" id="comment-input-${s.id}" rows="2" placeholder="Add comment..." style="margin-bottom:0"></textarea>
            <button class="btn btn-add mini-btn" onclick="addComment(${s.id})" style="align-self:flex-end">Post</button>
          </div>` : ''}
        </div>
      </div>
    </div>
  `;
}

function openNewSection() {
  el('proj-new-section').style.display = 'block';
  el('ns-title').focus();
}

function closeNewSection() {
  el('proj-new-section').style.display = 'none';
  el('ns-title').value = '';
  el('ns-desc').value = '';
  el('ns-todos-list').innerHTML = '';
}

function addNsTodoRow(value) {
  const list = el('ns-todos-list');
  const row = document.createElement('div');
  row.className = 'proj-add-row';
  row.style.marginBottom = '4px';
  const inp = document.createElement('input');
  inp.className = 'ifield ns-todo-input';
  inp.placeholder = 'Todo...';
  if (value) inp.value = value;
  inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); addNsTodoRow(); } };
  const del = document.createElement('button');
  del.className = 'proj-icon-btn del';
  del.type = 'button';
  del.textContent = '×';
  del.onclick = () => row.remove();
  row.appendChild(inp);
  row.appendChild(del);
  list.appendChild(row);
  inp.focus();
}

async function createSection() {
  const title = v('ns-title');
  const description = v('ns-desc');
  if (!title) { flash(el('ns-title'), false); return; }
  const todos = [...document.querySelectorAll('.ns-todo-input')]
    .map(i => i.value.trim()).filter(Boolean);
  const r = await api('/api/admin/sections', { method: 'POST', body: JSON.stringify({ title, description, todos }) });
  if (r.ok) { closeNewSection(); loadSections(); loadActivity(); }
}

async function doneSection(id) {
  if (!confirm('Mark this task as done?')) return;
  const r = await api('/api/admin/sections/' + id + '/done', { method: 'POST', body: '{}' });
  if (!r.ok) { const d = await r.json(); alert(d.error || 'Could not mark done'); return; }
  loadSections(); loadActivity();
}

function copyAsPrompt(id) {
  const section = _sectionsCache.find(s => s.id === id);
  if (!section) return;

  const lines = [];
  lines.push('# Task: ' + section.title);
  if (section.description) {
    lines.push('');
    lines.push('## Description');
    lines.push(section.description);
  }
  if (section.todos.length) {
    lines.push('');
    lines.push('## Todos');
    section.todos.forEach(t => {
      lines.push((t.done ? '[x] ' : '[ ] ') + t.text);
    });
  }
  if (section.comments.length) {
    lines.push('');
    lines.push('## Notes');
    section.comments.forEach(c => {
      lines.push('- ' + c.created_by + ': ' + c.text);
    });
  }
  lines.push('');
  lines.push('---');
  lines.push('Please implement the above task. Focus only on what is described. Do not add features beyond the scope of the todos.');

  navigator.clipboard.writeText(lines.join('\n')).then(() => {
    const btn = el('copy-btn-' + id);
    if (!btn) return;
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    btn.style.color = 'var(--green)';
    setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 1800);
  });
}

async function claimSection(id) {
  const r = await api('/api/admin/sections/' + id + '/claim', { method: 'POST', body: '{}' });
  if (!r.ok) { const d = await r.json(); alert(d.error || 'Could not claim'); return; }
  loadSections(); loadActivity();
}

async function unclaimSection(id) {
  await api('/api/admin/sections/' + id + '/claim', { method: 'DELETE' });
  loadSections(); loadActivity();
}

async function deleteSection(id) {
  if (!confirm('Delete this section and all its todos/comments?')) return;
  const r = await api('/api/admin/sections/' + id, { method: 'DELETE' });
  if (!r.ok) { const d = await r.json(); alert(d.error || 'Could not delete'); return; }
  loadSections(); loadActivity();
}

async function addTodo(sectionId) {
  const inp = el('todo-input-' + sectionId);
  const text = inp.value.trim();
  if (!text) { flash(inp, false); return; }
  const r = await api('/api/admin/sections/' + sectionId + '/todos', { method: 'POST', body: JSON.stringify({ text }) });
  if (r.ok) { inp.value = ''; loadSections(); loadActivity(); }
}

async function toggleTodo(id, done) {
  await api('/api/admin/todos/' + id, { method: 'PATCH', body: JSON.stringify({ done }) });
  loadSections(); loadActivity();
}

async function deleteTodo(id) {
  await api('/api/admin/todos/' + id, { method: 'DELETE' });
  loadSections(); loadActivity();
}

async function addComment(sectionId) {
  const inp = el('comment-input-' + sectionId);
  const text = inp.value.trim();
  if (!text) { flash(inp, false); return; }
  const r = await api('/api/admin/sections/' + sectionId + '/comments', { method: 'POST', body: JSON.stringify({ text }) });
  if (r.ok) { inp.value = ''; loadSections(); loadActivity(); }
}

async function deleteComment(id) {
  await api('/api/admin/comments/' + id, { method: 'DELETE' });
  loadSections(); loadActivity();
}


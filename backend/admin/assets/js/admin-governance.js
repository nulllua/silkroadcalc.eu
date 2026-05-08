// Lock/role governance + activity/revert UI logic.

function isOwner() {
  return window.ADMIN_CTX.role === 'owner';
}

function setGlobalStatus(text) {
  const elStatus = el('global-status');
  if (elStatus) elStatus.textContent = text || '';
}

function applyLockUi() {
  const lockBadge = el('lock-badge');
  const roleBadge = el('role-badge');
  const requestBtn = el('request-edit-btn');
  const ownerControls = el('owner-lock-controls');
  const ownerUserTools = el('owner-user-tools');

  if (roleBadge)
    roleBadge.textContent = window.ADMIN_CTX.username
      ? `${window.ADMIN_CTX.role}: ${window.ADMIN_CTX.username}`
      : '';
  if (lockBadge) lockBadge.textContent = window.ADMIN_CTX.isLocked ? 'LOCKED' : 'UNLOCKED';

  if (requestBtn) requestBtn.style.display = !isOwner() ? 'inline-block' : 'none';
  if (ownerControls) ownerControls.style.display = isOwner() ? 'inline-flex' : 'none';
  if (ownerUserTools) ownerUserTools.style.display = isOwner() ? 'flex' : 'none';

  const shouldDisable = window.ADMIN_CTX.isLocked && !isOwner();
  document.body.dataset.adminLocked = shouldDisable ? '1' : '0';
  document.querySelectorAll('button, input, select, textarea').forEach((node) => {
    if (node.closest('#owner-lock-controls')) return;
    if (node.id === 'request-edit-btn') return;
    if (node.closest('#panel-activity')) return;
    if (node.id === 'logoutBtn') return;
    node.disabled = shouldDisable;
  });
}

async function refreshGovernance() {
  try {
    const meRes = await api('/api/admin/me');
    if (meRes.ok) {
      const me = await meRes.json();
      window.ADMIN_CTX.role = me.role;
      window.ADMIN_CTX.username = me.username;
      window.ADMIN_CTX.isLocked = !!me.lock?.is_locked;
    }
    applyLockUi();
  } catch (_e) {
    // ignore
  }
}

async function setLocked(next) {
  const res = await api('/api/admin/lock-state', {
    method: 'POST',
    body: JSON.stringify({ is_locked: !!next }),
  });
  if (res.ok) {
    window.ADMIN_CTX.isLocked = !!next;
    applyLockUi();
    setGlobalStatus(next ? 'Panel locked' : 'Panel unlocked');
  }
}

async function requestEditAccess() {
  const note = prompt('Optional note for owner:', '') || '';
  const res = await api('/api/admin/permission-requests', {
    method: 'POST',
    body: JSON.stringify({ note }),
  });
  if (res.ok) setGlobalStatus('Permission request sent to owner');
}

function inferTabFromEntity(entityType) {
  if (['goods', 'city_goods'].includes(entityType)) return 'goods';
  if (['cities', 'city_city_traits'].includes(entityType)) return 'cities';
  if (['event_types', 'event_levels'].includes(entityType)) return 'events';
  if (['city_traits', 'trait_effects'].includes(entityType)) return 'traits';
  if (['religions', 'religion_perks'].includes(entityType)) return 'religions';
  if (['languages'].includes(entityType)) return 'languages';
  if (['travel_times'].includes(entityType)) return 'travel';
  if (['changelog', 'maintenance', 'notices'].includes(entityType)) return 'site';
  return 'analytics';
}

function fmtActivityDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value || '');
  // Example: "May 06 2026"
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  }).format(d);
}

async function loadActivity() {
  const includeOwner = el('act-show-owner')?.checked ? '1' : '0';
  const res = await api(`/api/admin/activity?includeOwner=${includeOwner}`);
  if (!res.ok) return;
  const rows = await res.json();
  const wrap = el('activity-body');
  if (!wrap) return;

  const counts = {};
  rows.forEach((r) => {
    const t = inferTabFromEntity(r.entity_type);
    counts[t] = (counts[t] || 0) + 1;
  });
  document.querySelectorAll('.tab').forEach((t) => {
    const name = t.dataset.tab;
    const n = counts[name] || 0;
    let badge = t.querySelector('.tab-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'tab-badge';
      t.appendChild(badge);
    }
    badge.textContent = n ? String(n) : '';
  });

  wrap.innerHTML =
    rows
      .map(
        (r) => `
      <tr>
        <td>${escHtml(fmtActivityDate(r.changed_at))}</td>
        <td>${escHtml(r.actor_username)}</td>
        <td>${escHtml(r.entity_type)}</td>
        <td>${escHtml(r.action)}</td>
        <td>${escHtml(r.entity_id || '')}</td>
        <td>${isOwner() ? `<button class="btn btn-del" onclick="revertActivity(${r.id})">Revert</button>` : ''}</td>
      </tr>
    `
      )
      .join('') || '<tr><td colspan="6" class="dim">No activity yet</td></tr>';
}

async function revertActivity(id) {
  if (!confirm('Revert this change?')) return;
  const res = await api(`/api/admin/activity/${id}/revert`, { method: 'POST' });
  if (res.ok) {
    setGlobalStatus('Change reverted');
    await Promise.all([
      loadActivity(),
      loadSite(),
      loadGoods(),
      loadTravel(),
      loadEvents(),
      loadCities(),
      loadTraits(),
      loadReligions(),
      loadLanguages(),
    ]);
  } else {
    const errTxt = await res.text();
    setGlobalStatus(`Revert failed: ${errTxt}`);
  }
}

async function createHelperUser() {
  const username = v('new-helper-user');
  const password = el('new-helper-pass')?.value || '';
  if (!username || !password) return setGlobalStatus('Helper username/password required');

  const res = await api('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify({ username, password, role: 'helper' }),
  });
  if (!res.ok) return setGlobalStatus('Failed to create helper user');
  el('new-helper-user').value = '';
  el('new-helper-pass').value = '';
  setGlobalStatus('Helper user created');
  loadActivity();
}

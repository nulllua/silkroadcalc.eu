(function () {
  'use strict';
  var API = 'https://admin.silkroadcalc.eu';

  /* ── Changelog ────────────────────────────────────────────────────────── */
  async function loadChangelog() {
    var el = document.getElementById('homeChangelog');
    if (!el) return;
    try {
      var res  = await fetch(API + '/api/changelog');
      var data = await res.json();
      renderChangelog(el, Array.isArray(data) ? data : data.entries || []);
    } catch (_) {
      el.innerHTML = '<div class="cl-loading">Could not load updates.</div>';
    }
  }

  function renderChangelog(el, entries) {
    if (!entries.length) {
      el.innerHTML = '<div class="cl-loading">No updates yet.</div>';
      return;
    }
    el.innerHTML = entries.slice(0, 6).map(function (e, i) {
      var items = (e.changes || e.items || [])
        .map(function (c) { return '<li>' + esc(c) + '</li>'; })
        .join('');
      return (
        '<div class="cl-entry' + (i === 0 ? ' latest' : '') + '">' +
          '<div class="cl-meta">' +
            '<span class="cl-ver">v' + esc(e.version || e.ver || '?') + '</span>' +
            (e.date ? '<span class="cl-date">' + esc(e.date) + '</span>' : '') +
            (e.tag  ? '<span class="cl-tag">' + esc(e.tag) + '</span>' : '') +
          '</div>' +
          (items ? '<ul class="cl-items">' + items + '</ul>' : '') +
        '</div>'
      );
    }).join('');
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ── Maintenance check ────────────────────────────────────────────────── */
  async function checkMaintenance() {
    try {
      var res  = await fetch(API + '/api/maintenance');
      if (!res.ok) return;
      var data = await res.json();
      if (data.active) {
        var overlay = document.getElementById('maintenanceOverlay');
        var msg     = document.getElementById('maintenanceMsg');
        if (overlay) overlay.style.cssText = 'display:flex!important';
        if (msg && data.message) msg.textContent = data.message;
      }
    } catch (_) { /* non-critical */ }
  }

  /* ── Notice bar ───────────────────────────────────────────────────────── */
  async function loadNotice() {
    try {
      var res  = await fetch(API + '/api/notice');
      var data = await res.json();
      if (data.text) {
        var bar  = document.getElementById('noticeBar');
        var txt  = document.getElementById('noticeText');
        var btn  = document.getElementById('noticeClose');
        if (!bar || !txt) return;
        txt.textContent = data.text;
        bar.classList.add('visible');
        if (btn) btn.addEventListener('click', function () { bar.classList.remove('visible'); });
      }
    } catch (_) { /* non-critical */ }
  }

  /* ── Route count stat ─────────────────────────────────────────────────── */
  async function loadRouteCount() {
    var el = document.getElementById('statRouteCount');
    if (!el) return;
    try {
      var res  = await fetch(API + '/api/routes/count');
      var data = await res.json();
      if (data.count) el.textContent = data.count + '+';
    } catch (_) { el.textContent = '100+'; }
  }

  /* ── What's New popup ─────────────────────────────────────────────────── */
  window.closeWhatsNew = function () {
    var modal = document.getElementById('whatsNewModal');
    var cb = document.getElementById('whatsNewDontShow');
    if (cb && cb.checked) localStorage.setItem(window._wnKey || 'silkroad_whatsnew', '1');
    if (!modal) return;
    modal.classList.remove('is-visible');
    setTimeout(function () { modal.style.display = 'none'; }, 350);
  };

  async function loadWhatsNew() {
    try {
      var res = await fetch(API + '/api/changelogs');
      if (!res.ok) return;
      var logs = await res.json();
      if (!logs.length) return;
      var latest = logs[0];
      window._wnKey = 'silkroad_whatsnew_id' + latest.id;
      if (localStorage.getItem(window._wnKey) === '1') return;
      var badge = document.querySelector('#whatsNewTitle .wn-ver-badge');
      if (badge) badge.textContent = latest.version;
      var body = document.querySelector('#whatsNewBox .wn-body');
      if (body && latest.entries && latest.entries.length) {
        body.innerHTML =
          '<ul>' +
          latest.entries.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') +
          '</ul>' +
          (latest.thanks ? '<div class="wn-thanks">Special thanks: ' + esc(latest.thanks) + '</div>' : '');
      }
      var modal = document.getElementById('whatsNewModal');
      if (!modal) return;
      modal.style.display = 'flex';
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { modal.classList.add('is-visible'); });
      });
    } catch (_) {}
  }

  /* ── Init ─────────────────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    checkMaintenance();
    loadChangelog();
    loadNotice();
    loadRouteCount();
    loadWhatsNew();
  });
})();

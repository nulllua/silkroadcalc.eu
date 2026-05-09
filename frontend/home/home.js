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
      var res  = await fetch(API + '/api/status');
      var data = await res.json();
      if (data.maintenance) {
        var overlay = document.getElementById('maintenanceOverlay');
        var msg     = document.getElementById('maintenanceMsg');
        if (overlay) overlay.classList.add('active');
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

  /* ── Init ─────────────────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    checkMaintenance();
    loadChangelog();
    loadNotice();
    loadRouteCount();
  });
})();

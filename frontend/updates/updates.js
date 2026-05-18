(function () {
  'use strict';
  var API = 'https://admin.silkroadcalc.eu';

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function versionDisplay(v) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return '?';
    if (/^v/i.test(s)) return esc(s);
    return 'v' + esc(s);
  }

  function renderChangelog(el, entries) {
    if (!entries.length) {
      el.innerHTML = '<div class="cl-loading">No updates yet.</div>';
      return;
    }
    el.innerHTML = entries.map(function (e, i) {
      var items = (e.changes || e.items || [])
        .map(function (c) { return '<li>' + esc(c) + '</li>'; })
        .join('');
      return (
        '<div class="cl-entry' + (i === 0 ? ' latest' : '') + '">' +
          '<div class="cl-meta">' +
            '<span class="cl-ver">' + versionDisplay(e.version || e.ver || '') + '</span>' +
            (e.date ? '<span class="cl-date">' + esc(e.date) + '</span>' : '') +
            (e.tag ? '<span class="cl-tag">' + esc(e.tag) + '</span>' : '') +
          '</div>' +
          (items ? '<ul class="cl-items">' + items + '</ul>' : '') +
        '</div>'
      );
    }).join('');
  }

  async function loadChangelog() {
    var el = document.getElementById('updatesChangelog');
    if (!el) return;
    try {
      var res = await fetch(API + '/api/changelog');
      var data = await res.json();
      renderChangelog(el, Array.isArray(data) ? data : data.entries || []);
    } catch (_) {
      el.innerHTML = '<div class="cl-loading">Could not load updates.</div>';
    }
  }

  document.addEventListener('DOMContentLoaded', loadChangelog);
})();

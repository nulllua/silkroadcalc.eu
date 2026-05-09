(function () {
  'use strict';

  var API = 'https://admin.silkroadcalc.eu';

  async function checkMaintenance() {
    try {
      var res  = await fetch(API + '/api/status');
      if (!res.ok) return;
      var data = await res.json();
      if (data.maintenance) {
        var msg = document.getElementById('maintenanceMsg');
        if (msg && data.message) msg.textContent = data.message;
        var ov = document.getElementById('maintenanceOverlay');
        if (ov) ov.style.display = 'flex';
      }
    } catch (_) {}
  }

  async function loadNotice() {
    try {
      var res  = await fetch(API + '/api/notice');
      if (!res.ok) return;
      var data = await res.json();
      if (!data.text) return;
      var bar = document.getElementById('noticeBar');
      if (!bar) return;
      var txt = bar.querySelector('.notice-text') || bar;
      txt.textContent = data.text;
      bar.style.display = 'flex';
    } catch (_) {}
  }

  document.addEventListener('DOMContentLoaded', function () {
    checkMaintenance();
    loadNotice();
  });
})();

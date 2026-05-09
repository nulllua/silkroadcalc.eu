(function () {
  'use strict';

  var API = 'https://admin.silkroadcalc.eu';

  async function checkMaintenance() {
    try {
      var res  = await fetch(API + '/api/maintenance');
      if (!res.ok) return;
      var data = await res.json();
      if (data.active) {
        var ov  = document.getElementById('maintenanceOverlay');
        var msg = document.getElementById('maintenanceMsg');
        if (msg && data.message) msg.textContent = data.message;
        if (ov) { ov.style.cssText = 'display:flex!important'; }
      }
    } catch (_) {}
  }

  async function loadNotice() {
    try {
      var res  = await fetch(API + '/api/notices');
      if (!res.ok) return;
      var data = await res.json();
      var text = Array.isArray(data) ? (data[0] && data[0].message) : data.text;
      if (!text) return;
      var bar = document.getElementById('noticeBar');
      if (!bar) return;
      var txt = bar.querySelector('.notice-text') || bar;
      txt.textContent = text;
      bar.style.cssText = 'display:flex!important';
    } catch (_) {}
  }

  checkMaintenance();
  loadNotice();
})();

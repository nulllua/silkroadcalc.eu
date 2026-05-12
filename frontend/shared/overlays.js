(function () {
  'use strict';

  var API = 'https://admin.silkroadcalc.eu';

  async function initFingerprint() {
    if (localStorage.getItem('srtc-fp')) return;
    try {
      await new Promise(function (resolve) {
        var s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/@fingerprintjs/fingerprintjs@4/dist/fp.min.js';
        s.onload = resolve;
        s.onerror = resolve;
        document.head.appendChild(s);
      });
      var fp = await window.FingerprintJS.load();
      var result = await fp.get();
      localStorage.setItem('srtc-fp', result.visitorId);
    } catch (_) {}
  }

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
      var notice = Array.isArray(data) ? data[0] : data;
      if (!notice || !notice.active || !notice.message) return;
      var text = notice.message;
      var bar = document.getElementById('noticeBar');
      if (!bar) return;
      var txt = bar.querySelector('.notice-text') || bar;
      txt.textContent = text;
      bar.style.cssText = 'display:flex!important';
    } catch (_) {}
  }

  async function checkVersion() {
    try {
      var res = await fetch('/version.json?t=' + Date.now());
      if (!res.ok) return;
      var current = (await res.json()).v;
      if (!current) return;
      var stored = localStorage.getItem('srtc-version');
      localStorage.setItem('srtc-version', current);
      if (stored && stored !== current) location.reload(true);
    } catch (_) {}
  }

  async function checkBan() {
    try {
      var sid = localStorage.getItem('srtc-session-id');
      if (!sid) return;
      var body = { sessionId: sid };
      var fpId = localStorage.getItem('srtc-fp');
      if (fpId) body.fpId = fpId;
      var res = await fetch(API + '/api/session/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) return;
      var data = await res.json();
      if (data.banned) window.location.replace('/frontend/banned/banned.html');
    } catch (_) {}
  }

  initFingerprint();
  checkVersion();
  setInterval(checkVersion, 30000);
  checkMaintenance();
  loadNotice();
  checkBan();
  setInterval(checkBan, 30000);
})();

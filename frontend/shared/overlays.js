(function () {
  'use strict';

  var API = (typeof API_BASE !== 'undefined' ? API_BASE : 'https://admin.silkroadcalc.eu');
  var isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);

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
      if (isLocal) {
        var localOv = document.getElementById('maintenanceOverlay');
        if (localOv) localOv.style.cssText = 'display:none!important';
        return;
      }
      var res  = await fetch(API + '/api/maintenance', { credentials: 'include' });
      if (!res.ok) return;
      var data = await res.json();
      var ov  = document.getElementById('maintenanceOverlay');
      if (ov && !data.active) {
        ov.style.cssText = 'display:none!important';
        return;
      }
      if (data.active) {
        var msg = document.getElementById('maintenanceMsg');
        if (msg && data.message) msg.textContent = data.message;
        if (ov) {
          var login = document.getElementById('maintenanceLogin');
          if (!login) {
            login = document.createElement('a');
            login.id = 'maintenanceLogin';
            login.href = API + '/api/auth/discord';
            login.textContent = 'Login with Discord';
            ov.appendChild(login);
          }
          ov.style.cssText = 'display:flex!important';
        }
      }
    } catch (_) {}
  }

  async function checkVersion() {
    try {
      var res = await fetch('/frontend/assets/images/icon.png', { method: 'HEAD', cache: 'no-store' });
      var current = res.headers.get('etag') || res.headers.get('last-modified');
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
  checkBan();
  setInterval(checkBan, 30000);
})();

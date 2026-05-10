(function () {
  'use strict';

  var KEYS = {
    compact: 'silkroad_compact',
    webhook: 'silkroad_webhook',
    notifEvents: 'silkroad_notif_events',
  };

  function load() {
    var ids = ['settingCompact', 'notifEvents'];
    var keys = [KEYS.compact, KEYS.notifEvents];
    ids.forEach(function (id, i) {
      var el = document.getElementById(id);
      if (el) el.checked = localStorage.getItem(keys[i]) === '1';
    });

    var wu = document.getElementById('webhookUrl');
    if (!wu) return;
    wu.value = localStorage.getItem(KEYS.webhook) || '';
    fetch('https://admin.silkroadcalc.eu/api/user/webhook', { credentials: 'include' }).then(function (r) {
      if (!r.ok) return;
      return r.json();
    }).then(function (d) {
      if (d && d.url) { wu.value = d.url; localStorage.setItem(KEYS.webhook, d.url); }
    }).catch(function () {});
  }

  function bind() {
    var pairs = [
      ['settingCompact', KEYS.compact],
      ['notifEvents',    KEYS.notifEvents],
    ];
    pairs.forEach(function (pair) {
      var el = document.getElementById(pair[0]);
      if (!el) return;
      el.addEventListener('change', function () {
        localStorage.setItem(pair[1], el.checked ? '1' : '0');
        if (pair[0] === 'notifEvents' && el.checked && Notification.permission !== 'granted')
          Notification.requestPermission();
      });
    });

    var saveBtn = document.getElementById('webhookSave');
    if (saveBtn) saveBtn.addEventListener('click', async function () {
      var v = (document.getElementById('webhookUrl')?.value || '').trim();
      if (!v) {
        localStorage.removeItem(KEYS.webhook);
        fetch('https://admin.silkroadcalc.eu/api/user/webhook', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: '' }) }).catch(function () {});
        saveBtn.textContent = 'Cleared';
        setTimeout(function () { saveBtn.textContent = 'Save'; }, 1500);
        return;
      }
      if (!v.startsWith('https://discord.com/api/webhooks/')) {
        saveBtn.textContent = 'Invalid URL';
        setTimeout(function () { saveBtn.textContent = 'Save'; }, 2000);
        return;
      }
      saveBtn.textContent = 'Testing...';
      saveBtn.disabled = true;
      try {
        var res = await fetch(v, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            embeds: [{
              title: 'SilkRoadCalc Webhook Connected',
              description: 'You will receive update announcements and maintenance notices here.',
              color: 0xe7c885,
              timestamp: new Date().toISOString(),
            }],
          }),
        });
        if (res.ok || res.status === 204) {
          localStorage.setItem(KEYS.webhook, v);
          fetch('https://admin.silkroadcalc.eu/api/user/webhook', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: v }) }).catch(function () {});
          saveBtn.textContent = 'Saved';
        } else {
          saveBtn.textContent = 'Invalid webhook';
        }
      } catch (_) {
        saveBtn.textContent = 'Failed';
      }
      saveBtn.disabled = false;
      setTimeout(function () { saveBtn.textContent = 'Save'; }, 2000);
    });
  }

  async function loadAccount() {
    var status = document.getElementById('accountStatus');
    if (!status) return;
    try {
      var res  = await fetch('https://admin.silkroadcalc.eu/api/auth/me', { credentials: 'include' });
      if (!res.ok) return;
      var data = await res.json();
      if (data.username) {
        status.innerHTML =
          '<span class="sas-text" style="color:var(--gold)">Logged in as <b>' +
          data.username.replace(/</g,'&lt;') + '</b></span>';
        var loginBtn = document.querySelector('.saccount-login');
        if (loginBtn) { loginBtn.textContent = 'Log out'; loginBtn.href = 'https://admin.silkroadcalc.eu/api/auth/logout'; }
      }
    } catch (_) {}
  }

  document.addEventListener('DOMContentLoaded', function () {
    load();
    bind();
    loadAccount();
  });
})();

(function () {
  'use strict';

  var KEYS = {
    compact: 'silkroad_compact',
    notifEvents: 'silkroad_notif_events',
    lowBudget: 'silkroad_routes_low_budget',
  };
  var SETUPS_KEY = 'silkroad_setups';
  var LS_KEY = 'silkroad_v1';

  function lsGetJson(k, def) {
    try {
      var v = localStorage.getItem(k);
      if (!v) return def;
      return JSON.parse(v);
    } catch (_) {
      return def;
    }
  }
  function lsSet(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch (_) {}
  }
  function getSetups() {
    return lsGetJson(SETUPS_KEY, {});
  }
  function saveSetups(obj) {
    lsSet(SETUPS_KEY, JSON.stringify(obj));
  }
  function refreshSetupDropdowns() {
    var names = Object.keys(getSetups()).sort();
    ['loadSetupSelect', 'clearSetupSelect'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.innerHTML =
        '<option value="">Choose setup</option>' +
        names
          .map(function (n) {
            return (
              '<option value="' +
              String(n).replace(/&/g, '&amp;').replace(/"/g, '&quot;') +
              '">' +
              String(n).replace(/&/g, '&amp;').replace(/</g, '&lt;') +
              '</option>'
            );
          })
          .join('');
    });
  }
  function saveNamedState() {
    var nameEl = document.getElementById('setupNameInput');
    var name = (nameEl && nameEl.value) || '';
    name = String(name).trim();
    if (!name) return;
    var cur = lsGetJson(LS_KEY, null);
    if (!cur || typeof cur !== 'object') {
      window.alert('No Routes setup found. Open Routes and configure your character first.');
      return;
    }
    var setups = getSetups();
    setups[name] = cur;
    saveSetups(setups);
    nameEl.value = '';
    var btn = document.getElementById('btnSaveSetup');
    if (btn) btn.disabled = true;
    refreshSetupDropdowns();
  }
  function loadNamedState() {
    var sel = document.getElementById('loadSetupSelect');
    var name = sel && sel.value;
    if (!name) return;
    var setups = getSetups();
    if (!setups[name]) return;
    lsSet(LS_KEY, JSON.stringify(setups[name]));
  }
  function clearNamedState() {
    var sel = document.getElementById('clearSetupSelect');
    var name = sel && sel.value;
    if (!name) return;
    var setups = getSetups();
    delete setups[name];
    saveSetups(setups);
    refreshSetupDropdowns();
  }

  function load() {
    var ids = ['settingCompact', 'notifEvents', 'lowBudgetMode'];
    var keys = [KEYS.compact, KEYS.notifEvents, KEYS.lowBudget];
    ids.forEach(function (id, i) {
      var el = document.getElementById(id);
      if (el) el.checked = localStorage.getItem(keys[i]) === '1';
    });
    refreshSetupDropdowns();
  }

  function bind() {
    var pairs = [
      ['settingCompact', KEYS.compact],
      ['notifEvents', KEYS.notifEvents],
      ['lowBudgetMode', KEYS.lowBudget],
    ];
    pairs.forEach(function (pair) {
      var el = document.getElementById(pair[0]);
      if (!el) return;
      el.addEventListener('change', function () {
        localStorage.setItem(pair[1], el.checked ? '1' : '0');
        var isNotif = pair[0] === 'notifEvents';
        if (el.checked && isNotif && Notification.permission !== 'granted')
          Notification.requestPermission();
      });
    });

    var setupName = document.getElementById('setupNameInput');
    if (setupName) {
      setupName.addEventListener('input', function () {
        var b = document.getElementById('btnSaveSetup');
        if (b) b.disabled = !String(setupName.value || '').trim();
      });
    }
    var btnSaveSetup = document.getElementById('btnSaveSetup');
    if (btnSaveSetup) btnSaveSetup.addEventListener('click', saveNamedState);
    var btnLoadSetup = document.getElementById('btnLoadSetup');
    if (btnLoadSetup) btnLoadSetup.addEventListener('click', loadNamedState);
    var btnClearSetup = document.getElementById('btnClearSetup');
    if (btnClearSetup) btnClearSetup.addEventListener('click', clearNamedState);
  }

  document.addEventListener('DOMContentLoaded', function () {
    load();
    bind();
  });
})();

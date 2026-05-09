(function () {
  'use strict';
  var KEY = 'srtc-char';
  var MAX_SLOTS = 5;

  var ANIMAL_OPTS = [
    'None',
    'Pack Mule',
    'Saddle Mule',
    'Dromedary Camel',
    'Dzungarian Horse',
    'Nisean Horse',
    'White Nisean Horse',
    'Red Chestnut Nisean',
  ];
  var HAS_SADDLE = {
    'Pack Mule': true,
    'Saddle Mule': true,
    'Dromedary Camel': true,
    'Dzungarian Horse': true,
  };

  var BACKPACK_SLOTS = { None:0, SmallSatchel:2, LargeSatchel:4, BasketBackpack:6, FramePack:6 };
  var ANIMAL_DATA = {
    'None':                  { slots:0, speed:0, saddle:false },
    'Pack Mule':             { slots:1, slotsSaddle:3, speed:1,  saddle:true },
    'Saddle Mule':           { slots:2, slotsSaddle:4, speed:1,  saddle:true },
    'Dromedary Camel':       { slots:2, slotsSaddle:4, speed:2,  saddle:true },
    'Dzungarian Horse':      { slots:1, slotsSaddle:3, speed:3,  saddle:true },
    'Nisean Horse':          { slots:4, speed:6, saddle:false },
    'White Nisean Horse':    { slots:4, speed:6, saddle:false },
    'Red Chestnut Nisean':   { slots:4, speed:6, saddle:false },
  };

  function calcStats() {
    var caravanEl = document.getElementById('setupCaravan');
    var byzEl     = document.getElementById('setupByzantine');
    var sassEl    = document.getElementById('setupSassanid');
    var backpackEl = document.getElementById('setupBackpack');
    var extraEl   = document.getElementById('setupExtraStorage');
    var autoEl    = document.getElementById('setupAutoWalk');

    var caravanOn = caravanEl && caravanEl.checked;
    var byz = byzEl ? parseInt(byzEl.value) : 1;
    var sass = sassEl ? parseInt(sassEl.value) : 1;
    var backpack = backpackEl ? backpackEl.value : 'None';
    var extra = extraEl && extraEl.checked;
    var autoWalk = autoEl && autoEl.checked;

    var caravanSlots = Math.min(3 + (caravanOn ? 1 : 0) + (byz >= 8 || sass >= 8 ? 1 : 0), MAX_SLOTS);

    var cargo = 3 + (BACKPACK_SLOTS[backpack] || 0) + (extra ? 1 : 0);
    var animalSpeedSum = 0, animalCount = 0;
    for (var i = 0; i < caravanSlots; i++) {
      var aEl = document.getElementById('setupAnimal' + i);
      var sEl = document.getElementById('setupSaddle' + i);
      var name = aEl ? aEl.value : 'None';
      var a = ANIMAL_DATA[name] || ANIMAL_DATA['None'];
      var hasSaddle = sEl && sEl.checked;
      cargo += (a.saddle && hasSaddle && a.slotsSaddle) ? a.slotsSaddle : a.slots;
      if (name !== 'None') { animalSpeedSum += a.speed; animalCount++; }
    }
    var animalBonus = animalCount ? Math.round(animalSpeedSum / animalCount * 100) / 100 : 0;
    var autoBonus = autoWalk ? 4 : 0;
    var speed = Math.round((16 + autoBonus + animalBonus) * 100) / 100;

    var el;
    if ((el = document.getElementById('statSetupSpeed')))  el.textContent = speed.toFixed(2);
    if ((el = document.getElementById('statSetupAuto')))   el.textContent = '+' + autoBonus;
    if ((el = document.getElementById('statSetupAnimal'))) el.textContent = '+' + animalBonus;
    if ((el = document.getElementById('statSetupSlots')))  el.textContent = cargo;
  }

  var SETUP_FIELDS = [
    { id: 'setupCulture',      key: 'culture' },
    { id: 'setupReligion',     key: 'religion' },
    { id: 'setupFaith',        key: 'religionLevel' },
    { id: 'setupLang',         key: 'langLevel' },
    { id: 'setupBackpack',     key: 'backpack' },
    { id: 'setupExtraStorage', key: 'extraStorage',    chk: true },
    { id: 'setupAutoWalk',     key: 'autoWalk',        chk: true },
    { id: 'setupCaravan',      key: 'caravanGamepass', chk: true },
    { id: 'setupByzantine',    key: 'byzantineRank' },
    { id: 'setupSassanid',     key: 'sassanidRank' },
  ];

  function getSlotCount() {
    var caravanEl = document.getElementById('setupCaravan');
    var byzEl     = document.getElementById('setupByzantine');
    var sassEl    = document.getElementById('setupSassanid');
    var count = 3;
    if (caravanEl && caravanEl.checked) count++;
    if ((byzEl && parseInt(byzEl.value) >= 8) || (sassEl && parseInt(sassEl.value) >= 8)) count++;
    return Math.min(count, MAX_SLOTS);
  }

  function updateSaddleRow(i) {
    var sel  = document.getElementById('setupAnimal' + i);
    var row  = document.getElementById('setupSaddleRow' + i);
    var sEl  = document.getElementById('setupSaddle' + i);
    if (!sel || !row) return;
    var show = !!HAS_SADDLE[sel.value];
    row.style.display = show ? '' : 'none';
    if (!show && sEl) sEl.checked = false;
  }

  function buildAnimalSlots() {
    var wrap  = document.getElementById('setupAnimalSlots');
    var title = document.getElementById('setupAnimalSlotsTitle');
    if (!wrap) return;
    var count = getSlotCount();
    if (title) title.textContent = 'Animal Slots (' + count + ')';

    var prevAnimals   = [];
    var prevSaddlebags = [];
    for (var j = 0; j < MAX_SLOTS; j++) {
      var aEl = document.getElementById('setupAnimal' + j);
      var sEl = document.getElementById('setupSaddle' + j);
      prevAnimals.push(aEl ? aEl.value : 'None');
      prevSaddlebags.push(sEl ? sEl.checked : false);
    }

    wrap.innerHTML = '';
    var optHtml = ANIMAL_OPTS.map(function (a) {
      return '<option value="' + a + '">' + a + '</option>';
    }).join('');

    for (var i = 0; i < count; i++) {
      (function (idx) {
        var col = document.createElement('div');

        var row = document.createElement('div');
        row.className = 'srow';
        row.innerHTML =
          '<label>Slot ' + (idx + 1) + '</label>' +
          '<select id="setupAnimal' + idx + '" class="sselect">' + optHtml + '</select>';
        col.appendChild(row);

        var sRow = document.createElement('label');
        sRow.id        = 'setupSaddleRow' + idx;
        sRow.className = 'stoggle';
        sRow.style.display = 'none';
        sRow.innerHTML =
          '<span class="stoggle-label">Slot ' + (idx + 1) + ' Saddlebags</span>' +
          '<span class="stoggle-sub">+2 cargo slots</span>' +
          '<input type="checkbox" id="setupSaddle' + idx + '" />' +
          '<span class="stoggle-track"></span>';
        col.appendChild(sRow);

        wrap.appendChild(col);

        var sel = document.getElementById('setupAnimal' + idx);
        if (sel) {
          sel.value = prevAnimals[idx] || 'None';
          updateSaddleRow(idx);
          sel.addEventListener('change', function () { updateSaddleRow(idx); save(); });
        }
        var sadEl = document.getElementById('setupSaddle' + idx);
        if (sadEl) {
          sadEl.checked = !!prevSaddlebags[idx];
          sadEl.addEventListener('change', save);
        }
      })(i);
    }
  }

  function load() {
    try {
      var d = JSON.parse(localStorage.getItem(KEY) || '{}');
      SETUP_FIELDS.forEach(function (f) {
        var el = document.getElementById(f.id);
        if (!el || !(f.key in d)) return;
        if (f.chk) el.checked = !!d[f.key];
        else el.value = d[f.key];
      });
      buildAnimalSlots();
      var animals    = d.animals    || [];
      var saddlebags = d.saddlebags || [];
      for (var i = 0; i < MAX_SLOTS; i++) {
        var aEl = document.getElementById('setupAnimal' + i);
        if (aEl && animals[i] !== undefined) { aEl.value = animals[i]; updateSaddleRow(i); }
        var sEl = document.getElementById('setupSaddle' + i);
        if (sEl) sEl.checked = !!saddlebags[i];
      }
      calcStats();
    } catch (e) {}
  }

  function save() {
    try {
      var d = {};
      SETUP_FIELDS.forEach(function (f) {
        var el = document.getElementById(f.id);
        if (!el) return;
        d[f.key] = f.chk ? el.checked : el.value;
      });
      d.animals    = [];
      d.saddlebags = [];
      for (var i = 0; i < MAX_SLOTS; i++) {
        var aEl = document.getElementById('setupAnimal' + i);
        var sEl = document.getElementById('setupSaddle' + i);
        d.animals.push(aEl ? aEl.value : 'None');
        d.saddlebags.push(sEl ? sEl.checked : false);
      }
      localStorage.setItem(KEY, JSON.stringify(d));
      calcStats();
      showStatus('Saved');
    } catch (e) {}
  }

  function showStatus(msg) {
    var el = document.getElementById('setupStatus');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('visible');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('visible'); }, 2000);
  }

  document.addEventListener('DOMContentLoaded', function () {
    load();
    SETUP_FIELDS.forEach(function (f) {
      var el = document.getElementById(f.id);
      if (!el) return;
      if (f.id === 'setupCaravan' || f.id === 'setupByzantine' || f.id === 'setupSassanid') {
        el.addEventListener('change', function () { buildAnimalSlots(); save(); calcStats(); });
      } else {
        el.addEventListener('change', save);
      }
    });
  });
})();

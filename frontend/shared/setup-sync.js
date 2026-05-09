(function () {
  'use strict';
  try {
    var d = JSON.parse(localStorage.getItem('srtc-char') || 'null');
    if (!d) return;

    function set(id, val, chk) {
      var el = document.getElementById(id);
      if (!el || val === undefined) return;
      if (chk) el.checked = !!val;
      else el.value = val;
    }

    // Planner page: populate hidden fields immediately (no competing restore logic)
    set('plannerCulture',  d.culture);
    set('plannerReligion', d.religion);
    set('plannerFaith',    d.religionLevel);
    set('plannerLang',     d.langLevel);
    set('plannerBackpack', d.backpack);

    // Routes page: handled by script.js merging srtc-char into applyState at load time
  } catch (e) {}
})();

function syncFromApi(cb) {
  var ctrl = new AbortController();
  var t = setTimeout(function () { ctrl.abort(); }, 5000);
  Promise.all([
    fetch(API_BASE + '/api/goods',          { signal: ctrl.signal }),
    fetch(API_BASE + '/api/cities',         { signal: ctrl.signal }),
    fetch(API_BASE + '/api/travel-times',   { signal: ctrl.signal }),
    fetch(API_BASE + '/api/trait-effects',  { signal: ctrl.signal }),
    fetch(API_BASE + '/api/religion-perks', { signal: ctrl.signal }),
    fetch(API_BASE + '/api/events',         { signal: ctrl.signal }),
  ]).then(function (rs) {
    clearTimeout(t);
    return Promise.all(rs.map(function (r) { return r.ok ? r.json() : null; }));
  }).then(function (ds) {
    var goods = ds[0], cities = ds[1], travel = ds[2], traits = ds[3], perks = ds[4], events = ds[5];
    if (goods && goods.length)
      GOODS = goods.map(function (g) { return { name: g.name, base: g.base_price, type: g.type, hopPct: g.hop_pct, produced_in: g.produced_in }; });
    if (cities && cities.length) {
      var c = {};
      cities.forEach(function (r) { c[r.name] = { culture: r.culture, language: r.language, hasFireTemple: r.has_fire_temple, traits: r.traits, produced: r.produced }; });
      CITIES = c;
    }
    if (travel && Object.keys(travel).length) TRAVEL_TIMES = travel;
    if (traits && traits.length)
      TRAIT_EFFECTS = traits.map(function (r) { return { trait_name: r.trait_name, kind: r.kind, bonus: parseFloat(r.bonus), cond_type: r.cond_type, cond_value: r.cond_value }; });
    if (perks && perks.length)
      RELIGION_PERKS = perks.map(function (r) { return { religion: r.religion, min_level: r.min_level, perk_type: r.perk_type, multiplier: parseFloat(r.multiplier) }; });
    if (events && events.length) {
      var em = {}, lm = {};
      events.forEach(function (e) {
        em[e.name] = { dir: e.dir, label: e.name, glyph: e.glyph, goodTypes: e.good_types, goodNames: e.good_names, desc: e.description };
        (e.levels || []).forEach(function (l) {
          if (!lm[l.level]) lm[l.level] = { pct: l.pct, base: l.base_bonus, label: {} };
          lm[l.level].label[e.name] = l.label;
        });
      });
      EVENTS = em;
      EVENT_LEVELS = lm;
    }
    rebuildRouteCaches();
    if (cb) cb();
  }).catch(function () { if (cb) cb(); });
}

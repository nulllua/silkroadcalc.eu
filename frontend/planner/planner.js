(function () {
  'use strict';

  /* ── State ────────────────────────────────────────────────────────────── */
  var _data = null;

  /* ── DOM helpers ──────────────────────────────────────────────────────── */
  function $id(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function sign(v) { return (v >= 0 ? '+$' : '-$') + Math.abs(v); }
  function cls(v)  { return v > 0 ? 'profit' : v < 0 ? 'loss' : 'zero'; }

  function badge(city) {
    var c = CITY_BADGE_COLORS[city] || '#888';
    return '<span class="pr-city-badge" style="background:' + c + '1a;border-color:' + c + '80;color:' + c + '">' + esc(city) + '</span>';
  }

  /* ── Player state from planner sidebar ───────────────────────────────── */
  function getPlannerState() {
    var ch = {};
    try { ch = JSON.parse(localStorage.getItem('srtc-char') || '{}'); } catch (_) {}
    return {
      culture:         $id('plannerCulture')?.value  || ch.culture   || 'Byzantine',
      religion:        $id('plannerReligion')?.value || ch.religion  || 'Christianity',
      religionLevel:   parseInt($id('plannerFaith')?.value  != null ? $id('plannerFaith').value  : (ch.religionLevel ?? 0)),
      langLevel:       parseInt($id('plannerLang')?.value   != null ? $id('plannerLang').value   : (ch.langLevel    ?? 2)),
      backpack:        $id('plannerBackpack')?.value || ch.backpack  || 'None',
      extraStorage:    !!ch.extraStorage,
      caravanGamepass: !!ch.caravanGamepass,
      autoWalk:        !!ch.autoWalk,
      byzantineRank:   parseInt(ch.byzantineRank) || 1,
      sassanidRank:    parseInt(ch.sassanidRank)  || 1,
      currentCity:     $id('plannerStart')?.value || '',
      sellInCity:      '',
      animals:         ch.animals    || ['None','None','None','None','None'],
      saddlebags:      ch.saddlebags || [false,false,false,false,false],
    };
  }

  /* ── Path utilities ───────────────────────────────────────────────────── */
  function getActualPath(from, to) {
    if (from === to) return [from];
    var visited = new Set([from]);
    var queue = [[from, [from]]];
    while (queue.length) {
      var pair = queue.shift();
      var city = pair[0], path = pair[1];
      var neighbors = CITY_NEIGHBORS[city] || [];
      for (var i = 0; i < neighbors.length; i++) {
        var nb = neighbors[i];
        if (nb === to) return path.concat(nb);
        if (!visited.has(nb)) {
          visited.add(nb);
          queue.push([nb, path.concat(nb)]);
        }
      }
    }
    return [from, to];
  }

  function bestGoodForLeg(from, to, ps, slots) {
    if (slots <= 0) return null;
    var best = null;
    for (var i = 0; i < GOODS.length; i++) {
      var good = GOODS[i];
      if (!isLuxuryAccessible(good, ps)) continue;
      var luxuryCity = LUXURY_CITY[good.name];
      if (luxuryCity && from !== luxuryCity) continue;
      if (CITIES[to].produced.includes(good.name)) continue;
      var buyP  = calculateBuyPrice(good, from, ps);
      var sellP = calculateSellPrice(good, from, to, ps);
      var pu    = sellP - buyP;
      if (pu <= 0) continue;
      var pt = pu * slots;
      if (!best || pt > best.profitPerTrip)
        best = { good: good.name, goodType: good.type, buyPrice: buyP, sellPrice: sellP, profitPerUnit: pu, profitPerTrip: pt, slots: slots };
    }
    return best;
  }

  function getCourierRank(ps, city) {
    var culture = CITIES[city]?.culture;
    if (culture === 'Byzantine') return ps.byzantineRank || 1;
    if (culture === 'Persian')   return ps.sassanidRank  || 1;
    return Math.max(ps.byzantineRank || 1, ps.sassanidRank || 1);
  }

  function packageReward(type, ps, deliveryCity) {
    var base = type === 'short' ? 30 : 100;
    var rank = getCourierRank(ps, deliveryCity);
    return Math.round(base * Math.pow(1.5, rank - 1));
  }

  /* ── Run ──────────────────────────────────────────────────────────────── */
  function run() {
    var startEl  = $id('plannerStart');
    var shortChk = $id('plannerShortCheck');
    var longChk  = $id('plannerLongCheck');
    var shortDst = $id('plannerShortDest');
    var longDst  = $id('plannerLongDest');
    var returnChk = $id('plannerReturn');
    var out = $id('plannerResult');
    if (!out) return;

    var start     = startEl?.value || '';
    var shortOn   = shortChk?.checked;
    var longOn    = longChk?.checked;
    var shortDest = shortOn ? (shortDst?.value || '') : '';
    var longDest  = longOn  ? (longDst?.value  || '') : '';
    var mustReturn = returnChk?.checked;

    if (!start)           { showError(out, 'Pick a starting city first.'); return; }
    if (!shortOn && !longOn) { showError(out, 'Enable at least one courier quest.'); return; }
    if (shortOn && !shortDest) { showError(out, 'Pick a destination for the short quest.'); return; }
    if (longOn  && !longDest)  { showError(out, 'Pick a destination for the long quest.'); return; }
    if (shortOn && shortDest === start) { showError(out, "Short quest destination can't be your starting city."); return; }
    if (longOn  && longDest  === start) { showError(out, "Long quest destination can't be your starting city."); return; }

    var ps         = getPlannerState();
    var totalSlots = calculateStorage(ps);
    var walkspeed  = calculateWalkspeed(ps);

    var packages = [];
    if (shortOn) packages.push({ type: 'short', dest: shortDest });
    if (longOn)  packages.push({ type: 'long',  dest: longDest });
    packages.sort(function (a, b) {
      return ((TRAVEL_TIMES[start] && TRAVEL_TIMES[start][a.dest]) || 99) -
             ((TRAVEL_TIMES[start] && TRAVEL_TIMES[start][b.dest]) || 99);
    });

    var outCities = [start];
    var cur = start;
    for (var i = 0; i < packages.length; i++) {
      var path = getActualPath(cur, packages[i].dest);
      outCities = outCities.concat(path.slice(1));
      cur = packages[i].dest;
    }

    var deliveryMap = {};
    for (var i = 0; i < packages.length; i++) {
      var d = packages[i].dest;
      if (!deliveryMap[d]) deliveryMap[d] = [];
      deliveryMap[d].push(packages[i]);
    }

    var pkgsLeft = packages.length;
    var outLegs = [];
    var outTradeProfit = 0;
    for (var i = 0; i < outCities.length - 1; i++) {
      var from = outCities[i], to = outCities[i + 1];
      var avail = Math.max(0, totalSlots - pkgsLeft);
      var time  = calculateTravelTime(from, to, walkspeed);
      var cargo = bestGoodForLeg(from, to, ps, avail);
      outLegs.push({ from: from, to: to, cargo: cargo, time: time, avail: avail });
      if (cargo) outTradeProfit += cargo.profitPerTrip;
      if (deliveryMap[to]) pkgsLeft -= deliveryMap[to].length;
    }

    var pkgProfit = 0;
    for (var i = 0; i < packages.length; i++)
      pkgProfit += packageReward(packages[i].type, ps, packages[i].dest);

    var retLegs = [];
    var retTradeProfit = 0;
    if (mustReturn) {
      var lastCity = outCities[outCities.length - 1];
      if (lastCity !== start) {
        var retPath = getActualPath(lastCity, start);
        for (var i = 0; i < retPath.length - 1; i++) {
          var from = retPath[i], to = retPath[i + 1];
          var time  = calculateTravelTime(from, to, walkspeed);
          var cargo = bestGoodForLeg(from, to, ps, totalSlots);
          retLegs.push({ from: from, to: to, cargo: cargo, time: time, avail: totalSlots });
          if (cargo) retTradeProfit += cargo.profitPerTrip;
        }
      }
    }

    var totalProfit = outTradeProfit + pkgProfit + retTradeProfit;

    _data = { start: start, packages: packages, outLegs: outLegs, retLegs: retLegs,
              outTradeProfit: outTradeProfit, pkgProfit: pkgProfit, retTradeProfit: retTradeProfit,
              totalProfit: totalProfit, deliveryMap: deliveryMap, totalSlots: totalSlots,
              mustReturn: mustReturn, ps: ps };
    render(out, _data);
  }

  /* ── Render ───────────────────────────────────────────────────────────── */
  function showError(out, msg) {
    out.innerHTML = '<div class="planner-empty"><div class="pe-title">' + esc(msg) + '</div></div>';
  }

  function legHTML(leg, num) {
    var cargoHtml;
    if (leg.avail === 0) {
      cargoHtml = '<div class="pr-leg-hint">Slots full — packages only</div>';
    } else if (!leg.cargo) {
      cargoHtml = '<div class="pr-leg-hint">Nothing profitable to carry</div>';
    } else {
      var c = leg.cargo;
      cargoHtml = '<div class="pr-leg-cargo">' +
        '<span class="pr-leg-good">' + esc(c.good) + '</span>' +
        '<span class="pr-leg-stats">' + leg.avail + ' slot' + (leg.avail !== 1 ? 's' : '') +
        ' · ' + fmtTime(leg.time) + '</span>' +
        '</div>' +
        '<div class="pr-leg-profit">' +
        '<span class="pr-good-profit ' + cls(c.profitPerTrip) + '">' + sign(c.profitPerTrip) + ' trip</span>' +
        '<span class="pr-good-profit ' + cls(c.profitPerUnit) + '">' + sign(c.profitPerUnit) + '/unit</span>' +
        '</div>';
    }
    return '<div class="pr-leg">' +
      '<div class="pr-leg-num">' + num + '</div>' +
      '<div class="pr-leg-body">' +
        '<div class="pr-leg-route">' + badge(leg.from) + '<span class="pr-leg-arrow">→</span>' + badge(leg.to) + '</div>' +
        cargoHtml +
      '</div>' +
    '</div>';
  }

  function deliveryBadgesHTML(deliveryMap, city, ps) {
    var pkgs = deliveryMap[city];
    if (!pkgs) return '';
    return pkgs.map(function (pkg) {
      var reward = packageReward(pkg.type, ps, city);
      var label  = pkg.type === 'short' ? 'Short' : 'Long';
      return '<div class="pr-delivery">' +
        '<span class="pr-delivery-badge ' + pkg.type + '">📦 ' + label + ' Quest Delivery</span>' +
        '<span class="pr-delivery-reward">+$' + reward + '</span>' +
      '</div>';
    }).join('');
  }

  function render(out, d) {
    var html = '';
    var legNum = 1;

    /* Outbound legs */
    html += '<div class="pr-section-label">Outbound Route</div>';
    html += '<div class="pr-legs">';
    for (var i = 0; i < d.outLegs.length; i++) {
      if (i > 0) html += '<div class="pr-leg-arrow-down">↓</div>';
      html += legHTML(d.outLegs[i], legNum++);
      html += deliveryBadgesHTML(d.deliveryMap, d.outLegs[i].to, d.ps);
    }
    html += '</div>';

    /* Return legs */
    if (d.mustReturn && d.retLegs.length > 0) {
      html += '<div class="pr-section-label" style="margin-top:20px">↩ Return to ' + esc(d.start) + '</div>';
      html += '<div class="pr-legs">';
      for (var i = 0; i < d.retLegs.length; i++) {
        if (i > 0) html += '<div class="pr-leg-arrow-down">↓</div>';
        html += legHTML(d.retLegs[i], legNum++);
      }
      html += '</div>';
    }

    /* Summary */
    html += '<div class="pr-summary">' +
      '<div class="prs-item"><span class="prs-val ' + cls(d.outTradeProfit) + '">' + sign(d.outTradeProfit) + '</span><span class="prs-label">Trade Profit</span></div>' +
      '<div class="prs-item"><span class="prs-val profit">+$' + d.pkgProfit + '</span><span class="prs-label">Package Rewards</span></div>' +
      (d.mustReturn && d.retLegs.length > 0 ? '<div class="prs-item"><span class="prs-val ' + cls(d.retTradeProfit) + '">' + sign(d.retTradeProfit) + '</span><span class="prs-label">Return Profit</span></div>' : '') +
      '<div class="prs-item"><span class="prs-val ' + cls(d.totalProfit) + '">' + sign(d.totalProfit) + '</span><span class="prs-label">Total Profit</span></div>' +
    '</div>';

    out.innerHTML = html;
  }

  /* ── Quest checkbox toggles ───────────────────────────────────────────── */
  function initQuestToggles() {
    function bind(chkId, dstId) {
      var chk = $id(chkId), dst = $id(dstId);
      if (!chk || !dst) return;
      chk.addEventListener('change', function () { dst.disabled = !chk.checked; });
    }
    bind('plannerShortCheck', 'plannerShortDest');
    bind('plannerLongCheck',  'plannerLongDest');
  }

  /* ── Init ─────────────────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    initQuestToggles();
    var btn = $id('plannerRun');
    if (btn) btn.addEventListener('click', run);
  });
})();

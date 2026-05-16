// Main pricing and simulation engine.
// Loaded before script.js and exposes global functions/state used by UI modules.

const CITY_ORDER = ['Tyre', 'Antioch', 'Damascus', 'Palmyra', 'Ctesiphon', 'Ecbatana'];
const CITY_NEIGHBORS = {
  Antioch: ['Tyre', 'Damascus'],
  Tyre: ['Antioch', 'Damascus'],
  Damascus: ['Antioch', 'Tyre', 'Palmyra'],
  Palmyra: ['Damascus', 'Ctesiphon'],
  Ctesiphon: ['Palmyra', 'Ecbatana'],
  Ecbatana: ['Ctesiphon'],
};

let CITIES = {};

let GOODS = [];

const FOOD_TYPES = new Set(['Agricultural']);
// These goods are sold by Spice Merchants in every city - can be bought anywhere (not just producing cities)
const SPICE_MERCHANT_GOODS = new Set(['Coriander', 'Sesame', 'Saffron']);
// Luxury goods are exclusive to one city - only available to buy there
let ENGINE_CONSTANTS = { langMod: { nativePct: 0.03, foreignL1Pct: -0.03, foreignL3Pct: 0.03, zoroL1ByzMultiplier: 1.5, judaismL2Multiplier: 1.75 }, repDiscount: { minRank: 6, discount: 0.1 }, luxury: { 'Byzantine Silk': { city: 'Antioch', culture: 'Byzantine', minRank: 4 }, 'Persian Carpets': { city: 'Ctesiphon', culture: 'Persian', minRank: 4 } } };
let LUXURY_CITY = Object.fromEntries(Object.entries(ENGINE_CONSTANTS.luxury).map(([k, v]) => [k, v.city]));

const BACKPACKS = {
  None: { extraSlots: 0 },
  SmallSatchel: { extraSlots: 2 },
  LargeSatchel: { extraSlots: 4 },
  BasketBackpack: { extraSlots: 6 },
  FramePack: { extraSlots: 6 },
};

const ANIMALS_DATA = {
  None: { slots: 0, speed: 0, saddle: false },
  'Pack Mule': { slots: 1, slotsSaddle: 3, speed: 1, saddle: true },
  'Saddle Mule': { slots: 2, slotsSaddle: 4, speed: 1, saddle: true },
  'Dromedary Camel': { slots: 2, slotsSaddle: 4, speed: 2, saddle: true },
  'Dzungarian Horse': { slots: 1, slotsSaddle: 3, speed: 3, saddle: true },
  'Nisean Horse': { slots: 4, speed: 6, saddle: false },
};

const CULTURES = {
  Byzantine: { nativeLang: 'Greek' },
  Syriac: { nativeLang: 'Aramaic' },
  Persian: { nativeLang: 'Persian' },
};

let TRAVEL_TIMES = {};

/* Warm-toned city palette to fit the parchment look */
const CITY_BADGE_COLORS = {
  Tyre: '#5b9ec7',
  Antioch: '#e08c6a',
  Damascus: '#d4a843',
  Palmyra: '#c8853a',
  Ctesiphon: '#a87bc4',
  Ecbatana: '#7ab06a',
};

// ---------------------------------------------------------------------------
// Distance + producer caches
// ---------------------------------------------------------------------------
// These calculations are called many times during route generation and table
// rendering. We precompute hop distances and producer lookups so runtime work
// stays O(1) for the hot path.
let HOP_DISTANCE_CACHE = {};
let PRODUCER_CITY_CACHE = {};

function rebuildRouteCaches() {
  const cities = Object.keys(CITY_NEIGHBORS);
  const hopCache = {};

  for (const from of cities) {
    hopCache[from] = {};
    for (const to of cities) hopCache[from][to] = from === to ? 0 : 99;

    const queue = [from];
    let head = 0;
    while (head < queue.length) {
      const city = queue[head++];
      const baseHops = hopCache[from][city];
      for (const neighbor of CITY_NEIGHBORS[city] || []) {
        if (hopCache[from][neighbor] <= baseHops + 1) continue;
        hopCache[from][neighbor] = baseHops + 1;
        queue.push(neighbor);
      }
    }
  }

  const producerMap = {};
  for (const city of CITY_ORDER) {
    const produced = CITIES[city]?.produced || [];
    for (const goodName of produced) {
      if (!producerMap[goodName]) producerMap[goodName] = [];
      producerMap[goodName].push(city);
    }
  }

  HOP_DISTANCE_CACHE = hopCache;
  PRODUCER_CITY_CACHE = producerMap;
}

// Sell price distance is based on minimum hops from any city that locally produces the good
function getHopsBetween(from, to) {
  return HOP_DISTANCE_CACHE[from]?.[to] ?? 99;
}

function getMinHopsFromProducers(good, targetCity) {
  const producers = PRODUCER_CITY_CACHE[good.name] || [];
  let minHops = Infinity;
  for (const city of producers) {
    const d = getHopsBetween(city, targetCity);
    if (d < minHops) minHops = d;
  }
  const hops = Number.isFinite(minHops) ? minHops : 0;
  return targetCity === 'Ecbatana' ? Math.min(hops, 2) : hops;
}

function calculateDistanceMultiplier(good, sellCity) {
  return 1 + getMinHopsFromProducers(good, sellCity) * good.hopPct;
}
rebuildRouteCaches();

function calculateDistanceValue(good, city) {
  const hops = getMinHopsFromProducers(good, city);
  const r = good.hopPct;

  if (hops <= 0) return 0;

  return good.base * (Math.pow(1 + r, hops) - 1);
}

let TRAIT_EFFECTS = [];
let RELIGION_PERKS = [];

function calculateCityModifier(good, sellCity, culture, religion, religionLevel, kind = 'sell') {
  const city = CITIES[sellCity];
  if (!city) return 0;
  let b = 0;
  for (const ef of TRAIT_EFFECTS) {
    if (!city.traits.includes(ef.trait_name)) continue;
    if (ef.kind && ef.kind !== kind) continue;
    if (ef.cond_type === 'good_type' && good.type !== ef.cond_value) continue;
    if (ef.cond_type === 'good_type_food' && !FOOD_TYPES.has(good.type)) continue;
    if (ef.cond_type === 'good_name' && good.name !== ef.cond_value) continue;
    if (ef.cond_type === 'culture_mismatch' && city.culture === culture) continue;
    if (ef.cond_type === 'religion' && religion !== ef.cond_value) continue;
    b += ef.bonus;
  }
  for (const pk of RELIGION_PERKS) {
    if (pk.religion !== religion || religionLevel < pk.min_level) continue;
    if (pk.perk_type === 'reduce_negative' && b < 0) b *= pk.multiplier;
    if (pk.perk_type === 'amplify_negative' && b < 0) b *= pk.multiplier;
    if (pk.perk_type === 'amplify_positive' && b > 0) b *= pk.multiplier;
    if (pk.perk_type === 'byzantine_penalty' && b < 0 && city.culture === 'Byzantine') {
      b *= pk.multiplier;
    }
  }
  return b;
}

function calculateLanguageModifier(sellCity, culture, langLevel, religion, religionLevel) {
  const native = CULTURES[culture].nativeLang;
  const cityLang = CITIES[sellCity].language;
  const lm = ENGINE_CONSTANTS.langMod;
  let pct = native === cityLang ? lm.nativePct : langLevel === 1 ? lm.foreignL1Pct : langLevel === 3 ? lm.foreignL3Pct : 0;
  if (
    religion === 'Zoroastrianism' &&
    religionLevel >= 1 &&
    CITIES[sellCity].culture === 'Byzantine' &&
    pct < 0
  ) {
    pct *= lm.zoroL1ByzMultiplier;
  }
  if (religion === 'Judaism' && religionLevel >= 2) pct *= lm.judaismL2Multiplier;
  return pct;
}

function calculateReligionModifier(good, sellCity, religion, religionLevel) {
  const city = CITIES[sellCity];
  let mod = 0;
  if (religion === 'Christianity') {
    if (
      religionLevel >= 1 &&
      (city.traits.includes('Capital') || city.traits.includes('Cosmopolitan'))
    )
      mod += 0.1;
    if (
      religionLevel >= 2 &&
      (city.culture === 'Byzantine' || city.culture === 'Syriac')
    )
      mod += 0.1;
  }
  if (religion === 'Zoroastrianism') {
    if (religionLevel >= 2 && city.hasFireTemple) mod += 0.05;
    if (religionLevel >= 3 && (good.type === 'Metal' || good.type === 'Craft')) mod += 0.1;
  }
  return mod;
}

let EVENTS = {};
let EVENT_LEVELS = {};
const EVENT_DURATION_MS = 60 * 60 * 1000; // 1 hour

// State: { cityName: { type:'Conflict', level:2, startTime: 1700000000000 } }
let eventState = {};

function loadEventState() {
  const parsed = lsGetJson('srtc-events', null);
  if (!parsed) return;
  // Strip expired
  const now = Date.now();
  eventState = {};
  for (const [city, ev] of Object.entries(parsed)) {
    if (
      ev &&
      ev.type &&
      ev.startTime &&
      now - ev.startTime < (ev.durationMs || EVENT_DURATION_MS)
    ) {
      eventState[city] = ev;
    }
  }
}
function saveEventState() {
  lsSet('srtc-events', JSON.stringify(eventState));
}
function setCityEvent(city, type, level, durationMs) {
  eventState[city] = {
    type,
    level,
    startTime: Date.now(),
    durationMs: durationMs || EVENT_DURATION_MS,
  };
  saveEventState();
  updateAll();
  renderEventsTab();
  renderEventFloater();
}
function clearCityEvent(city) {
  delete eventState[city];
  saveEventState();
  updateAll();
  renderEventsTab();
  renderEventFloater();
}
function getActiveEvent(city) {
  const ev = eventState[city];
  if (!ev) return null;
  const dur = ev.durationMs || EVENT_DURATION_MS;
  const remaining = dur - (Date.now() - ev.startTime);
  if (remaining <= 0) {
    delete eventState[city];
    saveEventState();
    return null;
  }
  return { ...ev, remainingMs: remaining };
}
// Returns delta to add to a price for a (good, city) pair (signed).
function getActiveEventDelta(good, city) {
  const ev = getActiveEvent(city);
  if (!ev) return 0;
  const def = EVENTS[ev.type];
  if (!def) return 0;
  const matches = def.goodTypes.includes(good.type) || (def.goodNames || []).includes(good.name);
  if (!matches) return 0;
  const lvl = EVENT_LEVELS[ev.level];
  if (!lvl) return 0;
  // increase: +base + base*pct  ;  decrease: -base - base*pct
  return def.dir * (lvl.base + good.base * lvl.pct);
}
function eventAffects(good, ev) {
  if (!ev) return false;
  const def = EVENTS[ev.type];
  if (!def) return false;
  return def.goodTypes.includes(good.type) || (def.goodNames || []).includes(good.name);
}

function calculateRepDiscount(buyCity, ps) {
  const culture = CITIES[buyCity].culture;
  const rd = ENGINE_CONSTANTS.repDiscount;
  if (culture === 'Byzantine' && (ps.byzantineRank || 0) >= rd.minRank) return rd.discount;
  if (culture === 'Persian' && (ps.sassanidRank || 0) >= rd.minRank) return rd.discount;
  return 0;
}

function calculateBuyPrice(good, buyCity, ps) {
  // Buy price is additive with floor per modifier - amounts < $1 are automatically zero.
  const rawCityMod = calculateCityModifier(
    good,
    buyCity,
    ps.culture,
    ps.religion,
    ps.religionLevel,
    'buy'
  );
  const langMod = calculateLanguageModifier(
    buyCity,
    ps.culture,
    ps.langLevel,
    ps.religion,
    ps.religionLevel
  );
  const relMod = calculateReligionModifier(good, buyCity, ps.religion, ps.religionLevel);
  const repMod = calculateRepDiscount(buyCity, ps);
  // Each modifier applied with floor (matching game behavior, <$1 -> zero)
  const applyMod = (mod) => Math.floor(good.base * Math.abs(mod)) * (mod >= 0 ? -1 : 1);
  const distance = calculateDistanceValue(good, buyCity);
  let price =
    good.base +
    distance +
    applyMod(rawCityMod) +
    applyMod(langMod) +
    applyMod(relMod) +
    applyMod(repMod);
  price += getActiveEventDelta(good, buyCity);
  return Math.round(price);
}

function applySellMod(base, mod) {
  return Math.floor(base * Math.abs(mod)) * (mod >= 0 ? 1 : -1);
}

function calculateSellPrice(good, buyCity, sellCity, ps) {
  const distance = calculateDistanceValue(good, sellCity);
  const cityMod = calculateCityModifier(good, sellCity, ps.culture, ps.religion, ps.religionLevel);
  const langMod = calculateLanguageModifier(
    sellCity,
    ps.culture,
    ps.langLevel,
    ps.religion,
    ps.religionLevel
  );
  const relMod = calculateReligionModifier(good, sellCity, ps.religion, ps.religionLevel);
  let price =
    good.base +
    distance +
    applySellMod(good.base, cityMod) +
    applySellMod(good.base, langMod) +
    applySellMod(good.base, relMod);
  price += getActiveEventDelta(good, sellCity);
  return Math.round(price);
}

function isLuxuryAccessible(good, ps) {
  if (good.type !== 'Luxury') return true;
  const producerCity = LUXURY_CITY[good.name];
  if (!producerCity) return true;
  const luxDef = ENGINE_CONSTANTS.luxury[good.name];
  const minRank = luxDef ? luxDef.minRank : 4;
  const culture = CITIES[producerCity].culture;
  if (culture === 'Byzantine') return (ps.byzantineRank || 1) >= minRank;
  if (culture === 'Persian') return (ps.sassanidRank || 1) >= minRank;
  return true;
}

function generateRoutes(ps) {
  const routes = [];
  for (const good of GOODS) {
    if (!isLuxuryAccessible(good, ps)) continue;
    for (const buyCity of CITY_ORDER) {
      const luxuryCity = LUXURY_CITY[good.name];
      if (luxuryCity && buyCity !== luxuryCity) continue;
      for (const sellCity of CITY_ORDER) {
        if (sellCity === buyCity) continue;
        if (CITIES[sellCity].produced.includes(good.name)) continue;
        const buyPrice = calculateBuyPrice(good, buyCity, ps);
        const sellPrice = calculateSellPrice(good, buyCity, sellCity, ps);
        const profitPerUnit = sellPrice - buyPrice;
        routes.push({
          good: good.name,
          goodType: good.type,
          buyCity,
          sellCity,
          buyPrice,
          sellPrice,
          profitPerUnit,
        });
      }
    }
  }
  return routes;
}

function getAnimalSlots(name, hasSaddle) {
  const a = ANIMALS_DATA[name];
  if (!a || a.slots === 0) return 0;
  return a.saddle && hasSaddle && a.slotsSaddle ? a.slotsSaddle : a.slots;
}

function calculateCaravanSlots(ps) {
  let count = 3;
  if (ps.caravanGamepass) count++;
  if ((ps.byzantineRank || 0) >= 8 || (ps.sassanidRank || 0) >= 8) count++;
  return Math.min(count, 5);
}

function calculateStorage(ps) {
  let slots = 3 + BACKPACKS[ps.backpack].extraSlots;
  if (ps.extraStorage) slots++;
  const caravan = calculateCaravanSlots(ps);
  for (let i = 0; i < caravan; i++) slots += getAnimalSlots(ps.animals[i], ps.saddlebags[i]);
  return slots;
}

function calculateWalkspeed(ps) {
  let speed = 16 + (ps.autoWalk ? 4 : 0);
  const active = ps.animals.filter((a) => a !== 'None');
  if (active.length > 0) {
    const avg = active.reduce((s, a) => s + (ANIMALS_DATA[a]?.speed || 0), 0) / active.length;
    speed += avg;
  }
  return Math.round(speed * 100) / 100;
}

function calculateTravelTime(from, to, walkspeed) {
  const base = TRAVEL_TIMES[from]?.[to] ?? 0;
  return Math.round(((base * 16) / walkspeed) * 10) / 10;
}

function fmtTime(mins) {
  const m = Math.floor(mins);
  const s = Math.round((mins - m) * 60);
  return s === 0 ? `~${m}m` : `~${m}m ${s}s`;
}

function enrichRoutes(routes, ps) {
  const slots = calculateStorage(ps);
  const walkspeed = calculateWalkspeed(ps);
  return routes.map((r) => {
    const profitPerTrip = r.profitPerUnit * slots;
    const time = calculateTravelTime(r.buyCity, r.sellCity, walkspeed);
    const profitPerMin = time > 0 ? Math.round(profitPerTrip / time) : 0;
    return {
      ...r,
      slots,
      walkspeed,
      time,
      profitPerTrip,
      profitPerMin,
      profitPerHour: profitPerMin * 60,
    };
  });
}

function attachReturnTrade(routes) {
  const best = {};
  for (const r of routes) {
    const k = r.buyCity + '|' + r.sellCity;
    if (!best[k] || r.profitPerUnit > best[k].profitPerUnit) best[k] = r;
  }
  return routes.map((r) => {
    const retKey = r.sellCity + '|' + r.buyCity;
    const ret = best[retKey];
    return { ...r, returnObj: ret && ret.profitPerUnit > 0 ? ret : null };
  });
}

let sortKey = 'profitPerMin';
let sortDir = -1;
let allRoutes = [];

require('dotenv').config();
const { pool, initSchema } = require('./db');
const bcrypt = require('bcrypt');

const GOODS = [
  { name: 'Barley', base_price: 10, type: 'Agricultural', hop_pct: 0.5 },
  { name: 'Wheat', base_price: 10, type: 'Agricultural', hop_pct: 0.5 },
  { name: 'Olive Oil', base_price: 20, type: 'Agricultural', hop_pct: 0.3 },
  { name: 'Dried Fish', base_price: 100, type: 'Agricultural', hop_pct: 0.09 },
  { name: 'Earthenware', base_price: 10, type: 'Household', hop_pct: 0.5 },
  { name: 'Glassware', base_price: 20, type: 'Household', hop_pct: 0.3 },
  { name: 'Iron Ingot', base_price: 35, type: 'Metal', hop_pct: 0.2 },
  { name: 'Copper Ingot', base_price: 130, type: 'Metal', hop_pct: 10 / 130 },
  { name: 'Sea Salt', base_price: 80, type: 'Spices', hop_pct: 0.1 },
  { name: 'Coriander', base_price: 80, type: 'Spices', hop_pct: 0.1 },
  { name: 'Sesame', base_price: 100, type: 'Spices', hop_pct: 0.09 },
  { name: 'Saffron', base_price: 200, type: 'Spices', hop_pct: 0.07 },
  { name: 'Linen', base_price: 10, type: 'Textile', hop_pct: 0.5 },
  { name: 'Cotton Yarn', base_price: 20, type: 'Textile', hop_pct: 0.3 },
  { name: 'Leather', base_price: 35, type: 'Textile', hop_pct: 0.2 },
  { name: 'Wool', base_price: 35, type: 'Textile', hop_pct: 0.2 },
  { name: 'Weapons', base_price: 35, type: 'Craft', hop_pct: 0.2 },
  { name: 'Tools', base_price: 35, type: 'Craft', hop_pct: 0.2 },
  {
    name: 'Byzantine Silk',
    base_price: 300,
    type: 'Luxury',
    hop_pct: 17 / 300,
  },
  {
    name: 'Persian Carpets',
    base_price: 300,
    type: 'Luxury',
    hop_pct: 17 / 300,
  },
];

const CITIES = [
  {
    name: 'Antioch',
    culture: 'Byzantine',
    language: 'Greek',
    has_fire_temple: false,
    traits: ['Pentarchy', 'Earthquake Prone'],
    produced: ['Sea Salt', 'Wool', 'Coriander', 'Byzantine Silk'],
  },
  {
    name: 'Tyre',
    culture: 'Byzantine',
    language: 'Greek',
    has_fire_temple: false,
    traits: ['Port'],
    produced: ['Olive Oil', 'Dried Fish', 'Sea Salt', 'Glassware', 'Linen'],
  },
  {
    name: 'Damascus',
    culture: 'Syriac',
    language: 'Aramaic',
    has_fire_temple: false,
    traits: ['Desert', 'Cosmopolitan'],
    produced: ['Iron Ingot', 'Copper Ingot', 'Weapons', 'Tools', 'Earthenware', 'Sesame'],
  },
  {
    name: 'Palmyra',
    culture: 'Syriac',
    language: 'Aramaic',
    has_fire_temple: false,
    traits: ['Frontier'],
    produced: ['Linen', 'Wool', 'Cotton Yarn', 'Wheat', 'Barley', 'Leather'],
  },
  {
    name: 'Ctesiphon',
    culture: 'Persian',
    language: 'Persian',
    has_fire_temple: true,
    traits: ['Capital'],
    produced: [
      'Wheat',
      'Olive Oil',
      'Cotton Yarn',
      'Glassware',
      'Earthenware',
      'Tools',
      'Iron Ingot',
      'Coriander',
      'Sesame',
      'Persian Carpets',
    ],
  },
  {
    name: 'Ecbatana',
    culture: 'Persian',
    language: 'Persian',
    has_fire_temple: true,
    traits: ['Homogenous'],
    produced: ['Copper Ingot', 'Barley', 'Wool', 'Leather', 'Weapons', 'Saffron'],
  },
];

const TRAITS = [
  { name: 'Port', description: 'Boosts all sell prices by 5%' },
  { name: 'Capital', description: '+10% to Luxury goods' },
  { name: 'Desert', description: '+10% to Agricultural goods (sell only)' },
  { name: 'Frontier', description: '+10% to Tools and Weapons' },
  { name: 'Earthquake Prone', description: '+10% to Tools and Weapons' },
  {
    name: 'Cosmopolitan',
    description: '+10% when your culture differs from city culture',
  },
  { name: 'Pentarchy', description: '+10% when religion is Christianity' },
  {
    name: 'Homogenous',
    description: '-10% when your culture differs from city culture',
  },
];

const TRAIT_EFFECTS = [
  {
    trait_name: 'Port',
    kind: null,
    bonus: 0.05,
    cond_type: null,
    cond_value: null,
  },
  {
    trait_name: 'Capital',
    kind: null,
    bonus: 0.1,
    cond_type: 'good_type',
    cond_value: 'Luxury',
  },
  {
    trait_name: 'Desert',
    kind: 'sell',
    bonus: 0.1,
    cond_type: 'good_type_food',
    cond_value: 'Agricultural',
  },
  {
    trait_name: 'Frontier',
    kind: null,
    bonus: 0.1,
    cond_type: 'good_name',
    cond_value: 'Tools',
  },
  {
    trait_name: 'Frontier',
    kind: null,
    bonus: 0.1,
    cond_type: 'good_name',
    cond_value: 'Weapons',
  },
  {
    trait_name: 'Earthquake Prone',
    kind: null,
    bonus: 0.1,
    cond_type: 'good_name',
    cond_value: 'Tools',
  },
  {
    trait_name: 'Earthquake Prone',
    kind: null,
    bonus: 0.1,
    cond_type: 'good_name',
    cond_value: 'Weapons',
  },
  {
    trait_name: 'Cosmopolitan',
    kind: null,
    bonus: 0.1,
    cond_type: 'culture_mismatch',
    cond_value: null,
  },
  {
    trait_name: 'Pentarchy',
    kind: null,
    bonus: 0.1,
    cond_type: 'religion',
    cond_value: 'Christianity',
  },
  {
    trait_name: 'Homogenous',
    kind: null,
    bonus: -0.1,
    cond_type: 'culture_mismatch',
    cond_value: null,
  },
];

const LANGUAGES = ['Greek', 'Aramaic', 'Persian'];
const CULTURES = [
  { name: 'Byzantine', native_language: 'Greek' },
  { name: 'Syriac', native_language: 'Aramaic' },
  { name: 'Persian', native_language: 'Persian' },
];
const RELIGIONS = ['Christianity', 'Judaism', 'Zoroastrianism'];
const RELIGION_PERKS = [
    {
    religion: 'Zoroastrianism',
    min_level: 1,
    perk_type: 'byzantine_penalty',
    multiplier: 1.5,
    description: 'Price penalties are 50% higher in Byzantine cities',
  },
  {
    religion: 'Christianity',
    min_level: 3,
    perk_type: 'reduce_negative',
    multiplier: 0.5,
    description: 'Halves negative city modifiers at level 3',
  },
  {
    religion: 'Judaism',
    min_level: 1,
    perk_type: 'amplify_negative',
    multiplier: 2,
    description: 'Doubles negative city modifiers at level 1+',
  },
  {
    religion: 'Judaism',
    min_level: 3,
    perk_type: 'amplify_positive',
    multiplier: 1.25,
    description: '25% bonus for positive city modifiers at level 3',
  },
];

const EVENT_TYPES = [
  {
    name: 'Conflict',
    glyph: '⚔',
    dir: 1,
    good_types: ['Metal'],
    good_names: ['Weapons'],
    description: 'Increases value of Weapons & Metal',
  },
  {
    name: 'Festival',
    glyph: '✿',
    dir: 1,
    good_types: ['Craft', 'Household'],
    good_names: [],
    description: 'Increases value of Craft & Household',
  },
  {
    name: 'Drought',
    glyph: '☼',
    dir: 1,
    good_types: ['Agricultural'],
    good_names: [],
    description: 'Increases value of Agriculture',
  },
  {
    name: 'Harvest',
    glyph: '❀',
    dir: -1,
    good_types: ['Agricultural'],
    good_names: [],
    description: 'Decreases value of Agriculture',
  },
];

const EVENT_LEVELS = [
  {
    event_name: 'Conflict',
    level: 1,
    pct: 0.05,
    base_bonus: 3,
    label: 'Small',
  },
  {
    event_name: 'Conflict',
    level: 2,
    pct: 0.1,
    base_bonus: 5,
    label: 'Local',
  },
  { event_name: 'Conflict', level: 3, pct: 0.15, base_bonus: 8, label: 'Major' },
  {
    event_name: 'Festival',
    level: 1,
    pct: 0.05,
    base_bonus: 3,
    label: 'Small',
  },
  {
    event_name: 'Festival',
    level: 2,
    pct: 0.1,
    base_bonus: 5,
    label: 'Local',
  },
  { event_name: 'Festival', level: 3, pct: 0.15, base_bonus: 8, label: 'Major' },
  {
    event_name: 'Drought',
    level: 1,
    pct: 0.05,
    base_bonus: 3,
    label: 'Small',
  },
  {
    event_name: 'Drought',
    level: 2,
    pct: 0.1,
    base_bonus: 5,
    label: 'Moderate',
  },
  { event_name: 'Drought', level: 3, pct: 0.15, base_bonus: 8, label: 'Severe' },
  { event_name: 'Harvest', level: 1, pct: 0.05, base_bonus: 3, label: 'Good' },
  {
    event_name: 'Harvest',
    level: 2,
    pct: 0.1,
    base_bonus: 5,
    label: 'Plentiful',
  },
  {
    event_name: 'Harvest',
    level: 3,
    pct: 0.15,
    base_bonus: 8,
    label: 'Abundant',
  },
];

const TRAVEL_TIMES_RAW = {
  Antioch: {
    Tyre: 8.7,
    Damascus: 7.0,
    Palmyra: 13.5,
    Ctesiphon: 19.3,
    Ecbatana: 23.6,
  },
  Tyre: {
    Antioch: 8.7,
    Damascus: 6.2,
    Palmyra: 12.7,
    Ctesiphon: 18.5,
    Ecbatana: 22.8,
  },
  Damascus: {
    Antioch: 7.0,
    Tyre: 6.2,
    Palmyra: 6.5,
    Ctesiphon: 12.3,
    Ecbatana: 16.6,
  },
  Palmyra: {
    Antioch: 13.5,
    Tyre: 12.7,
    Damascus: 6.5,
    Ctesiphon: 5.8,
    Ecbatana: 10.1,
  },
  Ctesiphon: {
    Antioch: 19.3,
    Tyre: 18.5,
    Damascus: 12.3,
    Palmyra: 5.8,
    Ecbatana: 4.3,
  },
  Ecbatana: {
    Antioch: 23.6,
    Tyre: 22.8,
    Damascus: 16.6,
    Palmyra: 10.1,
    Ctesiphon: 4.3,
  },
};

const HISTORICAL_CHANGELOGS = [
  {
    version: 'v1.0',
    date: '2026-04-28',
    entries: ['Initial release with cities, goods and religion modifiers'],
  },
  {
    version: 'v1.1',
    date: '2026-04-29',
    entries: [
      'Tools tab with trip planner and optimal setup finder',
      'Best round-trip card and price breakdown tooltips',
    ],
  },
  {
    version: 'v1.2',
    date: '2026-04-30',
    entries: [
      'Events tab introduced with city countdown timers',
      'Price calculations now include event modifiers',
    ],
  },
  {
    version: 'v1.3',
    date: '2026-05-01',
    entries: [
      'Inline return-leg route expansion',
      'Named setup save slots',
      'Custom event durations',
    ],
  },
  {
    version: 'v1.4',
    date: '2026-05-02',
    entries: [
      'Mobile support improvements for calculator layout and onboarding',
      'Routes shown as tappable cards on phones',
    ],
  },
  {
    version: 'v1.5',
    date: '2026-05-03',
    entries: [
      'Antioch added with goods, traits and travel times',
      'Spice goods added: Coriander, Sesame, Saffron',
      'Luxury goods added: Byzantine Silk and Persian Carpets',
      'Rank 6 faction buy discount reflected in prices',
      'Prices tab introduced',
    ],
    thanks: 'MinisterOfYapping & Bird',
  },
  {
    version: 'v1.6',
    date: '2026-05-04',
    entries: [
      'Prices recalculated from scratch to match in-game values',
      'Routes include all goods in all cities with import cost factored in',
      'Fixed missing/incorrect city trait bonuses',
    ],
    thanks: 'KuglerKnight',
  },
  {
    version: 'v1.7',
    date: '2026-05-05',
    entries: [
      'Travel times have been remeasured in-game and recalibrated for route ranking accuracy',
      'Prices tab rebuilt as a compact matrix grouped by type',
      'Trip Planner replaced with Courier Route Planner',
      'Events tab visual refresh with city cards and countdown',
      "What's New window appears after updates",
      'Routes table performance and search responsiveness improved',
      'General UI decluttering',
      'Display setting added to turn off walking animation',
    ],
  },
];

async function ins(table, fields, vals) {
  const cols = fields.join(',');
  const pls = fields.map((_, i) => `$${i + 1}`).join(',');
  await pool.query(`INSERT INTO ${table} (${cols}) VALUES (${pls}) ON CONFLICT DO NOTHING`, vals);
}

async function seed() {
  await initSchema();

  console.log('Goods...');
  for (const g of GOODS)
    await ins(
      'goods',
      ['name', 'base_price', 'type', 'hop_pct'],
      [g.name, g.base_price, g.type, g.hop_pct]
    );

  console.log('Travel times...');
  for (const from of Object.keys(TRAVEL_TIMES_RAW))
    for (const [to, mins] of Object.entries(TRAVEL_TIMES_RAW[from]))
      await ins('travel_times', ['from_city', 'to_city', 'minutes'], [from, to, mins]);

  console.log('Languages...');
  for (const l of LANGUAGES) await ins('languages', ['name'], [l]);

  console.log('Cultures...');
  for (const c of CULTURES)
    await ins('cultures', ['name', 'native_language'], [c.name, c.native_language]);

  console.log('Traits...');
  for (const t of TRAITS)
    await ins('city_traits', ['name', 'description'], [t.name, t.description]);

  console.log('Trait effects...');
  for (const e of TRAIT_EFFECTS)
    await pool.query(
      `INSERT INTO trait_effects (trait_name,kind,bonus,cond_type,cond_value) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
      [e.trait_name, e.kind, e.bonus, e.cond_type, e.cond_value]
    );

  console.log('Cities...');
  for (const c of CITIES) {
    await ins(
      'cities',
      ['name', 'culture', 'language', 'has_fire_temple'],
      [c.name, c.culture, c.language, c.has_fire_temple]
    );
    for (const t of c.traits)
      await ins('city_city_traits', ['city_name', 'trait_name'], [c.name, t]);
    for (const g of c.produced) await ins('city_goods', ['city_name', 'good_name'], [c.name, g]);
  }

  console.log('Religions...');
  for (const r of RELIGIONS) await ins('religions', ['name'], [r]);
  for (const p of RELIGION_PERKS)
    await pool.query(
      `INSERT INTO religion_perks (religion,min_level,perk_type,multiplier,description) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
      [p.religion, p.min_level, p.perk_type, p.multiplier, p.description]
    );

  console.log('Events...');
  for (const e of EVENT_TYPES)
    await ins(
      'event_types',
      ['name', 'glyph', 'dir', 'good_types', 'good_names', 'description'],
      [e.name, e.glyph, e.dir, e.good_types, e.good_names, e.description]
    );
  for (const l of EVENT_LEVELS)
    await pool.query(
      `INSERT INTO event_levels (event_name,level,pct,base_bonus,label) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (event_name,level) DO NOTHING`,
      [l.event_name, l.level, l.pct, l.base_bonus, l.label]
    );

  console.log('Historical changelogs...');
  for (const c of HISTORICAL_CHANGELOGS) {
    const existing = await pool.query('SELECT 1 FROM changelogs WHERE version=$1 LIMIT 1', [
      c.version,
    ]);
    if (!existing.rows.length) {
      await pool.query(
        `INSERT INTO changelogs (version,date,entries,thanks)
         VALUES ($1,$2,$3,$4)`,
        [c.version, c.date, c.entries, c.thanks || '']
      );
    }
  }

  console.log('Owner bootstrap...');
  if (process.env.OWNER_USERNAME && process.env.OWNER_PASSWORD) {
    const passwordHash = await bcrypt.hash(process.env.OWNER_PASSWORD, 12);
    await pool.query(
      `INSERT INTO admin_users (username, password_hash, role, active)
       VALUES ($1,$2,'owner',true)
       ON CONFLICT (username) DO NOTHING`,
      [process.env.OWNER_USERNAME, passwordHash]
    );
  } else {
    console.warn('OWNER_USERNAME / OWNER_PASSWORD env vars not set; owner bootstrap skipped.');
  }

  console.log('Done.');
  process.exit(0);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});

# silkroadcalc.eu - Codebase Reference

## After a Game Update: What to Change

This is the only section you need after a patch. All game data lives in `backend/seed.js`. Edit values there, then run:

```
cd backend
node seed.js
```

No deploy needed. Writes directly to Railway PostgreSQL and goes live on the next API call.

| What changed | Where in seed.js |
|---|---|
| Good base prices or hop% | `GOODS` (~line 5) |
| City traits or produced goods | `CITIES` (~line 38) |
| Trait modifier rules | `TRAIT_EFFECTS` (~line 117) |
| Language modifiers | `LANGUAGES` (~line 190) |
| Religion bonus rules | `RELIGION_PERKS` (~line 197) |
| Event types or levels | `EVENT_TYPES` / `EVENT_LEVELS` (~line 228) |
| Travel times between cities | `TRAVEL_TIMES_RAW` (~line 326) |

If you also changed **language modifier percentages, reputation discount threshold/amount, or luxury goods access rules**, those are hardcoded constants in `frontend/shared/engine-constants.js` and must be updated there too (they are not seeded from the database). `backend/engine-constants.js` is a copy of the same file - update both.

---

## Architecture

Three layers:

- **Cloudflare** - DNS proxy in front of GitHub Pages. Provides clean URLs (/routes, /planner, /setup, /settings, /updates) via URL Rewrite Rules.
- **Frontend:** `https://silkroadcalc.eu` - GitHub Pages, fully static HTML/CSS/JS
- **Backend:** `https://admin.silkroadcalc.eu` - Railway, Express + PostgreSQL

Frontend calls the backend API for all game data. The admin panel lives at `https://admin.silkroadcalc.eu/admin`.

---

## Directory Structure

```
silkroadcalc.eu/
├── index.html                        Home page entry point
├── CNAME / robots.txt / sitemap.xml  Deployment + SEO (must stay at root)
├── CLAUDE.md                         AI assistant instructions
│
├── frontend/
│   ├── shared/                       Loaded by every page
│   │   ├── engine-constants.js       Hardcoded constants (lang mod%, rep discount, luxury access)
│   │   ├── api-config.js             API base URL config
│   │   ├── sync.js                   Shared API sync helpers
│   │   ├── setup-sync.js             Fetches API data + overwrites engine globals
│   │   ├── overlays.js               Maintenance banner + session ping
│   │   ├── nav.js                    Navigation, mobile menu, auth button
│   │   └── base.css                  Base styles shared across pages
│   │
│   ├── assets/
│   │   ├── js/
│   │   │   ├── main-engine.js        Core pricing engine (see below)
│   │   │   └── main-utils.js         Shared UI utilities
│   │   ├── icons/                    Good + city icons
│   │   └── images/                   Favicon, OG image, etc.
│   │
│   ├── routes/                       Route calculator (primary page, /routes)
│   │   ├── routes.html
│   │   ├── script.js                 Routes UI + all route logic
│   │   ├── main-overlays.js          Page-local overlay wiring
│   │   ├── routes.css
│   │   └── styles.css
│   │
│   ├── planner/                      Courier route planner (/planner)
│   │   ├── planner.html
│   │   ├── planner.js
│   │   └── planner.css
│   │
│   ├── setup/                        Character setup wizard (/setup)
│   │   ├── setup.html
│   │   ├── setup.js
│   │   └── setup.css
│   │
│   ├── settings/                     User settings page (/settings)
│   │   ├── settings.html
│   │   ├── settings.js
│   │   └── settings.css
│   │
│   └── updates/                      Changelog / updates page (/updates)
│       ├── updates.html
│       └── updates.css
│
└── backend/
    ├── index.js                      Express API server
    ├── db.js                         PostgreSQL schema + pool
    ├── seed.js                       Seeds/updates the database
    ├── services/
    │   └── discord.js                Discord webhook notifications
    └── admin/
        ├── index.html                Admin panel (5 tabs: Analytics, Site, Changelog, Data, Projects)
        └── assets/
            ├── css/styles.css
            └── js/
                ├── script.js               Tab switching + login
                ├── admin-utils.js          Shared helpers (api(), ss(), el(), etc.)
                └── admin-site-analytics.js All panel logic
```

---

## Core Pricing Engine - `frontend/assets/js/main-engine.js`

All price calculations live here. Dynamic data (GOODS, CITIES, TRAVEL_TIMES, TRAIT_EFFECTS, RELIGION_PERKS, EVENTS) starts as empty defaults and is overwritten at runtime by `syncFromApi()` in `routes/script.js` or `syncData()` in `planner/planner.js`.

| What | Approx. line |
|---|---|
| `CITY_NEIGHBORS` - adjacency map for hop routing | 5 |
| `CITIES` - traits, culture, language, produced goods | 14 |
| `GOODS` - base prices and hop% per good | 70 |
| `TRAIT_EFFECTS` - city trait modifier rules | 220 |
| `RELIGION_PERKS` - religion bonus/penalty rules | 232 |
| `EVENTS` - event type definitions | 307 |
| `EVENT_LEVELS` - event impact levels 1-3 | 341 |
| `rebuildRouteCaches()` - precomputes hop distances + producer lookups | 156 |
| `getMinHopsFromProducers()` - min hops from any producer city | 195 |
| `calculateDistanceValue()` - exponential distance price modifier | 211 |
| `calculateCityModifier()` - city trait effects on buy/sell price | 239 |
| `calculateLanguageModifier()` - language skill modifier | 265 |
| `calculateReligionModifier()` - religion bonus calculations | 281 |
| `calculateRepDiscount()` - reputation rank discount | 422 |
| `calculateBuyPrice()` - full buy price with all modifiers | 429 |
| `calculateSellPrice()` - full sell price with all modifiers | 466 |
| `generateRoutes()` - generates all profitable route combinations | 497 |
| `enrichRoutes()` - adds profit/time per trip to routes | 567 |

### Price Formula

**Buy:** `round(base + base*(pow(1+hopPct, hops)-1) + floor(base*|mod|)*sign + eventDelta)`
**Sell:** `round(base + base*(pow(1+hopPct, hops)-1) + floor(base*|mod|)*sign + eventDelta)`

For buy: positive city modifier means negative adjustment (cheaper). For sell: positive modifier means positive adjustment (more profit). Modifiers below $1 floor to zero.

---

## Hardcoded Constants - `frontend/shared/engine-constants.js`

Constants not stored in the database. Used by both the browser (via `window.ENGINE_CONSTANTS`) and the backend `/api/constants` endpoint (via `require()`).

| Constant | What it controls |
|---|---|
| `langMod.nativePct` | Native language sell bonus (+3%) |
| `langMod.foreignL1Pct` | Broken language penalty (-3%) |
| `langMod.foreignL3Pct` | Fluent language bonus (+3%) |
| `langMod.zoroL1ByzMultiplier` | Zoroastrianism L1 language multiplier |
| `langMod.judaismL2Multiplier` | Judaism L2 language multiplier |
| `repDiscount.minRank` | Minimum rank for reputation discount |
| `repDiscount.discount` | Discount amount (10%) |
| `luxury` | Which goods are luxury, what city sells them, and min rank to buy |

---

## Routes Page - `frontend/routes/script.js`

| What | Approx. line |
|---|---|
| `getPlayerState()` - reads character setup from UI/localStorage | 4 |
| `updateAll()` - triggers full recalculation + render | 42 |
| `renderTable()` - main routes table rendering | 58 |
| `renderMobileCards()` - mobile card layout | 195 |
| `renderPricesTab()` - prices matrix tab | ~470 |
| `renderBestLoop()` - optimal round-trip route card | ~900 |
| `exportCSV()` - export routes to CSV | ~770 |
| `saveNamedState()` / `loadNamedState()` - named setup presets | ~860 |
| `buildPriceBreakdown()` - tooltip showing buy/sell modifiers | ~1350 |
| `syncFromApi()` - fetches all game data from API, overwrites engine globals | ~1650 |

---

## Backend API - `backend/index.js`

### Public

| Route | What |
|---|---|
| `GET /api/goods` | All goods with base price + hop% |
| `GET /api/cities` | All cities with traits + produced goods |
| `GET /api/travel-times` | Travel time matrix |
| `GET /api/events` | Event type definitions |
| `GET /api/religions` | Religion list |
| `GET /api/religion-perks` | Religion bonus rules |
| `GET /api/trait-effects` | City trait modifier rules |
| `GET /api/languages` | Language list |
| `GET /api/maintenance` | Maintenance mode status |
| `GET /api/notices` | Active notice bar content |
| `GET /api/changelogs` | Changelog entries |
| `GET /api/constants` | Hardcoded engine constants from engine-constants.js |

### Auth (Discord OAuth)

| Route | What |
|---|---|
| `GET /api/auth/discord` | Initiates OAuth |
| `GET /api/auth/discord/callback` | OAuth callback |
| `GET /api/auth/me` | Current user |
| `POST /api/session/ping` | Session tracking for analytics |

### Admin (JWT auth required)

| Route | What |
|---|---|
| `POST /api/admin/login` | Admin login |
| `GET /api/analytics` | Analytics data |
| `POST /api/admin/maintenance` | Set maintenance mode |
| `POST /api/admin/notices` | Manage notices |
| `POST /api/admin/changelogs` | Manage changelog |
| `GET/POST /api/admin/sections` | Project task management |

---

## Database - `backend/db.js`

`initSchema()` starts at line 9 and creates all tables:

`goods`, `travel_times`, `sessions`, `daily_sessions`, `languages`, `cultures`, `city_traits`, `trait_effects`, `cities`, `city_city_traits`, `city_goods`, `religions`, `religion_perks`, `event_types`, `event_levels`, `settings`, `changelogs`, `notices`, `admin_users`, `admin_audit_log`, `discord_users`, `user_webhooks`, `project_sections`, `project_todos`

---

## Environment Variables (Railway)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Signed tokens for admin login |
| `DISCORD_CLIENT_ID` | OAuth app ID |
| `DISCORD_CLIENT_SECRET` | OAuth app secret |
| `DISCORD_REDIRECT_URI` | OAuth callback URL |
| `ADMIN_USER_IDS` | Comma-separated Discord user IDs with admin access |
| `DISPLAY_NAMES` | Override display names: `userId:Name,userId2:Name2` |
| `OWNER_USERNAME` | Admin panel owner username |
| `OWNER_PASSWORD` | Admin panel owner password |
| `GITHUB_TOKEN` | GitHub API token for commit feed in admin projects tab |

---

## Data Flow

1. Page loads: `syncFromApi()` (routes) or `syncData()` (planner) fetches `/api/goods`, `/api/cities`, `/api/trait-effects`, etc.
2. Fetched values overwrite the empty defaults in `main-engine.js` globals
3. `generateRoutes()` computes all buy/sell combinations using current engine state
4. UI renders routes table / planner / prices

If the API is unreachable, pages fall back to empty data (no routes shown). All game data lives in `seed.js` and the database.

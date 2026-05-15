# silkroadcalc.eu — Codebase Reference

## Architecture

Two-domain setup:

- **Frontend:** `https://silkroadcalc.eu` — GitHub Pages, fully static HTML/CSS/JS
- **Backend:** `https://admin.silkroadcalc.eu` — Railway, Express + PostgreSQL

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
│   │   ├── main-engine.js            Core pricing engine (see below)
│   │   ├── main-utils.js             Shared UI utilities
│   │   ├── setup-sync.js             Fetches API data + overwrites engine globals
│   │   ├── overlays.js               Maintenance banner + notice bar
│   │   ├── nav.js                    Navigation, mobile menu, auth button
│   │   └── base.css                  Base styles shared across pages
│   │
│   ├── routes/                       Route calculator (primary page)
│   │   ├── routes.html
│   │   ├── script.js                 Routes UI + all route logic (~1950 lines)
│   │   ├── main-overlays.js          Page-local overlay wiring
│   │   ├── routes.css
│   │   └── styles.css
│   │
│   ├── planner/                      Courier route planner
│   │   ├── planner.html
│   │   ├── planner.js
│   │   └── planner.css
│   │
│   ├── setup/                        Character setup wizard
│   │   ├── home.js
│   │   └── home.css
│   │
│   ├── setup/                        Character setup wizard
│   │   ├── setup.html
│   │   ├── setup.js
│   │   └── setup.css
│   │
│   ├── settings/                     User settings page
│   │   ├── settings.html
│   │   ├── settings.js
│   │   └── settings.css
│   │
│   └── assets/
│       ├── icons/                    Good + city icons
│       └── images/                   Favicon, OG image, etc.
│
└── backend/
    ├── index.js                      Express API server (~1600 lines)
    ├── db.js                         PostgreSQL schema + pool
    ├── seed.js                       Seeds/updates the database
    ├── services/
    │   └── discord.js                Discord webhook notifications
    └── admin/
        ├── index.html                Admin panel (3 tabs: Analytics, Site, Data)
        └── assets/
            ├── css/styles.css
            └── js/
                ├── script.js         Tab switching + login
                ├── admin-utils.js    Shared helpers (api(), ss(), el(), etc.)
                └── admin-site-analytics.js  All panel logic (analytics, site, data)
```

---

## Core Pricing Engine — `frontend/shared/main-engine.js`

All price calculations live here. Values are hardcoded as fallbacks but overwritten at runtime by `syncFromApi()` in `setup-sync.js`.

| What | Line |
|------|------|
| `CITY_NEIGHBORS` — adjacency map for hop routing | 5 |
| `CITIES` — traits, culture, language, produced goods | 14 |
| `GOODS` — base prices and hop% per good | 70 |
| `TRAIT_EFFECTS` — city trait modifier rules | 220 |
| `RELIGION_PERKS` — religion bonus/penalty rules | 232 |
| `EVENTS` — event type definitions | 307 |
| `EVENT_LEVELS` — event impact levels 1–3 | 341 |
| `rebuildRouteCaches()` — precomputes hop distances + producer lookups | 156 |
| `getMinHopsFromProducers()` — min hops from any producer city | 195 |
| `calculateDistanceValue()` — exponential distance price modifier | 211 |
| `calculateCityModifier()` — city trait effects on buy/sell price | 239 |
| `calculateLanguageModifier()` — language skill modifier | 265 |
| `calculateReligionModifier()` — religion bonus calculations | 281 |
| `calculateRepDiscount()` — reputation rank discount | 422 |
| `calculateBuyPrice()` — full buy price with all modifiers | 429 |
| `calculateSellPrice()` — full sell price with all modifiers | 466 |
| `generateRoutes()` — generates all profitable route combinations | 497 |
| `enrichRoutes()` — adds profit/time per trip to routes | 567 |

### Price Formula

**Buy:** `round(base + base*(pow(1+hopPct, hops)-1) + floor(base*|mod|)*sign + eventDelta)`
**Sell:** `round(base + base*(pow(1+hopPct, hops)-1) + floor(base*|mod|)*sign + eventDelta)`

For buy: positive city modifier → negative adjustment (cheaper). For sell: positive modifier → positive adjustment (more profit). Modifiers below `$1` floor to zero.

---

## Routes Page — `frontend/routes/script.js`

| What | Line |
|------|------|
| `getPlayerState()` — reads character setup from UI/localStorage | 4 |
| `updateAll()` — triggers full recalculation + render | 42 |
| `renderTable()` — main routes table rendering | 58 |
| `renderMobileCards()` — mobile card layout | 195 |
| `renderEventsTab()` — events panel UI | 428 |
| `renderPricesTab()` — prices matrix tab | 564 |
| `buildPriceBreakdown()` — tooltip showing buy/sell modifiers | 1600 |
| `renderBestLoop()` — optimal round-trip route card | 1048 |
| `exportCSV()` — export routes to CSV | 843 |
| `saveNamedState()` / `loadNamedState()` — named setup presets | 1000 / 1014 |
| `syncFromApi()` — fetches all game data from API, overwrites engine globals | 1892 |

---

## Backend API — `backend/index.js`

### Public

| Route | Line |
|-------|------|
| `GET /api/goods` | 251 |
| `GET /api/cities` | 290 |
| `GET /api/travel-times` | 276 |
| `GET /api/events` | 321 |
| `GET /api/religions` | 355 |
| `GET /api/religion-perks` | 364 |
| `GET /api/trait-effects` | 373 |
| `GET /api/languages` | 382 |
| `GET /api/maintenance` | 391 |
| `GET /api/notices` | 410 |
| `GET /api/changelogs` | 401 |

### Auth (Discord OAuth)

| Route | Line |
|-------|------|
| `GET /api/auth/discord` — initiates OAuth | 482 |
| `GET /api/auth/discord/callback` — OAuth callback | 492 |
| `GET /api/auth/me` — current user | 539 |
| `POST /api/session/ping` — session tracking for analytics | 460 |

### Admin (JWT auth required)

| Route | Line |
|-------|------|
| `POST /api/admin/login` | 750 |
| `GET /api/analytics` | 957 |
| `POST /api/admin/maintenance` | — |
| `POST /api/admin/notices` | — |
| `POST /api/admin/changelogs` | — |

---

## Database — `backend/db.js`

`initSchema()` starts at **line 9** and creates all tables:

`goods`, `travel_times`, `sessions`, `daily_sessions`, `languages`, `cultures`, `city_traits`, `trait_effects`, `cities`, `city_city_traits`, `city_goods`, `religions`, `religion_perks`, `event_types`, `event_levels`, `settings`, `changelogs`, `notices`, `admin_users`, `admin_lock_state`, `admin_audit_log`, `discord_users`, `user_webhooks`, `forum_posts`, `forum_comments`, `forum_votes`

---

## Seed Script — `backend/seed.js`

Run `node seed.js` from `backend/` to populate or update the database. Uses `ON CONFLICT ... DO UPDATE SET` so re-running always overwrites existing values.

| What | Line |
|------|------|
| `GOODS` — 20 goods with base prices + hop% | 5 |
| `CITIES` — 6 cities with traits + produced goods | 38 |
| `TRAITS` — city trait definitions | 100 |
| `TRAIT_EFFECTS` — trait modifier rules | 117 |
| `LANGUAGES` | 190 |
| `CULTURES` | 191 |
| `RELIGIONS` | 196 |
| `RELIGION_PERKS` | 197 |
| `EVENT_TYPES` | 228 |
| `EVENT_LEVELS` | 263 |
| `TRAVEL_TIMES_RAW` — travel time matrix in hours | 326 |
| `ins()` — upsert helper | 448 |
| `seed()` — main seed function | 461 |

---

## Environment Variables (Railway)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Signed tokens for admin login |
| `DISCORD_CLIENT_ID` | OAuth app ID |
| `DISCORD_CLIENT_SECRET` | OAuth app secret |
| `DISCORD_REDIRECT_URI` | OAuth callback URL |
| `ADMIN_USER_IDS` | Comma-separated Discord user IDs with admin access |
| `DISPLAY_NAMES` | Override display names: `userId:Name,userId2:Name2` |
| `OWNER_USERNAME` | Admin panel owner username |
| `OWNER_PASSWORD` | Admin panel owner password |

---

## Data Flow

1. Page loads → `setup-sync.js` fetches `/api/goods`, `/api/cities`, `/api/trait-effects`, etc.
2. Fetched values overwrite the hardcoded fallbacks in `main-engine.js` globals
3. `generateRoutes()` computes all buy/sell combinations using current engine state
4. UI renders routes table / planner / prices

If the API is unreachable, hardcoded fallbacks in `main-engine.js` are used. Keep fallbacks in sync with `seed.js` values.

---

## Changing Game Data

Edit values in `backend/seed.js`, then run:

```
cd backend
node seed.js
```

No GitHub push needed — writes directly to Railway PostgreSQL. Changes are live immediately after the next API call.

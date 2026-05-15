require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const path = require('path');
const { pool, initSchema } = require('./db');
const fetchImpl = globalThis.fetch || require('node-fetch');
const {
  sendChangelogToDiscord,
  sendMaintenanceToDiscord,
  sendPermissionRequestToDiscord,
  sendNoticeToDiscord,
} = require('./services/discord.js');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(
  cors({
    origin: [
      'https://silkroadcalc.eu',
      'https://www.silkroadcalc.eu',
      'https://admin.silkroadcalc.eu',
      'http://127.0.0.1:5500',
      'http://localhost:5500',
      'http://localhost:3000',
    ],
    credentials: true,
  })
);
app.set('trust proxy', 1);
app.use(express.json());
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.use('/assets', express.static(path.join(__dirname, '../frontend/assets')));

app.get('/health', (_req, res) => res.json({ ok: true }));

function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
    req.adminUser = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function requireOwner(req, res, next) {
  if (req.adminUser?.role !== 'owner') return res.status(403).json({ error: 'Owner only' });
  next();
}

async function getLockState() {
  const { rows } = await pool.query(
    'SELECT is_locked, changed_at FROM admin_lock_state WHERE id=1'
  );
  if (!rows.length) return { is_locked: true };
  return rows[0];
}

async function requireUnlockedOrOwner(req, res, next) {
  if (req.adminUser?.role === 'owner') return next();
  const lock = await getLockState();
  if (lock.is_locked) return res.status(423).json({ error: 'Panel is locked by owner' });
  next();
}

async function writeAudit(
  req,
  { entityType, entityId, action, beforeJson = null, afterJson = null }
) {
  await pool.query(
    `INSERT INTO admin_audit_log
    (actor_user_id, actor_role, actor_username, entity_type, entity_id, action, before_json, after_json, request_json)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      req.adminUser?.id ?? null,
      req.adminUser?.role ?? 'unknown',
      req.adminUser?.username ?? 'unknown',
      entityType,
      entityId || '',
      action,
      beforeJson ? JSON.stringify(beforeJson) : null,
      afterJson ? JSON.stringify(afterJson) : null,
      JSON.stringify(req.body || {}),
    ]
  );
}

function parseAdminEntity(req) {
  const p = req.path.replace(/^\/api\/admin\/?/, '');
  const parts = p
    .split('/')
    .filter(Boolean)
    .map((x) => decodeURIComponent(x));

  if (!parts.length) return { entityType: 'admin', entityId: '' };
  if (parts[0] === 'maintenance')
    return { entityType: 'maintenance', entityId: 'settings:maintenance' };
  if (parts[0] === 'changelogs') return { entityType: 'changelog', entityId: parts[1] || '' };
  if (parts[0] === 'notices') return { entityType: 'notices', entityId: parts[1] || 'active' };
  if (parts[0] === 'goods' && parts.length === 2)
    return { entityType: 'goods', entityId: parts[1] };
  if (parts[0] === 'goods' && parts[2] === 'cities')
    return {
      entityType: 'city_goods',
      entityId: `${parts[1]}:${parts[3] || req.body.city_name || ''}`,
    };
  if (parts[0] === 'travel-times')
    return {
      entityType: 'travel_times',
      entityId: `${req.body.from_city || ''}:${req.body.to_city || ''}`,
    };
  if (parts[0] === 'cities' && parts.length === 2)
    return { entityType: 'cities', entityId: parts[1] };
  if (parts[0] === 'cities' && parts[2] === 'traits')
    return {
      entityType: 'city_city_traits',
      entityId: `${parts[1]}:${parts[3] || req.body.trait_name || ''}`,
    };
  if (parts[0] === 'cities' && parts[2] === 'goods')
    return {
      entityType: 'city_goods',
      entityId: `${parts[1]}:${parts[3] || req.body.good_name || ''}`,
    };
  if (parts[0] === 'traits' && parts.length === 2)
    return { entityType: 'city_traits', entityId: parts[1] };
  if (parts[0] === 'trait-effects')
    return { entityType: 'trait_effects', entityId: parts[1] || '' };
  if (parts[0] === 'languages')
    return {
      entityType: 'languages',
      entityId: parts[1] || req.body.name || '',
    };
  if (parts[0] === 'religions' && parts.length <= 2)
    return {
      entityType: 'religions',
      entityId: parts[1] || req.body.name || '',
    };
  if (parts[0] === 'religion-perks')
    return { entityType: 'religion_perks', entityId: parts[1] || '' };
  if (parts[0] === 'events' && parts[2] === 'levels')
    return { entityType: 'event_levels', entityId: parts[3] || '' };
  if (parts[0] === 'events' && parts[1] === 'levels')
    return { entityType: 'event_levels', entityId: parts[2] || '' };
  if (parts[0] === 'events')
    return {
      entityType: 'event_types',
      entityId: parts[1] || req.body.name || '',
    };
  return { entityType: 'admin', entityId: p };
}

async function snapshotEntity(entityType, entityId) {
  if (!entityType || !entityId) return null;
  if (entityType === 'maintenance') {
    const { rows } = await pool.query(`SELECT value FROM settings WHERE key='maintenance'`);
    return rows[0] || null;
  }
  if (entityType === 'changelog') {
    const { rows } = await pool.query('SELECT * FROM changelogs WHERE id=$1', [entityId]);
    return rows[0] || null;
  }
  if (entityType === 'notices') {
    const { rows } = await pool.query('SELECT * FROM notices ORDER BY created_at DESC LIMIT 1');
    return rows[0] || null;
  }
  if (entityType === 'goods') {
    const { rows } = await pool.query('SELECT * FROM goods WHERE name=$1', [entityId]);
    return rows[0] || null;
  }
  if (entityType === 'cities') {
    const { rows } = await pool.query('SELECT * FROM cities WHERE name=$1', [entityId]);
    return rows[0] || null;
  }
  if (entityType === 'city_traits') {
    const { rows } = await pool.query('SELECT * FROM city_traits WHERE name=$1', [entityId]);
    return rows[0] || null;
  }
  if (entityType === 'languages') {
    const { rows } = await pool.query('SELECT * FROM languages WHERE name=$1', [entityId]);
    return rows[0] || null;
  }
  if (entityType === 'religions') {
    const { rows } = await pool.query('SELECT * FROM religions WHERE name=$1', [entityId]);
    return rows[0] || null;
  }
  if (entityType === 'event_types') {
    const { rows } = await pool.query('SELECT * FROM event_types WHERE name=$1', [entityId]);
    return rows[0] || null;
  }
  return null;
}

const err = (res, e) => {
  console.error(e);
  res.status(500).json({ error: 'DB error' });
};

function parseCookies(req) {
  const out = {};
  const rc = req.headers.cookie;
  if (rc) rc.split(';').forEach(c => {
    const i = c.indexOf('=');
    if (i < 0) return;
    out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim());
  });
  return out;
}

function isAdmin(userId) {
  const ids = (process.env.ADMIN_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  return ids.includes(String(userId));
}

function displayName(userId, fallback) {
  for (const part of (process.env.DISPLAY_NAMES || '').split(',')) {
    const [id, name] = part.split(':');
    if (id && name && id.trim() === String(userId)) return name.trim();
  }
  return fallback;
}

function requireUserAuth(req, res, next) {
  const token = parseCookies(req).auth_token;
  if (!token) return res.status(401).json({ error: 'Login required' });
  try {
    req.discordUser = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid session' });
  }
}

async function fireUserWebhooks(embed) {
  try {
    const { rows } = await pool.query('SELECT url FROM user_webhooks');
    await Promise.allSettled(rows.map(r =>
      fetchImpl(r.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [embed] }),
      }).catch(() => {})
    ));
  } catch (_) {}
}

// ── Public ────────────────────────────────────────────────────────────────────

app.get('/api/goods', async (_req, res) => {
  try {
    const [gRes, pRes] = await Promise.all([
      pool.query('SELECT name, base_price, type, hop_pct FROM goods ORDER BY type, name'),
      pool.query('SELECT city_name, good_name FROM city_goods'),
    ]);
    const produced = {};
    for (const r of pRes.rows) {
      if (!produced[r.good_name]) produced[r.good_name] = [];
      produced[r.good_name].push(r.city_name);
    }
    res.json(
      gRes.rows.map((r) => ({
        name: r.name,
        base_price: r.base_price,
        type: r.type,
        hop_pct: r.hop_pct,
        produced_in: produced[r.name] || [],
      }))
    );
  } catch (e) {
    err(res, e);
  }
});

app.get('/api/travel-times', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT from_city, to_city, minutes FROM travel_times');
    const m = {};
    for (const r of rows) {
      if (!m[r.from_city]) m[r.from_city] = {};
      m[r.from_city][r.to_city] = r.minutes;
    }
    res.json(m);
  } catch (e) {
    err(res, e);
  }
});

app.get('/api/cities', async (_req, res) => {
  try {
    const [cRes, tRes, gRes] = await Promise.all([
      pool.query('SELECT * FROM cities ORDER BY name'),
      pool.query('SELECT city_name, trait_name FROM city_city_traits'),
      pool.query('SELECT city_name, good_name FROM city_goods'),
    ]);
    res.json(
      cRes.rows.map((c) => ({
        name: c.name,
        culture: c.culture,
        language: c.language,
        has_fire_temple: c.has_fire_temple,
        traits: tRes.rows.filter((r) => r.city_name === c.name).map((r) => r.trait_name),
        produced: gRes.rows.filter((r) => r.city_name === c.name).map((r) => r.good_name),
      }))
    );
  } catch (e) {
    err(res, e);
  }
});

app.get('/api/cities/traits', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT name, description FROM city_traits ORDER BY name');
    res.json(rows);
  } catch (e) {
    err(res, e);
  }
});

app.get('/api/events', async (_req, res) => {
  try {
    const [etRes, elRes] = await Promise.all([
      pool.query('SELECT * FROM event_types ORDER BY name'),
      pool.query('SELECT * FROM event_levels ORDER BY event_name, level'),
    ]);
    res.json(
      etRes.rows.map((e) => ({
        name: e.name,
        glyph: e.glyph,
        dir: e.dir,
        good_types: e.good_types,
        good_names: e.good_names,
        description: e.description,
        levels: elRes.rows.filter((l) => l.event_name === e.name),
      }))
    );
  } catch (e) {
    err(res, e);
  }
});

app.get('/api/events/:name/levels', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM event_levels WHERE event_name=$1 ORDER BY level',
      [decodeURIComponent(req.params.name)]
    );
    res.json(rows);
  } catch (e) {
    err(res, e);
  }
});

app.get('/api/religions', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT name FROM religions ORDER BY name');
    res.json(rows);
  } catch (e) {
    err(res, e);
  }
});

app.get('/api/religion-perks', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM religion_perks ORDER BY religion, min_level');
    res.json(rows);
  } catch (e) {
    err(res, e);
  }
});

app.get('/api/trait-effects', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM trait_effects ORDER BY trait_name');
    res.json(rows);
  } catch (e) {
    err(res, e);
  }
});

app.get('/api/languages', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT name FROM languages ORDER BY name');
    res.json(rows);
  } catch (e) {
    err(res, e);
  }
});

app.get('/api/maintenance', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT value FROM settings WHERE key='maintenance'`);
    const data = rows.length ? JSON.parse(rows[0].value) : { active: false, message: '' };
    if (data.active) {
      const token = parseCookies(req).auth_token;
      if (token) {
        try {
          const payload = jwt.verify(token, process.env.JWT_SECRET);
          if (isAdmin(payload.id)) {
            return res.json({ ...data, active: false, maintenanceActive: true, bypassed: true });
          }
        } catch (_) {}
      }
    }
    res.json(data);
  } catch (e) {
    err(res, e);
  }
});

app.get('/api/changelogs', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM changelogs ORDER BY created_at DESC');
    res.json(rows);
  } catch (e) {
    err(res, e);
  }
});

app.get('/api/notices', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM notices ORDER BY created_at DESC LIMIT 1');
    res.json(rows);
  } catch (e) {
    err(res, e);
  }
});

// Frontend calls /api/status, /api/notice, /api/changelog (aliases for existing routes)
app.get('/api/status', async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT value FROM settings WHERE key='maintenance'`);
    const data = rows.length ? JSON.parse(rows[0].value) : { active: false, message: '' };
    res.json({ maintenance: data.active, message: data.message || '' });
  } catch (e) { err(res, e); }
});

app.get('/api/notice', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT message FROM notices WHERE active=true ORDER BY created_at DESC LIMIT 1`
    );
    res.json(rows.length ? { text: rows[0].message } : {});
  } catch (e) { err(res, e); }
});

app.get('/api/changelog', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM changelogs ORDER BY created_at DESC');
    res.json(rows.map(r => ({
      ...r,
      changes: r.entries,
      text: (r.entries || []).slice(0, 2).join('; '),
    })));
  } catch (e) { err(res, e); }
});

app.get('/api/routes/count', async (_req, res) => {
  try {
    const [a, b] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM travel_times'),
      pool.query('SELECT COUNT(*) FROM goods'),
    ]);
    const routes = parseInt(a.rows[0].count);
    const goods  = parseInt(b.rows[0].count);
    res.json({ count: routes * goods || 100 });
  } catch (e) { err(res, e); }
});

app.get('/api/my-ip', (req, res) => {
  res.json({ ip: req.ip });
});

function isTrollFeedbackMessage(message) {
  const text = String(message || '').trim();
  if (text.length < 24) return false;
  const compact = text.replace(/\s/g, '');
  if (!compact) return false;
  const letters = (text.match(/[A-Za-z]/g) || []).length;
  const symbols = (text.match(/[^A-Za-z0-9\s]/g) || []).length;
  const lines = text.split(/\r?\n/).filter(Boolean).length;
  return (
    (text.length >= 40 && letters < 3 && symbols / compact.length > 0.6) ||
    (text.length >= 80 && letters / compact.length < 0.05) ||
    (lines >= 4 && letters < 5 && symbols > 20)
  );
}

app.post('/api/feedback/abuse', async (req, res) => {
  const { sessionId, fpId, message } = req.body;
  if (!isTrollFeedbackMessage(message)) return res.status(400).json({ error: 'Invalid abuse report' });
  if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 100)
    return res.status(400).json({ error: 'Invalid sessionId' });
  try {
    const reason = 'Automated feedback spam ban';
    const feedbackMessage = String(message || '').slice(0, 2000);
    const banGroupId = `feedback:${sessionId}`;
    await Promise.all([
      pool.query(
        `INSERT INTO banned_sessions (session_id, reason, banned_until, feedback_message, ban_group_id) VALUES ($1, $2, NOW() + INTERVAL '24 hours', $3, $4)
         ON CONFLICT (session_id) DO UPDATE SET reason=$2, banned_at=NOW(), banned_until=NOW() + INTERVAL '24 hours', feedback_message=$3, ban_group_id=$4`,
        [sessionId, reason, feedbackMessage, banGroupId]
      ),
      pool.query(
        `INSERT INTO banned_ips (ip, reason, banned_until, feedback_message, ban_group_id) VALUES ($1, $2, NOW() + INTERVAL '24 hours', $3, $4)
         ON CONFLICT (ip) DO UPDATE SET reason=$2, banned_at=NOW(), banned_until=NOW() + INTERVAL '24 hours', feedback_message=$3, ban_group_id=$4`,
        [req.ip, reason, feedbackMessage, banGroupId]
      ),
      fpId && typeof fpId === 'string' && fpId.length <= 64
        ? pool.query(
            `INSERT INTO banned_fingerprints (fp_id, reason, banned_until, feedback_message, ban_group_id) VALUES ($1, $2, NOW() + INTERVAL '24 hours', $3, $4)
             ON CONFLICT (fp_id) DO UPDATE SET reason=$2, banned_at=NOW(), banned_until=NOW() + INTERVAL '24 hours', feedback_message=$3, ban_group_id=$4`,
            [fpId, reason, feedbackMessage, banGroupId]
          )
        : Promise.resolve(),
    ]);
    res.json({ ok: true, banned: true });
  } catch (e) { err(res, e); }
});

app.post('/api/session/ping', async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 64)
    return res.status(400).json({ error: 'Invalid sessionId' });
  try {
    const ip = req.ip;
    const { fpId } = req.body;
    const checks = [
      pool.query('SELECT banned_until FROM banned_sessions WHERE session_id=$1 AND (banned_until IS NULL OR banned_until > NOW())', [sessionId]),
      pool.query('SELECT banned_until FROM banned_ips WHERE ip=$1 AND (banned_until IS NULL OR banned_until > NOW())', [ip]),
      fpId ? pool.query('SELECT banned_until FROM banned_fingerprints WHERE fp_id=$1 AND (banned_until IS NULL OR banned_until > NOW())', [fpId]) : Promise.resolve({ rows: [] }),
    ];
    const [sidBan, ipBan, fpBan] = await Promise.all(checks);
    if (sidBan.rows.length || ipBan.rows.length || fpBan.rows.length) {
      const untils = [...sidBan.rows, ...ipBan.rows, ...fpBan.rows].map(r => r.banned_until).filter(Boolean);
      const bannedUntil = untils.length ? new Date(Math.min(...untils.map(d => new Date(d).getTime()))) : null;
      return res.json({ ok: true, banned: true, bannedUntil });
    }
    await pool.query(
      `INSERT INTO sessions (session_id, last_ping, created_at) VALUES ($1, NOW(), NOW())
       ON CONFLICT (session_id) DO UPDATE SET last_ping = NOW()`,
      [sessionId]
    );
    await pool.query(
      `INSERT INTO daily_sessions (date, session_id) VALUES (CURRENT_DATE, $1) ON CONFLICT DO NOTHING`,
      [sessionId]
    );
    await pool.query(
      `INSERT INTO daily_online_peaks (date, peak_online)
       SELECT CURRENT_DATE, COUNT(*)::int FROM sessions WHERE last_ping > NOW() - INTERVAL '5 minutes'
       ON CONFLICT (date) DO UPDATE SET peak_online = GREATEST(daily_online_peaks.peak_online, EXCLUDED.peak_online)`
    );
    res.json({ ok: true });
  } catch (e) {
    err(res, e);
  }
});

app.get('/api/admin/bans', requireAuth, requireOwner, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM banned_sessions ORDER BY banned_at DESC');
    res.json(rows);
  } catch (e) { err(res, e); }
});

app.post('/api/admin/bans', requireAuth, requireOwner, async (req, res) => {
  const { sessionId, reason } = req.body;
  if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 100)
    return res.status(400).json({ error: 'Invalid sessionId' });
  try {
    await pool.query(
      `INSERT INTO banned_sessions (session_id, reason) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [sessionId, reason || '']
    );
    res.json({ ok: true });
  } catch (e) { err(res, e); }
});

async function deleteLinkedBan(table, idColumn, idValue) {
  const { rows } = await pool.query(`SELECT ban_group_id FROM ${table} WHERE ${idColumn}=$1`, [idValue]);
  const groupId = rows[0]?.ban_group_id;
  if (groupId) {
    await Promise.all([
      pool.query('DELETE FROM banned_sessions WHERE ban_group_id=$1', [groupId]),
      pool.query('DELETE FROM banned_ips WHERE ban_group_id=$1', [groupId]),
      pool.query('DELETE FROM banned_fingerprints WHERE ban_group_id=$1', [groupId]),
    ]);
    return;
  }
  await pool.query(`DELETE FROM ${table} WHERE ${idColumn}=$1`, [idValue]);
}

app.delete('/api/admin/bans/:sessionId', requireAuth, requireOwner, async (req, res) => {
  try {
    await deleteLinkedBan('banned_sessions', 'session_id', req.params.sessionId);
    res.json({ ok: true });
  } catch (e) { err(res, e); }
});

app.get('/api/admin/ip-bans', requireAuth, requireOwner, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM banned_ips ORDER BY banned_at DESC');
    res.json(rows);
  } catch (e) { err(res, e); }
});

app.post('/api/admin/ip-bans', requireAuth, requireOwner, async (req, res) => {
  const { ip, reason } = req.body;
  if (!ip || typeof ip !== 'string' || ip.length > 64)
    return res.status(400).json({ error: 'Invalid IP' });
  try {
    await pool.query(
      `INSERT INTO banned_ips (ip, reason) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [ip, reason || '']
    );
    res.json({ ok: true });
  } catch (e) { err(res, e); }
});

app.delete('/api/admin/ip-bans/:ip', requireAuth, requireOwner, async (req, res) => {
  try {
    await deleteLinkedBan('banned_ips', 'ip', req.params.ip);
    res.json({ ok: true });
  } catch (e) { err(res, e); }
});

app.get('/api/admin/fp-bans', requireAuth, requireOwner, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM banned_fingerprints ORDER BY banned_at DESC');
    res.json(rows);
  } catch (e) { err(res, e); }
});

app.post('/api/admin/fp-bans', requireAuth, requireOwner, async (req, res) => {
  const { fpId, reason } = req.body;
  if (!fpId || typeof fpId !== 'string' || fpId.length > 64)
    return res.status(400).json({ error: 'Invalid fpId' });
  try {
    await pool.query(
      `INSERT INTO banned_fingerprints (fp_id, reason) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [fpId, reason || '']
    );
    res.json({ ok: true });
  } catch (e) { err(res, e); }
});

app.delete('/api/admin/fp-bans/:fpId', requireAuth, requireOwner, async (req, res) => {
  try {
    await deleteLinkedBan('banned_fingerprints', 'fp_id', req.params.fpId);
    res.json({ ok: true });
  } catch (e) { err(res, e); }
});

// ── Discord OAuth (public users) ──────────────────────────────────────────────

app.get('/api/auth/discord', (_req, res) => {
  const params = new URLSearchParams({
    client_id:     process.env.DISCORD_CLIENT_ID,
    redirect_uri:  process.env.DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope:         'identify',
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

app.get('/api/auth/discord/callback', async (req, res) => {
  const code = req.query.code;
  const siteUrl = process.env.SITE_URL || '/';
  if (!code) return res.redirect(siteUrl);
  try {
    const tokenRes = await fetchImpl('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type:    'authorization_code',
        code,
        redirect_uri:  process.env.DISCORD_REDIRECT_URI,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return res.redirect(siteUrl);

    const userRes = await fetchImpl('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const u = await userRes.json();
    if (!u.id) return res.redirect(siteUrl);

    await pool.query(
      `INSERT INTO discord_users (id, username, avatar, updated_at)
       VALUES ($1,$2,$3,NOW())
       ON CONFLICT (id) DO UPDATE SET username=$2, avatar=$3, updated_at=NOW()`,
      [u.id, u.username || u.global_name || 'Unknown', u.avatar]
    );

    const token = jwt.sign(
      { id: u.id, username: u.username || u.global_name || 'Unknown' },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
    res.setHeader('Set-Cookie',
      `auth_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30*24*3600}; Secure`
    );
    res.redirect(siteUrl);
  } catch (e) {
    console.error('Discord OAuth error:', e);
    res.redirect(siteUrl);
  }
});

app.get('/api/auth/me', async (req, res) => {
  const token = parseCookies(req).auth_token;
  if (!token) return res.json({});
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await pool.query('SELECT avatar FROM discord_users WHERE id=$1', [payload.id]);
    const avatar = rows[0]?.avatar || null;
    res.json({ id: payload.id, username: payload.username, isAdmin: isAdmin(payload.id), avatar });
  } catch {
    res.json({});
  }
});

app.get('/api/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'auth_token=; Path=/; HttpOnly; Max-Age=0');
  res.redirect(process.env.SITE_URL || '/');
});

// ── User webhooks ─────────────────────────────────────────────────────────────

app.get('/api/user/webhook', requireUserAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT url FROM user_webhooks WHERE user_id=$1', [req.discordUser.id]
    );
    res.json({ url: rows[0]?.url || '' });
  } catch (e) { err(res, e); }
});

app.post('/api/user/webhook', requireUserAuth, async (req, res) => {
  const url = String(req.body.url || '').trim();
  if (url && !url.startsWith('https://discord.com/api/webhooks/'))
    return res.status(400).json({ error: 'Invalid webhook URL' });
  try {
    if (!url) {
      await pool.query('DELETE FROM user_webhooks WHERE user_id=$1', [req.discordUser.id]);
    } else {
      await pool.query(
        `INSERT INTO user_webhooks (user_id, url, updated_at) VALUES ($1,$2,NOW())
         ON CONFLICT (user_id) DO UPDATE SET url=$2, updated_at=NOW()`,
        [req.discordUser.id, url]
      );
    }
    res.json({ ok: true });
  } catch (e) { err(res, e); }
});

// ── Forum ─────────────────────────────────────────────────────────────────────

app.get('/api/forum/counts', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT category, COUNT(*) FROM forum_posts GROUP BY category`
    );
    const counts = { general: 0, feedback: 0, bugs: 0 };
    rows.forEach(r => { counts[r.category] = parseInt(r.count); });
    res.json(counts);
  } catch (e) { err(res, e); }
});

app.get('/api/forum/posts', async (req, res) => {
  const cat   = ['general','feedback','bugs'].includes(req.query.category) ? req.query.category : 'general';
  const page  = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 15));
  const sort  = req.query.sort;
  const q     = String(req.query.q || '').trim().slice(0, 200);
  const offset = (page - 1) * limit;

  let uidFilter = null;
  if (['feedback','bugs'].includes(cat)) {
    const token = parseCookies(req).auth_token;
    let uid = null;
    try { uid = jwt.verify(token, process.env.JWT_SECRET)?.id; } catch {}
    if (!uid) return res.status(403).json({ error: 'Login required' });
    if (!isAdmin(uid)) uidFilter = String(uid);
  }

  const orderBy = sort === 'hot' ? 'p.upvotes - p.downvotes DESC, p.created_at DESC'
                : sort === 'top' ? 'p.upvotes DESC, p.created_at DESC'
                : 'p.created_at DESC';

  try {
    const conds  = ['p.category=$1'];
    const params = [cat];

    if (uidFilter) {
      params.push(uidFilter);
      conds.push(`p.author_id=$${params.length}`);
    }

    if (q.startsWith('@')) {
      const name = q.slice(1).replace(/[%_]/g, '\\$&');
      params.push('%' + name + '%');
      conds.push(`p.author_name ILIKE $${params.length}`);
    } else if (q) {
      params.push('%' + q.replace(/[%_]/g, '\\$&') + '%');
      conds.push(`p.title ILIKE $${params.length}`);
    }

    const where      = 'WHERE ' + conds.join(' AND ');
    const limitIdx   = params.length + 1;
    const offsetIdx  = params.length + 2;
    const listParams = [...params, limit, offset];

    const [postsRes, countRes] = await Promise.all([
      pool.query(
        `SELECT p.id, p.category, p.title, p.author_id, p.author_name, p.created_at, p.upvotes, p.downvotes, p.reply_count, d.avatar AS author_avatar
         FROM forum_posts p LEFT JOIN discord_users d ON d.id = p.author_id
         ${where} ORDER BY ${orderBy} LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        listParams
      ),
      pool.query(`SELECT COUNT(*) FROM forum_posts p ${where}`, params),
    ]);
    res.json({ posts: postsRes.rows, total: parseInt(countRes.rows[0].count) });
  } catch (e) { err(res, e); }
});

app.get('/api/forum/posts/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.category, p.title, p.body, p.author_id, p.author_name, p.created_at, p.upvotes, p.downvotes, p.reply_count, d.avatar AS author_avatar
       FROM forum_posts p LEFT JOIN discord_users d ON d.id::text = p.author_id::text WHERE p.id=$1`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const post = rows[0];
    if (['feedback','bugs'].includes(post.category)) {
      const token = parseCookies(req).auth_token;
      let uid = null;
      try { uid = jwt.verify(token, process.env.JWT_SECRET)?.id; } catch {}
      if (!uid) return res.status(403).json({ error: 'Login required' });
      if (!isAdmin(uid) && String(uid) !== String(post.author_id))
        return res.status(403).json({ error: 'Forbidden' });
    }
    res.json(post);
  } catch (e) { err(res, e); }
});

app.get('/api/forum/posts/:id/comments', async (req, res) => {
  const postId = parseInt(req.params.id);
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.author_id, c.author_name, c.body, c.created_at, d.avatar AS author_avatar
       FROM forum_comments c LEFT JOIN discord_users d ON d.id::text = c.author_id::text
       WHERE c.post_id=$1 ORDER BY c.created_at ASC`,
      [postId]
    );
    res.json(rows);
  } catch (e) { err(res, e); }
});

app.post('/api/forum/posts/:id/comments', requireUserAuth, async (req, res) => {
  const postId = parseInt(req.params.id);
  const body   = String(req.body.body || '').trim().slice(0, 2000);
  if (!body) return res.status(400).json({ error: 'Empty comment' });
  try {
    const authorName = displayName(req.discordUser.id, req.discordUser.username);
    await pool.query(
      'INSERT INTO forum_comments (post_id, author_id, author_name, body) VALUES ($1,$2,$3,$4)',
      [postId, req.discordUser.id, authorName, body]
    );
    await pool.query('UPDATE forum_posts SET reply_count = reply_count + 1 WHERE id=$1', [postId]);

    const mentions = [...new Set((body.match(/@([\w.]+)/g) || []).map(m => m.slice(1).toLowerCase()))];
    for (const name of mentions) {
      const { rows } = await pool.query('SELECT id FROM discord_users WHERE LOWER(username)=$1', [name]);
      for (const u of rows) {
        if (String(u.id) === String(req.discordUser.id)) continue;
        await pool.query(
          `INSERT INTO user_notifications (user_id, type, title, body, post_id) VALUES ($1,'reply',$2,$3,$4)`,
          [u.id, authorName + ' replied to you', body.slice(0, 150), postId]
        );
      }
    }
    res.json({ ok: true });
  } catch (e) { err(res, e); }
});

app.delete('/api/forum/posts/:id', requireUserAuth, async (req, res) => {
  const postId = parseInt(req.params.id);
  try {
    const { rows } = await pool.query('SELECT author_id FROM forum_posts WHERE id=$1', [postId]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    if (String(rows[0].author_id) !== String(req.discordUser.id) && !isAdmin(req.discordUser.id))
      return res.status(403).json({ error: 'Forbidden' });
    await pool.query('DELETE FROM forum_posts WHERE id=$1', [postId]);
    res.json({ ok: true });
  } catch (e) { err(res, e); }
});

app.delete('/api/forum/comments/:id', requireUserAuth, async (req, res) => {
  const commentId = parseInt(req.params.id);
  try {
    const { rows } = await pool.query('SELECT author_id, post_id FROM forum_comments WHERE id=$1', [commentId]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    if (String(rows[0].author_id) !== String(req.discordUser.id) && !isAdmin(req.discordUser.id))
      return res.status(403).json({ error: 'Forbidden' });
    await pool.query('DELETE FROM forum_comments WHERE id=$1', [commentId]);
    await pool.query('UPDATE forum_posts SET reply_count = GREATEST(reply_count - 1, 0) WHERE id=$1', [rows[0].post_id]);
    res.json({ ok: true });
  } catch (e) { err(res, e); }
});

app.get('/api/user/notifications', requireUserAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, type, title, body, post_id, created_at FROM user_notifications
       WHERE user_id=$1 AND read=FALSE ORDER BY created_at DESC LIMIT 20`,
      [req.discordUser.id]
    );
    res.json(rows);
  } catch (e) { err(res, e); }
});

app.post('/api/user/notifications/read', requireUserAuth, async (req, res) => {
  try {
    await pool.query('UPDATE user_notifications SET read=TRUE WHERE user_id=$1', [req.discordUser.id]);
    res.json({ ok: true });
  } catch (e) { err(res, e); }
});

app.post('/api/forum/posts', requireUserAuth, async (req, res) => {
  const category = ['general','feedback','bugs'].includes(req.body.category) ? req.body.category : 'general';
  const title    = String(req.body.title || '').trim().slice(0, 200);
  const body     = String(req.body.body  || '').trim().slice(0, 10000);
  if (!title || !body) return res.status(400).json({ error: 'Missing title or body' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO forum_posts (category, title, body, author_id, author_name)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [category, title, body, req.discordUser.id, displayName(req.discordUser.id, req.discordUser.username)]
    );
    res.json({ ok: true, id: rows[0].id });
  } catch (e) { err(res, e); }
});

app.post('/api/forum/posts/:id/vote', requireUserAuth, async (req, res) => {
  const postId  = parseInt(req.params.id);
  const dir     = req.body.direction === 'down' ? 'down' : 'up';
  const userId  = req.discordUser.id;
  if (!postId) return res.status(400).json({ error: 'Invalid post' });
  try {
    const existing = await pool.query(
      'SELECT direction FROM forum_votes WHERE post_id=$1 AND user_id=$2', [postId, userId]
    );
    if (existing.rows.length && existing.rows[0].direction === dir) {
      await pool.query('DELETE FROM forum_votes WHERE post_id=$1 AND user_id=$2', [postId, userId]);
    } else {
      await pool.query(
        `INSERT INTO forum_votes (post_id, user_id, direction) VALUES ($1,$2,$3)
         ON CONFLICT (post_id, user_id) DO UPDATE SET direction=$3`,
        [postId, userId, dir]
      );
    }
    await pool.query(
      `UPDATE forum_posts SET
        upvotes   = (SELECT COUNT(*) FROM forum_votes WHERE post_id=$1 AND direction='up'),
        downvotes = (SELECT COUNT(*) FROM forum_votes WHERE post_id=$1 AND direction='down')
       WHERE id=$1`,
      [postId]
    );
    res.json({ ok: true });
  } catch (e) { err(res, e); }
});

// ── Auth ──────────────────────────────────────────────────────────────────────

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });
  (async () => {
    const { rows } = await pool.query(
      'SELECT id, username, password_hash, role, active FROM admin_users WHERE username=$1',
      [username]
    );
    const user = rows[0];
    if (!user || !user.active) return res.status(401).json({ error: 'Wrong credentials' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Wrong credentials' });
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, role: user.role, username: user.username });
  })().catch((e) => err(res, e));
});

app.get('/api/admin/me', requireAuth, async (req, res) => {
  const lockState = await getLockState();
  res.json({
    id: req.adminUser.id,
    username: req.adminUser.username,
    role: req.adminUser.role,
    lock: { is_locked: lockState.is_locked },
  });
});

app.get('/api/admin/lock-state', requireAuth, async (_req, res) => {
  const lockState = await getLockState();
  res.json(lockState);
});

app.post('/api/admin/lock-state', requireAuth, requireOwner, async (req, res) => {
  const isLocked = !!req.body.is_locked;
  const before = await getLockState();
  await pool.query(
    `UPDATE admin_lock_state
     SET is_locked=$1, changed_by_user_id=$2, changed_at=NOW()
     WHERE id=1`,
    [isLocked, req.adminUser.id]
  );
  await writeAudit(req, {
    entityType: 'lock_state',
    entityId: 'global',
    action: 'POST',
    beforeJson: before,
    afterJson: { is_locked: isLocked },
  });
  res.json({ ok: true, is_locked: isLocked });
});

app.post('/api/admin/permission-requests', requireAuth, async (req, res) => {
  const note = String(req.body.note || '').slice(0, 400);
  const { rows } = await pool.query(
    `INSERT INTO admin_permission_requests (requester_user_id, note)
     VALUES ($1,$2) RETURNING id, created_at`,
    [req.adminUser.id, note]
  );
  await sendPermissionRequestToDiscord({
    username: req.adminUser.username,
    role: req.adminUser.role,
    note,
  });
  await writeAudit(req, {
    entityType: 'permission_request',
    entityId: String(rows[0].id),
    action: 'POST',
    beforeJson: null,
    afterJson: rows[0],
  });
  res.json({ ok: true, request: rows[0] });
});

app.get('/api/admin/users', requireAuth, requireOwner, async (_req, res) => {
  const { rows } = await pool.query(
    'SELECT id, username, role, active, created_at FROM admin_users ORDER BY created_at DESC'
  );
  res.json(rows);
});

app.post('/api/admin/users', requireAuth, requireOwner, async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const role = req.body.role === 'owner' ? 'owner' : 'helper';
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });
  const hash = await bcrypt.hash(password, 12);
  await pool.query(
    `INSERT INTO admin_users (username, password_hash, role, active)
     VALUES ($1,$2,$3,true)`,
    [username, hash, role]
  );
  await writeAudit(req, {
    entityType: 'admin_user',
    entityId: username,
    action: 'POST',
    beforeJson: null,
    afterJson: { username, role },
  });
  res.json({ ok: true });
});

app.use('/api/admin', async (req, res, next) => {
  if (req.path === '/login') return next();
  if (!req.adminUser) return next();
  if (req.method === 'GET') return next();
  if (req.path === '/lock-state' || req.path === '/permission-requests') return next();

  const { entityType, entityId } = parseAdminEntity(req);
  req._auditEntityType = entityType;
  req._auditEntityId = entityId;
  req._auditBefore = await snapshotEntity(entityType, entityId);

  res.on('finish', async () => {
    if (res.statusCode >= 400) return;
    try {
      const after = await snapshotEntity(entityType, entityId);
      await writeAudit(req, {
        entityType,
        entityId,
        action: req.method,
        beforeJson: req._auditBefore,
        afterJson: after,
      });
    } catch (e) {
      console.error('audit write failed', e);
    }
  });
  next();
});

app.get('/api/admin/activity', requireAuth, async (req, res) => {
  const includeOwner = req.query.includeOwner === '1';
  const entity = req.query.entity_type ? String(req.query.entity_type) : null;
  const windowHours = 24;
  const params = [windowHours];
  const wheres = [`changed_at >= NOW() - ($1::text || ' hours')::interval`];
  if (!includeOwner) {
    params.push('owner');
    wheres.push(`actor_role <> $${params.length}`);
  }
  if (entity) {
    params.push(entity);
    wheres.push(`entity_type = $${params.length}`);
  }
  const { rows } = await pool.query(
    `SELECT id, actor_username, actor_role, entity_type, entity_id, action, before_json, after_json, request_json, changed_at
     FROM admin_audit_log
     WHERE ${wheres.join(' AND ')}
     ORDER BY changed_at DESC
     LIMIT 300`,
    params
  );
  res.json(rows);
});

app.post('/api/admin/activity/:id/revert', requireAuth, requireOwner, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM admin_audit_log WHERE id=$1', [req.params.id]);
  const row = rows[0];
  if (!row) return res.status(404).json({ error: 'Audit row not found' });
  if (!row.before_json && !row.after_json)
    return res.status(400).json({ error: 'Nothing to revert' });

  const before = row.before_json;
  const entityType = row.entity_type;
  const entityId = row.entity_id;

  if (entityType === 'maintenance') {
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ('maintenance', $1)
       ON CONFLICT (key) DO UPDATE SET value=$1`,
      [before?.value || JSON.stringify({ active: false, message: '' })]
    );
  } else if (entityType === 'changelog') {
    if (!before) await pool.query('DELETE FROM changelogs WHERE id=$1', [entityId]);
    else {
      await pool.query(
        `INSERT INTO changelogs (id, version, date, entries, thanks, created_at)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO UPDATE
         SET version=$2, date=$3, entries=$4, thanks=$5, created_at=$6`,
        [before.id, before.version, before.date, before.entries, before.thanks, before.created_at]
      );
    }
  } else {
    return res.status(400).json({
      error: 'Revert currently supported for maintenance/changelog rows only',
    });
  }

  await writeAudit(req, {
    entityType,
    entityId,
    action: 'REVERT',
    beforeJson: row.after_json,
    afterJson: row.before_json,
  });
  res.json({ ok: true });
});

// ── Analytics ─────────────────────────────────────────────────────────────────

app.get('/api/analytics', requireAuth, async (_req, res) => {
  try {
    const [a, b, c] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM sessions WHERE last_ping > NOW() - INTERVAL '5 minutes'`),
      pool.query(`SELECT COUNT(*) FROM daily_sessions WHERE date = CURRENT_DATE`),
      pool.query(
        `SELECT d.date, COUNT(*) AS visits, COALESCE(p.peak_online, 0) AS peak_online
         FROM daily_sessions d
         LEFT JOIN daily_online_peaks p ON p.date = d.date
         WHERE d.date >= CURRENT_DATE - INTERVAL '6 days'
         GROUP BY d.date, p.peak_online
         ORDER BY d.date`
      ),
    ]);
    res.json({
      onlineNow: parseInt(a.rows[0].count),
      todayVisits: parseInt(b.rows[0].count),
      last7Days: c.rows.map((r) => ({
        date: r.date,
        visits: parseInt(r.visits),
        peakOnline: parseInt(r.peak_online),
      })),
    });
  } catch (e) {
    err(res, e);
  }
});

// ── Goods ─────────────────────────────────────────────────────────────────────

app.post('/api/admin/goods', requireAuth, requireUnlockedOrOwner, async (req, res) => {
  const { name, base_price, type, hop_pct } = req.body;
  if (!name || !base_price || !type || hop_pct == null)
    return res.status(400).json({ error: 'Missing fields' });
  try {
    await pool.query(`INSERT INTO goods (name,base_price,type,hop_pct) VALUES ($1,$2,$3,$4)`, [
      name,
      base_price,
      type,
      hop_pct,
    ]);
    res.json({ ok: true });
  } catch (e) {
    err(res, e);
  }
});

app.patch('/api/admin/goods/:name', requireAuth, requireUnlockedOrOwner, async (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const { base_price, type, hop_pct } = req.body;
  try {
    await pool.query(
      `UPDATE goods SET base_price=COALESCE($1,base_price), type=COALESCE($2,type), hop_pct=COALESCE($3,hop_pct) WHERE name=$4`,
      [base_price ?? null, type ?? null, hop_pct ?? null, name]
    );
    res.json({ ok: true });
  } catch (e) {
    err(res, e);
  }
});

app.delete('/api/admin/goods/:name', requireAuth, requireUnlockedOrOwner, async (req, res) => {
  try {
    await pool.query('DELETE FROM goods WHERE name=$1', [decodeURIComponent(req.params.name)]);
    res.json({ ok: true });
  } catch (e) {
    err(res, e);
  }
});

app.post('/api/admin/goods/:name/cities', requireAuth, requireUnlockedOrOwner, async (req, res) => {
  try {
    await pool.query(
      `INSERT INTO city_goods (city_name,good_name) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [req.body.city_name, decodeURIComponent(req.params.name)]
    );
    res.json({ ok: true });
  } catch (e) {
    err(res, e);
  }
});

app.delete(
  '/api/admin/goods/:name/cities/:city',
  requireAuth,
  requireUnlockedOrOwner,
  async (req, res) => {
    try {
      await pool.query('DELETE FROM city_goods WHERE good_name=$1 AND city_name=$2', [
        decodeURIComponent(req.params.name),
        decodeURIComponent(req.params.city),
      ]);
      res.json({ ok: true });
    } catch (e) {
      err(res, e);
    }
  }
);

// ── Travel times ──────────────────────────────────────────────────────────────

app.put('/api/admin/travel-times', requireAuth, requireUnlockedOrOwner, async (req, res) => {
  const { from_city, to_city, minutes } = req.body;
  if (!from_city || !to_city || typeof minutes !== 'number' || minutes <= 0)
    return res.status(400).json({ error: 'Invalid data' });
  try {
    await pool.query(
      `INSERT INTO travel_times (from_city,to_city,minutes) VALUES ($1,$2,$3) ON CONFLICT (from_city,to_city) DO UPDATE SET minutes=$3`,
      [from_city, to_city, minutes]
    );
    await pool.query(
      `INSERT INTO travel_times (from_city,to_city,minutes) VALUES ($2,$1,$3) ON CONFLICT (from_city,to_city) DO UPDATE SET minutes=$3`,
      [from_city, to_city, minutes]
    );
    res.json({ ok: true });
  } catch (e) {
    err(res, e);
  }
});

// ── Cities ────────────────────────────────────────────────────────────────────

app.post('/api/admin/cities', requireAuth, requireUnlockedOrOwner, async (req, res) => {
  const { name, culture, language, has_fire_temple } = req.body;
  if (!name) return res.status(400).json({ error: 'Missing name' });
  try {
    await pool.query(
      `INSERT INTO cities (name,culture,language,has_fire_temple) VALUES ($1,$2,$3,$4)`,
      [name, culture || '', language || '', has_fire_temple || false]
    );
    res.json({ ok: true });
  } catch (e) {
    err(res, e);
  }
});

app.patch('/api/admin/cities/:name', requireAuth, requireUnlockedOrOwner, async (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const { culture, language, has_fire_temple } = req.body;
  try {
    await pool.query(
      `UPDATE cities SET culture=COALESCE($1,culture), language=COALESCE($2,language), has_fire_temple=COALESCE($3,has_fire_temple) WHERE name=$4`,
      [culture ?? null, language ?? null, has_fire_temple ?? null, name]
    );
    res.json({ ok: true });
  } catch (e) {
    err(res, e);
  }
});

app.delete('/api/admin/cities/:name', requireAuth, requireUnlockedOrOwner, async (req, res) => {
  try {
    await pool.query('DELETE FROM cities WHERE name=$1', [decodeURIComponent(req.params.name)]);
    res.json({ ok: true });
  } catch (e) {
    err(res, e);
  }
});

app.post(
  '/api/admin/cities/:name/traits',
  requireAuth,
  requireUnlockedOrOwner,
  async (req, res) => {
    try {
      await pool.query(
        `INSERT INTO city_city_traits (city_name,trait_name) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [decodeURIComponent(req.params.name), req.body.trait_name]
      );
      res.json({ ok: true });
    } catch (e) {
      err(res, e);
    }
  }
);

app.delete(
  '/api/admin/cities/:name/traits/:trait',
  requireAuth,
  requireUnlockedOrOwner,
  async (req, res) => {
    try {
      await pool.query('DELETE FROM city_city_traits WHERE city_name=$1 AND trait_name=$2', [
        decodeURIComponent(req.params.name),
        decodeURIComponent(req.params.trait),
      ]);
      res.json({ ok: true });
    } catch (e) {
      err(res, e);
    }
  }
);

app.post('/api/admin/cities/:name/goods', requireAuth, requireUnlockedOrOwner, async (req, res) => {
  try {
    await pool.query(
      `INSERT INTO city_goods (city_name,good_name) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [decodeURIComponent(req.params.name), req.body.good_name]
    );
    res.json({ ok: true });
  } catch (e) {
    err(res, e);
  }
});

app.delete(
  '/api/admin/cities/:name/goods/:good',
  requireAuth,
  requireUnlockedOrOwner,
  async (req, res) => {
    try {
      await pool.query('DELETE FROM city_goods WHERE city_name=$1 AND good_name=$2', [
        decodeURIComponent(req.params.name),
        decodeURIComponent(req.params.good),
      ]);
      res.json({ ok: true });
    } catch (e) {
      err(res, e);
    }
  }
);

// ── Traits ────────────────────────────────────────────────────────────────────

app.post('/api/admin/traits', requireAuth, requireUnlockedOrOwner, async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Missing name' });
  try {
    await pool.query(
      `INSERT INTO city_traits (name,description) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [name, description || '']
    );
    res.json({ ok: true });
  } catch (e) {
    err(res, e);
  }
});

app.patch('/api/admin/traits/:name', requireAuth, requireUnlockedOrOwner, async (req, res) => {
  try {
    await pool.query(`UPDATE city_traits SET description=COALESCE($1,description) WHERE name=$2`, [
      req.body.description ?? null,
      decodeURIComponent(req.params.name),
    ]);
    res.json({ ok: true });
  } catch (e) {
    err(res, e);
  }
});

app.delete('/api/admin/traits/:name', requireAuth, requireUnlockedOrOwner, async (req, res) => {
  try {
    await pool.query('DELETE FROM city_traits WHERE name=$1', [
      decodeURIComponent(req.params.name),
    ]);
    res.json({ ok: true });
  } catch (e) {
    err(res, e);
  }
});

app.post('/api/admin/trait-effects', requireAuth, requireUnlockedOrOwner, async (req, res) => {
  const { trait_name, kind, bonus, cond_type, cond_value } = req.body;
  if (!trait_name || bonus == null) return res.status(400).json({ error: 'Missing fields' });
  try {
    await pool.query(
      `INSERT INTO trait_effects (trait_name,kind,bonus,cond_type,cond_value) VALUES ($1,$2,$3,$4,$5)`,
      [trait_name, kind || null, bonus, cond_type || null, cond_value || null]
    );
    res.json({ ok: true });
  } catch (e) {
    err(res, e);
  }
});

app.patch('/api/admin/trait-effects/:id', requireAuth, requireUnlockedOrOwner, async (req, res) => {
  const { kind, bonus, cond_type, cond_value } = req.body;
  try {
    await pool.query(
      `UPDATE trait_effects SET kind=COALESCE($1,kind), bonus=COALESCE($2,bonus), cond_type=COALESCE($3,cond_type), cond_value=COALESCE($4,cond_value) WHERE id=$5`,
      [kind ?? null, bonus ?? null, cond_type ?? null, cond_value ?? null, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) {
    err(res, e);
  }
});

app.delete(
  '/api/admin/trait-effects/:id',
  requireAuth,
  requireUnlockedOrOwner,
  async (req, res) => {
    try {
      await pool.query('DELETE FROM trait_effects WHERE id=$1', [req.params.id]);
      res.json({ ok: true });
    } catch (e) {
      err(res, e);
    }
  }
);

// ── Languages ─────────────────────────────────────────────────────────────────

app.post('/api/admin/languages', requireAuth, requireUnlockedOrOwner, async (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: 'Missing name' });
  try {
    await pool.query(`INSERT INTO languages (name) VALUES ($1) ON CONFLICT DO NOTHING`, [
      req.body.name,
    ]);
    res.json({ ok: true });
  } catch (e) {
    err(res, e);
  }
});

app.delete('/api/admin/languages/:name', requireAuth, requireUnlockedOrOwner, async (req, res) => {
  try {
    await pool.query('DELETE FROM languages WHERE name=$1', [decodeURIComponent(req.params.name)]);
    res.json({ ok: true });
  } catch (e) {
    err(res, e);
  }
});

// ── Religions ─────────────────────────────────────────────────────────────────

app.post('/api/admin/religions', requireAuth, requireUnlockedOrOwner, async (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: 'Missing name' });
  try {
    await pool.query(`INSERT INTO religions (name) VALUES ($1) ON CONFLICT DO NOTHING`, [
      req.body.name,
    ]);
    res.json({ ok: true });
  } catch (e) {
    err(res, e);
  }
});

app.delete('/api/admin/religions/:name', requireAuth, requireUnlockedOrOwner, async (req, res) => {
  try {
    await pool.query('DELETE FROM religions WHERE name=$1', [decodeURIComponent(req.params.name)]);
    res.json({ ok: true });
  } catch (e) {
    err(res, e);
  }
});

app.post('/api/admin/religion-perks', requireAuth, requireUnlockedOrOwner, async (req, res) => {
  const { religion, min_level, perk_type, multiplier, description } = req.body;
  if (!religion || !min_level || !perk_type || multiplier == null)
    return res.status(400).json({ error: 'Missing fields' });
  try {
    await pool.query(
      `INSERT INTO religion_perks (religion,min_level,perk_type,multiplier,description) VALUES ($1,$2,$3,$4,$5)`,
      [religion, min_level, perk_type, multiplier, description || '']
    );
    res.json({ ok: true });
  } catch (e) {
    err(res, e);
  }
});

app.patch(
  '/api/admin/religion-perks/:id',
  requireAuth,
  requireUnlockedOrOwner,
  async (req, res) => {
    const { min_level, perk_type, multiplier, description } = req.body;
    try {
      await pool.query(
        `UPDATE religion_perks SET min_level=COALESCE($1,min_level), perk_type=COALESCE($2,perk_type), multiplier=COALESCE($3,multiplier), description=COALESCE($4,description) WHERE id=$5`,
        [
          min_level ?? null,
          perk_type ?? null,
          multiplier ?? null,
          description ?? null,
          req.params.id,
        ]
      );
      res.json({ ok: true });
    } catch (e) {
      err(res, e);
    }
  }
);

app.delete(
  '/api/admin/religion-perks/:id',
  requireAuth,
  requireUnlockedOrOwner,
  async (req, res) => {
    try {
      await pool.query('DELETE FROM religion_perks WHERE id=$1', [req.params.id]);
      res.json({ ok: true });
    } catch (e) {
      err(res, e);
    }
  }
);

// ── Maintenance & Changelogs ──────────────────────────────────────────────────
app.post('/api/admin/maintenance', requireAuth, requireUnlockedOrOwner, async (req, res) => {
  const { active, message } = req.body;
  try {
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ('maintenance', $1)
       ON CONFLICT (key) DO UPDATE SET value=$1`,
      [JSON.stringify({ active: !!active, message: message || '' })]
    );
    await sendMaintenanceToDiscord({ active: !!active, message: message || '' });
    fireUserWebhooks({
      title: active ? '🔧 SilkRoadCalc — Maintenance' : '✅ SilkRoadCalc — Back Online',
      description: message || undefined,
      color: active ? 0xff4444 : 0x00ff88,
      timestamp: new Date().toISOString(),
    });
    res.json({ ok: true });
  } catch (e) {
    err(res, e);
  }
});
// Temporary test route - remove later
app.get('/api/admin/test-discord', requireAuth, requireOwner, async (req, res) => {
  try {
    await sendChangelogToDiscord({
      version: 'vTEST-1.0',
      date: new Date().toISOString().slice(0, 10),
      entries: ['This is a test changelog', 'Testing Discord webhook'],
      thanks: 'Test User',
    });
    res.json({ ok: true, message: 'Test message sent to Discord' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.post('/api/admin/changelogs', requireAuth, requireUnlockedOrOwner, async (req, res) => {
  const { version, date, entries, thanks } = req.body;
  if (!version) return res.status(400).json({ error: 'Missing version' });

  try {
    const result = await pool.query(
      `INSERT INTO changelogs (version,date,entries,thanks)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [version, date || new Date().toISOString().slice(0, 10), entries || [], thanks || '']
    );

    const newChangelog = result.rows[0];
    await sendChangelogToDiscord(newChangelog);
    fireUserWebhooks({
      title: `📜 SilkRoadCalc Update — ${newChangelog.version}`,
      description: (newChangelog.entries || []).map(e => `• ${e}`).join('\n') || undefined,
      color: 0xe7c885,
      timestamp: new Date().toISOString(),
    });
    res.json({ ok: true });
  } catch (e) {
    err(res, e);
  }
});

app.patch('/api/admin/changelogs/:id', requireAuth, requireUnlockedOrOwner, async (req, res) => {
  const { version, date, entries, thanks } = req.body;
  try {
    const result = await pool.query(
      `UPDATE changelogs
       SET version=COALESCE($1,version),
           date=COALESCE($2,date),
           entries=COALESCE($3,entries),
           thanks=COALESCE($4,thanks)
       WHERE id=$5
       RETURNING *`,
      [version ?? null, date ?? null, entries ?? null, thanks ?? null, req.params.id]
    );

    if (result.rows.length > 0) {
      await sendChangelogToDiscord(result.rows[0]); // ← Sends to Discord
    }

    res.json({ ok: true });
  } catch (e) {
    err(res, e);
  }
});

app.delete('/api/admin/changelogs/:id', requireAuth, requireUnlockedOrOwner, async (req, res) => {
  try {
    await pool.query('DELETE FROM changelogs WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    err(res, e);
  }
});

app.post('/api/admin/notices', requireAuth, requireUnlockedOrOwner, async (req, res) => {
  const { active, message, level } = req.body;
  if (!message) return res.status(400).json({ error: 'Missing message' });
  try {
    await pool.query('DELETE FROM notices');
    const result = await pool.query(
      `INSERT INTO notices (active, message, level) VALUES ($1, $2, $3) RETURNING *`,
      [active ?? true, message, level || 'info']
    );
    await writeAudit(req, {
      entityType: 'notices',
      entityId: 'active',
      action: 'update',
      afterJson: result.rows[0],
    });
    if (active) {
      await sendNoticeToDiscord(result.rows[0]);
      fireUserWebhooks({
        title: '📢 SilkRoadCalc Notice',
        description: message,
        color: 0x4488ff,
        timestamp: new Date().toISOString(),
      });
    }
    res.json({ ok: true });
  } catch (e) {
    err(res, e);
  }
});

app.post('/api/admin/notices/disable', requireAuth, requireUnlockedOrOwner, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE notices SET active = false, updated_at = NOW() RETURNING *'
    );
    await writeAudit(req, {
      entityType: 'notices',
      entityId: 'active',
      action: 'update',
      afterJson: result.rows[0] || null,
    });
    res.json({ ok: true });
  } catch (e) {
    err(res, e);
  }
});

// ── Events ────────────────────────────────────────────────────────────────────

app.post('/api/admin/events', requireAuth, requireUnlockedOrOwner, async (req, res) => {
  const { name, glyph, dir, good_types, good_names, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Missing name' });
  try {
    await pool.query(
      `INSERT INTO event_types (name,glyph,dir,good_types,good_names,description) VALUES ($1,$2,$3,$4,$5,$6)`,
      [name, glyph || '', dir ?? 1, good_types || [], good_names || [], description || '']
    );
    res.json({ ok: true });
  } catch (e) {
    err(res, e);
  }
});

app.patch('/api/admin/events/:name', requireAuth, requireUnlockedOrOwner, async (req, res) => {
  const { glyph, dir, good_types, good_names, description } = req.body;
  try {
    await pool.query(
      `UPDATE event_types SET glyph=COALESCE($1,glyph), dir=COALESCE($2,dir), good_types=COALESCE($3,good_types), good_names=COALESCE($4,good_names), description=COALESCE($5,description) WHERE name=$6`,
      [
        glyph ?? null,
        dir ?? null,
        good_types ?? null,
        good_names ?? null,
        description ?? null,
        decodeURIComponent(req.params.name),
      ]
    );
    res.json({ ok: true });
  } catch (e) {
    err(res, e);
  }
});

app.delete('/api/admin/events/:name', requireAuth, requireUnlockedOrOwner, async (req, res) => {
  try {
    await pool.query('DELETE FROM event_types WHERE name=$1', [
      decodeURIComponent(req.params.name),
    ]);
    res.json({ ok: true });
  } catch (e) {
    err(res, e);
  }
});

app.post(
  '/api/admin/events/:name/levels',
  requireAuth,
  requireUnlockedOrOwner,
  async (req, res) => {
    const { level, pct, base_bonus, label } = req.body;
    if (!level || pct == null) return res.status(400).json({ error: 'Missing fields' });
    try {
      await pool.query(
        `INSERT INTO event_levels (event_name,level,pct,base_bonus,label) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (event_name,level) DO UPDATE SET pct=$3, base_bonus=$4, label=$5`,
        [decodeURIComponent(req.params.name), level, pct, base_bonus ?? 0, label || '']
      );
      res.json({ ok: true });
    } catch (e) {
      err(res, e);
    }
  }
);

app.patch('/api/admin/events/levels/:id', requireAuth, requireUnlockedOrOwner, async (req, res) => {
  const { label, pct, base_bonus } = req.body;
  try {
    await pool.query(
      `UPDATE event_levels SET label=COALESCE($1,label), pct=COALESCE($2,pct), base_bonus=COALESCE($3,base_bonus) WHERE id=$4`,
      [label ?? null, pct ?? null, base_bonus ?? null, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) {
    err(res, e);
  }
});

app.delete(
  '/api/admin/events/levels/:id',
  requireAuth,
  requireUnlockedOrOwner,
  async (req, res) => {
    try {
      await pool.query('DELETE FROM event_levels WHERE id=$1', [req.params.id]);
      res.json({ ok: true });
    } catch (e) {
      err(res, e);
    }
  }
);

// ── Projects ──────────────────────────────────────────────────────────────────

app.get('/api/admin/projects', requireAuth, async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT data FROM projects_state WHERE id=1');
    res.json(rows[0]?.data || { projects: [], activeProjectId: null });
  } catch (e) {
    err(res, e);
  }
});

app.put('/api/admin/projects', requireAuth, async (req, res) => {
  const data = req.body;
  if (!Array.isArray(data.projects))
    return res.status(400).json({ error: 'Invalid data' });
  try {
    await pool.query(
      `INSERT INTO projects_state (id, data) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET data=$1`,
      [JSON.stringify(data)]
    );
    res.json({ ok: true });
  } catch (e) {
    err(res, e);
  }
});

app.get('/api/github/latest', requireAuth, async (req, res) => {
  const repo = req.query.repo;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo || ''))
    return res.status(400).json({ error: 'Invalid repo' });
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'projects-manager' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  try {
    const r = await fetchImpl(`https://api.github.com/repos/${repo}/commits?per_page=1`, { headers });
    if (!r.ok) return res.status(r.status).json({ error: r.status === 403 ? 'GitHub rate limit reached.' : 'Commit unavailable.' });
    const [latest] = await r.json();
    res.json({
      sha:     latest.sha.slice(0, 7),
      message: latest.commit.message.split('\n')[0],
      author:  latest.commit.author?.name || 'Unknown',
      date:    latest.commit.author?.date || '',
      url:     latest.html_url,
    });
  } catch (e) {
    err(res, e);
  }
});

// ─────────────────────────────────────────────────────────────────────────────

initSchema()
  .then(() => app.listen(PORT, () => console.log(`Listening on port ${PORT}`)))
  .catch((e) => {
    console.error('Schema init failed:', e);
    process.exit(1);
  });

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const path = require('path');
const { pool, initSchema } = require('./db');
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
  })
);
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

app.get('/api/maintenance', async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT value FROM settings WHERE key='maintenance'`);
    const data = rows.length ? JSON.parse(rows[0].value) : { active: false, message: '' };
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

app.post('/api/session/ping', async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 64)
    return res.status(400).json({ error: 'Invalid sessionId' });
  try {
    await pool.query(
      `INSERT INTO sessions (session_id, last_ping, created_at) VALUES ($1, NOW(), NOW())
       ON CONFLICT (session_id) DO UPDATE SET last_ping = NOW()`,
      [sessionId]
    );
    await pool.query(
      `INSERT INTO daily_sessions (date, session_id) VALUES (CURRENT_DATE, $1) ON CONFLICT DO NOTHING`,
      [sessionId]
    );
    res.json({ ok: true });
  } catch (e) {
    err(res, e);
  }
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
        `SELECT date, COUNT(*) AS visits FROM daily_sessions WHERE date >= CURRENT_DATE - INTERVAL '6 days' GROUP BY date ORDER BY date`
      ),
    ]);
    res.json({
      onlineNow: parseInt(a.rows[0].count),
      todayVisits: parseInt(b.rows[0].count),
      last7Days: c.rows.map((r) => ({
        date: r.date,
        visits: parseInt(r.visits),
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
    await sendChangelogToDiscord(newChangelog); // ← Sends to Discord

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
    if (active) await sendNoticeToDiscord(result.rows[0]);
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

// ─────────────────────────────────────────────────────────────────────────────

initSchema()
  .then(() => app.listen(PORT, () => console.log(`Listening on port ${PORT}`)))
  .catch((e) => {
    console.error('Schema init failed:', e);
    process.exit(1);
  });

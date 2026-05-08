const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS goods (
      name        VARCHAR(100) PRIMARY KEY,
      base_price  INTEGER      NOT NULL,
      type        VARCHAR(50)  NOT NULL,
      hop_pct     FLOAT        NOT NULL
    );

    CREATE TABLE IF NOT EXISTS travel_times (
      from_city   VARCHAR(50) NOT NULL,
      to_city     VARCHAR(50) NOT NULL,
      minutes     FLOAT       NOT NULL,
      PRIMARY KEY (from_city, to_city)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      session_id  VARCHAR(100) PRIMARY KEY,
      last_ping   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS daily_sessions (
      date        DATE         NOT NULL DEFAULT CURRENT_DATE,
      session_id  VARCHAR(100) NOT NULL,
      PRIMARY KEY (date, session_id)
    );

    CREATE TABLE IF NOT EXISTS languages (
      name VARCHAR(100) PRIMARY KEY
    );

    CREATE TABLE IF NOT EXISTS cultures (
      name            VARCHAR(100) PRIMARY KEY,
      native_language VARCHAR(100) NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS city_traits (
      name        VARCHAR(100) PRIMARY KEY,
      description TEXT         NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS trait_effects (
      id         SERIAL       PRIMARY KEY,
      trait_name VARCHAR(100) NOT NULL,
      kind       VARCHAR(10),
      bonus      FLOAT        NOT NULL,
      cond_type  VARCHAR(50),
      cond_value VARCHAR(100)
    );

    CREATE TABLE IF NOT EXISTS cities (
      name            VARCHAR(100) PRIMARY KEY,
      culture         VARCHAR(100) NOT NULL DEFAULT '',
      language        VARCHAR(100) NOT NULL DEFAULT '',
      has_fire_temple BOOLEAN      NOT NULL DEFAULT false
    );

    CREATE TABLE IF NOT EXISTS city_city_traits (
      city_name  VARCHAR(100) NOT NULL,
      trait_name VARCHAR(100) NOT NULL,
      PRIMARY KEY (city_name, trait_name)
    );

    CREATE TABLE IF NOT EXISTS city_goods (
      city_name VARCHAR(100) NOT NULL,
      good_name VARCHAR(100) NOT NULL,
      PRIMARY KEY (city_name, good_name)
    );

    CREATE TABLE IF NOT EXISTS religions (
      name VARCHAR(100) PRIMARY KEY
    );

    CREATE TABLE IF NOT EXISTS religion_perks (
      id          SERIAL       PRIMARY KEY,
      religion    VARCHAR(100) NOT NULL,
      min_level   INTEGER      NOT NULL,
      perk_type   VARCHAR(50)  NOT NULL,
      multiplier  FLOAT        NOT NULL,
      description TEXT         NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS event_types (
      name        VARCHAR(100) PRIMARY KEY,
      glyph       VARCHAR(10)  NOT NULL DEFAULT '',
      dir         INTEGER      NOT NULL DEFAULT 1,
      good_types  TEXT[]       NOT NULL DEFAULT '{}',
      good_names  TEXT[]       NOT NULL DEFAULT '{}',
      description TEXT         NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS event_levels (
      id         SERIAL       PRIMARY KEY,
      event_name VARCHAR(100) NOT NULL,
      level      INTEGER      NOT NULL,
      pct        FLOAT        NOT NULL,
      base_bonus INTEGER      NOT NULL DEFAULT 0,
      label      VARCHAR(100) NOT NULL DEFAULT '',
      UNIQUE (event_name, level)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   VARCHAR(100) PRIMARY KEY,
      value TEXT         NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS changelogs (
      id         SERIAL       PRIMARY KEY,
      version    VARCHAR(50)  NOT NULL,
      date       DATE         NOT NULL DEFAULT CURRENT_DATE,
      entries    TEXT[]       NOT NULL DEFAULT '{}',
      thanks     VARCHAR(200) NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS notices (
      id         SERIAL       PRIMARY KEY,
      active     BOOLEAN      NOT NULL DEFAULT false,
      message    TEXT         NOT NULL,
      level      VARCHAR(20)  NOT NULL DEFAULT 'info',
      created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      id            SERIAL PRIMARY KEY,
      username      VARCHAR(100) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role          VARCHAR(20) NOT NULL CHECK (role IN ('owner','helper')),
      active        BOOLEAN NOT NULL DEFAULT true,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS admin_lock_state (
      id                 INTEGER PRIMARY KEY DEFAULT 1,
      is_locked          BOOLEAN NOT NULL DEFAULT true,
      changed_by_user_id INTEGER,
      changed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS admin_permission_requests (
      id                SERIAL PRIMARY KEY,
      requester_user_id INTEGER NOT NULL,
      status            VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
      note              TEXT NOT NULL DEFAULT '',
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at       TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id            BIGSERIAL PRIMARY KEY,
      actor_user_id INTEGER,
      actor_role    VARCHAR(20) NOT NULL DEFAULT 'unknown',
      actor_username VARCHAR(100) NOT NULL DEFAULT 'unknown',
      entity_type   VARCHAR(100) NOT NULL,
      entity_id     VARCHAR(200) NOT NULL DEFAULT '',
      action        VARCHAR(30) NOT NULL,
      before_json   JSONB,
      after_json    JSONB,
      request_json  JSONB,
      changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  // Add id column to event_levels if upgrading from old schema
  await pool.query(`ALTER TABLE event_levels ADD COLUMN IF NOT EXISTS id SERIAL`).catch(() => {});

  await pool.query(
    `INSERT INTO admin_lock_state (id, is_locked, changed_at)
     VALUES (1, true, NOW())
     ON CONFLICT (id) DO NOTHING`
  );
}

module.exports = { pool, initSchema };

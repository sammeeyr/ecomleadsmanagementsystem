'use strict';
// Neon Postgres access. The table is created on first use, so there is no manual migration step.
const { neon } = require('@neondatabase/serverless');

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS leads (
    id            uuid PRIMARY KEY,
    name          text NOT NULL,
    business      text NOT NULL DEFAULT '',
    phone         text NOT NULL DEFAULT '',
    email         text NOT NULL DEFAULT '',
    biz_type      text NOT NULL DEFAULT '',
    volume        text NOT NULL DEFAULT '',
    pains         jsonb NOT NULL DEFAULT '[]'::jsonb,
    notes         text NOT NULL DEFAULT '',
    source        text NOT NULL DEFAULT '',
    interest      text NOT NULL DEFAULT 'warm',
    stage         text NOT NULL DEFAULT 'new',
    next_follow_up date,
    setup_value   integer NOT NULL DEFAULT 0,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    log           jsonb NOT NULL DEFAULT '[]'::jsonb
  )`,
  `CREATE INDEX IF NOT EXISTS leads_follow_up_idx ON leads (stage, next_follow_up)`,
  `CREATE INDEX IF NOT EXISTS leads_created_idx ON leads (created_at DESC)`
];

// Columns returned to the browser, named the way the pipeline page expects them.
const LEAD_COLUMNS = `id, name, business, phone, email, biz_type AS "bizType", volume, pains, notes, source, interest, stage,
  next_follow_up::text AS "nextFollowUp", setup_value AS "setupValue", created_at AS "createdAt", updated_at AS "updatedAt", log`;

let sql = null;
let ready = null;

function client() {
  if (!sql) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) throw new Error('DATABASE_URL is not set. Add a Neon Postgres database to the Vercel project.');
    sql = neon(url);
  }
  return sql;
}

async function ensureSchema() {
  if (!ready) {
    ready = (async () => {
      const s = client();
      for (const stmt of SCHEMA) await s.query(stmt);
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

async function query(text, params) {
  await ensureSchema();
  return client().query(text, params || []);
}

module.exports = { query, LEAD_COLUMNS };

'use strict';
// GET /api/leads   list every lead (owner only)
// POST /api/leads  add a lead by hand (owner only)
const crypto = require('crypto');
const { query, LEAD_COLUMNS } = require('./_lib/db');
const A = require('./_lib/auth');
const U = require('./_lib/util');

module.exports = async function handler(req, res) {
  try {
    if (!A.requireOwner(req, res)) return;

    if (req.method === 'GET') {
      const rows = await query(`SELECT ${LEAD_COLUMNS} FROM leads ORDER BY created_at DESC LIMIT 5000`);
      return res.status(200).json({ leads: rows });
    }

    if (req.method === 'POST') {
      const body = U.jsonBody(req, res); if (!body) return;
      const c = U.contactFrom(body);
      const problem = U.validateContact(c);
      if (problem) return res.status(400).json({ error: 'invalid', message: problem });
      const source = U.SOURCES.indexOf(body.source) >= 0 ? body.source : 'Other';
      const interest = U.INTERESTS.indexOf(body.interest) >= 0 ? body.interest : 'warm';
      const value = Math.max(0, Math.min(2e9, Math.round(Number(body.setupValue) || 0)));
      const next = U.isDate(String(body.nextFollowUp || '')) ? body.nextFollowUp : U.dateInZone(1);
      const now = new Date().toISOString();
      const rows = await query(
        `INSERT INTO leads (id, name, business, phone, email, biz_type, volume, pains, notes, source, interest, stage, next_follow_up, setup_value, log)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,'new',$12,$13,$14::jsonb) RETURNING ${LEAD_COLUMNS}`,
        [crypto.randomUUID(), c.name, c.business, c.phone, c.email, c.bizType, c.volume, JSON.stringify(c.pains), c.notes, source, interest, next, value,
          JSON.stringify([{ t: now, text: 'Lead added from ' + source }])]);
      return res.status(201).json({ lead: rows[0] });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    console.error('leads failed', e);
    return res.status(500).json({ error: 'server', message: 'The database could not be reached.' });
  }
};

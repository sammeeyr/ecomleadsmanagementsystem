'use strict';
// POST /api/submit  (public) - a prospect fills in the form and the lead lands in the pipeline.
const crypto = require('crypto');
const { query, LEAD_COLUMNS } = require('./_lib/db');
const U = require('./_lib/util');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'method_not_allowed' }); }
  try {
    const body = U.jsonBody(req, res); if (!body) return;
    // Hidden field a person never fills in. Pretend success so bots learn nothing.
    if (U.clean(body.website, 50)) return res.status(200).json({ ok: true });
    if (U.limited('submit:' + U.clientIp(req), 6, 15 * 60 * 1000)) return res.status(429).json({ error: 'too_many', message: 'Too many submissions. Please try again in a few minutes.' });

    const c = U.contactFrom(body);
    const problem = U.validateContact(c);
    if (problem) return res.status(400).json({ error: 'invalid', message: problem });

    // The same number twice in one day is one lead. Comparing the last 10 digits treats 0803... and +234 803... as the same number.
    const digits = c.phone.replace(/\D/g, '').slice(-10);
    const dup = await query(`SELECT id FROM leads WHERE right(regexp_replace(phone, '\\D', '', 'g'), 10) = $1 AND created_at > now() - interval '1 day' LIMIT 1`, [digits]);
    if (dup.length) return res.status(200).json({ ok: true, duplicate: true });

    const now = new Date().toISOString();
    const rows = await query(
      `INSERT INTO leads (id, name, business, phone, email, biz_type, volume, pains, notes, source, interest, stage, next_follow_up, setup_value, log)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,'Prospect form','warm','new',$10,0,$11::jsonb) RETURNING ${LEAD_COLUMNS}`,
      [crypto.randomUUID(), c.name, c.business, c.phone, c.email, c.bizType, c.volume, JSON.stringify(c.pains), c.notes,
        U.dateInZone(1), JSON.stringify([{ t: now, text: 'Submitted the prospect form' }])]);
    await U.notify(rows[0]);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('submit failed', e);
    return res.status(500).json({ error: 'server', message: 'Something went wrong on our side. Please try again.' });
  }
};

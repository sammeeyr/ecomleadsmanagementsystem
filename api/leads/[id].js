'use strict';
// PATCH /api/leads/:id   { fields: {...}, logText?: "..." }  update a lead and optionally add an activity entry (owner only)
// DELETE /api/leads/:id  remove a lead (owner only)
const { query, LEAD_COLUMNS } = require('./../_lib/db');
const A = require('./../_lib/auth');
const U = require('./../_lib/util');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Fields the browser may change, mapped to columns, each with a validator that returns the clean value or undefined.
const EDITABLE = {
  name: ['name', (v) => U.clean(v, 120) || undefined],
  business: ['business', (v) => U.clean(v, 160)],
  phone: ['phone', (v) => U.clean(v, 40)],
  email: ['email', (v) => U.clean(v, 160)],
  bizType: ['biz_type', (v) => U.clean(v, 80)],
  volume: ['volume', (v) => U.clean(v, 80)],
  notes: ['notes', (v) => U.clean(v, 4000)],
  source: ['source', (v) => (U.SOURCES.indexOf(v) >= 0 ? v : undefined)],
  interest: ['interest', (v) => (U.INTERESTS.indexOf(v) >= 0 ? v : undefined)],
  stage: ['stage', (v) => (U.STAGES.indexOf(v) >= 0 ? v : undefined)],
  nextFollowUp: ['next_follow_up', (v) => (v === '' || v === null ? null : U.isDate(String(v)) ? v : undefined)],
  setupValue: ['setup_value', (v) => (isFinite(Number(v)) ? Math.max(0, Math.min(2e9, Math.round(Number(v)))) : undefined)],
  pains: ['pains', (v) => (Array.isArray(v) ? JSON.stringify(U.cleanPains(v)) : undefined)]
};

module.exports = async function handler(req, res) {
  try {
    if (!A.requireOwner(req, res)) return;
    const id = String(req.query && req.query.id || '');
    if (!UUID.test(id)) return res.status(400).json({ error: 'bad_id' });

    if (req.method === 'DELETE') {
      await query('DELETE FROM leads WHERE id = $1', [id]);
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'PATCH') {
      const body = U.jsonBody(req, res); if (!body) return;
      const fields = body.fields && typeof body.fields === 'object' ? body.fields : {};
      const sets = [], params = [id];
      for (const key of Object.keys(fields)) {
        const def = EDITABLE[key];
        if (!def) continue;
        const val = def[1](fields[key]);
        if (val === undefined) return res.status(400).json({ error: 'invalid', message: 'Invalid value for ' + key + '.' });
        params.push(val);
        sets.push(`${def[0]} = $${params.length}${key === 'pains' ? '::jsonb' : ''}`);
      }
      const logText = U.clean(body.logText, 500);
      if (logText) {
        params.push(JSON.stringify([{ t: new Date().toISOString(), text: logText }]));
        sets.push(`log = (SELECT COALESCE(jsonb_agg(e ORDER BY ord), '[]'::jsonb) FROM
          (SELECT e, ord FROM jsonb_array_elements($${params.length}::jsonb || COALESCE(leads.log, '[]'::jsonb)) WITH ORDINALITY AS t(e, ord) LIMIT 60) s)`);
      }
      sets.push('updated_at = now()');
      const rows = await query(`UPDATE leads SET ${sets.join(', ')} WHERE id = $1 RETURNING ${LEAD_COLUMNS}`, params);
      if (!rows.length) return res.status(404).json({ error: 'not_found' });
      return res.status(200).json({ lead: rows[0] });
    }

    res.setHeader('Allow', 'PATCH, DELETE');
    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    console.error('lead update failed', e);
    return res.status(500).json({ error: 'server', message: 'The database could not be reached.' });
  }
};

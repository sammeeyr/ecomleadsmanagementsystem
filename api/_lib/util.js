'use strict';
// Shared validation, dates and request helpers.
const STAGES = ['new', 'contacted', 'demo', 'proposal', 'won', 'lost'];
const INTERESTS = ['hot', 'warm', 'cold'];
const SOURCES = ['Prospect form', 'Showcase', 'Referral', 'WhatsApp', 'Instagram', 'LinkedIn', 'Website', 'Other'];
const PAINS = ['Orders get lost', 'Slow replies to customers', 'No order tracking', 'Staff share one WhatsApp', 'No follow-up with customers', 'Hard to see sales'];

const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);

function cleanPains(list) {
  if (!Array.isArray(list)) return [];
  return list.map((p) => clean(p, 60)).filter((p) => PAINS.indexOf(p) >= 0).filter((p, i, a) => a.indexOf(p) === i);
}

function validateContact(d) {
  if (!d.name) return 'Enter your name.';
  if (!d.business) return 'Enter your business name.';
  const digits = d.phone.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return 'Enter a WhatsApp number with 10 to 15 digits.';
  if (d.email && !/^\S+@\S+\.\S+$/.test(d.email)) return 'That email address looks incomplete.';
  return '';
}

function contactFrom(body) {
  const b = body || {};
  return {
    name: clean(b.name, 120), business: clean(b.business, 160), phone: clean(b.phone, 40), email: clean(b.email, 160),
    bizType: clean(b.bizType, 80), volume: clean(b.volume, 80), pains: cleanPains(b.pains), notes: clean(b.notes, 2000)
  };
}

// Today's date (YYYY-MM-DD) in the business timezone, plus n days.
function dateInZone(offsetDays) {
  const zone = process.env.APP_TIMEZONE || 'Africa/Lagos';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const [y, m, d] = today.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + (offsetDays || 0))).toISOString().slice(0, 10);
}
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));

function jsonBody(req, res) {
  const type = String(req.headers['content-type'] || '');
  if (type.indexOf('application/json') < 0) { res.status(415).json({ error: 'json_required' }); return null; }
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = null; } }
  if (!b || typeof b !== 'object') { res.status(400).json({ error: 'bad_body' }); return null; }
  return b;
}
const clientIp = (req) => String((req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket && req.socket.remoteAddress || 'unknown').trim();

// Best-effort per-instance limiter (serverless instances do not share memory).
const buckets = new Map();
function limited(key, max, windowMs) {
  const now = Date.now();
  const hits = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (hits.length >= max) { buckets.set(key, hits); return true; }
  hits.push(now); buckets.set(key, hits);
  if (buckets.size > 5000) buckets.clear();
  return false;
}

// Optional alert: POSTs the new lead to NOTIFY_WEBHOOK_URL (for example an n8n or Make webhook that messages you on WhatsApp).
async function notify(lead) {
  const url = process.env.NOTIFY_WEBHOOK_URL;
  if (!url) return;
  const text = ['New eComCRM lead', lead.name + ' (' + lead.business + ')', 'WhatsApp: ' + lead.phone, lead.volume && 'Orders: ' + lead.volume,
    lead.pains && lead.pains.length && 'Problems: ' + lead.pains.join(', ')].filter(Boolean).join('\n');
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 3000);
  try {
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'lead.created', text, lead }), signal: ctl.signal });
  } catch (e) { /* an alert failure must never lose the lead */ } finally { clearTimeout(t); }
}

module.exports = { STAGES, INTERESTS, SOURCES, PAINS, clean, cleanPains, validateContact, contactFrom, dateInZone, isDate, jsonBody, clientIp, limited, notify };

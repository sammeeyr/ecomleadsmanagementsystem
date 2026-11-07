'use strict';
// End-to-end API test. Uses an in-memory Postgres (PGlite) in place of Neon, and a local server to catch the alert webhook.
const Module = require('module');
const http = require('http');
const assert = require('assert');
const { PGlite } = require('@electric-sql/pglite');

const pg = new PGlite();
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === '@neondatabase/serverless') {
    return { neon: () => ({ query: async (text, params) => (await pg.query(text, params || [])).rows }) };
  }
  return origLoad.apply(this, arguments);
};

process.env.DATABASE_URL = 'postgres://test';
process.env.OWNER_PASSWORD = 'correct horse battery';
process.env.SESSION_SECRET = 'test-secret-test-secret-1234';

const submit = require('../api/submit');
const login = require('../api/login');
const logout = require('../api/logout');
const leads = require('../api/leads');
const leadById = require('../api/leads/[id]');

function call(handler, { method = 'GET', body, cookie, query, json = true, ip = '10.0.0.1' } = {}) {
  return new Promise((resolve, reject) => {
    const headers = { 'x-forwarded-for': ip };
    if (json) headers['content-type'] = 'application/json';
    if (cookie) headers.cookie = cookie;
    const res = { code: 200, headers: {}, status(c) { this.code = c; return this; }, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, json(o) { resolve({ code: this.code, body: o, headers: this.headers }); }, end() { resolve({ code: this.code, headers: this.headers }); } };
    Promise.resolve(handler({ method, headers, body, query: query || {}, socket: {} }, res)).catch(reject);
  });
}

(async () => {
  let hook = null;
  const server = http.createServer((req, res) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => { hook = JSON.parse(d); res.end('ok'); }); });
  await new Promise((r) => server.listen(0, r));
  process.env.NOTIFY_WEBHOOK_URL = 'http://127.0.0.1:' + server.address().port + '/hook';

  const good = { name: 'Ada Obi', business: 'Ada Beauty Hub', phone: '0803 123 4567', email: 'ada@example.com', bizType: 'Fashion and beauty', volume: '50 to 300 orders a month', pains: ['Orders get lost', 'Not a real pain'], notes: 'Wants a demo Friday' };

  // public form
  let r = await call(submit, { method: 'POST', body: good, json: false });
  assert.strictEqual(r.code, 415, 'non-JSON is refused');
  r = await call(submit, { method: 'POST', body: { ...good, phone: '123' } });
  assert.strictEqual(r.code, 400, 'bad phone is refused');
  r = await call(submit, { method: 'POST', body: { ...good, website: 'http://spam' } });
  assert.strictEqual(r.code, 200, 'honeypot looks like success');
  r = await call(submit, { method: 'POST', body: good });
  assert.strictEqual(r.code, 200); assert.ok(r.body.ok);
  assert.ok(hook && hook.lead.name === 'Ada Obi' && /New eComCRM lead/.test(hook.text), 'webhook received the lead');
  r = await call(submit, { method: 'POST', body: { ...good, phone: '+234 803-123-4567' } });
  assert.ok(r.body.duplicate, 'same number the same day is a duplicate');

  // owner routes need login
  r = await call(leads);
  assert.strictEqual(r.code, 401, 'list without login is refused');
  r = await call(leads, { cookie: 'ecomcrm_session=9999999999999.forged' });
  assert.strictEqual(r.code, 401, 'forged cookie is refused');
  r = await call(login, { method: 'POST', body: { password: 'nope' }, ip: '10.0.0.9' });
  assert.strictEqual(r.code, 401, 'wrong password is refused');
  r = await call(login, { method: 'POST', body: { password: 'correct horse battery' }, ip: '10.0.0.9' });
  assert.strictEqual(r.code, 200);
  const setCookie = r.headers['set-cookie'];
  assert.ok(/HttpOnly/.test(setCookie) && /Secure/.test(setCookie) && /SameSite=Lax/.test(setCookie), 'cookie is HttpOnly, Secure, SameSite');
  const cookie = setCookie.split(';')[0];

  r = await call(leads, { cookie });
  assert.strictEqual(r.code, 200); assert.strictEqual(r.body.leads.length, 1, 'honeypot and duplicate saved nothing extra');
  const lead = r.body.leads[0];
  assert.deepStrictEqual(lead.pains, ['Orders get lost'], 'unknown pains are dropped');
  assert.strictEqual(lead.source, 'Prospect form'); assert.strictEqual(lead.stage, 'new');
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(lead.nextFollowUp), 'next follow-up is a plain date');
  assert.strictEqual(lead.log.length, 1);
  assert.strictEqual(lead.setupValue, 0); assert.strictEqual(typeof lead.setupValue, 'number');

  // update
  const id = lead.id;
  r = await call(leadById, { method: 'PATCH', cookie, query: { id }, body: { fields: { stage: 'contacted', nextFollowUp: '2026-11-20', setupValue: 750000, interest: 'hot' }, logText: 'Stage: New to Contacted' } });
  assert.strictEqual(r.code, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.lead.stage, 'contacted'); assert.strictEqual(r.body.lead.nextFollowUp, '2026-11-20'); assert.strictEqual(r.body.lead.setupValue, 750000);
  assert.strictEqual(r.body.lead.log.length, 2); assert.strictEqual(r.body.lead.log[0].text, 'Stage: New to Contacted', 'newest log entry first');
  r = await call(leadById, { method: 'PATCH', cookie, query: { id }, body: { fields: { stage: 'bogus' } } });
  assert.strictEqual(r.code, 400, 'invalid stage is refused');
  r = await call(leadById, { method: 'PATCH', cookie, query: { id }, body: { fields: { nextFollowUp: '' }, logText: '' } });
  assert.strictEqual(r.body.lead.nextFollowUp, null, 'empty date clears the follow-up');
  assert.strictEqual(r.body.lead.log.length, 2, 'no log text adds no entry');
  r = await call(leadById, { method: 'PATCH', cookie, query: { id: 'not-a-uuid' }, body: { fields: {} } });
  assert.strictEqual(r.code, 400);
  r = await call(leadById, { method: 'PATCH', query: { id }, body: { fields: { stage: 'won' } } });
  assert.strictEqual(r.code, 401, 'update without login is refused');
  for (let i = 0; i < 70; i++) await call(leadById, { method: 'PATCH', cookie, query: { id }, body: { fields: {}, logText: 'note ' + i } });
  r = await call(leads, { cookie });
  assert.strictEqual(r.body.leads[0].log.length, 60, 'log is capped at 60 entries');
  assert.strictEqual(r.body.leads[0].log[0].text, 'note 69');

  // add by hand
  r = await call(leads, { method: 'POST', cookie, body: { name: 'Tunde', business: 'Tunde Gadgets', phone: '08011112222', source: 'Showcase', interest: 'hot', setupValue: 1500000, nextFollowUp: '2026-11-09' } });
  assert.strictEqual(r.code, 201); assert.strictEqual(r.body.lead.source, 'Showcase'); assert.strictEqual(r.body.lead.setupValue, 1500000);
  r = await call(leads, { cookie });
  assert.strictEqual(r.body.leads.length, 2);

  // delete and logout
  r = await call(leadById, { method: 'DELETE', cookie, query: { id } });
  assert.strictEqual(r.code, 200);
  r = await call(leads, { cookie });
  assert.strictEqual(r.body.leads.length, 1);
  r = await call(logout, { method: 'POST' });
  assert.ok(/Max-Age=0/.test(r.headers['set-cookie']));

  // limiter
  let last;
  for (let i = 0; i < 9; i++) last = await call(login, { method: 'POST', body: { password: 'x' }, ip: '10.0.0.77' });
  assert.strictEqual(last.code, 429, 'login attempts are rate limited');

  server.close();
  console.log('All API checks passed');
  process.exit(0);
})().catch((e) => { console.error('TEST FAILED:', e); process.exit(1); });

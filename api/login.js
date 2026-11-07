'use strict';
// POST /api/login  { password }  -> sets the owner session cookie.
const A = require('./_lib/auth');
const U = require('./_lib/util');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'method_not_allowed' }); }
  try {
    const body = U.jsonBody(req, res); if (!body) return;
    if (U.limited('login:' + U.clientIp(req), 8, 15 * 60 * 1000)) return res.status(429).json({ error: 'too_many', message: 'Too many attempts. Wait 15 minutes and try again.' });
    if (!process.env.OWNER_PASSWORD) return res.status(500).json({ error: 'not_configured', message: 'OWNER_PASSWORD is not set on the server.' });
    if (!A.passwordOk(body.password)) {
      await new Promise((r) => setTimeout(r, 600));
      return res.status(401).json({ error: 'wrong_password', message: 'That password is not right.' });
    }
    res.setHeader('Set-Cookie', A.sessionCookie(A.makeToken()));
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('login failed', e);
    return res.status(500).json({ error: 'server', message: 'Login is not set up correctly. Check SESSION_SECRET and OWNER_PASSWORD.' });
  }
};

'use strict';
// Owner login: one password (OWNER_PASSWORD) and a signed, HTTP-only session cookie. No third-party auth service.
const crypto = require('crypto');

const COOKIE = 'ecomcrm_session';
const MAX_AGE_DAYS = 30;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error('SESSION_SECRET must be set to a random string of at least 16 characters.');
  return s;
}
const sign = (v) => crypto.createHmac('sha256', secret()).update(v).digest('base64url');

function makeToken() {
  const exp = String(Date.now() + MAX_AGE_DAYS * 864e5);
  return exp + '.' + sign(exp);
}
function verifyToken(token) {
  if (!token) return false;
  const i = String(token).indexOf('.');
  if (i < 1) return false;
  const exp = token.slice(0, i), sig = token.slice(i + 1);
  const a = Buffer.from(sig), b = Buffer.from(sign(exp));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  return Number(exp) > Date.now();
}
function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function isOwner(req) {
  try { return verifyToken(parseCookies(req.headers.cookie)[COOKIE]); } catch (e) { return false; }
}
function requireOwner(req, res) {
  if (isOwner(req)) return true;
  res.status(401).json({ error: 'login_required' });
  return false;
}
function passwordOk(pw) {
  const want = process.env.OWNER_PASSWORD;
  if (!want || typeof pw !== 'string') return false;
  const h = (s) => crypto.createHash('sha256').update(String(s)).digest();
  return crypto.timingSafeEqual(h(pw), h(want));
}
function sessionCookie(token) {
  return `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE_DAYS * 86400}`;
}
function clearCookie() {
  return `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

module.exports = { makeToken, isOwner, requireOwner, passwordOk, sessionCookie, clearCookie };

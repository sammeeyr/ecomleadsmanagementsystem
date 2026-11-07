/* Shared by the prospect form (/) and the owner pipeline (/pipeline). */
(function (w) {
'use strict';
var EC = {};

/* Digits with country code. Used for the optional "message us on WhatsApp" button after a prospect submits. */
EC.WA_NUMBER = '2348071472213';

EC.STAGES = [
  { id: 'new', label: 'New', days: 1 }, { id: 'contacted', label: 'Contacted', days: 2 },
  { id: 'demo', label: 'Demo booked', days: 1 }, { id: 'proposal', label: 'Proposal sent', days: 3 },
  { id: 'won', label: 'Won', days: 0 }, { id: 'lost', label: 'Lost', days: 0 }
];
EC.STAGE = {}; EC.STAGES.forEach(function (s) { EC.STAGE[s.id] = s; });
EC.OPEN = ['new', 'contacted', 'demo', 'proposal'];
EC.SOURCES = ['Prospect form', 'Showcase', 'Referral', 'WhatsApp', 'Instagram', 'LinkedIn', 'Website', 'Other'];
EC.SELL = ['Fashion and beauty', 'Food and groceries', 'Herbal and wellness', 'Electronics and gadgets', 'General retail', 'Services', 'Other'];
EC.VOLUME = ['Under 50 orders a month', '50 to 300 orders a month', '300 to 1,000 orders a month', 'Over 1,000 orders a month'];
EC.PAINS = ['Orders get lost', 'Slow replies to customers', 'No order tracking', 'Staff share one WhatsApp', 'No follow-up with customers', 'Hard to see sales'];

var $ = function (s, r) { return (r || document).querySelector(s); };
EC.$ = $;
EC.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
var esc = EC.esc;
var z = function (n) { return String(n).padStart(2, '0'); };
var ymd = function (d) { return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); };
EC.today = function () { return ymd(new Date()); };
EC.addDays = function (s, n) { var p = s.split('-').map(Number); return ymd(new Date(p[0], p[1] - 1, p[2] + n)); };
EC.daysBetween = function (a, b) { var x = a.split('-').map(Number), y = b.split('-').map(Number); return Math.round((Date.UTC(y[0], y[1] - 1, y[2]) - Date.UTC(x[0], x[1] - 1, x[2])) / 864e5); };
EC.naira = function (n) { return '₦' + Number(n || 0).toLocaleString('en-NG'); };
EC.shortDate = function (iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); };
EC.waNumber = function (p) {
  var d = String(p || '').replace(/\D/g, '');
  if (d.indexOf('00') === 0) d = d.slice(2);
  if (d.charAt(0) === '0' && d.length === 11) d = '234' + d.slice(1);
  else if (d.length === 10 && d.indexOf('234') !== 0) d = '234' + d;
  return d;
};
EC.waLink = function (num, text) { return 'https://wa.me/' + num + '?text=' + encodeURIComponent(text); };
EC.options = function (list, sel, blank) {
  return (blank ? '<option value="">' + esc(blank) + '</option>' : '') + list.map(function (o) {
    var v = typeof o === 'string' ? o : o.id, t = typeof o === 'string' ? o : o.label;
    return '<option value="' + esc(v) + '"' + (v === sel ? ' selected' : '') + '>' + esc(t) + '</option>';
  }).join('');
};
var toastT;
EC.toast = function (msg) { var t = $('#toast'); if (!t) return; t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 2600); };
EC.copyText = function (text, fallbackEl) {
  var ok = function () { EC.toast('Copied'); };
  var fail = function () { if (fallbackEl) { fallbackEl.focus(); if (fallbackEl.select) fallbackEl.select(); } EC.toast('Select the text and copy it'); };
  try { navigator.clipboard.writeText(text).then(ok, fail); } catch (e) { fail(); }
};

/* ---------- the form (same fields for prospects and for you adding a lead) ---------- */
EC.formHTML = function (p, owner) {
  var t = EC.today();
  return '<form class="form" id="' + p + 'form" novalidate>' +
    '<div class="grid2">' +
    '<div class="field"><label for="' + p + 'name">Full name</label><input id="' + p + 'name" type="text" autocomplete="name" required></div>' +
    '<div class="field"><label for="' + p + 'biz">Business name</label><input id="' + p + 'biz" type="text" autocomplete="organization" required></div>' +
    '<div class="field"><label for="' + p + 'phone">WhatsApp number</label><input id="' + p + 'phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="0803 000 0000" required></div>' +
    '<div class="field"><label for="' + p + 'email">Email <span class="hint">(optional)</span></label><input id="' + p + 'email" type="email" autocomplete="email"></div>' +
    '<div class="field"><label for="' + p + 'sell">What do you sell?</label><select id="' + p + 'sell">' + EC.options(EC.SELL, '', 'Choose one') + '</select></div>' +
    '<div class="field"><label for="' + p + 'vol">How many orders do you handle?</label><select id="' + p + 'vol">' + EC.options(EC.VOLUME, '', 'Choose one') + '</select></div>' +
    (owner ? '<div class="field"><label for="' + p + 'src">Source</label><select id="' + p + 'src">' + EC.options(EC.SOURCES, 'Showcase') + '</select></div>' +
      '<div class="field"><label for="' + p + 'int">Interest level</label><select id="' + p + 'int">' + EC.options([{ id: 'hot', label: 'Hot' }, { id: 'warm', label: 'Warm' }, { id: 'cold', label: 'Cold' }], 'warm') + '</select></div>' +
      '<div class="field"><label for="' + p + 'val">Estimated setup fee (₦)</label><input id="' + p + 'val" type="number" inputmode="numeric" min="0" step="50000" placeholder="500000"></div>' +
      '<div class="field"><label for="' + p + 'next">First follow-up</label><input id="' + p + 'next" type="date" value="' + EC.addDays(t, 1) + '"></div>' : '') +
    '</div>' +
    '<div class="field"><span class="legend">What hurts most right now?</span><div class="chipset">' +
    EC.PAINS.map(function (x) { return '<label class="chip"><input type="checkbox" name="' + p + 'pain" value="' + esc(x) + '">' + esc(x) + '</label>'; }).join('') + '</div></div>' +
    '<div class="field"><label for="' + p + 'notes">Anything else we should know?</label><textarea id="' + p + 'notes"></textarea></div>' +
    '<div class="honey" aria-hidden="true"><label for="' + p + 'site">Website</label><input id="' + p + 'site" type="text" tabindex="-1" autocomplete="off"></div>' +
    '<div class="err" id="' + p + 'err" role="alert"></div>' +
    '<div class="row"><button class="btn primary" type="submit">' + (owner ? 'Save lead' : 'Send my details') + '</button>' + (owner ? '<button class="btn" type="button" id="' + p + 'cancel">Cancel</button>' : '') + '</div>' +
    (owner ? '' : '<p class="fine">We use these details only to contact you about eComCRM.</p>') +
    '</form>';
};
EC.readForm = function (p, owner) {
  var v = function (id) { var e = $('#' + p + id); return e ? e.value.trim() : ''; };
  var pains = Array.prototype.map.call(document.querySelectorAll('input[name="' + p + 'pain"]:checked'), function (e) { return e.value; });
  return { name: v('name'), business: v('biz'), phone: v('phone'), email: v('email'), bizType: v('sell'), volume: v('vol'), pains: pains, notes: v('notes'), website: v('site'),
    source: owner ? v('src') : '', interest: owner ? v('int') : '', setupValue: owner ? Number(v('val')) || 0 : 0, nextFollowUp: owner ? v('next') : '' };
};
EC.validate = function (d) {
  if (!d.name) return 'Enter your name.';
  if (!d.business) return 'Enter your business name.';
  var digits = d.phone.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return 'Enter a WhatsApp number with 10 to 15 digits.';
  if (d.email && !/^\S+@\S+\.\S+$/.test(d.email)) return 'That email address looks incomplete.';
  return '';
};
EC.first = function (l) { return String(l.name || 'there').trim().split(/\s+/)[0]; };

w.EC = EC;
})(window);

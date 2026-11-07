/* Owner pipeline: login, follow-up queue, lead details, templates, add lead, CSV export. Talks to /api/leads. */
(function () {
'use strict';
var EC = window.EC, $ = EC.$, esc = EC.esc, STAGES = EC.STAGES, STAGE = EC.STAGE, OPEN = EC.OPEN;
var viewEl = $('#view');

var first = EC.first;
var biz = function (l) { return l.business || 'your business'; };
var TEMPLATES = {
  intro: { label: 'First message', text: function (l) { return 'Hello ' + first(l) + ', this is Samuel from Cube Tech Enterprises. Thank you for your interest in eComCRM. It brings your orders, live tracking and a shared WhatsApp inbox with AI into one place. Can I show you a quick 15-minute demo for ' + biz(l) + ' this week? What day and time suit you?'; } },
  checkin: { label: 'Check-in', text: function (l) { return 'Hello ' + first(l) + ', Samuel from Cube Tech here. Just checking in on eComCRM for ' + biz(l) + '. Do you have any questions I can answer, or should I book your demo?'; } },
  demo: { label: 'Demo reminder', text: function (l) { return 'Hello ' + first(l) + ', a quick reminder about your eComCRM demo. I will show you how orders, tracking and the WhatsApp inbox work for ' + biz(l) + '. Please confirm the time still suits you.'; } },
  proposal: { label: 'Proposal follow-up', text: function (l) { return 'Hello ' + first(l) + ', I hope you had a chance to review the eComCRM proposal for ' + biz(l) + '. After the one-time setup, the retainer is ₦135,000 a month for up to 10 users, and Meta WhatsApp messaging is billed pay-as-you-go. Can we go ahead, or is there anything you would like adjusted?'; } },
  nudge: { label: 'Gentle nudge', text: function (l) { return 'Hello ' + first(l) + ', Samuel from Cube Tech. I have not heard back about eComCRM for ' + biz(l) + ', so I wanted to check if the timing is still right. Happy to answer questions or send a short video of how it works.'; } },
  won: { label: 'Welcome', text: function (l) { return 'Welcome aboard, ' + first(l) + '. Thank you for choosing eComCRM for ' + biz(l) + '. I will send your onboarding steps shortly so we can set up your orders and WhatsApp inbox.'; } }
};
var DEFAULT_TPL = { 'new': 'intro', contacted: 'checkin', demo: 'demo', proposal: 'proposal', won: 'won', lost: 'nudge' };

var leads = [], ui = {}, openIds = {}, filter = 'all', query = '', pendingRender = false, writeQ = {}, pollT = null, mounted = false;

/* ---------- API ---------- */
async function api(method, url, body) {
  var r = await fetch(url, { method: method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 401) { showLogin(); throw { code: 'auth' }; }
  var j = await r.json().catch(function () { return null; });
  if (!r.ok) throw { code: (j && j.error) || 'error', message: (j && j.message) || '' };
  return j;
}

/* ---------- login ---------- */
function showLogin(msg) {
  clearInterval(pollT); mounted = false; leads = [];
  $('#nav').hidden = true;
  viewEl.className = '';
  viewEl.innerHTML = '<section class="panel login"><h1>Owner login</h1><p>Enter your password to open the pipeline.</p>' +
    '<form class="form" id="loginForm"><div class="field"><label for="pw">Password</label><input id="pw" type="password" autocomplete="current-password" required></div>' +
    '<div class="err" id="loginErr" role="alert">' + esc(msg || '') + '</div><div class="row"><button class="btn primary" type="submit">Open pipeline</button></div></form></section>';
  $('#pw').focus();
  $('#loginForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var btn = $('#loginForm button'); btn.disabled = true;
    try {
      var r = await fetch('/api/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: $('#pw').value }) });
      var j = await r.json().catch(function () { return {}; });
      if (r.ok) return start();
      $('#loginErr').textContent = j.message || 'Could not log in.'; btn.disabled = false;
    } catch (x) { $('#loginErr').textContent = 'Could not reach the server.'; btn.disabled = false; }
  });
}
$('#logoutBtn').addEventListener('click', async function () {
  try { await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }); } catch (e) { /* ignore */ }
  showLogin();
});

/* ---------- shell ---------- */
async function start() {
  try {
    var j = await api('GET', '/api/leads');
    leads = j.leads || [];
  } catch (e) {
    if (e && e.code === 'auth') return;
    viewEl.innerHTML = '<div class="empty"><h3>Leads could not load</h3><p>' + esc((e && e.message) || 'Reload the page to try again.') + '</p></div>';
    return;
  }
  mount();
  clearInterval(pollT);
  pollT = setInterval(refresh, 30000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden && mounted) refresh(); });
}
async function refresh() {
  if (!mounted || document.hidden) return;
  try { var j = await api('GET', '/api/leads'); leads = j.leads || []; if (inListField()) pendingRender = true; else renderAll(); } catch (e) { /* keep what is on screen */ }
}
function mount() {
  mounted = true;
  $('#nav').hidden = false;
  viewEl.className = '';
  viewEl.innerHTML =
    '<div class="summary" id="summary"></div>' +
    '<section class="panel" id="addPanel" hidden></section>' +
    '<div class="toolbar"><input id="q" type="search" placeholder="Search name, business or number" aria-label="Search leads" value="' + esc(query) + '">' +
    '<button class="btn primary" type="button" id="addBtn">Add lead</button>' +
    '<button class="btn" type="button" id="exportBtn">Export CSV</button></div>' +
    '<div class="chips" id="chips" role="group" aria-label="Filter by stage"></div>' +
    '<div class="list" id="list"></div>' +
    '<p class="hintbox">Prospects who fill in the form at <b>' + esc(location.origin) + '/</b> appear here automatically with a follow-up date for tomorrow. Use <b>Add lead</b> for people you meet in person or chat with elsewhere.</p>';
  $('#q').addEventListener('input', function (e) { query = e.target.value; renderList(); });
  $('#addBtn').onclick = openAddPanel;
  $('#exportBtn').onclick = exportCsv;
  $('#chips').addEventListener('click', function (e) { var b = e.target.closest('[data-f]'); if (b) { filter = b.getAttribute('data-f'); renderAll(); } });
  var list = $('#list');
  list.addEventListener('click', onListClick);
  list.addEventListener('change', onListChange);
  list.addEventListener('input', onListInput);
  list.addEventListener('focusout', function () { if (pendingRender) setTimeout(function () { if (!inListField()) renderAll(); }, 0); });
  renderAll();
}
function inListField() { var a = document.activeElement, l = $('#list'); return !!(a && l && l.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)); }

/* ---------- rendering ---------- */
function dueInfo(l) {
  if (OPEN.indexOf(l.stage) < 0 || !l.nextFollowUp) return null;
  var d = EC.daysBetween(EC.today(), l.nextFollowUp);
  if (d < 0) return { d: d, cls: 'over', label: 'Overdue ' + (-d) + (d === -1 ? ' day' : ' days') };
  if (d === 0) return { d: d, cls: 'today', label: 'Due today' };
  if (d === 1) return { d: d, cls: '', label: 'Due tomorrow' };
  return { d: d, cls: '', label: 'Due in ' + d + ' days' };
}
function renderAll() { pendingRender = false; renderSummary(); renderChips(); renderList(); }
function renderSummary() {
  var el = $('#summary'); if (!el) return;
  var open = leads.filter(function (l) { return OPEN.indexOf(l.stage) >= 0; });
  var overdue = open.filter(function (l) { var i = dueInfo(l); return i && i.d < 0; }).length;
  var dueToday = open.filter(function (l) { var i = dueInfo(l); return i && i.d === 0; }).length;
  var pipe = open.reduce(function (a, l) { return a + (Number(l.setupValue) || 0); }, 0);
  el.innerHTML =
    '<div class="stat' + (overdue ? ' alert' : '') + '"><span>Overdue</span><b>' + overdue + '</b></div>' +
    '<div class="stat"><span>Due today</span><b>' + dueToday + '</b></div>' +
    '<div class="stat"><span>Open leads</span><b>' + open.length + '</b></div>' +
    '<div class="stat"><span>Open setup fees</span><b>' + EC.naira(pipe) + '</b></div>';
}
function renderChips() {
  var el = $('#chips'); if (!el) return;
  var due = leads.filter(function (l) { var i = dueInfo(l); return i && i.d <= 0; }).length;
  var defs = [{ id: 'all', label: 'All', n: leads.length }, { id: 'due', label: 'Due now', n: due }].concat(STAGES.map(function (s) { return { id: s.id, label: s.label, n: leads.filter(function (l) { return l.stage === s.id; }).length }; }));
  el.innerHTML = defs.map(function (c) { return '<button class="fchip" type="button" data-f="' + c.id + '" aria-pressed="' + (filter === c.id) + '">' + esc(c.label) + '<em>' + c.n + '</em></button>'; }).join('');
}
function sortLeads(a, b) {
  var ao = OPEN.indexOf(a.stage) >= 0, bo = OPEN.indexOf(b.stage) >= 0;
  if (ao !== bo) return ao ? -1 : 1;
  if (ao) { var x = a.nextFollowUp || '9999', y = b.nextFollowUp || '9999'; if (x !== y) return x < y ? -1 : 1; }
  return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
}
function matches(l) {
  if (filter === 'due') { var i = dueInfo(l); if (!(i && i.d <= 0)) return false; }
  else if (filter !== 'all' && l.stage !== filter) return false;
  if (!query) return true;
  return [l.name, l.business, l.phone, l.email].join(' ').toLowerCase().indexOf(query.toLowerCase().replace(/\s+/g, ' ')) >= 0;
}
function renderList() {
  var el = $('#list'); if (!el) return;
  var rows = leads.filter(matches).sort(sortLeads);
  if (!rows.length) {
    el.innerHTML = leads.length
      ? '<div class="empty"><h3>No leads match</h3><p>Clear the search or pick another stage.</p></div>'
      : '<div class="empty"><h3>No leads yet</h3><p>Prospects who fill in your form appear here with a follow-up date. You can also add the first lead yourself.</p><button class="btn primary" type="button" id="emptyAdd">Add lead</button></div>';
    var b = $('#emptyAdd'); if (b) b.onclick = openAddPanel;
    return;
  }
  el.innerHTML = rows.map(cardHTML).join('');
}
function tplState(l) {
  var st = ui[l.id] || (ui[l.id] = {});
  if (!st.tpl) st.tpl = DEFAULT_TPL[l.stage] || 'checkin';
  return { tpl: st.tpl, text: st.edited ? st.text : TEMPLATES[st.tpl].text(l) };
}
function cardHTML(l) {
  var due = dueInfo(l), isOpen = !!openIds[l.id], num = EC.waNumber(l.phone), s = tplState(l);
  var pills = '<span class="pill ' + (l.interest === 'hot' ? 'hot' : l.interest === 'warm' ? 'warm' : '') + '">' + esc(({ hot: 'Hot', warm: 'Warm', cold: 'Cold' })[l.interest] || 'Warm') + '</span>' +
    '<span class="pill ' + (l.stage === 'won' ? 'won' : '') + '">' + esc((STAGE[l.stage] || STAGE['new']).label) + '</span>' +
    (due ? '<span class="pill ' + due.cls + '">' + esc(due.label) + '</span>' : '');
  var sub = [l.business, l.bizType, l.volume].filter(Boolean).map(esc).join(' &middot; ');
  var isOpenStage = OPEN.indexOf(l.stage) >= 0;
  return '<article class="lead" data-id="' + esc(l.id) + '">' +
    '<div class="lead-head"><div class="lead-id"><h3>' + esc(l.name) + '</h3><p>' + sub + '</p><p>' + esc(l.phone) + (l.source ? ' &middot; ' + esc(l.source) : '') + (l.setupValue ? ' &middot; ' + EC.naira(l.setupValue) : '') + '</p></div><div class="pills">' + pills + '</div></div>' +
    '<div class="lead-actions">' +
    (num ? '<a class="btn wa small" data-wa target="_blank" rel="noopener" href="' + EC.waLink(num, s.text) + '">WhatsApp</a>' : '') +
    (isOpenStage ? '<button class="btn small" type="button" data-act="done">Followed up</button><button class="btn small" type="button" data-act="snooze2">+2 days</button><button class="btn small" type="button" data-act="snooze7">+7 days</button>' : '') +
    '<button class="btn small" type="button" data-act="toggle" aria-expanded="' + isOpen + '">' + (isOpen ? 'Hide details' : 'Details') + '</button></div>' +
    (isOpen ? detailHTML(l, s) : '') + '</article>';
}
function detailHTML(l, s) {
  var id = esc(l.id);
  var log = (l.log || []).map(function (e) { return '<li><time>' + esc(EC.shortDate(e.t)) + '</time><span>' + esc(e.text) + '</span></li>'; }).join('');
  return '<div class="detail">' +
    '<div class="grid2">' +
    '<div class="field"><label for="st-' + id + '">Stage</label><select id="st-' + id + '" data-field="stage">' + EC.options(STAGES, l.stage) + '</select></div>' +
    '<div class="field"><label for="in-' + id + '">Interest</label><select id="in-' + id + '" data-field="interest">' + EC.options([{ id: 'hot', label: 'Hot' }, { id: 'warm', label: 'Warm' }, { id: 'cold', label: 'Cold' }], l.interest || 'warm') + '</select></div>' +
    '<div class="field"><label for="nx-' + id + '">Next follow-up</label><input id="nx-' + id + '" type="date" data-field="nextFollowUp" value="' + esc(l.nextFollowUp || '') + '"></div>' +
    '<div class="field"><label for="vl-' + id + '">Estimated setup fee (₦)</label><input id="vl-' + id + '" type="number" inputmode="numeric" min="0" step="50000" data-field="setupValue" value="' + esc(l.setupValue || '') + '"></div>' +
    '</div>' +
    ((l.pains && l.pains.length) ? '<div><div class="sect-title">Problems they named</div><div class="pills">' + l.pains.map(function (p) { return '<span class="pill">' + esc(p) + '</span>'; }).join('') + '</div></div>' : '') +
    '<div class="field"><label for="nt-' + id + '">Notes</label><textarea id="nt-' + id + '" data-field="notes">' + esc(l.notes || '') + '</textarea></div>' +
    '<div><div class="sect-title">Follow-up message</div>' +
    '<div class="field"><label for="tp-' + id + '">Template</label><select id="tp-' + id + '" data-field="tpl">' + EC.options(Object.keys(TEMPLATES).map(function (k) { return { id: k, label: TEMPLATES[k].label }; }), s.tpl) + '</select></div>' +
    '<div class="field" style="margin-top:8px"><label for="ms-' + id + '">Message</label><textarea id="ms-' + id + '" data-field="msg">' + esc(s.text) + '</textarea></div>' +
    '<div class="row" style="margin-top:8px"><button class="btn small" type="button" data-act="copy">Copy message</button></div></div>' +
    '<div><div class="sect-title">Activity</div><ul class="log">' + (log || '<li><span></span><span>No activity yet.</span></li>') + '</ul>' +
    '<div class="note-row"><input type="text" id="an-' + id + '" placeholder="Add a note, for example: asked for a Friday demo" aria-label="Add activity note"><button class="btn small" type="button" data-act="note">Add note</button></div></div>' +
    '<div class="row"><button class="btn small danger" type="button" data-act="del">Delete lead</button></div>' +
    '</div>';
}

/* ---------- list events and saving ---------- */
function leadOf(el) { var c = el.closest('.lead'); if (!c) return null; var id = c.getAttribute('data-id'); return leads.filter(function (x) { return x.id === id; })[0] || null; }
// Changes show at once, then the server's copy replaces ours. Writes to one lead go out one at a time.
function patch(l, fields, logText) {
  var id = l.id, now = new Date().toISOString();
  if (fields.stage && ui[id]) { ui[id].tpl = DEFAULT_TPL[fields.stage]; ui[id].edited = false; }
  Object.assign(l, fields, { updatedAt: now });
  if (logText) l.log = [{ t: now, text: logText }].concat(l.log || []).slice(0, 60);
  if (inListField()) pendingRender = true; else renderAll();
  writeQ[id] = (writeQ[id] || Promise.resolve()).then(function () {
    return api('PATCH', '/api/leads/' + id, { fields: fields, logText: logText || '' });
  }).then(function (j) {
    var i = leads.findIndex(function (x) { return x.id === id; });
    if (i >= 0 && j && j.lead) leads[i] = j.lead;
    if (inListField()) pendingRender = true; else renderAll();
  }).catch(function (e) {
    if (e && e.code === 'auth') return;
    EC.toast('Could not save that change. Reloading your leads.'); refresh();
  });
}
function onListClick(e) {
  var btn = e.target.closest('[data-act]'); if (!btn) return;
  var l = leadOf(btn); if (!l) return;
  var act = btn.getAttribute('data-act'), t = EC.today();
  if (act === 'toggle') { openIds[l.id] = !openIds[l.id]; renderList(); }
  else if (act === 'done') {
    var f = { nextFollowUp: EC.addDays(t, (STAGE[l.stage] || {}).days || 3) };
    if (l.stage === 'new') f.stage = 'contacted';
    patch(l, f, 'Followed up' + (l.stage === 'new' ? ' (moved to Contacted)' : '')); EC.toast('Logged. Next follow-up set.');
  }
  else if (act === 'snooze2') patch(l, { nextFollowUp: EC.addDays(t, 2) }, 'Snoozed 2 days');
  else if (act === 'snooze7') patch(l, { nextFollowUp: EC.addDays(t, 7) }, 'Snoozed 7 days');
  else if (act === 'copy') { var ta = $('#ms-' + l.id); EC.copyText(ta.value, ta); }
  else if (act === 'note') {
    var inp = $('#an-' + l.id), v = inp.value.trim(); if (!v) return;
    inp.value = ''; patch(l, {}, v);
  }
  else if (act === 'del') { btn.setAttribute('data-act', 'delok'); btn.textContent = 'Tap again to delete'; }
  else if (act === 'delok') {
    api('DELETE', '/api/leads/' + l.id).then(function () {
      leads = leads.filter(function (x) { return x.id !== l.id; }); EC.toast('Lead deleted'); renderAll();
    }, function (err) { if (!err || err.code !== 'auth') EC.toast('Could not delete.'); });
  }
}
function onListChange(e) {
  var f = e.target.getAttribute('data-field'); if (!f) return;
  var l = leadOf(e.target); if (!l) return;
  var v = e.target.value;
  if (f === 'stage') {
    var d = (STAGE[v] || {}).days, fields = { stage: v, nextFollowUp: d ? EC.addDays(EC.today(), d) : '' };
    var prev = (STAGE[l.stage] || STAGE['new']).label;
    if (ui[l.id]) { ui[l.id].tpl = DEFAULT_TPL[v]; ui[l.id].edited = false; }
    patch(l, fields, 'Stage: ' + prev + ' to ' + STAGE[v].label);
  }
  else if (f === 'interest') patch(l, { interest: v });
  else if (f === 'nextFollowUp') patch(l, { nextFollowUp: v }, v ? 'Follow-up set for ' + v : 'Follow-up cleared');
  else if (f === 'setupValue') patch(l, { setupValue: Number(v) || 0 });
  else if (f === 'notes') patch(l, { notes: v });
  else if (f === 'tpl') { var st = ui[l.id] || (ui[l.id] = {}); st.tpl = v; st.edited = false; renderList(); }
}
function onListInput(e) {
  if (e.target.getAttribute('data-field') !== 'msg') return;
  var l = leadOf(e.target); if (!l) return;
  var st = ui[l.id] || (ui[l.id] = {}); st.edited = true; st.text = e.target.value;
  var a = e.target.closest('.lead').querySelector('a[data-wa]'); if (a) a.href = EC.waLink(EC.waNumber(l.phone), e.target.value);
}

/* ---------- add lead ---------- */
function parsePasted(text) {
  var map = { name: 'name', business: 'biz', whatsapp: 'phone', phone: 'phone', email: 'email', notes: 'notes' }, out = {};
  String(text).split(/\r?\n/).forEach(function (line) {
    var m = line.match(/^\s*([A-Za-z ]+?)\s*:\s*(.+)$/); if (!m) return;
    var k = m[1].toLowerCase(), v = m[2].trim();
    if (map[k]) out[map[k]] = v;
    else if (k === 'we sell') out.sell = v;
    else if (k === 'orders') out.vol = v;
    else if (k.indexOf('problem') >= 0) out.pains = v.split(/\s*,\s*/);
  });
  return out;
}
function openAddPanel() {
  var p = $('#addPanel'); p.hidden = false;
  p.innerHTML = '<h2 style="font-size:18px;margin-bottom:10px">Add a lead</h2>' +
    '<div class="field" style="margin-bottom:14px"><label for="o-paste">Paste a message with their details <span class="hint">(optional, fills the form)</span></label><textarea id="o-paste" style="min-height:70px"></textarea><div><button class="btn small" type="button" id="o-fill" style="margin-top:6px">Fill form</button></div></div>' +
    EC.formHTML('o-', true);
  $('#o-fill').onclick = function () {
    var r = parsePasted($('#o-paste').value);
    ['name', 'biz', 'phone', 'email', 'notes'].forEach(function (k) { if (r[k]) $('#o-' + k).value = r[k]; });
    if (r.sell) { var s = $('#o-sell'); Array.prototype.forEach.call(s.options, function (o) { if (o.value === r.sell) s.value = o.value; }); }
    if (r.vol) { var vs = $('#o-vol'); Array.prototype.forEach.call(vs.options, function (o) { if (o.value === r.vol) vs.value = o.value; }); }
    if (r.pains) Array.prototype.forEach.call(document.querySelectorAll('input[name="o-pain"]'), function (c) { c.checked = r.pains.indexOf(c.value) >= 0; });
    if (r.name || r.phone) { $('#o-src').value = 'WhatsApp'; EC.toast('Form filled'); } else EC.toast('No details found in that message');
  };
  $('#o-cancel').onclick = function () { p.hidden = true; p.innerHTML = ''; };
  $('#o-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var d = EC.readForm('o-', true), msg = EC.validate(d);
    if (msg) { $('#o-err').textContent = msg; return; }
    var btn = $('#o-form button[type="submit"]'); btn.disabled = true;
    api('POST', '/api/leads', d).then(function (j) {
      leads.unshift(j.lead); p.hidden = true; p.innerHTML = ''; filter = 'all'; EC.toast('Lead saved'); renderAll();
    }, function (err) {
      btn.disabled = false;
      if (!err || err.code !== 'auth') $('#o-err').textContent = (err && err.message) || 'Could not save the lead. Try again.';
    });
  });
  $('#o-name').focus();
}

/* ---------- export ---------- */
function exportCsv() {
  if (!leads.length) { EC.toast('No leads to export yet'); return; }
  var cols = [['name', 'Name'], ['business', 'Business'], ['phone', 'WhatsApp'], ['email', 'Email'], ['stage', 'Stage'], ['interest', 'Interest'], ['source', 'Source'], ['nextFollowUp', 'Next follow-up'], ['setupValue', 'Est. setup fee'], ['bizType', 'Sells'], ['volume', 'Orders'], ['notes', 'Notes'], ['createdAt', 'Created']];
  var q = function (v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  var rows = [cols.map(function (c) { return c[1]; }).join(',')].concat(leads.slice().sort(sortLeads).map(function (l) { return cols.map(function (c) { return q(l[c[0]]); }).join(','); }));
  var url = URL.createObjectURL(new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  var a = document.createElement('a'); a.href = url; a.download = 'ecomcrm-leads-' + EC.today() + '.csv';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  EC.toast('Leads exported');
}

start();
})();

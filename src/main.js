import './styles.css';
import { invoke } from '@tauri-apps/api/core';
import { createUniver, LocaleType, mergeLocales } from '@univerjs/presets';
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core';
import coreEn from '@univerjs/preset-sheets-core/locales/en-US';
import '@univerjs/preset-sheets-core/lib/index.css';
import { SECTIONS, blankPage } from './templates.js';

const $ = (s) => document.querySelector(s);
const app = $('#app');
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const IDLE_MS = 10 * 60 * 1000;
let data, last = '', wb = null, U = null, cur = { sec: SECTIONS[0].key, idx: 0 }, saveT, idleT;

const secOf = (k) => SECTIONS.find((s) => s.key === k);
const pages = () => data.sections[cur.sec].pages;
const mkPage = (s, n) => { const id = crypto.randomUUID(); return { id, title: 'Page ' + n, wb: blankPage(s, id) }; };
const newData = () => ({ v: 1, sections: Object.fromEntries(SECTIONS.map((s) => [s.key, { pages: [mkPage(s, 1)] }])) });

/* ---------- password screens ---------- */
function screen(html) {
  app.className = 'auth';
  app.innerHTML = `<div class="card"><h1>Reflecting</h1><p class="verse">“Search me, O God, and know my heart.” <span>Psalm 139:23</span></p>${html}<p id="err" class="err"></p></div>`;
}
const err = (m) => ($('#err').textContent = m);

function setup() {
  screen(`<h2>Create your password</h2><p>This password protects everything you write. It cannot be reset without your recovery key, so choose one you will remember.</p>
    <input id="p1" type="password" placeholder="Password (10+ characters)"><input id="p2" type="password" placeholder="Confirm password"><button id="go">Continue</button>`);
  $('#go').onclick = async () => {
    const a = $('#p1').value;
    if (a.length < 10) return err('Use at least 10 characters.');
    if (a !== $('#p2').value) return err('Passwords do not match.');
    try { data = newData(); const rec = await invoke('create_vault', { password: a, data: JSON.stringify(data) }); last = JSON.stringify(data); showKey(rec); }
    catch (x) { err(String(x)); }
  };
}
function showKey(rec) {
  screen(`<h2>Save your recovery key</h2><p>If you forget your password, this key is the only way back in. Write it down or print it and keep it somewhere safe. It is shown only once.</p>
    <div class="key">${rec}</div><label class="chk"><input type="checkbox" id="ok"> I have saved my recovery key</label><button id="go" disabled>Open Reflecting</button>`);
  $('#ok').onchange = (e) => ($('#go').disabled = !e.target.checked);
  $('#go').onclick = startApp;
}
function login() {
  screen(`<h2>Welcome back</h2><input id="p" type="password" placeholder="Password"><button id="go">Unlock</button><a id="fg">Forgot password? Use recovery key</a>`);
  const go = async () => { try { data = JSON.parse(await invoke('unlock', { password: $('#p').value })); last = JSON.stringify(data); startApp(); } catch (x) { err(String(x)); } };
  $('#go').onclick = go; $('#p').onkeydown = (e) => { if (e.key === 'Enter') go(); }; $('#p').focus(); $('#fg').onclick = recover;
}
function recover() {
  screen(`<h2>Recover access</h2><input id="k" placeholder="Recovery key"><input id="p1" type="password" placeholder="New password (10+ characters)"><input id="p2" type="password" placeholder="Confirm new password"><button id="go">Reset password</button><a id="bk">Back</a>`);
  $('#bk').onclick = login;
  $('#go').onclick = async () => {
    if ($('#p1').value !== $('#p2').value) return err('Passwords do not match.');
    try { data = JSON.parse(await invoke('recover', { recovery: $('#k').value, password: $('#p1').value })); last = JSON.stringify(data); startApp(); }
    catch (x) { err(String(x)); }
  };
}

/* ---------- main app ---------- */
function capture() { if (wb) pages()[cur.idx].wb = wb.save(); }
async function persist() {
  capture(); const s = JSON.stringify(data);
  if (s !== last) { await invoke('save', { data: s }); last = s; }
  const el = $('#saved'); if (el) el.textContent = 'Saved ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function openPage() {
  if (wb) { U.univerAPI.disposeUnit(wb.getId()); wb = null; }
  const p = pages()[cur.idx];
  wb = U.univerAPI.createWorkbook(p.wb);
  $('#pos').textContent = `Page ${cur.idx + 1} of ${pages().length}`;
  $('#title').value = p.title;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.k === cur.sec));
}
async function goTo(sec, idx) { await persist(); cur = { sec, idx }; openPage(); }

function startApp() {
  app.className = 'main';
  app.innerHTML = `<header><b class="logo">Reflecting</b><nav>${SECTIONS.map((s) => `<button class="tab" data-k="${s.key}">${s.name}</button>`).join('')}</nav><span class="sp"></span>
    <button id="book">Book view</button><button id="pw">Password</button><button id="lock">Lock</button></header>
    <div class="pagebar"><button id="prev">◀</button><span id="pos"></span><button id="next">▶</button><input id="title" maxlength="60"><button id="add">+ Add page</button><button id="del">Delete page</button><span id="saved"></span></div><div id="grid"></div>`;
  U = createUniver({ locale: LocaleType.EN_US, locales: { [LocaleType.EN_US]: mergeLocales(coreEn) }, presets: [UniverSheetsCorePreset({ container: 'grid' })] });
  cur = { sec: SECTIONS[0].key, idx: 0 }; openPage();
  document.querySelectorAll('.tab').forEach((t) => (t.onclick = () => goTo(t.dataset.k, 0)));
  $('#prev').onclick = () => cur.idx > 0 && goTo(cur.sec, cur.idx - 1);
  $('#next').onclick = () => cur.idx < pages().length - 1 && goTo(cur.sec, cur.idx + 1);
  $('#title').onchange = (e) => { pages()[cur.idx].title = e.target.value || 'Untitled'; persist(); };
  $('#add').onclick = async () => { capture(); pages().push(mkPage(secOf(cur.sec), pages().length + 1)); await goTo(cur.sec, pages().length - 1); };
  $('#del').onclick = async () => {
    if (!(await ask('Delete this page? This cannot be undone.'))) return;
    if (wb) { U.univerAPI.disposeUnit(wb.getId()); wb = null; }
    pages().splice(cur.idx, 1);
    if (!pages().length) pages().push(mkPage(secOf(cur.sec), 1));
    cur.idx = Math.min(cur.idx, pages().length - 1); openPage(); persist();
  };
  $('#book').onclick = bookView; $('#pw').onclick = pwDialog; $('#lock').onclick = lock;
  saveT = setInterval(() => persist().catch(() => {}), 5000);
  const bump = () => { clearTimeout(idleT); idleT = setTimeout(lock, IDLE_MS); };
  ['mousemove', 'keydown', 'mousedown'].forEach((ev) => window.addEventListener(ev, bump)); bump();
}
async function lock() {
  try { await persist(); } catch {}
  clearInterval(saveT); clearTimeout(idleT);
  await invoke('lock'); try { U?.univer.dispose(); } catch {}
  U = null; wb = null; data = null; last = ''; login();
}

/* ---------- book view & dialogs ---------- */
function snippet(p) {
  const rows = Object.values(p.wb.sheets)[0].cellData || {};
  for (const r of Object.keys(rows).map(Number).sort((a, b) => a - b)) {
    if (r < 2) continue;
    for (const c of Object.keys(rows[r])) if (rows[r][c]?.v) return String(rows[r][c].v).slice(0, 90);
  }
  return 'Blank page';
}
function modal(html) { const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div class="box">${html}</div>`; document.body.appendChild(m); return m; }
function ask(msg) {
  return new Promise((res) => {
    const m = modal(`<h2>${esc(msg)}</h2><button id="y">Yes, delete</button> <button class="x">Cancel</button>`);
    m.querySelector('#y').onclick = () => { m.remove(); res(true); };
    m.querySelector('.x').onclick = () => { m.remove(); res(false); };
  });
}
function bookView() {
  capture(); const s = secOf(cur.sec);
  const m = modal(`<h2>${s.name} · ${pages().length} page${pages().length > 1 ? 's' : ''}</h2><div class="cards">${pages().map((p, i) => `<div class="pg" data-i="${i}"><b>${esc(p.title)}</b><small>${esc(snippet(p))}</small></div>`).join('')}</div><button class="x">Close</button>`);
  m.querySelector('.x').onclick = () => m.remove();
  m.querySelectorAll('.pg').forEach((c) => (c.onclick = () => { m.remove(); goTo(cur.sec, +c.dataset.i); }));
}
function pwDialog() {
  const m = modal(`<h2>Change password</h2><input id="o" type="password" placeholder="Current password"><input id="n1" type="password" placeholder="New password (10+ characters)"><input id="n2" type="password" placeholder="Confirm new password"><p class="err" id="e2"></p><button id="ok">Change</button> <button class="x">Cancel</button>`);
  m.querySelector('.x').onclick = () => m.remove();
  m.querySelector('#ok').onclick = async () => {
    const e2 = m.querySelector('#e2');
    if (m.querySelector('#n1').value !== m.querySelector('#n2').value) return (e2.textContent = 'Passwords do not match.');
    try { await invoke('change_password', { oldPassword: m.querySelector('#o').value, newPassword: m.querySelector('#n1').value }); m.querySelector('.box').innerHTML = '<h2>Password changed</h2><p>Your recovery key still works.</p><button class="x">OK</button>'; m.querySelector('.x').onclick = () => m.remove(); }
    catch (x) { e2.textContent = String(x); }
  };
}

invoke('status').then((s) => (s === 'new' ? setup() : login()));

'use strict';

// ---------- Constantes ----------
const DAY = 86400000;
const STEPS = [1, 3, 7, 16, 35, 80];       // jours entre deux révisions réussies
const STORE = 'n5.progress.v1';
const LESSONS = Array.from({ length: 12 }, (_, i) => i + 1);

let VOCAB = [];
let BY_ID = {};
let state = load();
let ui = { screen: 'home', lesson: 1, query: '', session: null, pending: new Set(), flash: '' };

// ---------- Stockage ----------
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE));
    if (s && s.cards) return s;
  } catch (e) { /* stockage indisponible */ }
  return { cards: {}, mode: 'clavier', lastExport: null, created: Date.now() };
}
function save() {
  try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { alert('Sauvegarde impossible sur ce téléphone.'); }
}

// ---------- Dates ----------
function startOfDay(t) { const d = new Date(t); d.setHours(4, 0, 0, 0); if (d.getTime() > t) d.setDate(d.getDate() - 1); return d.getTime(); }
// Premier test : le soir même à 17 h, ou 4 h plus tard si le mot est coché l'après-midi.
function firstDue(now) {
  const evening = new Date(now); evening.setHours(17, 0, 0, 0);
  return Math.max(evening.getTime(), now + 4 * 3600000);
}
// Les révisions espacées sont dues dès 4 h du matin du jour prévu.
function dueInDays(now, days) { return startOfDay(now) + days * DAY; }

// ---------- Cartes ----------
function addCard(id, now = Date.now()) {
  if (state.cards[id]) return;
  state.cards[id] = { step: -1, due: firstDue(now), added: now, reviews: 0, lapses: 0 };
}
function removeCard(id) { delete state.cards[id]; }
function grade(id, success, now = Date.now()) {
  const c = state.cards[id];
  c.reviews++;
  c.last = now;
  if (success) {
    c.step = Math.min(c.step + 1, STEPS.length - 1);
    c.due = dueInDays(now, STEPS[c.step]);
  } else {
    c.lapses++;
    c.step = -1;
    c.due = dueInDays(now, 1);
  }
}
function dueIds(now = Date.now()) {
  return Object.entries(state.cards)
    .filter(([, c]) => c.due <= now)
    // Les mots jamais testés (vus dans Genki aujourd'hui) passent en premier.
    .sort(([, a], [, b]) => (b.reviews === 0) - (a.reviews === 0) || a.due - b.due)
    .map(([id]) => id);
}
function nextDue() {
  const ds = Object.values(state.cards).map(c => c.due).filter(d => d > Date.now());
  return ds.length ? Math.min(...ds) : null;
}

// ---------- Correction du mode clavier ----------
const STOP = /^(le|la|les|l|un|une|des|du|de|d|se|s|qqch|qqn|etre|faire)$/;
function norm(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/œ/g, 'oe').replace(/\([^)]*\)/g, ' ').replace(/[~…'’.!?]/g, ' ')
    .replace(/[^a-z0-9 -]/g, ' ').replace(/\s+/g, ' ').trim();
}
function core(s) { return norm(s).split(' ').filter(w => w && !STOP.test(w)).join(' '); }
function senses(fr) { return fr.split(/[;,]/).map(s => s.trim()).filter(Boolean); }
function isCorrect(answer, fr) {
  const a = core(answer);
  if (!a) return false;
  return senses(fr).some(s => { const c = core(s); return c && (c === a || (a.length >= 4 && c.split(' ').includes(a))); });
}

// ---------- Rendu ----------
const $app = document.getElementById('app');
function h(html) { $app.innerHTML = html; window.scrollTo(0, 0); }
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function fmtWhen(t) {
  if (!t) return '';
  const d = new Date(t), now = new Date();
  const hm = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `aujourd'hui à ${hm}`;
  const tom = new Date(now); tom.setDate(now.getDate() + 1);
  if (d.toDateString() === tom.toDateString()) return 'demain';
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function render() {
  if (ui.screen === 'home') return home();
  if (ui.screen === 'add') return addScreen();
  if (ui.screen === 'review') return reviewScreen();
  if (ui.screen === 'done') return doneScreen();
  if (ui.screen === 'backup') return backupScreen();
}

function home() {
  const due = dueIds().length;
  const total = Object.keys(state.cards).length;
  const known = Object.values(state.cards).filter(c => c.step >= 2).length;
  const nd = nextDue();
  const exportOld = total > 0 && Date.now() - (state.lastExport || state.created) > 7 * DAY;
  h(`
    <div class="top"><h1>Révisions N5</h1><button class="link" data-go="backup">Sauvegarde</button></div>
    ${ui.flash ? `<div class="notice">${esc(ui.flash)}</div>` : ''}
    <section class="panel">
      <div class="big">${due}</div>
      <div>${due === 1 ? 'révision due' : 'révisions dues'}</div>
      ${due === 0 && nd ? `<div class="muted">Prochaine révision ${fmtWhen(nd)}</div>` : ''}
    </section>
    <div class="stats">
      <section class="panel"><h2>${total}</h2><div class="muted">mots ajoutés</div></section>
      <section class="panel"><h2>${known}</h2><div class="muted">mots acquis (revus 3 fois)</div></section>
    </div>
    <div>
      <div class="muted" style="margin-bottom:6px">Mode de révision</div>
      <div class="seg" role="group">
        <button data-mode="clavier" aria-pressed="${state.mode === 'clavier'}">Clavier</button>
        <button data-mode="rapide" aria-pressed="${state.mode === 'rapide'}">Rapide</button>
      </div>
    </div>
    ${exportOld ? `<div class="notice">Pense à exporter ta sauvegarde : sur iPhone, les données d'un site peuvent être effacées. <button class="link" data-go="backup">Exporter</button></div>` : ''}
    <div class="sticky">
      <button class="primary" data-start ${due ? '' : 'disabled'}>Réviser${due ? ` (${due})` : ''}</button>
      <button data-go="add">Ajouter les mots vus dans Genki</button>
    </div>`);
  $app.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { state.mode = b.dataset.mode; save(); home(); });
  bindGo();
  const s = $app.querySelector('[data-start]');
  if (s) s.onclick = startSession;
  ui.flash = '';
}

function bindGo() { $app.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { ui.screen = b.dataset.go; render(); }); }

function wordsForView() {
  const q = core(ui.query) || '';
  const qRaw = ui.query.trim();
  if (qRaw) {
    return VOCAB.filter(v => v.alt.includes(qRaw) || v.kana.includes(qRaw) || (q && core(v.fr).includes(q)));
  }
  if (ui.lesson === 'autres') return VOCAB.filter(v => !v.l || v.l > 12);
  return VOCAB.filter(v => v.l === ui.lesson);
}

// Les mots cochés restent en attente (ui.pending) jusqu'au bouton « Ajouter » ;
// décocher un mot déjà ajouté le retire tout de suite.
function addScreen() {
  const list = wordsForView();
  const on = v => !!state.cards[v.id] || ui.pending.has(v.id);
  const allOn = list.length && list.every(on);
  const n = ui.pending.size;
  h(`
    <div class="top"><button class="link" id="back">‹ Accueil</button><h1>Mots vus</h1><span></span></div>
    <input type="search" id="q" placeholder="Chercher : いぬ, 犬, chien…" value="${esc(ui.query)}" autocomplete="off">
    ${ui.query ? '' : `<div class="chips" role="group">
      ${LESSONS.map(l => `<button data-l="${l}" aria-pressed="${ui.lesson === l}">Leçon ${l}</button>`).join('')}
      <button data-l="autres" aria-pressed="${ui.lesson === 'autres'}">Autres mots N5</button>
    </div>`}
    <div class="row"><span class="muted" id="count"></span>
      ${list.length ? `<button class="link" id="all" style="text-align:right">${allOn ? 'Tout décocher' : 'Tout cocher'}</button>` : ''}</div>
    <ul class="words">
      ${list.map(v => `<li><label><input type="checkbox" data-id="${v.id}" ${on(v) ? 'checked' : ''}>
        <span><span class="w-jp">${esc(v.alt)}</span>${v.kana !== v.alt ? ` <span class="w-sub jp">${esc(v.kana)}</span>` : ''}${state.cards[v.id] ? ' <span class="tag">ajouté</span>' : ''}<br><span class="w-sub">${esc(v.fr)}</span></span></label></li>`).join('')}
    </ul>
    ${list.length ? '' : '<p class="muted">Aucun mot trouvé.</p>'}
    <div class="sticky"><button class="primary" id="commit"></button></div>`);
  const refresh = () => {
    const k = ui.pending.size;
    $app.querySelector('#count').textContent = `${list.length} mots · ${list.filter(on).length} cochés`;
    const b = $app.querySelector('#commit');
    b.disabled = !k;
    b.textContent = k ? `Ajouter ${k} mot${k > 1 ? 's' : ''} à mes révisions` : 'Coche les mots vus dans Genki';
  };
  refresh();
  $app.querySelector('#back').onclick = () => {
    if (n && !confirm(`Quitter sans ajouter les ${ui.pending.size} mots cochés ?`)) return;
    ui.pending.clear(); ui.screen = 'home'; render();
  };
  $app.querySelector('#commit').onclick = () => {
    const now = Date.now(), k = ui.pending.size;
    ui.pending.forEach(id => addCard(id, now));
    ui.pending.clear(); save();
    ui.flash = `${k} mot${k > 1 ? 's' : ''} ajouté${k > 1 ? 's' : ''}. Premier test ${fmtWhen(firstDue(now))}.`;
    ui.screen = 'home'; render();
  };
  const q = $app.querySelector('#q');
  q.oninput = () => { ui.query = q.value; const pos = q.selectionStart; addScreen(); const nq = $app.querySelector('#q'); nq.focus(); nq.setSelectionRange(pos, pos); };
  $app.querySelectorAll('[data-l]').forEach(b => b.onclick = () => { ui.lesson = b.dataset.l === 'autres' ? 'autres' : +b.dataset.l; addScreen(); });
  $app.querySelectorAll('input[data-id]').forEach(cb => cb.onchange = () => {
    const id = cb.dataset.id, c = state.cards[id];
    if (cb.checked) { if (!c) ui.pending.add(id); }
    else if (ui.pending.has(id)) ui.pending.delete(id);
    else if (c.reviews === 0 || confirm('Retirer ce mot et sa progression ?')) { removeCard(id); save(); return addScreen(); }
    else cb.checked = true;
    refresh();
  });
  const all = $app.querySelector('#all');
  if (all) all.onclick = () => {
    if (allOn) {
      const added = list.filter(v => state.cards[v.id]);
      const reviewed = added.filter(v => state.cards[v.id].reviews > 0).length;
      if (added.length && !confirm(`Retirer ${added.length} mots déjà ajoutés${reviewed ? `, dont ${reviewed} déjà révisés` : ''} ?`)) return;
      list.forEach(v => { ui.pending.delete(v.id); removeCard(v.id); });
      save();
    } else list.forEach(v => { if (!state.cards[v.id]) ui.pending.add(v.id); });
    addScreen();
  };
}

// ---------- Session de révision ----------
function startSession() {
  const ids = dueIds();
  ui.session = { queue: ids, retried: new Set(), i: 0, total: ids.length, ok: 0, ko: 0, revealed: false, answer: '', verdict: null };
  ui.screen = 'review';
  render();
}

function reviewScreen() {
  const s = ui.session;
  if (s.i >= s.queue.length) { ui.screen = 'done'; return render(); }
  const v = BY_ID[s.queue[s.i]];
  const pct = Math.round(100 * Math.min(s.i, s.total) / Math.max(s.total, 1));
  const back = s.revealed ? `
      <div class="kana">${esc(v.kana)}</div>
      <div class="fr">${esc(v.fr)}</div>
      <div class="muted">${v.l ? `Genki leçon ${v.l}` : 'Hors Genki I'}</div>` : '';
  let controls;
  if (state.mode === 'clavier') {
    controls = s.revealed ? `
      <div class="verdict ${s.verdict ? 'ok' : 'ko'}">${s.verdict ? 'Correct' : `Pas tout à fait${s.answer ? ` : « ${esc(s.answer)} »` : ''}`}</div>
      ${s.verdict ? '' : '<button class="link" id="override">J\'avais raison</button>'}
      <button class="primary" id="next">Continuer</button>` : `
      <form id="f"><input type="text" id="ans" placeholder="Traduction en français" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done"></form>
      <div class="row"><button id="idk">Je ne sais pas</button><button class="primary" id="check">Valider</button></div>`;
  } else {
    controls = s.revealed ? `
      <div class="row"><button class="ko" id="no">Je ne savais pas</button><button class="ok" id="yes">Je savais</button></div>` : `
      <button class="primary" id="show">Voir la réponse</button>`;
  }
  h(`
    <div class="top"><button class="link" id="quit">‹ Arrêter</button><span class="muted" style="text-align:right">${Math.min(s.i + 1, s.queue.length)} / ${s.queue.length}</span></div>
    <div class="progress"><div style="width:${pct}%"></div></div>
    <section class="card" lang="ja"><div class="q">${esc(v.jp)}</div><div lang="fr">${back}</div></section>
    <div class="sticky">${controls}</div>`);
  $app.querySelector('#quit').onclick = () => { ui.screen = s.ok + s.ko ? 'done' : 'home'; render(); };
  const id = s.queue[s.i];
  const answerAndNext = ok => { record(id, ok); s.i++; s.revealed = false; s.answer = ''; s.verdict = null; reviewScreen(); };
  if (state.mode === 'clavier') {
    if (!s.revealed) {
      const inp = $app.querySelector('#ans');
      inp.focus();
      const check = () => { s.answer = inp.value.trim(); if (!s.answer) return; s.verdict = isCorrect(s.answer, v.fr); s.revealed = true; reviewScreen(); };
      $app.querySelector('#f').onsubmit = e => { e.preventDefault(); check(); };
      $app.querySelector('#check').onclick = check;
      $app.querySelector('#idk').onclick = () => { s.answer = ''; s.verdict = false; s.revealed = true; reviewScreen(); };
    } else {
      $app.querySelector('#next').onclick = () => answerAndNext(s.verdict);
      const o = $app.querySelector('#override');
      if (o) o.onclick = () => answerAndNext(true);
    }
  } else if (!s.revealed) {
    $app.querySelector('#show').onclick = () => { s.revealed = true; reviewScreen(); };
  } else {
    $app.querySelector('#yes').onclick = () => answerAndNext(true);
    $app.querySelector('#no').onclick = () => answerAndNext(false);
  }
}

// Une carte ratée revient une fois en fin de session ; seule la première réponse compte pour l'espacement.
function record(id, ok) {
  const s = ui.session;
  if (s.retried.has(id)) return;
  grade(id, ok);
  ok ? s.ok++ : s.ko++;
  if (!ok) { s.retried.add(id); s.queue.push(id); }
  save();
}

function doneScreen() {
  const s = ui.session;
  const nd = nextDue();
  h(`
    <h1>Session terminée</h1>
    <div class="stats">
      <section class="panel"><h2 style="color:var(--ok)">${s.ok}</h2><div class="muted">réussies</div></section>
      <section class="panel"><h2 style="color:var(--ko)">${s.ko}</h2><div class="muted">à revoir demain</div></section>
    </div>
    ${dueIds().length ? `<p>Il reste ${dueIds().length} révisions dues.</p>` : nd ? `<p class="muted">Prochaine révision ${fmtWhen(nd)}.</p>` : ''}
    <div class="sticky"><button class="primary" data-go="home">Retour à l'accueil</button></div>`);
  bindGo();
}

// ---------- Sauvegarde ----------
function backupScreen() {
  h(`
    <div class="top"><button class="link" data-go="home">‹ Accueil</button><h1>Sauvegarde</h1><span></span></div>
    <p>Ta progression est enregistrée uniquement sur ce téléphone. Exporte-la chaque semaine dans Fichiers ou iCloud Drive pour ne rien perdre.</p>
    <p class="muted">Dernier export : ${state.lastExport ? new Date(state.lastExport).toLocaleDateString('fr-FR') : 'jamais'}</p>
    <button class="primary" id="exp">Exporter ma progression</button>
    <label class="btn" style="text-align:center">Importer une sauvegarde<input type="file" id="imp" accept="application/json,.json" hidden></label>`);
  bindGo();
  $app.querySelector('#exp').onclick = async () => {
    const data = JSON.stringify({ app: 'n5-revisions', exported: Date.now(), state }, null, 1);
    const name = `n5-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([data], name, { type: 'application/json' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: name });
      else { const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; a.click(); }
      state.lastExport = Date.now(); save(); backupScreen();
    } catch (e) { if (e.name !== 'AbortError') alert('Export impossible : ' + e.message); }
  };
  $app.querySelector('#imp').onchange = async e => {
    try {
      const d = JSON.parse(await e.target.files[0].text());
      if (d.app !== 'n5-revisions' || !d.state || !d.state.cards) throw new Error('fichier non reconnu');
      if (!confirm(`Remplacer la progression actuelle par cette sauvegarde (${Object.keys(d.state.cards).length} mots) ?`)) return;
      state = d.state; save(); ui.screen = 'home'; render();
    } catch (err) { alert('Import impossible : ' + err.message); }
  };
}

// ---------- Démarrage ----------
async function init() {
  const r = await fetch('data/vocab.json');
  VOCAB = (await r.json()).vocab;
  BY_ID = Object.fromEntries(VOCAB.map(v => [v.id, v]));
  for (const id of Object.keys(state.cards)) if (!BY_ID[id]) delete state.cards[id];
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
  document.addEventListener('visibilitychange', () => { if (!document.hidden && ui.screen === 'home') home(); });
}
init().catch(e => h(`<p>Impossible de charger les mots : ${esc(e.message)}</p>`));

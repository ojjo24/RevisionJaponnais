import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import * as C from './config.js';
import { isOk, record, load, mastered, choices, shuffle } from './lib.js';
import { pdfToLines } from './pdf-import.js';

const sb = createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
const root = document.getElementById('app');
const CATS = { vocab: ['Vocabulaire', 'Mots, traductions et QCM'], sentence: ['Rédaction', 'Phrases complètes'], kanji: ['Kanji', 'Signification et prononciation'] };
const LBL = { fr: ['Ce mot veut dire…', 'Écrivez la traduction en français'], jp: ['Choisissez la traduction japonaise', 'Écrivez la traduction en japonais'], reading: ['Choisissez la prononciation', 'Écrivez la prononciation (en kana)'] };
const st = { lessons: [], cards: [], sel: new Set(), cfg: {}, user: null, uid: null, admin: false, v: 'home', cat: 'vocab', ac: null, al: null, s: null };
const h = (t, a = {}, ...k) => {
  const e = document.createElement(t);
  for (const [x, y] of Object.entries(a)) x.startsWith('on') ? e.addEventListener(x.slice(2), y) : (e[x] = y);
  e.append(...k.flat().filter(v => v != null && v !== false));
  return e;
};
const count = id => st.cards.filter(c => c.lesson_id === id).length;
const catOf = id => st.lessons.find(l => l.id === id)?.category;
const dur = s => {
  const h = Math.floor(s / 3600);
  const m = Math.floor(s % 3600 / 60);
  const sec = s % 60;
  return `${h} h ${m} min ${sec} sec`;
};
const fmt = c => [c.fr, c.jp, c.reading || '', c.alt_fr.join('|'), c.alt_jp.join('|'), c.note || ''].join(';');
const parse = l => { const [fr, jp, reading, af, aj, note] = l.split(';').map(x => x.trim()); return { fr, jp, reading: reading || null, alt_fr: af ? af.split('|') : [], alt_jp: aj ? aj.split('|') : [], note: note || null }; };

async function refresh() {
  const [l, c] = await Promise.all([sb.from('lessons').select('*').order('position').order('created_at'), sb.from('cards').select('*')]);
  if (l.error || c.error) return alert('Connexion à la base impossible. Vérifiez js/config.js et schema-v2.sql.');
  st.lessons = l.data; st.cards = c.data;
}
const go = v => { st.v = v; render(); window.scrollTo(0, 0); };
const adminFor = cat => { st.ac = cat; go(st.admin ? 'admin' : 'login'); };
function render() {
  root.replaceChildren(nav(), views[st.v]());
  root.querySelector('input:not([readonly]):not([type])')?.focus();
}
const nav = () => h('nav', {}, st.v !== 'home' && h('button', { onclick: () => go('home') }, '← Accueil'), st.user && h('button', { className: 'link', onclick: () => sb.auth.signOut() }, 'Se déconnecter'));

function start() {
  const cat = st.cat, cf = st.cfg[cat], ids = new Set(st.lessons.filter(l => l.category === cat).map(l => l.id));
  const pool = st.cards.filter(c => ids.has(c.lesson_id)), chosen = pool.filter(c => st.sel.has(c.lesson_id)), rd = () => Math.random() < .5;
  const dist = (a, k) => new Set(a.map(c => c[k]).filter(Boolean)).size;
  const items = shuffle(chosen).map(c => {
    const d = cf.dir === 'both' ? (rd() ? 'fr-jp' : 'jp-fr') : cf.dir;
    const [qk, ak] = d === 'fr-jp' ? ['fr', 'jp'] : d === 'jp-fr' ? ['jp', 'fr'] : d === 'meaning' ? ['jp', 'fr'] : ['jp', 'reading'];
    return { c, qk, ak, qcm: cf.fmt === 'qcm' || (cf.fmt === 'mix' && rd()) };
  }).filter(e => e.c[e.qk] && e.c[e.ak]).slice(0, cf.n);
  if (!items.length) return alert('Choisissez au moins une leçon contenant des éléments.');
  items.forEach(e => { // propositions du QCM : leçons choisies, sinon toute la catégorie
    if (!e.qcm) return;
    const a = chosen.filter(c => c[e.ak]), b = pool.filter(c => c[e.ak]);
    e.pool = dist(a, e.ak) >= 4 ? a : b;
    if (dist(e.pool, e.ak) < 4) e.qcm = false;
  });
  st.s = {
  list: items,
  i: 0,
  ok: 0,
  ko: 0,
  res: null,
  typed: '',
  startAt: Date.now(),
  sent: false,
  saving: false,
  saved: false,
  saveError: null
};
  go('review');
}
const progress = () => {
  const s = load(), v = Object.values(s);
  return h('div', {}, h('h3', {}, 'Ma progression'), h('p', {}, `Mots maîtrisés : ${v.filter(mastered).length}`),
    ...st.lessons.map(l => { const cs = st.cards.filter(c => c.lesson_id === l.id), m = cs.filter(c => mastered(s[c.id])).length; return h('div', { className: 'row' }, h('span', {}, l.title), h('progress', { max: cs.length || 1, value: m }), h('small', {}, `${m}/${cs.length}`)); }),
    h('h3', {}, 'À retravailler'), ...st.cards.filter(c => s[c.id]?.ko).sort((a, b) => s[b.id].ko - s[a.id].ko).slice(0, 8).map(c => h('p', {}, `${c.fr} — ${c.jp} (${s[c.id].ko} erreurs)`)));
};

const views = {
  home() {
    const tile = (t, d, f) => h('button', { className: 'tile', onclick: f }, h('b', {}, t), h('small', {}, d));
    return h('section', { className: 'hero' }, h('h1', {}, 'にほんごをべんきょうします'), h('p', { className: 'muted', lang: 'ja' }, '日本語を勉強します'),
      h('div', { className: 'tiles' }, ...Object.entries(CATS).map(([k, [t, d]]) => tile(t, d, () => { st.cat = k; go('cat'); })), tile('Classement', 'Bonnes réponses, temps passé, mes statistiques', () => go('classement'))),
      st.user ? h('p', { className: 'muted' }, 'Connecté : ' + st.user.email) : h('button', { className: 'primary', onclick: () => go('connexion') }, 'Connexion'),
      h('p', {}, h('button', { className: 'link', onclick: () => adminFor(null) }, 'Administration')));
  },
  cat() {
    return h('section', {}, h('h2', {}, CATS[st.cat][0]), h('div', { className: 'tiles' },
      h('button', { className: 'tile', onclick: () => go('setup') }, h('b', {}, 'Quiz')), h('button', { className: 'tile', onclick: () => adminFor(st.cat) }, h('b', {}, 'Administration'))));
  },
  setup() {
    const cat = st.cat, cf = st.cfg[cat] ||= { n: 20, dir: cat === 'kanji' ? 'meaning' : 'both', fmt: 'mix' };
    const ls = st.lessons.filter(l => l.category === cat), avail = st.cards.filter(c => st.sel.has(c.lesson_id) && catOf(c.lesson_id) === cat).length;
    const dirs = cat === 'kanji' ? [['meaning', 'Signification'], ['reading', 'Prononciation']] : [['fr-jp', 'Français → japonais'], ['jp-fr', 'Japonais → français'], ['both', 'Les deux (aléatoire)']];
    const sel = (k, o) => h('select', { onchange: e => cf[k] = k === 'n' ? +e.target.value : e.target.value }, ...o.map(([v, t]) => h('option', { value: v, selected: cf[k] == v }, t)));
    return h('section', {}, h('h2', {}, `${CATS[cat][0]} : quiz`),
      h('button', { onclick: () => { ls.every(l => st.sel.has(l.id)) ? ls.forEach(l => st.sel.delete(l.id)) : ls.forEach(l => st.sel.add(l.id)); render(); } }, 'Tout / rien'),
      ...ls.map(l => h('label', { className: 'row' }, h('input', { type: 'checkbox', checked: st.sel.has(l.id), onchange: e => { e.target.checked ? st.sel.add(l.id) : st.sel.delete(l.id); render(); } }), l.title, h('small', {}, count(l.id) + ' éléments'))),
      !ls.length && h('p', { className: 'muted' }, 'Aucune leçon pour le moment.'),
      h('div', { className: 'bar' }, sel('dir', dirs), sel('fmt', [['mix', 'Écrire + QCM (mixte)'], ['type', 'Écrire la traduction'], ['qcm', 'QCM (4 choix)']]), sel('n', [[20, '20 questions'], [40, '40 questions'], [100, '100 questions']])),
      h('p', { className: 'muted' }, `${avail} éléments dans les leçons cochées (le quiz ne répète jamais un élément).`),
      h('button', { className: 'primary', onclick: start }, 'Commencer'));
  },
  review() {
    const s = st.s, e = s.list[s.i];
    const send = async d => {
  if (s.sent) return;
  s.sent = true;

  if (!st.user || !(s.ok + s.ko)) return;

  s.saving = true;

  const { error } = await sb.rpc('record_answers', {
    c: s.ok,
    w: s.ko,
    done: d
  });

  s.saving = false;
  s.saved = !error;
  s.saveError = error?.message || null;

  if (st.v === 'review' && st.s === s) render();
};
  if (!e) return h('section', {},
  h('h2', {}, `Terminé : ${s.ok} / ${s.list.length}`),
  h('p', {}, `Bonnes réponses : ${s.ok}`),
  h('p', {}, `Mauvaises réponses : ${s.ko}`),
  h('p', {}, `Temps : ${Math.floor((Date.now() - s.startAt) / 60000)} min ${Math.floor((Date.now() - s.startAt) / 1000) % 60} sec`),
  h('p', { className: 'muted' },
    !st.user ? 'Connectez-vous pour enregistrer vos résultats.' :
    s.saving ? 'Enregistrement en cours...' :
    s.saved ? 'Résultats enregistrés.' :
    s.saveError ? 'Erreur : ' + s.saveError :
    'Aucun résultat à enregistrer.'
  ),
  h('button', { className: 'primary', onclick: () => go('cat') }, 'Retour')
);
    const c = e.c, acc = [c[e.ak], ...(e.ak === 'fr' ? c.alt_fr : c.alt_jp)], last = s.i + 1 >= s.list.length;
    const answer = ok => { record(c.id, ok); ok ? s.ok++ : s.ko++; s.res = ok; if (last) send(true); render(); };
    const next = () => { s.i++; s.res = s.opts = s.pick = null; s.typed = ''; render(); };
    let body;
    if (e.qcm) {
      s.opts ||= choices(c, e.pool, e.ak);
      body = h('div', { className: 'opts' }, ...s.opts.map(o => h('button', { className: s.res === null ? '' : o.id === c.id ? 'ok' : o.id === s.pick ? 'ko' : '', disabled: s.res !== null, onclick: () => { s.pick = o.id; answer(o.id === c.id); } }, o[e.ak])));
    } else {
      const inp = h('input', { autocomplete: 'off', autocapitalize: 'off', spellcheck: false, lang: e.ak === 'fr' ? 'fr' : 'ja', placeholder: 'Votre réponse', value: s.typed, readOnly: s.res !== null });
      body = h('form', { onsubmit: ev => { ev.preventDefault(); if (s.res === null) { s.typed = inp.value; answer(isOk(inp.value, acc, e.ak !== 'fr')); } else next(); } }, inp, s.res === null ? h('button', { className: 'primary' }, 'Valider') : null);
    }
    const q = c[e.qk];
    return h('section', {},
      h('div', { className: 'bar' },
        h('progress', { max: s.list.length, value: s.i }),
        h('strong', { id: 'quiz-timer' }, '00:00'),
        h('button', {
          onclick: () => {
            if (confirm('Quitter le quiz ?')) {
               send(false);
               go('setup');
             }
            }
          }, 'Quitter')
        ),
      h('p', { className: 'muted' }, `${LBL[e.ak][e.qcm ? 0 : 1]} (${s.i + 1}/${s.list.length})`),
      h('div', { className: 'q' + (q.length > 12 ? ' long' : ''), lang: e.qk === 'fr' ? 'fr' : 'ja' }, q), body,
      s.res === null ? null : h('div', { className: 'res ' + (s.res ? 'ok' : 'ko') }, s.res ? 'Correct' : 'Incorrect. Réponse : ' + acc.join(' / '),
        c.reading && e.ak !== 'reading' ? h('small', {}, c.reading) : null, h('button', { className: 'primary', onclick: next }, last ? 'Terminer' : 'Question suivante')));
  },
  classement() {
    const box = h('p', {}, 'Chargement…');
    (async () => {
      const [lb, me] = await Promise.all([sb.rpc('leaderboard'), st.user ? sb.from('user_stats').select('*').maybeSingle() : { data: null }]);
      if (lb.error) return box.replaceChildren('Classement indisponible (schema-v2.sql exécuté ?).');
      const top = (k, f) => h('ol', {}, ...[...lb.data].sort((a, b) => b[k] - a[k]).slice(0, 10).map(r => h('li', {}, `${r.pseudo} : ${f(r[k])}`)));
      const m = me.data, t = m ? m.correct + m.wrong : 0;
      box.replaceChildren(h('h3', {}, 'Bonnes réponses'), top('correct', v => v), h('h3', {}, 'Temps passé sur le site'), top('seconds', dur), h('h2', {}, 'Mes statistiques'),
        !st.user ? h('p', {}, 'Connectez-vous pour enregistrer et voir vos statistiques.') : !m ? h('p', {}, 'Statistiques indisponibles.') : h('div', {},
          h('p', {}, `Temps total : ${dur(m.seconds)}`), h('p', {}, `Bonnes réponses : ${m.correct} · Mauvaises : ${m.wrong}`), h('p', {}, `Quiz terminés : ${m.quizzes} · Réussite : ${t ? Math.round(100 * m.correct / t) : 0} %`),
          h('button', { onclick: async () => { const p = (prompt('Votre pseudo affiché dans le classement') || '').trim().slice(0, 30); if (p) { await sb.from('profiles').update({ pseudo: p }).eq('id', st.uid); render(); } } }, 'Changer mon pseudo'), progress()));
    })();
    return h('section', {}, h('h2', {}, 'Classement'), box);
  },
  connexion() {
    const em = h('input', { type: 'email', placeholder: 'Votre adresse e-mail', autocomplete: 'email', value: st.email || '' });
    const code = h('input', { placeholder: 'Code reçu par e-mail', inputMode: 'numeric', autocomplete: 'one-time-code' });
    return h('section', {}, h('h2', {}, 'Connexion'),
      h('form', { onsubmit: async e => { e.preventDefault(); st.email = em.value.trim(); const { error } = await sb.auth.signInWithOtp({ email: st.email, options: { emailRedirectTo: location.origin + location.pathname } }); if (error) return alert(error.message); st.sent = true; render(); } }, em, h('button', { className: 'primary' }, 'Recevoir un code')),
      st.sent ? h('form', { onsubmit: async e => { e.preventDefault(); const { error } = await sb.auth.verifyOtp({ email: st.email, token: code.value.trim(), type: 'email' }); if (error) return alert('Code incorrect ou expiré.'); st.sent = false; } }, h('p', { className: 'muted' }, 'Entrez le code reçu, ou cliquez sur le lien du message.'), code, h('button', { className: 'primary' }, 'Valider')) : null);
  },
  login() {
    const p = h('input', { type: 'password', placeholder: 'Mot de passe administrateur', autocomplete: 'current-password' });
    return h('section', {}, h('h2', {}, 'Administration'), h('form', { onsubmit: async e => {
      e.preventDefault();
      const { error } = await sb.auth.signInWithPassword({ email: C.ADMIN_EMAIL, password: p.value });
      if (error) return alert('Mot de passe incorrect.');
      st.admin = true; go('admin');
    } }, p, h('button', { className: 'primary' }, 'Se connecter')));
  },
  admin() {
    const ac = st.ac, ls = st.lessons.filter(l => !ac || l.category === ac);
    const L = st.al = ls.some(l => l.id === st.al) ? st.al : ls[0]?.id, cur = st.lessons.find(l => l.id === L);
    const run = async p => { const { error } = await p; if (error) return alert(error.message); await refresh(); render(); };
    const ask = (t, d = '') => (prompt(t, d) || '').trim();
    const newCat = () => ac || { v: 'vocab', r: 'sentence', k: 'kanji' }[ask('Catégorie : v = vocabulaire, r = rédaction, k = kanji').toLowerCase()];
    const hint = cur?.category === 'kanji' ? 'signification;kanji;prononciation;autres_sens|…;autres_prononciations|…;note' : 'français;japonais;lecture;autres_fr|…;autres_jp|…;note';
    const ta = h('textarea', { rows: 8, placeholder: hint + '\nUne carte par ligne. Seuls les deux premiers champs sont obligatoires.' });
    const lines = () => ta.value.split('\n').map(parse).filter(c => c.fr && c.jp);
    const pdf = h('input', { type: 'file', accept: 'application/pdf', onchange: async e => {
      const f = e.target.files[0]; if (!f) return;
      try { const l = await pdfToLines(f); ta.value = l.join('\n'); alert(l.length ? `${l.length} éléments détectés. Vérifiez et corrigez la liste, puis validez.` : 'Aucun texte exploitable (PDF scanné ?). Saisissez à la main.'); }
      catch { alert('Lecture du PDF impossible. Saisissez à la main.'); }
    } });
    const imp = h('input', { type: 'file', accept: '.json', onchange: async e => {
      try { const d = JSON.parse(await e.target.files[0].text()); const r = await sb.from('lessons').upsert(d.lessons); if (r.error) throw r.error; await run(sb.from('cards').upsert(d.cards)); }
      catch (x) { alert('Import impossible : ' + (x.message || x)); }
    } });
    const newLesson = async withCards => {
      const t = ask('Titre de la nouvelle leçon'); if (!t) return; const cat = newCat(); if (!cat) return;
      const { data, error } = await sb.from('lessons').insert({ title: t, category: cat, position: st.lessons.length }).select().single();
      if (error) return alert(error.message);
      st.al = data.id; if (withCards) await sb.from('cards').insert(lines().map(c => ({ ...c, lesson_id: data.id })));
      await refresh(); render();
    };
    return h('section', {}, h('h2', {}, 'Administration'),
      h('p', { className: 'muted' }, Object.entries(CATS).map(([k, [t]]) => `${t} : ${st.lessons.filter(l => l.category === k).length} leçons, ${st.cards.filter(c => catOf(c.lesson_id) === k).length} éléments`).join(' · ')),
      h('div', { className: 'bar' },
        h('select', { onchange: e => { st.ac = e.target.value || null; render(); } }, h('option', { value: '' }, 'Toutes les catégories'), ...Object.entries(CATS).map(([k, [t]]) => h('option', { value: k, selected: ac === k }, t))),
        h('select', { onchange: e => { st.al = e.target.value; render(); } }, ...ls.map(l => h('option', { value: l.id, selected: l.id === L }, (ac ? '' : CATS[l.category][0] + ' · ') + l.title))),
        h('button', { onclick: () => newLesson(false) }, 'Nouvelle leçon'),
        cur && h('button', { onclick: () => { const t = ask('Nouveau titre', cur.title); t && run(sb.from('lessons').update({ title: t }).eq('id', L)); } }, 'Renommer'),
        cur && h('button', { className: 'danger', onclick: () => { if (confirm(`Supprimer « ${cur.title} » et ses ${count(L)} éléments ?`)) { st.al = null; run(sb.from('lessons').delete().eq('id', L)); } } }, 'Supprimer')),
      ...st.cards.filter(c => c.lesson_id === L).map(c => h('div', { className: 'row' }, h('span', {}, `${c.fr} — ${c.jp}${c.reading ? ` (${c.reading})` : ''}`),
        h('button', { onclick: () => { const t = ask(hint, fmt(c)); t && run(sb.from('cards').update(parse(t)).eq('id', c.id)); } }, 'Modifier'),
        h('button', { className: 'danger', onclick: () => confirm('Supprimer cet élément ?') && run(sb.from('cards').delete().eq('id', c.id)) }, 'Suppr.'))),
      h('h3', {}, 'Ajouter (saisie ou PDF)'), pdf, ta,
      h('div', { className: 'bar' },
        cur && h('button', { className: 'primary', onclick: () => lines().length && run(sb.from('cards').insert(lines().map(c => ({ ...c, lesson_id: L })))) }, 'Ajouter à cette leçon'),
        h('button', { onclick: () => lines().length && newLesson(true) }, 'Créer une leçon avec ceci')),
      h('h3', {}, 'Sauvegarde et compte'),
      h('div', { className: 'bar' },
        h('button', { onclick: () => h('a', { href: URL.createObjectURL(new Blob([JSON.stringify({ lessons: st.lessons, cards: st.cards }, null, 1)], { type: 'application/json' })), download: 'flashcards-sauvegarde.json' }).click() }, 'Exporter (JSON)'),
        h('label', {}, 'Importer ', imp),
        h('button', { onclick: () => { const p = ask('Nouveau mot de passe (6 caractères minimum)'); p.length >= 6 ? sb.auth.updateUser({ password: p }).then(r => alert(r.error ? r.error.message : 'Mot de passe modifié.')) : p && alert('Mot de passe trop court.'); } }, 'Changer le mot de passe'),
        h('button', { onclick: () => sb.auth.signOut() }, 'Se déconnecter')));
  }
};

// Connexion : l'état de l'utilisateur suit la session Supabase (le droit d'écriture est contrôlé côté base).
sb.auth.onAuthStateChange((_e, ses) => {
  const u = ses?.user || null;
  if ((u?.id || null) === st.uid) return;
  st.uid = u?.id || null; st.user = u; st.admin = !!u && u.email?.toLowerCase() === C.ADMIN_EMAIL.toLowerCase();
  if (u) setTimeout(() => sb.rpc('log_login'), 0);
  if (u && st.v === 'connexion') st.v = 'home';
  if (!u && ['admin', 'classement'].includes(st.v)) st.v = 'home';
  render();
});
// Temps passé : un ping toutes les 15 s, seulement si l'onglet est visible et l'utilisateur actif (le serveur plafonne l'écart entre pings).
let act = Date.now();
['pointerdown', 'keydown', 'scroll'].forEach(ev => addEventListener(ev, () => act = Date.now(), { passive: true }));
setInterval(() => { if (st.user && !document.hidden && Date.now() - act < 6e4) sb.rpc('ping'); }, 15000);
// Chronomètre du quiz : actualisation chaque seconde.
setInterval(() => {
  if (st.v !== 'review' || !st.s) return;

  const elapsed = Math.floor((Date.now() - st.s.startAt) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;

  const timer = document.getElementById('quiz-timer');

  if (timer) {
    timer.textContent =
      String(minutes).padStart(2, '0') + ':' +
      String(seconds).padStart(2, '0');
  }
}, 1000);
render();
if (C.SUPABASE_URL.includes('VOTRE')) root.prepend(h('p', { className: 'res ko' }, 'Configuration manquante : renseignez js/config.js (URL, clé anon, e-mail admin).'));
else try { await refresh(); render(); } catch (e) { root.prepend(h('p', { className: 'res ko' }, 'Erreur : ' + (e.message || e))); }

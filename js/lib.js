// Correction des réponses, répétition espacée (type SM-2) et tirage des questions.
const K = 'jf:stats';
const nf = (s, jp) => { s = s.normalize('NFKC').replace(/[。、.,!?！？「」"'’]/g, '').trim(); return jp ? s.replace(/\s+/g, '') : s.replace(/\s+/g, ' ').toLowerCase(); };
// Strict : seules les réponses enregistrées (mot + variantes) sont acceptées.
export const isOk = (a, acc, jp) => acc.some(x => nf(x, jp) === nf(a, jp));
export const load = () => { try { return JSON.parse(localStorage.getItem(K)) || {}; } catch { return {}; } };
export const mastered = c => !!c && c.iv >= 7;
export const shuffle = a => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(p => p[1]);

export function record(id, ok) {
  const s = load(), c = s[id] || { ef: 2.5, n: 0, iv: 0, due: 0, ok: 0, ko: 0 };
  if (ok) { c.ok++; c.n++; c.iv = c.n === 1 ? 1 : c.n === 2 ? 3 : Math.round(c.iv * c.ef); c.ef = Math.min(2.8, c.ef + .05); }
  else { c.ko++; c.n = 0; c.iv = 0; c.ef = Math.max(1.3, c.ef - .2); }
  c.due = Date.now() + c.iv * 864e5; s[id] = c;
  localStorage.setItem(K, JSON.stringify(s));
}
// Priorité : mots nouveaux ou à revoir, puis les plus ratés.
export function pick(cards, n = 20) {
  const s = load(), now = Date.now();
  const sc = c => { const x = s[c.id]; return (x && x.due > now ? 10 : 0) - (x ? Math.min(x.ko, 5) * .3 : 0) + Math.random(); };
  return cards.map(c => [sc(c), c]).sort((a, b) => a[0] - b[0]).slice(0, n).map(p => p[1]);
}
// 4 propositions (1 bonne + 3 fausses distinctes) pour le quiz.
export function choices(card, pool, key) {
  const seen = new Set([card[key]]), out = [card];
  for (const c of shuffle(pool)) if (out.length < 4 && c[key] && !seen.has(c[key])) { seen.add(c[key]); out.push(c); }
  return shuffle(out);
}

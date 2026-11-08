// Extraction du texte d'un PDF (PDF.js) -> lignes "français;japonais;lecture" à vérifier.
const JP = /[\u3040-\u30ff\u3400-\u9fff]/, KANJI = /[\u3400-\u9fff]/;

export async function pdfToLines(file) {
  const B = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/';
  const pdfjs = await import(B + 'pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = B + 'pdf.worker.min.mjs';
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise, out = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const items = (await (await pdf.getPage(p)).getTextContent()).items.filter(i => i.str && i.str.trim());
    const rows = [];
    for (const i of items) {
      const y = i.transform[5];
      let r = rows.find(r => Math.abs(r.y - y) < 3);
      if (!r) rows.push(r = { y, it: [] });
      r.it.push(i);
    }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) {
      r.it.sort((a, b) => a.transform[4] - b.transform[4]);
      const ch = []; let end = null;
      for (const i of r.it) { // un grand espace horizontal sépare deux colonnes
        const x = i.transform[4];
        if (end !== null && x - end < 8) ch[ch.length - 1] += (x - end > 1 ? ' ' : '') + i.str.trim();
        else ch.push(i.str.trim());
        end = x + i.width;
      }
      const jp = ch.filter(c => JP.test(c)), fr = ch.filter(c => !JP.test(c)).join(' ');
      if (jp.length && fr) out.push([fr, jp[0], KANJI.test(jp[0]) ? jp[1] || '' : ''].join(';'));
    }
  }
  return out;
}

// Mathildas Rechen-Werkstatt – baut die PDFs aus src/
//
//   node build.mjs                 ganzes Buch + Kopiervorlagen  → out/
//   node build.mjs --nur 03        nur Einheit 03 (Anleitung + Blätter) → out/teil-03.pdf
//   node build.mjs --nur rahmen    nur die Rahmenseiten (Titel, Sammelpass …)
//   node build.mjs --png           zusätzlich jede Seite als Bild → out/seiten/
//   node build.mjs --dpi 110       Auflösung der Seitenbilder (Standard 70)
//
// Braucht Node 20+, playwright-core und Google Chrome (oder MATHILDA_CHROME=/pfad/zu/chrome),
// außerdem poppler (pdfinfo, pdftoppm). Mit Nix: ./baue.sh
// Bricht mit Fehlern ab, wenn eine Rechnung falsch ist oder ein Blatt überläuft.

import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WURZEL = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(WURZEL, 'src');
const OUT = path.join(WURZEL, 'out');

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const nur = opt('--nur', null);
const mitPng = args.includes('--png');
const dpi = parseInt(opt('--dpi', '70'), 10);

const buch = JSON.parse(fs.readFileSync(path.join(SRC, 'buch.json'), 'utf8'));
let teile = buch.teile;
if (nur) {
  const muster = nur.split(',');
  teile = teile.concat(buch.extras || []).filter((t) => muster.some((m) => /^\d+$/.test(m) ? t.startsWith('einheiten/' + m) : t.includes(m)));
  if (!teile.length) {
    console.error('Kein Teil passt zu --nur ' + nur);
    process.exit(2);
  }
}
const name = nur ? 'teil-' + nur.replace(/[^\w-]+/g, '_') : 'rechen-werkstatt';

fs.mkdirSync(OUT, { recursive: true });
const html =
  '<!doctype html>\n<html lang="de-AT">\n<head>\n<meta charset="utf-8">\n<title>Mathildas Rechen-Werkstatt</title>\n' +
  '<link rel="stylesheet" href="../src/styles.css">\n<script src="../src/components.js"></script>\n</head>\n<body>\n' +
  teile.map((t) => '<!-- ===== ' + t + ' ===== -->\n' + fs.readFileSync(path.join(SRC, t), 'utf8')).join('\n') +
  '\n</body>\n</html>\n';
const htmlDatei = path.join(OUT, name + '.html');
fs.writeFileSync(htmlDatei, html);

function poppler(prog, a) {
  return execFileSync(prog, a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}
function seitenAnzahl(pdf) {
  const m = poppler('pdfinfo', [pdf]).match(/Pages:\s+(\d+)/);
  return m ? +m[1] : 0;
}
function ziele(pdf) {
  // Benannte Sprungziele (Chrome legt sie für verlinkte ids an) → Seitenzahl
  const map = {};
  for (const z of poppler('pdfinfo', ['-dests', pdf]).split('\n')) {
    const m = z.match(/^\s*(\d+)\s+\[.*\]\s+"(.+)"\s*$/);
    if (m) map[m[2]] = +m[1];
  }
  return map;
}

const chromePfad = process.env.MATHILDA_CHROME;
const browser = await chromium.launch(chromePfad ? { executablePath: chromePfad } : { channel: 'chrome' });
let fehlerAnzahl = 0;
try {
  const page = await browser.newPage({ viewport: { width: 665, height: 1100 } }); // 176 mm = Satzspiegel der Anleitung
  const konsole = [];
  page.on('console', (m) => { if (m.type() === 'error') konsole.push(m.text()); });
  page.on('pageerror', (e) => konsole.push(e.message));
  await page.emulateMedia({ media: 'print' });
  await page.goto(pathToFileURL(htmlDatei).href);
  await page.waitForFunction(() => window.__fertig === true, null, { timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);

  const erg = await page.evaluate(() => window.__pruefe());
  const alleFehler = erg.fehler.concat(konsole.map((k) => 'Browser: ' + k));
  fehlerAnzahl = alleFehler.length;

  // PDF erzeugen, Seitenzahlen eintragen, nochmal erzeugen
  const pdf = path.join(OUT, name + '.pdf');
  const pdfOpt = { path: pdf, preferCSSPageSize: true, printBackground: true, outline: false, tagged: true };
  await page.pdf(pdfOpt);
  const fehlend = await page.evaluate((m) => window.__setzeSeiten(m), ziele(pdf));
  await page.pdf(pdfOpt);
  const echteFehlende = nur ? [] : fehlend;
  for (const f of echteFehlende) alleFehler.push('Seitenzahl für Ziel „' + f + '“ nicht gefunden');

  // Jede feste Seite muss genau eine PDF-Seite sein: Ziele aufeinanderfolgender fester Seiten prüfen
  const zielMap = ziele(pdf);
  const festeIds = await page.evaluate(() => Array.from(document.querySelectorAll('.seite[id]'))
    .filter((s) => !s.closest('.loesungsmodus') && getComputedStyle(s).display !== 'none').map((s) => s.id));
  const gesamt = seitenAnzahl(pdf);
  console.log('\n📄 ' + path.relative(WURZEL, pdf) + ' – ' + gesamt + ' Seiten');

  // Kopiervorlagen (nur Mathildas Seiten)
  let vorlagenPdf = null;
  if (!nur) {
    await page.evaluate(() => document.body.classList.add('vorlagen'));
    const sichtbar = await page.evaluate(() => Array.from(document.querySelectorAll('.seite'))
      .filter((s) => !s.closest('.loesungsmodus') && getComputedStyle(s).display !== 'none').length);
    vorlagenPdf = path.join(OUT, 'kopiervorlagen.pdf');
    await page.pdf({ ...pdfOpt, path: vorlagenPdf });
    const n = seitenAnzahl(vorlagenPdf);
    console.log('📄 ' + path.relative(WURZEL, vorlagenPdf) + ' – ' + n + ' Seiten');
    if (n !== sichtbar) alleFehler.push('Kopiervorlagen: ' + n + ' PDF-Seiten, aber ' + sichtbar + ' feste Seiten – irgendwo läuft eine Seite über oder es entsteht eine Leerseite');
    await page.evaluate(() => document.body.classList.remove('vorlagen'));
  } else {
    // Bei Teil-Builds: feste Seiten zählen gegen Abstand der Sprungziele
    for (let i = 0; i < festeIds.length - 1; i++) {
      const a = zielMap[festeIds[i]], b = zielMap[festeIds[i + 1]];
      if (a && b && b - a !== 1) alleFehler.push('Zwischen ' + festeIds[i] + ' (S. ' + a + ') und ' + festeIds[i + 1] + ' (S. ' + b + ') liegen ' + (b - a - 1) + ' Seiten zu viel');
    }
  }

  if (mitPng) {
    const ordner = path.join(OUT, nur ? 'seiten-' + nur.replace(/[^\w-]+/g, '_') : 'seiten');
    fs.rmSync(ordner, { recursive: true, force: true });
    fs.mkdirSync(ordner, { recursive: true });
    poppler('pdftoppm', ['-r', String(dpi), '-png', pdf, path.join(ordner, 's')]);
    console.log('🖼  Seitenbilder: ' + path.relative(WURZEL, ordner) + '/ (' + fs.readdirSync(ordner).length + ' Bilder, ' + dpi + ' dpi)');
  }

  const s = erg.statistik;
  console.log('🔢 Geprüft: ' + s.gleichungenKomponenten + ' Bausteine mit Rechnungen, ' + s.gleichungenText + ' Rechnungen im Text, ' + s.blaetter + ' feste Seiten/Blätter');
  if (erg.warnungen.length) {
    console.log('\n⚠️  ' + erg.warnungen.length + ' Warnung(en):');
    for (const w of erg.warnungen) console.log('  • ' + w);
  }
  fehlerAnzahl = alleFehler.length;
  if (alleFehler.length) {
    console.log('\n❌ ' + alleFehler.length + ' Fehler:');
    for (const f of alleFehler) console.log('  • ' + f);
  } else {
    console.log('\n✅ Keine Fehler.');
  }
} finally {
  await browser.close();
}
process.exit(fehlerAnzahl ? 1 : 0);

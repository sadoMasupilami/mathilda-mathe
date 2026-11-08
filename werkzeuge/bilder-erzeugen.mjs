// Erzeugt die Rohbilder mit der Codex CLI, immer mehrere Bilder pro Aufruf (eine Gruppe), nach bilder/roh/ (nicht eingecheckt).
//   node werkzeuge/bilder-erzeugen.mjs farbe|umriss|szenen [--gruppe 10] [--parallel 2] [--nur a,b]
// Vorhandene Rohbilder werden übersprungen: Ein abgebrochener Lauf geht einfach weiter, wenn man ihn neu startet.
// Exit 3 heißt: Die Usage ist aus (der Grund steht in der Ausgabe). Danach: werkzeuge/bilder-verarbeiten.sh
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const WURZEL = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROH = path.join(WURZEL, 'bilder', 'roh');
const daten = JSON.parse(fs.readFileSync(path.join(WURZEL, 'bilder', 'motive.json'), 'utf8'));

const args = process.argv.slice(2);
const art = args[0];
const opt = (n, d) => (args.includes('--' + n) ? args[args.indexOf('--' + n) + 1] : d);
const groesse = +opt('gruppe', 10);
const parallel = +opt('parallel', 2);
const nur = opt('nur', '') ? opt('nur', '').split(',') : null;
if (!['farbe', 'umriss', 'szenen'].includes(art)) {
  console.error('Aufruf: node werkzeuge/bilder-erzeugen.mjs farbe|umriss|szenen [--gruppe 10] [--parallel 2] [--nur a,b]');
  process.exit(2);
}

const ENDE = `After generating, copy each image into the current directory under exactly the file names given, then list the files.
Do not write code. Do not generate variations or extras. If you cannot generate images, say so plainly with the reason and stop.`;

const STIL = `Shared style for all: a single friendly subject for a picture book for a 6-year-old; soft, rounded, chunky shapes; smooth 3D-like gradients with gentle shading and a subtle highlight; no black outlines; bright clean colours; centred, filling about 85 percent of a square canvas, whole subject visible and not cropped; no text, no ground, no cast shadow, no scene. Only animals and characters may have a face: food, plants and objects must have no eyes, no mouth and no face at all. Original designs only, not resembling any existing character or brand. Background: fully transparent.`;

const UMRISS = `Turn each attached reference image into a colouring-page outline for a 6-year-old child:
- Keep the same subject, same pose, same proportions, and the same position and size on the square canvas.
- Bold, clean, uniform dark lines of about 2.5 percent of the canvas width, with rounded ends. Solid black lines only.
- Pure white background and pure white inside every shape. No shading, no grey, no colour, no gradients, no hatching, no texture.
- Keep it simple with large areas to colour in. Where the subject has a face, keep it clear and friendly: eyes with a solid dark pupil, nose and a smiling mouth. Do not add a face where the reference has none. Leave out small details such as fur strokes, shine marks, patterns on clothes, jewellery and single hair strands; a child must be able to colour every area with a thick crayon.
- Closed outer contour. No text, no ground, no extra objects.`;

const SZENE = `Shared style for all: a soft, calm, bright background for a picture book for a 4-year-old; smooth rounded shapes and gentle gradients in light, pastel colours; low detail and low contrast, because small figures will be placed on top; no animals, no people, no characters, no text; the whole square canvas filled edge to edge, no border. Nothing scary.`;

function aufgaben() {
  if (art === 'farbe') {
    return Object.entries(daten.motive).map(([id, text]) => {
      // Optionale Vorlage (bilder/roh/vorlage/<id>.png), wenn eine Figur wiedererkennbar bleiben soll
      const v = path.join(ROH, 'vorlage', id + '.png');
      return { id, text, ziel: path.join(ROH, 'farbe', id + '.png'), datei: id + '.png', ...(fs.existsSync(v) ? { vorlage: v, vorlageName: 'vorlage-' + id + '.png' } : {}) };
    });
  }
  if (art === 'szenen') {
    return Object.entries(daten.szenen).map(([id, text]) => ({ id, text, ziel: path.join(ROH, 'szene', id + '.png'), datei: id + '.png' }));
  }
  return fs.readdirSync(path.join(ROH, 'farbe')).filter((d) => d.endsWith('.png')).map((d) => {
    const id = d.slice(0, -4);
    return { id, vorlage: path.join(ROH, 'farbe', d), ziel: path.join(ROH, 'linie', id + '.png'), datei: id + '-linie.png' };
  });
}

function prompt(gruppe) {
  const n = gruppe.length;
  const kopf = 'Use your built-in image generation tool to generate exactly ' + n + ' images, one for each item below, and nothing else.\n\n';
  if (art === 'umriss') {
    return kopf + UMRISS + '\n\nFiles:\n' + gruppe.map((a) => '- ' + path.basename(a.vorlage) + ' becomes ' + a.datei).join('\n') + '\n\n' + ENDE;
  }
  const stil = art === 'farbe' ? STIL : SZENE;
  return kopf + stil + '\n\nImages:\n' + gruppe.map((a, i) => (i + 1) + '. ' + a.datei + ': ' + a.text + (a.vorlageName ? ' (reference: ' + a.vorlageName + ')' : '')).join('\n') + '\n\n' + ENDE;
}

// Ein Aufruf: legt seine Bilder in einem eigenen Ordner ab und verschiebt nur, was wirklich da ist
function lauf(gruppe) {
  return new Promise((fertig) => {
    const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'bilder-'));
    const a = ['exec', '--skip-git-repo-check', '--sandbox', 'workspace-write', '-C', ordner, prompt(gruppe)];
    for (const x of gruppe) {
      if (x.vorlage) { const name = x.vorlageName || path.basename(x.vorlage); fs.copyFileSync(x.vorlage, path.join(ordner, name)); a.push('-i', name); }
    }
    const log = [];
    const p = spawn('codex', a, { cwd: ordner, stdio: ['ignore', 'pipe', 'pipe'] });
    p.stdout.on('data', (d) => log.push(d));
    p.stderr.on('data', (d) => log.push(d));
    p.on('close', (code) => {
      const fehlen = [];
      for (const x of gruppe) {
        const q = path.join(ordner, x.datei);
        if (fs.existsSync(q)) { fs.mkdirSync(path.dirname(x.ziel), { recursive: true }); fs.copyFileSync(q, x.ziel); } else fehlen.push(x.id);
      }
      const text = Buffer.concat(log).toString();
      fs.rmSync(ordner, { recursive: true, force: true });
      fertig({ code, fehlen, text });
    });
  });
}

const LIMIT = /usage limit|limit reached|hit your|rate.?limit|quota|too many requests|\b429\b|exceeded/i;
const offen = aufgaben().filter((a) => !fs.existsSync(a.ziel) && (!nur || nur.includes(a.id)));
console.log(art + ': ' + offen.length + ' Bilder offen, Gruppen zu ' + groesse + ', ' + parallel + ' parallel');
const gruppen = [];
for (let i = 0; i < offen.length; i += groesse) gruppen.push(offen.slice(i, i + groesse));

let leer = 0;
let usageAus = null;
async function arbeiter() {
  while (gruppen.length && !usageAus && leer < 2) {
    const g = gruppen.shift();
    const e = await lauf(g);
    const gut = g.length - e.fehlen.length;
    console.log((e.fehlen.length ? '⚠️  ' : '✅ ') + gut + '/' + g.length + ': ' + g.map((x) => x.id).join(' ') + (e.fehlen.length ? ' | fehlt: ' + e.fehlen.join(' ') : ''));
    if (!e.fehlen.length) { leer = 0; continue; }
    const zeile = e.text.split('\n').filter((z) => LIMIT.test(z) && !/^\s*-/.test(z)).pop();
    if (zeile && gut === 0) usageAus = zeile.slice(0, 300);
    else if (gut === 0) { leer++; console.log(e.text.split('\n').slice(-12).join('\n').slice(0, 1200)); }
  }
}
await Promise.all(Array.from({ length: parallel }, arbeiter));

const rest = aufgaben().filter((a) => !fs.existsSync(a.ziel));
console.log('Fertig: ' + (aufgaben().length - rest.length) + '/' + aufgaben().length + (rest.length ? ', offen: ' + rest.map((a) => a.id).join(' ') : ''));
if (usageAus) { console.log('🛑 USAGE AUS: ' + usageAus); process.exit(3); }
process.exit(rest.length ? 1 : 0);

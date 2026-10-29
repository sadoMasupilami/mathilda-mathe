/* =====================================================================
   Mathildas Rechen-Werkstatt – Bausteine
   Läuft im Browser (Chrome) beim Bauen. Ersetzt die <m-…>-Elemente durch
   Grafiken, rechnet Lösungen selbst aus und prüft jede Rechnung.
   Fehler landen in window.__fehler, build.mjs bricht dann ab.
   Beschreibung aller Bausteine: vorlagen/AUTOREN-LEITFADEN.md
   ===================================================================== */
(function () {
  'use strict';

  const FEHLER = [];
  const WARNUNGEN = [];
  window.__fehler = FEHLER;
  window.__warnungen = WARNUNGEN;

  // ---------------------------------------------------------------------
  // Hilfen
  // ---------------------------------------------------------------------
  function wo(el) {
    const teile = [];
    const lsg = el.closest('.loesungsmodus');
    const blatt = el.closest('.blatt');
    const anl = el.closest('.anleitung');
    const sec = el.closest('section');
    if (blatt && blatt.dataset.blatt) teile.push('Blatt ' + blatt.dataset.blatt);
    else if (anl) teile.push('Anleitung Einheit ' + anl.dataset.einheit);
    else if (sec && sec.id) teile.push(sec.id);
    else if (sec && sec.dataset.quelle) teile.push(sec.dataset.quelle);
    if (lsg) teile.push('(Lösungsansicht)');
    let schnipsel = (el.getAttribute && el.getAttribute('data-src')) || el.outerHTML || '';
    schnipsel = schnipsel.replace(/\s+/g, ' ').slice(0, 110);
    return (teile.join(' ') || 'Dokument') + ' › ' + schnipsel;
  }
  function fehler(el, msg) {
    // Fehler in Lösungs-Klonen nicht doppelt melden
    if (!el.closest || !el.closest('.loesungsmodus')) FEHLER.push(wo(el) + '\n    → ' + msg);
    if (el.classList) el.classList.add('komp-fehler');
  }
  function warnung(el, msg) {
    if (!el.closest || !el.closest('.loesungsmodus')) WARNUNGEN.push(wo(el) + '\n    → ' + msg);
  }
  const MINUS = '−';
  function fmt(n) {
    if (typeof n !== 'number') return String(n);
    return n < 0 ? MINUS + Math.abs(n) : String(n);
  }
  function zahl(s) {
    if (s === null || s === undefined || s === '') return NaN;
    s = String(s).trim().replace(MINUS, '-');
    return /^-?\d+$/.test(s) ? parseInt(s, 10) : NaN;
  }
  function liste(s) {
    if (!s) return [];
    return String(s).split(/[,;]\s*|\s+/).filter(Boolean);
  }
  function attr(el, name, def) {
    return el.hasAttribute(name) ? el.getAttribute(name) : def;
  }
  function svg(w, h, inner, extra) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + 'mm" height="' + h +
      'mm" viewBox="0 0 ' + w + ' ' + h + '"' + (extra || '') + '>' + inner + '</svg>';
  }
  function r2(x) { return Math.round(x * 100) / 100; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // ---------------------------------------------------------------------
  // Rechnen: Ausdrücke mit + − · : (Punkt vor Strich)
  // ---------------------------------------------------------------------
  const OPS = { '+': '+', '-': MINUS, '−': MINUS, '·': '·', '⋅': '·', ':': ':' };
  function rechne(werte, ops) {
    // werte: Zahlen, ops: Operatoren dazwischen. Ergebnis oder NaN.
    if (werte.length !== ops.length + 1) return NaN;
    const w = [werte[0]];
    const o = [];
    for (let i = 0; i < ops.length; i++) {
      const op = OPS[ops[i]];
      const b = werte[i + 1];
      if (op === '·') w[w.length - 1] = w[w.length - 1] * b;
      else if (op === ':') {
        const a = w[w.length - 1];
        if (b === 0 || a % b !== 0) return NaN;
        w[w.length - 1] = a / b;
      } else { o.push(op); w.push(b); }
    }
    let erg = w[0];
    for (let i = 0; i < o.length; i++) erg = o[i] === '+' ? erg + w[i + 1] : erg - w[i + 1];
    return erg;
  }
  function vergleiche(a, rel, b) {
    if (rel === '=') return a === b;
    if (rel === '<') return a < b;
    if (rel === '>') return a > b;
    return false;
  }
  window.__rechne = rechne;

  // ---------------------------------------------------------------------
  // Antwortfeld: <span class="feld"><span class="lsg">…</span></span>
  // ---------------------------------------------------------------------
  function feldHTML(loesung, art) {
    let cls = 'feld';
    if (art) cls += ' ' + art;
    return '<span class="' + cls + '"><span class="lsg">' + esc(loesung) + '</span></span>';
  }
  function feldArt(wert, wunsch) {
    if (wunsch) return wunsch;
    const s = String(wert);
    if (s.replace(MINUS, '').length >= 3) return 'b3';
    return '';
  }

  // <m-feld l="7" [art="k|b3|text|rel"]>
  function mFeld(el) {
    if (!el.hasAttribute('l') || el.getAttribute('l').trim() === '') {
      fehler(el, 'm-feld braucht eine Lösung: l="…"');
      return;
    }
    const l = el.getAttribute('l');
    el.innerHTML = feldHTML(l, attr(el, 'art', feldArt(l)));
    el.classList.add('komp', 'geprueft');
  }

  // ---------------------------------------------------------------------
  // <m-aufgabe>8 + 5 = _</m-aufgabe>
  //   _      Lücke, wird ausgerechnet
  //   [13]   Lücke mit angegebener Lösung (wird geprüft)
  //   [<]    Lücke für Vergleichs- oder Rechenzeichen
  // ---------------------------------------------------------------------
  function mAufgabe(el) {
    const src = el.getAttribute('data-src') || el.textContent.trim().replace(/\s+/g, ' ');
    el.setAttribute('data-src', src);
    const roh = src.split(' ');
    const t = [];
    for (const r of roh) {
      if (r === '_') t.push({ typ: 'zahl', luecke: true, auto: true });
      else if (/^\[.+\]$/.test(r)) {
        const inn = r.slice(1, -1);
        if (/^[=<>]$/.test(inn)) t.push({ typ: 'rel', wert: inn, luecke: true });
        else if (OPS[inn]) t.push({ typ: 'op', wert: OPS[inn], luecke: true });
        else if (!isNaN(zahl(inn))) t.push({ typ: 'zahl', wert: zahl(inn), luecke: true });
        else return fehler(el, 'Unbekannte Lücke ' + r);
      } else if (!isNaN(zahl(r))) t.push({ typ: 'zahl', wert: zahl(r) });
      else if (OPS[r]) t.push({ typ: 'op', wert: OPS[r] });
      else if (/^[=<>]$/.test(r)) t.push({ typ: 'rel', wert: r });
      else return fehler(el, 'Unbekanntes Zeichen „' + r + '“ (Leerzeichen zwischen allen Teilen!)');
    }
    // in Seiten teilen
    const seiten = [[]];
    const rels = [];
    for (const x of t) {
      if (x.typ === 'rel') { rels.push(x); seiten.push([]); } else seiten[seiten.length - 1].push(x);
    }
    if (rels.length === 0) return fehler(el, 'Aufgabe ohne = < oder >');
    for (const s of seiten) {
      if (s.length === 0 || s.length % 2 === 0) return fehler(el, 'Aufgabe unvollständig');
      for (let i = 0; i < s.length; i++) {
        if ((i % 2 === 0) !== (s[i].typ === 'zahl')) return fehler(el, 'Zahlen und Rechenzeichen müssen sich abwechseln');
      }
    }
    const wert = (s) => rechne(s.filter((_, i) => i % 2 === 0).map((x) => x.wert), s.filter((_, i) => i % 2 === 1).map((x) => x.wert));
    // automatische Lücken lösen
    const autoSeiten = seiten.filter((s) => s.some((x) => x.auto));
    if (autoSeiten.length) {
      if (rels.some((r) => r.wert !== '=')) return fehler(el, '„_“ geht nur bei Gleichungen, sonst [Lösung] schreiben');
      const bekannt = seiten.filter((s) => !s.some((x) => x.auto));
      if (!bekannt.length) return fehler(el, 'Zu viele Lücken – mit [Lösung] angeben');
      const ziel = wert(bekannt[0]);
      if (isNaN(ziel)) return fehler(el, 'Ausdruck nicht ganzzahlig');
      for (const s of autoSeiten) {
        const lks = s.filter((x) => x.auto);
        if (lks.length > 1) return fehler(el, 'Mehrere „_“ auf einer Seite – mit [Lösung] angeben');
        const lk = lks[0];
        const treffer = [];
        for (let n = 0; n <= 2000; n++) { lk.wert = n; if (wert(s) === ziel) treffer.push(n); }
        if (treffer.length !== 1) return fehler(el, treffer.length ? 'Lücke nicht eindeutig' : 'Lücke hat keine Lösung (0–2000)');
        lk.wert = treffer[0];
      }
    }
    // prüfen
    const vals = seiten.map(wert);
    if (vals.some(isNaN)) return fehler(el, 'Teilaufgabe geht nicht glatt auf');
    for (let i = 0; i < rels.length; i++) {
      if (!vergleiche(vals[i], rels[i].wert, vals[i + 1])) {
        return fehler(el, 'FALSCH: ' + fmt(vals[i]) + ' ' + rels[i].wert + ' ' + fmt(vals[i + 1]));
      }
    }
    for (const x of t) if (x.typ === 'zahl' && x.wert < 0) return fehler(el, 'Negative Zahl');
    const wunsch = el.getAttribute('feld');
    let html = '<span class="aufgabe">';
    for (const x of t) {
      if (x.luecke) {
        const art = x.typ === 'zahl' ? feldArt(x.wert, wunsch) : 'rel';
        html += feldHTML(fmt(x.wert), art);
      } else if (x.typ === 'zahl') html += '<span class="z">' + fmt(x.wert) + '</span>';
      else html += '<span class="op">' + x.wert + '</span>';
    }
    html += '</span>';
    el.innerHTML = html;
    el.classList.add('komp', 'geprueft');
  }

  // ---------------------------------------------------------------------
  // <m-rechenweg luecken="alle|ergebnis|teile|keine" [schritte]>8 + 5</m-rechenweg>
  // Zehnerüberschreitung / -unterschreitung mit Zerlegen
  // ---------------------------------------------------------------------
  function mRechenweg(el) {
    const src = el.getAttribute('data-src') || el.textContent.trim().replace(/\s+/g, ' ');
    el.setAttribute('data-src', src);
    const m = src.match(/^(\d+) ([+\-−]) (\d+)$/);
    if (!m) return fehler(el, 'Format: „8 + 5“ oder „13 − 5“');
    const a = +m[1], b = +m[3], plus = m[2] === '+';
    let t1, t2, zehn, erg;
    if (plus) {
      zehn = Math.ceil((a + 1) / 10) * 10;
      t1 = zehn - a;
      t2 = b - t1;
      erg = a + b;
      if (a % 10 === 0 || t2 <= 0) return fehler(el, 'Kein Sprung über den Zehner: ' + src);
    } else {
      zehn = Math.floor(a / 10) * 10;
      t1 = a - zehn;
      t2 = b - t1;
      erg = a - b;
      if (t1 === 0 || t2 <= 0 || erg < 0) return fehler(el, 'Kein Sprung zurück über den Zehner: ' + src);
    }
    if (rechne([a, b], [plus ? '+' : '-']) !== erg) return fehler(el, 'Rechenfehler');
    const lk = attr(el, 'luecken', 'alle');
    if (!/^(alle|ergebnis|teile|keine)$/.test(lk)) return fehler(el, 'luecken= alle|ergebnis|teile|keine');
    const zeigeTeil = (v) => (lk === 'alle' || lk === 'teile') ? feldHTML(v, 'k') : '<span class="feld k ohne"><span>' + v + '</span></span>';
    const zeigeErg = (v) => (lk === 'alle' || lk === 'ergebnis') ? feldHTML(v, feldArt(v)) : '<span class="z">' + v + '</span>';
    const op = plus ? '+' : MINUS;
    const beine = svg(28, 8, '<line class="duenn" x1="14" y1="0.5" x2="6" y2="7.5"/><line class="duenn" x1="14" y1="0.5" x2="22" y2="7.5"/>');
    let html = '<span class="rw"><span class="rw-zeile"><span class="z">' + a + '</span><span class="op">' + op +
      '</span><span class="rw-b">' + b + '<span class="rw-unten">' + beine + '<span class="rw-teile">' +
      zeigeTeil(t1) + zeigeTeil(t2) + '</span></span></span><span class="op">=</span>' + zeigeErg(erg) + '</span>';
    if (el.hasAttribute('schritte')) {
      const f = (v) => (lk === 'keine') ? '<span class="z">' + v + '</span>' : feldHTML(v, feldArt(v));
      html += '<span class="rw-schritte"><span class="aufgabe"><span class="z">' + a + '</span><span class="op">' + op + '</span>' +
        f(t1) + '<span class="op">=</span>' + f(zehn) + '</span><span class="aufgabe">' + f(zehn) + '<span class="op">' + op +
        '</span>' + f(t2) + '<span class="op">=</span>' + f(erg) + '</span></span>';
    }
    html += '<span class="rw-platz" style="display:block"></span></span>';
    el.innerHTML = html;
    el.classList.add('komp', 'geprueft');
  }

  // ---------------------------------------------------------------------
  // Formen (Punkte, Sterne, Herzen …)
  // ---------------------------------------------------------------------
  function sternPfad(cx, cy, R, r, n) {
    n = n || 5; r = r || R * 0.45;
    let d = '';
    for (let i = 0; i < 2 * n; i++) {
      const rad = i % 2 === 0 ? R : r;
      const w = Math.PI / n * i - Math.PI / 2;
      d += (i ? 'L' : 'M') + r2(cx + rad * Math.cos(w)) + ' ' + r2(cy + rad * Math.sin(w));
    }
    return d + 'Z';
  }
  function form(sym, cx, cy, r, cls) {
    cls = cls || 'p1';
    if (sym === 'stern') return '<path class="' + cls + '" d="' + sternPfad(cx, cy, r * 1.25, r * 0.55) + '"/>';
    if (sym === 'herz') {
      const s = r * 1.1;
      return '<path class="' + cls + '" d="M' + r2(cx) + ' ' + r2(cy + s) + ' C' + r2(cx - 1.6 * s) + ' ' + r2(cy) + ' ' +
        r2(cx - 0.9 * s) + ' ' + r2(cy - 1.2 * s) + ' ' + r2(cx) + ' ' + r2(cy - 0.45 * s) + ' C' + r2(cx + 0.9 * s) + ' ' +
        r2(cy - 1.2 * s) + ' ' + r2(cx + 1.6 * s) + ' ' + r2(cy) + ' ' + r2(cx) + ' ' + r2(cy + s) + 'Z"/>';
    }
    if (sym === 'edelstein') {
      const s = r * 1.15;
      return '<path class="' + cls + '" d="M' + r2(cx - s) + ' ' + r2(cy - s * 0.35) + 'L' + r2(cx - s * 0.5) + ' ' + r2(cy - s * 0.85) +
        'L' + r2(cx + s * 0.5) + ' ' + r2(cy - s * 0.85) + 'L' + r2(cx + s) + ' ' + r2(cy - s * 0.35) + 'L' + r2(cx) + ' ' + r2(cy + s) + 'Z"/>';
    }
    return '<circle class="' + cls + '" cx="' + r2(cx) + '" cy="' + r2(cy) + '" r="' + r2(r) + '"/>';
  }

  // ---------------------------------------------------------------------
  // Zehnerfeld, Zwanzigerfeld, mehrere Zehnerfelder
  // n="7"  farben="5,2"  zelle="10" (mm)  zeichne="7" (nur in Lösung)  symbol="stern"
  // ---------------------------------------------------------------------
  function punkteFarben(el, n) {
    const f = liste(el.getAttribute('farben')).map(zahl);
    if (!f.length) return [n, 0];
    if (f.length !== 2 || f.some(isNaN) || f[0] + f[1] !== n) { fehler(el, 'farben="a,b" muss zusammen n ergeben'); return [n, 0]; }
    return f;
  }
  function feldBasis(el, max) {
    let n = zahl(attr(el, 'n', '0'));
    const zeichne = el.hasAttribute('zeichne') ? zahl(el.getAttribute('zeichne')) : null;
    const lsgModus = !!el.closest('.loesungsmodus');
    if (isNaN(n) || n < 0 || n > max) { fehler(el, 'n muss 0–' + max + ' sein'); n = 0; }
    if (zeichne !== null && (isNaN(zeichne) || zeichne < 0 || zeichne > max)) { fehler(el, 'zeichne muss 0–' + max + ' sein'); }
    let gesamt = n, lsgAb = n;
    if (zeichne !== null && lsgModus) { gesamt = n + zeichne; }
    if (zeichne !== null && n + zeichne > max) fehler(el, 'n + zeichne zu groß');
    return { n, gesamt, lsgAb, farben: punkteFarben(el, n), sym: attr(el, 'symbol', 'punkt') };
  }
  function punktKlasse(i, b) {
    if (i >= b.lsgAb) return 'p2';
    return i < b.farben[0] ? 'p1' : 'p2';
  }
  function mZehnerfeld(el) {
    const z = parseFloat(attr(el, 'zelle', '10'));
    const b = feldBasis(el, 10);
    let inner = '<rect class="rahmen" x="0.3" y="0.3" width="' + r2(5 * z) + '" height="' + r2(2 * z) + '" rx="0.8"/>';
    for (let i = 1; i < 5; i++) inner += '<line class="duenn" x1="' + r2(0.3 + i * z) + '" y1="0.3" x2="' + r2(0.3 + i * z) + '" y2="' + r2(0.3 + 2 * z) + '"/>';
    inner += '<line class="duenn" x1="0.3" y1="' + r2(0.3 + z) + '" x2="' + r2(0.3 + 5 * z) + '" y2="' + r2(0.3 + z) + '"/>';
    for (let i = 0; i < b.gesamt; i++) {
      const cx = 0.3 + (i % 5 + 0.5) * z, cy = 0.3 + (Math.floor(i / 5) + 0.5) * z;
      inner += form(b.sym, cx, cy, z * 0.34, punktKlasse(i, b));
    }
    el.innerHTML = svg(r2(5 * z + 0.6), r2(2 * z + 0.6), inner);
    el.classList.add('komp');
  }
  function mZwanzigerfeld(el) {
    const z = parseFloat(attr(el, 'zelle', '8'));
    const g = z * 0.35;
    const b = feldBasis(el, 20);
    const x = (i) => 0.3 + (i % 10) * z + (i % 10 >= 5 ? g : 0);
    let inner = '';
    for (const blk of [0, 5]) {
      const x0 = 0.3 + blk * z + (blk ? g : 0);
      inner += '<rect class="rahmen" x="' + r2(x0) + '" y="0.3" width="' + r2(5 * z) + '" height="' + r2(2 * z) + '" rx="0.8"/>';
      for (let i = 1; i < 5; i++) inner += '<line class="duenn" x1="' + r2(x0 + i * z) + '" y1="0.3" x2="' + r2(x0 + i * z) + '" y2="' + r2(0.3 + 2 * z) + '"/>';
      inner += '<line class="duenn" x1="' + r2(x0) + '" y1="' + r2(0.3 + z) + '" x2="' + r2(x0 + 5 * z) + '" y2="' + r2(0.3 + z) + '"/>';
    }
    for (let i = 0; i < b.gesamt; i++) {
      inner += form(b.sym, x(i) + z / 2, 0.3 + (Math.floor(i / 10) + 0.5) * z, z * 0.34, punktKlasse(i, b));
    }
    el.innerHTML = svg(r2(10 * z + g + 0.6), r2(2 * z + 0.6), inner);
    el.classList.add('komp');
  }
  function mZehnerfelder(el) {
    const z = parseFloat(attr(el, 'zelle', '5'));
    const b = feldBasis(el, 100);
    const anzahl = Math.max(1, Math.ceil(b.gesamt / 10));
    const proReihe = parseInt(attr(el, 'proreihe', '5'), 10);
    const lx = 5 * z + z * 0.8, ly = 2 * z + z * 0.8;
    const reihen = Math.ceil(anzahl / proReihe);
    const sp = Math.min(anzahl, proReihe);
    let inner = '';
    for (let k = 0; k < anzahl; k++) {
      const x0 = 0.3 + (k % proReihe) * lx, y0 = 0.3 + Math.floor(k / proReihe) * ly;
      inner += '<rect class="rahmen" x="' + r2(x0) + '" y="' + r2(y0) + '" width="' + r2(5 * z) + '" height="' + r2(2 * z) + '" rx="0.6"/>';
      for (let i = 1; i < 5; i++) inner += '<line class="duenn" x1="' + r2(x0 + i * z) + '" y1="' + r2(y0) + '" x2="' + r2(x0 + i * z) + '" y2="' + r2(y0 + 2 * z) + '"/>';
      inner += '<line class="duenn" x1="' + r2(x0) + '" y1="' + r2(y0 + z) + '" x2="' + r2(x0 + 5 * z) + '" y2="' + r2(y0 + z) + '"/>';
      for (let i = 0; i < 10; i++) {
        const idx = k * 10 + i;
        if (idx >= b.gesamt) break;
        inner += form(b.sym, x0 + (i % 5 + 0.5) * z, y0 + (Math.floor(i / 5) + 0.5) * z, z * 0.34, punktKlasse(idx, b));
      }
    }
    el.innerHTML = svg(r2(sp * lx - z * 0.8 + 0.6), r2(reihen * ly - z * 0.8 + 0.6), inner);
    el.classList.add('komp');
  }

  // ---------------------------------------------------------------------
  // <m-wuerfel n="5" gr="14">
  // ---------------------------------------------------------------------
  const AUGEN = {
    1: [[0.5, 0.5]], 2: [[0.27, 0.27], [0.73, 0.73]], 3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
    4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
    5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
    6: [[0.27, 0.22], [0.73, 0.22], [0.27, 0.5], [0.73, 0.5], [0.27, 0.78], [0.73, 0.78]],
  };
  function mWuerfel(el) {
    const n = zahl(attr(el, 'n', '1'));
    const g = parseFloat(attr(el, 'gr', '14'));
    if (!(n >= 1 && n <= 6)) { fehler(el, 'Würfel n muss 1–6 sein'); return; }
    let inner = '<rect class="rahmen" x="0.4" y="0.4" width="' + r2(g - 0.8) + '" height="' + r2(g - 0.8) + '" rx="' + r2(g * 0.16) + '"/>';
    if (!el.hasAttribute('leer')) for (const [x, y] of AUGEN[n]) inner += '<circle class="p1" cx="' + r2(x * g) + '" cy="' + r2(y * g) + '" r="' + r2(g * 0.085) + '"/>';
    el.innerHTML = svg(g, g, inner);
    el.classList.add('komp');
  }

  // ---------------------------------------------------------------------
  // <m-punkte n="7" art="haufen|reihe|fuenfer|paare|wuerfel|kreis" gr="32" saat="1" symbol="punkt|stern|herz|edelstein" farben="5,2">
  // ---------------------------------------------------------------------
  function zufall(saat) {
    let s = (saat * 9301 + 49297) % 233280 || 1;
    return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  }
  function mPunkte(el) {
    const n = zahl(attr(el, 'n', '0'));
    const art = attr(el, 'art', 'haufen');
    const gr = parseFloat(attr(el, 'gr', '32'));
    const sym = attr(el, 'symbol', 'punkt');
    if (isNaN(n) || n < 0 || n > 30) return fehler(el, 'n muss 0–30 sein');
    const fb = punkteFarben(el, n);
    const r = gr * 0.065;
    let pos = [];
    let w = gr, h = gr;
    if (art === 'wuerfel') {
      if (n < 1 || n > 6) return fehler(el, 'Würfelbild nur 1–6');
      pos = AUGEN[n].map(([x, y]) => [x * gr, y * gr]);
    } else if (art === 'reihe') {
      const d = r * 3;
      w = n * d; h = d;
      for (let i = 0; i < n; i++) pos.push([d / 2 + i * d, d / 2]);
    } else if (art === 'fuenfer') {
      const d = r * 3, gap = r * 1.6;
      const zeilen = Math.ceil(n / 5);
      w = 5 * d; h = zeilen * d + (zeilen - 1) * gap;
      for (let i = 0; i < n; i++) pos.push([d / 2 + (i % 5) * d, d / 2 + Math.floor(i / 5) * (d + gap)]);
    } else if (art === 'paare') {
      const d = r * 3, gap = r * 1.6;
      const sp = Math.ceil(n / 2);
      w = sp * d + (sp - 1) * gap; h = 2 * d;
      for (let i = 0; i < n; i++) pos.push([d / 2 + Math.floor(i / 2) * (d + gap), d / 2 + (i % 2) * d]);
    } else if (art === 'kreis') {
      const R = gr / 2 - r * 1.6;
      for (let i = 0; i < n; i++) {
        const a = 2 * Math.PI * i / n - Math.PI / 2;
        pos.push([gr / 2 + R * Math.cos(a), gr / 2 + R * Math.sin(a)]);
      }
    } else if (art === 'haufen') {
      const rnd = zufall(parseInt(attr(el, 'saat', '1'), 10) * 31 + n);
      let dmin = r * 3.2;
      let versuche = 0;
      while (pos.length < n) {
        const p = [r * 1.4 + rnd() * (gr - r * 2.8), r * 1.4 + rnd() * (gr - r * 2.8)];
        if (pos.every((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) >= dmin)) pos.push(p);
        if (++versuche > 4000) { pos = []; versuche = 0; dmin *= 0.92; }
      }
    } else return fehler(el, 'Unbekannte art=' + art);
    let inner = '';
    if (el.hasAttribute('rahmen')) inner += '<rect class="rahmen" x="0.3" y="0.3" width="' + r2(w - 0.6) + '" height="' + r2(h - 0.6) + '" rx="2"/>';
    pos.forEach(([x, y], i) => { inner += form(sym, x, y, r, i < fb[0] ? 'p1' : 'p2'); });
    el.innerHTML = svg(r2(w), r2(h), inner);
    el.classList.add('komp');
  }

  // ---------------------------------------------------------------------
  // <m-zahlenhaus dach="10" zeilen="3 _ ; _ 6 ; [5] [5]">
  // ---------------------------------------------------------------------
  function zelle(s) {
    s = s.trim();
    if (s === '_') return { luecke: true, auto: true };
    if (/^\[.+\]$/.test(s)) return { luecke: true, wert: zahl(s.slice(1, -1)) };
    return { wert: zahl(s) };
  }
  function boxSVG(x, y, w, h, c, gr, extraCls) {
    let s = '<rect class="rahmen' + (extraCls ? ' ' + extraCls : '') + '" x="' + r2(x) + '" y="' + r2(y) + '" width="' + r2(w) + '" height="' + r2(h) + '" rx="1"/>';
    if (c.wert !== undefined && c.wert !== '' && !(typeof c.wert === 'number' && isNaN(c.wert))) {
      s += '<text class="zahl' + (c.luecke ? ' lsg' : '') + '" x="' + r2(x + w / 2) + '" y="' + r2(y + h / 2 + 0.3) + '" font-size="' + gr + '">' + fmt(c.wert) + '</text>';
    }
    return s;
  }
  function mZahlenhaus(el) {
    const dach = zelle(attr(el, 'dach', '_'));
    const zeilen = attr(el, 'zeilen', '').split(';').map((z) => z.trim()).filter(Boolean).map((z) => z.split(/\s+/).map(zelle));
    if (!zeilen.length || zeilen.some((z) => z.length !== 2)) return fehler(el, 'zeilen="a b ; c d ; …" (je 2 Zahlen)');
    if (dach.auto) {
      const voll = zeilen.find((z) => !z[0].auto && !z[1].auto);
      if (!voll) return fehler(el, 'Dach fehlt und keine volle Zeile');
      dach.wert = voll[0].wert + voll[1].wert;
    }
    for (const z of zeilen) {
      if (z[0].auto && z[1].auto) return fehler(el, 'Zwei „_“ in einer Zeile – [Lösung] angeben');
      if (z[0].auto) z[0].wert = dach.wert - z[1].wert;
      if (z[1].auto) z[1].wert = dach.wert - z[0].wert;
      if (z.some((c) => isNaN(c.wert) || c.wert < 0)) return fehler(el, 'Zahl fehlt oder negativ');
      if (z[0].wert + z[1].wert !== dach.wert) return fehler(el, 'FALSCH: ' + z[0].wert + ' + ' + z[1].wert + ' ≠ ' + dach.wert);
    }
    const w = parseFloat(attr(el, 'zelle', '17')), h = w * 0.72, dh = w * 1.25;
    const gr = h * 0.62;
    const W = 2 * w;
    let inner = '<path class="hell-f" d="M0.4 ' + r2(dh) + ' L' + r2(W / 2 + 0.4) + ' 0.6 L' + r2(W + 0.4) + ' ' + r2(dh) + ' Z" stroke="var(--tinte)" stroke-width="0.55" stroke-linejoin="round"/>';
    const bw = w * 0.7, bh = h * 0.78;
    inner += boxSVG(W / 2 + 0.4 - bw / 2, dh - bh - 2, bw, bh, dach, gr);
    zeilen.forEach((z, i) => {
      const y = dh + i * h;
      inner += boxSVG(0.4, y, w, h, z[0], gr) + boxSVG(0.4 + w, y, w, h, z[1], gr);
    });
    el.innerHTML = svg(r2(W + 0.8), r2(dh + zeilen.length * h + 0.6), inner);
    el.classList.add('komp', 'geprueft');
  }

  // ---------------------------------------------------------------------
  // <m-zahlenmauer reihen="_ ; _ _ ; 3 4 5">  (oben → unten)
  // ---------------------------------------------------------------------
  function mZahlenmauer(el) {
    const reihen = attr(el, 'reihen', '').split(';').map((z) => z.trim()).filter(Boolean).map((z) => z.split(/\s+/).map(zelle));
    const N = reihen.length;
    if (!N || reihen.some((r, i) => r.length !== i + 1)) return fehler(el, 'reihen: oben 1 Stein, darunter 2, 3 …');
    let geaendert = true;
    const bek = (c) => !c.auto;
    while (geaendert) {
      geaendert = false;
      for (let r = 0; r < N - 1; r++) for (let c = 0; c <= r; c++) {
        const o = reihen[r][c], u1 = reihen[r + 1][c], u2 = reihen[r + 1][c + 1];
        const k = [o, u1, u2].filter(bek).length;
        if (k === 2) {
          if (!bek(o)) { o.wert = u1.wert + u2.wert; o.auto = false; o.luecke = true; }
          else if (!bek(u1)) { u1.wert = o.wert - u2.wert; u1.auto = false; u1.luecke = true; }
          else { u2.wert = o.wert - u1.wert; u2.auto = false; u2.luecke = true; }
          geaendert = true;
        }
      }
    }
    for (const r of reihen) for (const c of r) {
      if (c.auto) return fehler(el, 'Mauer nicht eindeutig lösbar – [Lösung] angeben');
      if (isNaN(c.wert) || c.wert < 0) return fehler(el, 'Zahl fehlt oder negativ');
    }
    for (let r = 0; r < N - 1; r++) for (let c = 0; c <= r; c++) {
      if (reihen[r][c].wert !== reihen[r + 1][c].wert + reihen[r + 1][c + 1].wert) {
        return fehler(el, 'FALSCH in Reihe ' + (r + 1) + ': ' + reihen[r][c].wert + ' ≠ ' + reihen[r + 1][c].wert + ' + ' + reihen[r + 1][c + 1].wert);
      }
    }
    const w = parseFloat(attr(el, 'stein', '19')), h = w * 0.62, gr = h * 0.62;
    let inner = '';
    reihen.forEach((reihe, r) => {
      const x0 = (N - 1 - r) * w / 2;
      reihe.forEach((c, i) => { inner += boxSVG(0.4 + x0 + i * w, 0.4 + r * h, w, h, c, gr); });
    });
    el.innerHTML = svg(r2(N * w + 0.8), r2(N * h + 0.8), inner);
    el.classList.add('komp', 'geprueft');
  }

  // ---------------------------------------------------------------------
  // <m-zahlenstrahl von="0" bis="20" breite="170" beschriftung="alle|fuenfer|zehner|keine|0,10,20"
  //                 luecken="7,13" markiert="8" spruenge="8>10>13" sprung-luecken>
  // ---------------------------------------------------------------------
  function bogenSVG(x1, x2, yLinie, hoehe, label, lsg, gr, box) {
    const xm = (x1 + x2) / 2, top = yLinie - hoehe;
    let s = '<path class="bogen" d="M' + r2(x1) + ' ' + r2(yLinie - 0.8) + ' Q' + r2(xm) + ' ' + r2(top - hoehe * 0.35) + ' ' + r2(x2) + ' ' + r2(yLinie - 0.8) + '"/>';
    const dir = x2 > x1 ? -1 : 1;
    s += '<path class="akzent-f" d="M' + r2(x2) + ' ' + r2(yLinie - 0.6) + ' l' + r2(dir * 2.2) + ' ' + r2(-2.0) + ' l' + r2(dir * 0.3) + ' 2.6 Z"/>';
    if (box) {
      const bw = 13, bh = 9.5;
      s += boxSVG(xm - bw / 2, top - bh - 0.5, bw, bh, { wert: label, luecke: lsg }, gr);
    } else {
      s += '<text class="zahl" x="' + r2(xm) + '" y="' + r2(top - 3) + '" font-size="' + gr + '" fill="var(--akzent)">' + label + '</text>';
    }
    return s;
  }
  function mZahlenstrahl(el) {
    const von = zahl(attr(el, 'von', '0')), bis = zahl(attr(el, 'bis', '20'));
    const schritt = zahl(attr(el, 'schritt', '1'));
    const B = parseFloat(attr(el, 'breite', '170'));
    if ([von, bis, schritt].some(isNaN) || bis <= von || (bis - von) % schritt) return fehler(el, 'von/bis/schritt passen nicht');
    const anz = (bis - von) / schritt;
    const rand = 5;
    const dx = (B - 2 * rand) / anz;
    const xv = (v) => rand + (v - von) / schritt * dx;
    const luecken = liste(attr(el, 'luecken', '')).map(zahl);
    const markiert = liste(attr(el, 'markiert', '')).map(zahl);
    const spruengeRoh = liste(attr(el, 'spruenge', ''));
    const besch = attr(el, 'beschriftung', anz <= 20 ? 'alle' : (anz <= 50 ? 'fuenfer' : 'zehner'));
    const gr = 4.6;
    for (const v of luecken.concat(markiert)) if (isNaN(v) || v < von || v > bis || (v - von) % schritt) return fehler(el, 'Lücke/Markierung ' + v + ' liegt nicht auf dem Strahl');
    const zeigt = (v) => {
      if (luecken.includes(v)) return false;
      if (besch === 'alle') return true;
      if (besch === 'keine') return false;
      if (besch === 'fuenfer') return v % 5 === 0;
      if (besch === 'zehner') return v % 10 === 0;
      return liste(besch).map(zahl).includes(v);
    };
    const bw = 12, bh = 9.5;
    // Überlappung prüfen: Zahlen untereinander, Lücken (eine Zeile tiefer) untereinander
    const zahlen = [], kaesten = [];
    for (let v = von; v <= bis; v += schritt) {
      if (luecken.includes(v)) kaesten.push([xv(v) - bw / 2, xv(v) + bw / 2]);
      else if (zeigt(v)) { const tw = String(v).length * gr * 0.55; zahlen.push([xv(v) - tw / 2, xv(v) + tw / 2]); }
    }
    for (const b of [zahlen, kaesten]) for (let i = 1; i < b.length; i++) {
      if (b[i][0] < b[i - 1][1] + 0.6) return fehler(el, 'Zahlen/Lücken am Zahlenstrahl zu dicht – breiter machen, weniger beschriften oder Lücken nicht nebeneinander');
    }
    const ketten = spruengeRoh.map((k) => k.split('>').map(zahl));
    const hatSpr = ketten.length > 0;
    const sprBox = el.hasAttribute('sprung-luecken');
    const yL = hatSpr ? (sprBox ? 22 : 15) : 4;
    let inner = '<line x1="0" y1="' + yL + '" x2="' + r2(B - 1) + '" y2="' + yL + '" stroke="var(--tinte)" stroke-width="0.6"/>' +
      '<path d="M' + r2(B) + ' ' + yL + ' l-3 -1.6 l0 3.2 Z" fill="var(--tinte)"/>';
    for (let v = von; v <= bis; v += schritt) {
      const x = xv(v);
      const lang = v % 10 === 0 ? 3.2 : (v % 5 === 0 ? 2.4 : 1.6);
      inner += '<line x1="' + r2(x) + '" y1="' + r2(yL - lang) + '" x2="' + r2(x) + '" y2="' + r2(yL + lang) + '" stroke="var(--tinte)" stroke-width="' + (v % 10 === 0 ? 0.55 : 0.4) + '"/>';
      if (luecken.includes(v)) {
        inner += '<line x1="' + r2(x) + '" y1="' + r2(yL + lang) + '" x2="' + r2(x) + '" y2="' + r2(yL + 11) + '" stroke="var(--tinte)" stroke-width="0.3" stroke-dasharray="0.8 0.8"/>';
        inner += boxSVG(x - bw / 2, yL + 11, bw, bh, { wert: v, luecke: true }, gr + 0.6);
      }
      else if (zeigt(v)) inner += '<text class="zahl" x="' + r2(x) + '" y="' + r2(yL + 7.5) + '" font-size="' + gr + '">' + v + '</text>';
      if (markiert.includes(v)) inner += '<circle class="p2" cx="' + r2(x) + '" cy="' + yL + '" r="1.5"/>';
    }
    for (const k of ketten) {
      if (k.some((v) => isNaN(v) || v < von || v > bis)) return fehler(el, 'Sprung außerhalb des Strahls');
      for (let i = 0; i < k.length - 1; i++) {
        const d = k[i + 1] - k[i];
        if (d === 0) return fehler(el, 'Sprung der Länge 0');
        inner += bogenSVG(xv(k[i]), xv(k[i + 1]), yL, sprBox ? 8 : 6.5, (d > 0 ? '+' : MINUS) + Math.abs(d), true, gr, sprBox);
      }
    }
    el.innerHTML = svg(r2(B + 0.5), r2(yL + (luecken.length ? 21 : 10)), inner);
    el.classList.add('komp');
  }

  // ---------------------------------------------------------------------
  // <m-rechenstrich start="8" spruenge="+2 +3" luecken="zwischen,ziel,spruenge" breite="150">
  // <m-rechenstrich blanko breite="160">
  // ---------------------------------------------------------------------
  function mRechenstrich(el) {
    const B = parseFloat(attr(el, 'breite', '150'));
    if (el.hasAttribute('blanko')) {
      const h = parseFloat(attr(el, 'hoehe', '30'));
      el.innerHTML = svg(B, h, '<line x1="2" y1="' + r2(h * 0.62) + '" x2="' + r2(B - 2) + '" y2="' + r2(h * 0.62) + '" stroke="var(--tinte)" stroke-width="0.6"/>');
      el.classList.add('komp');
      return;
    }
    const start = zahl(attr(el, 'start', ''));
    const spr = liste(attr(el, 'spruenge', '')).map((s) => zahl(s.replace(/^\+/, '')));
    if (isNaN(start) || !spr.length || spr.some(isNaN)) return fehler(el, 'start="8" spruenge="+2 +3"');
    const plus = spr[0] > 0;
    if (spr.some((s) => (s > 0) !== plus)) return fehler(el, 'Alle Sprünge in dieselbe Richtung');
    const lk = liste(attr(el, 'luecken', 'keine'));
    const werte = [start];
    for (const s of spr) werte.push(werte[werte.length - 1] + s);
    if (werte.some((v) => v < 0)) return fehler(el, 'Rechenstrich geht unter 0');
    const rand = 9, minW = 24;
    const verf = B - 2 * rand;
    if (minW * spr.length > verf) return fehler(el, 'Rechenstrich zu schmal für so viele Sprünge');
    const summe = spr.reduce((a, s) => a + Math.abs(s), 0);
    const breiten = spr.map((s) => minW + (verf - minW * spr.length) * Math.abs(s) / summe);
    const xs = [plus ? rand : B - rand];
    breiten.forEach((b) => xs.push(xs[xs.length - 1] + (plus ? b : -b)));
    const gr = 5.2;
    const yL = 21;
    let inner = '<line x1="2" y1="' + yL + '" x2="' + r2(B - 2) + '" y2="' + yL + '" stroke="var(--tinte)" stroke-width="0.6"/>';
    werte.forEach((v, i) => {
      const x = xs[i];
      inner += '<line x1="' + r2(x) + '" y1="' + (yL - 2.2) + '" x2="' + r2(x) + '" y2="' + (yL + 2.2) + '" stroke="var(--tinte)" stroke-width="0.5"/>';
      const rolle = i === 0 ? 'start' : (i === werte.length - 1 ? 'ziel' : 'zwischen');
      const luecke = lk.includes(rolle) || lk.includes('alle') && rolle !== 'start';
      if (luecke) inner += boxSVG(x - 7, yL + 3.5, 14, 10, { wert: v, luecke: true }, gr);
      else inner += '<text class="zahl" x="' + r2(x) + '" y="' + r2(yL + 8) + '" font-size="' + gr + '">' + v + '</text>';
    });
    spr.forEach((s, i) => {
      const box = lk.includes('spruenge') || lk.includes('alle');
      inner += bogenSVG(xs[i], xs[i + 1], yL, 6.5, (s > 0 ? '+' : MINUS) + Math.abs(s), true, gr, box);
      if (!box) {
        // Text über dem Bogen in Akzentfarbe ist schon gesetzt
      }
    });
    el.innerHTML = svg(B, yL + 15, inner);
    el.classList.add('komp', 'geprueft');
  }

  // ---------------------------------------------------------------------
  // <m-kaestchen b="16" h="4">  1-cm-Kästchen
  // ---------------------------------------------------------------------
  function mKaestchen(el) {
    const b = zahl(attr(el, 'b', '10')), h = zahl(attr(el, 'h', '3'));
    if (isNaN(b) || isNaN(h) || b < 1 || h < 1) return fehler(el, 'b und h in Kästchen');
    let inner = '';
    for (let i = 0; i <= b; i++) inner += '<line class="kaestchen" x1="' + (0.2 + i * 10) + '" y1="0.2" x2="' + (0.2 + i * 10) + '" y2="' + (0.2 + h * 10) + '"/>';
    for (let j = 0; j <= h; j++) inner += '<line class="kaestchen" x1="0.2" y1="' + (0.2 + j * 10) + '" x2="' + (0.2 + b * 10) + '" y2="' + (0.2 + j * 10) + '"/>';
    el.innerHTML = svg(b * 10 + 0.4, h * 10 + 0.4, inner);
    el.classList.add('komp');
  }

  // ---------------------------------------------------------------------
  // <m-spielfeld von="0" bis="20" spalten="7" extra="7:stern,13:drache">
  // ---------------------------------------------------------------------
  function mSpielfeld(el) {
    const von = zahl(attr(el, 'von', '0')), bis = zahl(attr(el, 'bis', '20'));
    const sp = zahl(attr(el, 'spalten', '7'));
    const d = parseFloat(attr(el, 'feld', '17'));
    const ab = parseFloat(attr(el, 'abstand', '8'));
    if ([von, bis, sp].some(isNaN) || bis <= von) return fehler(el, 'von/bis/spalten');
    const extra = {};
    liste(attr(el, 'extra', '')).forEach((e) => { const [k, v] = e.split(':'); extra[zahl(k)] = v; });
    const n = bis - von + 1;
    const zeilen = Math.ceil(n / sp);
    const pos = [];
    for (let i = 0; i < n; i++) {
      const z = Math.floor(i / sp), c = i % sp;
      const cc = z % 2 === 0 ? c : sp - 1 - c;
      pos.push([d / 2 + 1 + cc * (d + ab), d / 2 + 1 + z * (d + ab)]);
    }
    let inner = '<polyline points="' + pos.map((p) => r2(p[0]) + ',' + r2(p[1])).join(' ') + '" fill="none" stroke="var(--akzent)" stroke-width="2.2" stroke-linejoin="round" opacity="0.35"/>';
    pos.forEach(([x, y], i) => {
      const v = von + i;
      const sonder = i === 0 || i === n - 1;
      inner += '<circle cx="' + r2(x) + '" cy="' + r2(y) + '" r="' + r2(d / 2) + '" fill="' + (sonder ? 'var(--gold-hell)' : 'white') + '" stroke="var(--tinte)" stroke-width="0.55"/>';
      inner += '<text class="zahl" x="' + r2(x) + '" y="' + r2(y + 0.4) + '" font-size="' + r2(d * 0.38) + '">' + v + '</text>';
      if (extra[v]) inner += '<g transform="translate(' + r2(x + d * 0.18) + ' ' + r2(y - d * 0.62) + ') scale(' + r2(d * 0.45 / 100) + ')">' + (BILDER[extra[v]] || '') + '</g>';
    });
    el.innerHTML = svg(r2(sp * d + (sp - 1) * ab + 2), r2(zeilen * d + (zeilen - 1) * ab + 2), inner);
    el.classList.add('komp');
  }

  // ---------------------------------------------------------------------
  // Bilder (Strichzeichnungen zum Anmalen), Koordinaten 0–100
  // ---------------------------------------------------------------------
  const S = ' fill="white" stroke="#1f2340" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"';
  const SL = ' fill="none" stroke="#1f2340" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"';
  const BILDER = {
    stern: '<path' + S + ' d="' + sternPfad(50, 53, 46, 20) + '"/>',
    zauberstab: '<path' + SL + ' d="M14 88 L60 42"/><path' + S + ' d="' + sternPfad(68, 32, 22, 10) + '"/>' +
      '<path' + SL + ' d="M26 22 v10 M21 27 h10 M86 66 v8 M82 70 h8 M44 12 v6 M41 15 h6"/>',
    krone: '<path' + S + ' d="M12 78 L12 34 L31 54 L50 22 L69 54 L88 34 L88 78 Z"/><path' + SL + ' d="M12 68 H88"/>' +
      '<circle' + S + ' cx="12" cy="30" r="5"/><circle' + S + ' cx="50" cy="18" r="5"/><circle' + S + ' cx="88" cy="30" r="5"/>',
    mond: '<path' + S + ' d="M58 10 A42 42 0 1 0 90 72 A34 34 0 1 1 58 10 Z"/>',
    edelstein: '<path' + S + ' d="M10 38 L28 16 H72 L90 38 L50 88 Z"/><path' + SL + ' d="M10 38 H90 M28 16 L38 38 L50 16 L62 38 L72 16 M38 38 L50 88 L62 38"/>',
    trank: '<path' + S + ' d="M40 10 H60 V34 C80 42 88 58 84 72 C80 86 66 92 50 92 C34 92 20 86 16 72 C12 58 20 42 40 34 Z"/>' +
      '<path' + SL + ' d="M20 64 C34 58 46 70 60 62 C70 57 78 60 84 64"/><circle' + SL + ' cx="44" cy="76" r="4"/><circle' + SL + ' cx="60" cy="80" r="3"/><path' + SL + ' d="M36 10 H64"/>',
    zauberhut: '<path' + S + ' d="M50 6 L76 76 H24 Z"/><ellipse' + S + ' cx="50" cy="80" rx="44" ry="10"/><path' + S + ' d="' + sternPfad(50, 48, 11, 5) + '"/>',
    schloss: '<path' + S + ' d="M14 92 V40 H30 V56 H70 V40 H86 V92 Z"/><path' + S + ' d="M10 40 V28 H16 V34 H22 V28 H28 V34 H34 V40 Z M66 40 V28 H72 V34 H78 V28 H84 V34 H90 V40 Z"/>' +
      '<path' + S + ' d="M42 92 V74 A8 8 0 0 1 58 74 V92 Z"/><path' + SL + ' d="M22 28 V12 M78 28 V12"/><path' + S + ' d="M22 12 L34 16 L22 20 Z M78 12 L90 16 L78 20 Z"/>',
    drache: '<path' + S + ' d="M28 80 C14 82 6 74 8 64 L2 60 L12 56 L13 64 C13 70 18 73 28 72 Z"/>' +
      '<path' + S + ' d="M36 56 C26 44 18 34 20 20 C27 25 33 24 37 19 C41 27 46 35 46 50 Z"/><path' + SL + ' d="M28 30 C31 38 35 45 40 51"/>' +
      '<path' + S + ' d="M28 90 C12 90 12 62 30 54 C42 48 58 50 64 60 C72 74 68 90 52 90 Z"/>' +
      '<path' + SL + ' d="M40 66 C44 70 52 70 56 66 M38 76 C44 80 52 80 58 76"/>' +
      '<path' + S + ' d="M50 16 L49 4 L57 13 Z M64 12 L68 1 L71 14 Z"/>' +
      '<ellipse' + S + ' cx="60" cy="30" rx="19" ry="17"/>' +
      '<ellipse' + S + ' cx="78" cy="38" rx="13" ry="10"/>' +
      '<circle cx="62" cy="26" r="3.4" fill="#1f2340"/><circle cx="84" cy="35" r="1.8" fill="#1f2340"/><path' + SL + ' d="M72 44 C76 46 81 46 85 44"/>' +
      '<path' + S + ' d="M30 88 C30 82 40 82 40 88 Z M52 88 C52 82 62 82 62 88 Z"/>',
    einhorn: '<path' + S + ' d="M26 94 C24 72 30 50 44 40 C54 33 66 32 76 38 C84 43 90 52 92 58 C94 64 88 68 82 66 C76 64 72 64 66 68 C60 74 60 84 62 94 Z"/>' +
      '<path' + S + ' d="M58 36 L76 4 L68 38 Z"/><path' + SL + ' d="M62 30 L70 30 M65 22 L72 22 M68 14 L74 14"/>' +
      '<path' + S + ' d="M46 40 L42 22 L56 35 Z"/><circle cx="70" cy="49" r="3" fill="#1f2340"/><circle cx="86" cy="60" r="1.6" fill="#1f2340"/>' +
      '<path' + S + ' d="M44 40 C34 40 32 50 26 52 C32 54 30 60 22 64 C28 66 28 72 20 78 C26 80 26 86 24 92 L28 94 C26 74 32 52 44 40 Z"/>',
    fee: '<ellipse' + S + ' cx="32" cy="42" rx="18" ry="11" transform="rotate(-30 32 42)"/><ellipse' + S + ' cx="68" cy="42" rx="18" ry="11" transform="rotate(30 68 42)"/>' +
      '<path' + S + ' d="M50 34 L30 80 H70 Z"/><circle' + S + ' cx="50" cy="24" r="11"/>' +
      '<path' + SL + ' d="M42 86 L44 80 M58 86 L56 80 M40 46 L28 58 M60 46 L76 36"/><path' + S + ' d="' + sternPfad(80, 30, 9, 4) + '"/>' +
      '<circle cx="46" cy="23" r="1.6" fill="#1f2340"/><circle cx="54" cy="23" r="1.6" fill="#1f2340"/><path' + SL + ' d="M46 28 C48 30 52 30 54 28"/>',
    schere: '<circle' + S + ' cx="22" cy="30" r="12"/><circle' + S + ' cx="22" cy="70" r="12"/><path' + SL + ' d="M32 36 L90 72 M32 64 L90 28"/>',
    gluehbirne: '<path' + S + ' d="M50 8 C28 8 18 26 22 42 C25 54 36 58 36 70 H64 C64 58 75 54 78 42 C82 26 72 8 50 8 Z"/><path' + S + ' d="M36 70 H64 V80 H36 Z M40 80 H60 V88 H40 Z"/><path' + SL + ' d="M44 56 L50 40 L56 56"/>',
    eule: '<ellipse' + S + ' cx="50" cy="58" rx="32" ry="34"/><path' + S + ' d="M22 34 L18 12 L38 26 Z M78 34 L82 12 L62 26 Z"/>' +
      '<circle' + S + ' cx="36" cy="44" r="11"/><circle' + S + ' cx="64" cy="44" r="11"/><circle cx="36" cy="44" r="4" fill="#1f2340"/><circle cx="64" cy="44" r="4" fill="#1f2340"/>' +
      '<path' + S + ' d="M45 56 L55 56 L50 66 Z"/><path' + SL + ' d="M36 76 L40 72 L44 76 M48 80 L52 76 L56 80 M56 72 L60 68 L64 72"/>',
    wuerfel: '<rect' + S + ' x="12" y="12" width="76" height="76" rx="14"/><circle cx="32" cy="32" r="7" fill="#1f2340"/><circle cx="50" cy="50" r="7" fill="#1f2340"/><circle cx="68" cy="68" r="7" fill="#1f2340"/>',
    rakete: '<path' + S + ' d="M50 6 C66 18 70 40 66 66 H34 C30 40 34 18 50 6 Z"/><circle' + S + ' cx="50" cy="36" r="8"/>' +
      '<path' + S + ' d="M34 50 L20 70 L34 66 Z M66 50 L80 70 L66 66 Z"/><path' + S + ' d="M40 66 L50 92 L60 66 Z"/>',
    karten: '<rect' + S + ' x="14" y="20" width="46" height="66" rx="6" transform="rotate(-12 37 53)"/><rect' + S + ' x="40" y="14" width="46" height="66" rx="6" transform="rotate(10 63 47)"/>' +
      '<path' + S + ' d="M62 34 L70 46 L62 58 L54 46 Z" transform="rotate(10 63 47)"/>',
    ei: '<path' + S + ' d="M50 8 C72 8 86 44 86 62 C86 80 70 92 50 92 C30 92 14 80 14 62 C14 44 28 8 50 8 Z"/>',
    kreide: '<path' + S + ' d="M14 70 L62 22 L78 38 L30 86 Z"/><path' + SL + ' d="M54 30 L70 46"/>',
    haken: '<path fill="none" stroke="#1f2340" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" d="M14 54 L38 78 L86 24"/>',
    ziel: '<circle' + S + ' cx="50" cy="50" r="40"/><circle' + S + ' cx="50" cy="50" r="26"/><circle cx="50" cy="50" r="11" fill="#1f2340"/>',
    achtung: '<path' + S + ' d="M50 8 L94 88 H6 Z"/><path fill="none" stroke="#1f2340" stroke-width="8" stroke-linecap="round" d="M50 36 V60"/><circle cx="50" cy="74" r="5" fill="#1f2340"/>',
    feder: '<path' + S + ' d="M84 10 C50 14 26 40 22 76 L30 72 C40 70 64 56 72 38 L58 38 L78 28 C82 22 84 16 84 10 Z"/><path' + SL + ' d="M14 90 L52 46"/>',
    huepfen: '<circle' + S + ' cx="50" cy="16" r="10"/><path' + SL + ' d="M50 26 V58 M50 36 L30 22 M50 36 L72 24 M50 58 L34 76 L36 90 M50 58 L68 72 L82 66"/><path' + SL + ' d="M14 92 H88" stroke-dasharray="6 6"/>',
    medaille: '<path' + S + ' d="M34 6 L50 40 L66 6 Z"/><path' + SL + ' d="M42 6 L50 24 L58 6"/><circle' + S + ' cx="50" cy="62" r="30"/><circle' + SL + ' cx="50" cy="62" r="21"/><path fill="#1f2340" d="' + sternPfad(50, 63, 12, 5.5) + '"/>',
    lupe: '<circle' + S + ' cx="40" cy="40" r="28"/><path fill="none" stroke="#1f2340" stroke-width="9" stroke-linecap="round" d="M62 62 L88 88"/>',
  };
  window.__bilder = BILDER;
  function bildSVG(name, gr) {
    if (!BILDER[name]) return null;
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + gr + 'mm" height="' + gr + 'mm" viewBox="0 0 100 100">' + BILDER[name] + '</svg>';
  }
  function mBild(el) {
    const name = attr(el, 'name', '');
    const s = bildSVG(name, parseFloat(attr(el, 'gr', '20')));
    if (!s) return fehler(el, 'Unbekanntes Bild „' + name + '“. Es gibt: ' + Object.keys(BILDER).join(', '));
    el.innerHTML = s;
    el.classList.add('komp');
  }
  function mStern(el) {
    const g = parseFloat(attr(el, 'gr', '14'));
    el.innerHTML = svg(g, g, '<path fill="white" stroke="var(--gold)" stroke-width="' + r2(g * 0.06) + '" stroke-linejoin="round" d="' + sternPfad(g / 2, g * 0.53, g * 0.47, g * 0.2) + '"/>');
    el.classList.add('komp');
  }

  // ---------------------------------------------------------------------
  // <m-karten spalten="3" zeilen="4" [hoehe="60"]> <div>…</div> … </m-karten>
  // ---------------------------------------------------------------------
  function mKarten(el) {
    const sp = zahl(attr(el, 'spalten', '3')), ze = zahl(attr(el, 'zeilen', '4'));
    const breite = parseFloat(attr(el, 'breite', '180'));
    const kb = breite / sp;
    const kh = parseFloat(attr(el, 'hoehe', String(kb)));
    const karten = Array.from(el.children);
    if (karten.length > sp * ze) return fehler(el, 'Mehr Karten als Plätze');
    const raster = document.createElement('div');
    raster.className = 'karten-raster';
    raster.style.gridTemplateColumns = 'repeat(' + sp + ', ' + r2(kb) + 'mm)';
    raster.style.gridAutoRows = r2(kh) + 'mm';
    raster.style.width = r2(breite) + 'mm';
    for (let i = 0; i < sp * ze; i++) {
      const k = karten[i] || document.createElement('div');
      k.classList.add('karte');
      if (i % sp === sp - 1) k.classList.add('r');
      if (Math.floor(i / sp) === ze - 1) k.classList.add('u');
      raster.appendChild(k);
    }
    const sch = document.createElement('span');
    sch.className = 'schere';
    sch.innerHTML = bildSVG('schere', 7);
    raster.appendChild(sch);
    el.innerHTML = '';
    el.appendChild(raster);
    el.classList.add('komp-karten');
  }

  // ---------------------------------------------------------------------
  // Blätter und Anleitungen aufbauen
  // ---------------------------------------------------------------------
  const BLOCK_TITEL = { A: 'Zahlen bis 20', B: 'Zahlenraum bis 100', C: 'Mal & Geteilt', D: 'Knobeln, Geometrie, Extras' };
  function blockVon(n) { return n <= 6 ? 'A' : n <= 12 ? 'B' : n <= 15 ? 'C' : 'D'; }

  function nummeriereBlaetter() {
    const zaehler = {};
    document.querySelectorAll('section.blatt').forEach((b) => {
      const e = b.dataset.einheit;
      if (!e) { fehler(b, 'Blatt ohne data-einheit'); return; }
      zaehler[e] = (zaehler[e] || 0) + 1;
      b.dataset.blatt = e + '-' + zaehler[e];
      b.id = 'blatt-' + e + '-' + zaehler[e];
      if (!b.dataset.block) b.dataset.block = blockVon(+e);
      if (!b.classList.contains('seite')) b.classList.add('seite');
    });
    return zaehler;
  }

  function baueBlatt(b) {
    if (b.querySelector(':scope > .blatt-kopf')) return;
    const titel = b.dataset.titel || '';
    if (!titel) fehler(b, 'Blatt ohne data-titel');
    const inhalt = document.createElement('div');
    inhalt.className = 'inhalt' + (b.hasAttribute('data-verteilt') ? ' verteilt' : '');
    while (b.firstChild) inhalt.appendChild(b.firstChild);
    const kopf = document.createElement('header');
    kopf.className = 'blatt-kopf';
    kopf.innerHTML = '<span class="nummer">Einheit ' + b.dataset.einheit + '</span><h1>' + esc(titel) + '</h1>' +
      '<span class="geschafft">Geschafft?<m-stern gr="13"></m-stern></span>';
    const fuss = document.createElement('div');
    fuss.className = 'fuss';
    const art = b.dataset.art && b.dataset.art !== 'Blatt' ? ' · ' + b.dataset.art : '';
    fuss.innerHTML = '<span>Mathildas Rechen-Werkstatt</span>' + (b.id ? '<span class="seitenzahl" data-ref="' + b.id + '"></span>' : '<span></span>') + '<span>Blatt ' + b.dataset.blatt + esc(art) + '</span>';
    b.appendChild(kopf);
    b.appendChild(inhalt);
    b.appendChild(fuss);
    b.querySelectorAll('.profi, .knobel').forEach((k) => {
      if (k.querySelector(':scope > .marke')) return;
      const m = document.createElement('div');
      m.className = 'marke';
      const istProfi = k.classList.contains('profi');
      m.innerHTML = bildSVG(istProfi ? 'krone' : 'eule', 8) + esc(k.dataset.titel || (istProfi ? 'Profi-Aufgabe' : 'Knobel-Ecke'));
      k.insertBefore(m, k.firstChild);
    });
  }

  const KASTEN = {
    ziel: ['Darum geht’s heute', 'ziel'],
    material: ['Material & Vorbereitung', 'schere'],
    einschaetzung: ['Nebenbei einschätzen: Wo steht Mathilda?', 'lupe'],
    stolper: ['Stolpersteine', 'achtung'],
    leichter: ['Leichter machen', 'feder'],
    schwerer: ['Schwerer machen', 'rakete'],
    bonus: ['Bonus-Knobelei für zwischendurch', 'gluehbirne'],
    warum: ['Warum funktioniert das?', 'eule'],
    tipp: ['Tipp', 'stern'],
    bewegung: ['Bewegung', 'huepfen'],
    basteln: ['Basteln', 'schere'],
    spiel: ['Spiel', 'wuerfel'],
    loesung: ['Lösung', 'haken'],
  };
  function baueAnleitung(a) {
    const n = a.dataset.einheit;
    if (!n) return fehler(a, 'Anleitung ohne data-einheit');
    if (!a.dataset.block) a.dataset.block = blockVon(+n);
    a.id = a.id || 'einheit-' + n;
    a.setAttribute('data-toc', 'Einheit ' + n + ' · ' + (a.dataset.titel || ''));
    // Zeiten im Ablauf
    let summe = 0;
    a.querySelectorAll('ol.ablauf > li').forEach((li) => {
      const m = zahl(li.dataset.min);
      if (isNaN(m)) { fehler(li, 'Ablauf-Schritt ohne data-min'); return; }
      summe += m;
      if (!li.querySelector(':scope > .zeit')) {
        const z = document.createElement('span');
        z.className = 'zeit';
        z.textContent = m + ' Min';
        li.insertBefore(z, li.firstChild);
      }
    });
    a.querySelectorAll('ol.ablauf').forEach((ol) => {
      if (ol.nextElementSibling && ol.nextElementSibling.classList.contains('ablauf-summe')) return;
      const p = document.createElement('p');
      p.className = 'ablauf-summe';
      p.textContent = 'Zusammen etwa ' + summe + ' Minuten. Ihr müsst nicht alles schaffen: Wenn es gerade gut läuft, bleibt ruhig länger bei einem Spiel.';
      ol.after(p);
    });
    if (summe && (summe < 18 || summe > 32)) warnung(a, 'Ablauf dauert ' + summe + ' Minuten (Ziel: 20–30)');
    // Kopf
    if (!a.querySelector(':scope > .einheit-kopf')) {
      const k = document.createElement('header');
      k.className = 'einheit-kopf';
      const blk = a.dataset.block;
      k.innerHTML = '<div class="badge"><small>Einheit</small><b>' + n + '</b></div><div><h1>' + esc(a.dataset.titel || '') + '</h1>' +
        '<div class="unter">Block ' + blk + ': ' + BLOCK_TITEL[blk] + ' · Anleitung für dich' + (summe ? ' · etwa ' + summe + ' Minuten' : '') + '</div></div>';
      a.insertBefore(k, a.firstChild);
    }
    // Kästen
    a.querySelectorAll('.kasten').forEach((k) => {
      if (k.querySelector(':scope > .kasten-titel')) return;
      const typ = Object.keys(KASTEN).find((t) => k.classList.contains(t));
      if (!typ && !k.dataset.titel) return;
      const [titel, bild] = typ ? KASTEN[typ] : ['', 'stern'];
      const t = document.createElement('div');
      t.className = 'kasten-titel';
      const dt = k.dataset.titel;
      t.innerHTML = bildSVG(bild, 6) + '<span>' + esc(dt ? (typ && ['spiel', 'bewegung', 'basteln'].includes(typ) ? titel + ': ' + dt : dt) : titel) + '</span>';
      k.insertBefore(t, k.firstChild);
    });
    // Pflichtteile
    const pflicht = { ziel: '.kasten.ziel', material: '.kasten.material', ablauf: 'ol.ablauf', sag: '.sag', stolper: '.kasten.stolper',
      leichter: '.kasten.leichter', schwerer: '.kasten.schwerer', bonus: '.kasten.bonus', warum: '.kasten.warum', loesungen: 'm-loesungen, .loesungen-raster' };
    for (const [name, sel] of Object.entries(pflicht)) if (!a.querySelector(sel)) fehler(a, 'Pflichtteil fehlt: ' + name + ' (' + sel + ')');
  }

  // Lösungsansicht: Kopien der Blätter mit eingetragenen Lösungen
  function baueLoesungen(quellen) {
    document.querySelectorAll('m-loesungen').forEach((el) => {
      const e = el.getAttribute('einheit');
      const s = parseFloat(attr(el, 'skala', '0.41'));
      const blaetter = quellen.filter((q) => q.einheit === e);
      if (!blaetter.length) { fehler(el, 'Keine Blätter für Einheit ' + e + ' gefunden'); return; }
      const raster = document.createElement('div');
      raster.className = 'loesungen-raster';
      for (const q of blaetter) {
        const mini = document.createElement('div');
        mini.className = 'loesung-mini loesungsmodus';
        mini.style.setProperty('--s', s);
        mini.innerHTML = '<div class="titel-mini">' + esc('Blatt ' + q.nr + ': ' + q.titel) + '</div><div class="rahmen-mini">' + q.html + '</div>';
        mini.querySelectorAll('[id]').forEach((x) => x.removeAttribute('id'));
        mini.querySelectorAll('[data-toc]').forEach((x) => x.removeAttribute('data-toc'));
        raster.appendChild(mini);
      }
      el.innerHTML = '';
      el.appendChild(raster);
    });
  }

  // Inhaltsverzeichnis
  function baueInhalt() {
    document.querySelectorAll('m-inhalt').forEach((el) => {
      const eintraege = [];
      document.querySelectorAll('[data-toc]').forEach((z) => {
        if (z.closest('.loesungsmodus')) return;
        if (!z.id) z.id = 'toc-' + eintraege.length;
        eintraege.push({ id: z.id, text: z.getAttribute('data-toc'), ebene: z.getAttribute('data-toc-ebene') || 'haupt' });
      });
      el.innerHTML = '<ul class="inhalt-liste">' + eintraege.map((e) =>
        '<li class="' + e.ebene + '"><a href="#' + e.id + '">' + esc(e.text) + '</a><span class="punkte"></span><a class="seitenzahl" data-ref="' + e.id + '" href="#' + e.id + '">00</a></li>').join('') + '</ul>';
    });
    document.querySelectorAll('a.blattref').forEach((a) => {
      const ziel = (a.getAttribute('href') || '').replace('#', '');
      const z = document.getElementById(ziel);
      if (!z) { fehler(a, 'Verweis auf unbekanntes Ziel ' + ziel); return; }
      if (!a.textContent.trim()) {
        // „Blatt <a class="blattref">“ im Text: dann nur die Nummer einsetzen
        const davor = a.previousSibling && a.previousSibling.nodeType === 3 ? a.previousSibling.nodeValue : '';
        const ohneWort = /Blatt[\s\u00a0]*$/.test(davor);
        a.textContent = z.dataset.blatt ? (ohneWort ? '' : 'Blatt ') + z.dataset.blatt : (z.dataset.toc || ziel);
      }
      if (!a.querySelector('.seitenzahl-inline')) {
        const s = document.createElement('span');
        s.className = 'seitenzahl-inline';
        s.setAttribute('data-ref', ziel);
        a.appendChild(s);
      }
    });
  }
  window.__setzeSeiten = function (map) {
    let fehlt = [];
    document.querySelectorAll('.seitenzahl[data-ref]').forEach((s) => {
      const p = map[s.dataset.ref];
      if (p) s.textContent = p; else { s.textContent = s.closest('.fuss') ? '' : '?'; fehlt.push(s.dataset.ref); }
    });
    document.querySelectorAll('.seitenzahl-inline[data-ref]').forEach((s) => {
      const p = map[s.dataset.ref];
      s.textContent = p ? ' (S. ' + p + ')' : '';
      if (!p) fehlt.push(s.dataset.ref);
    });
    return fehlt;
  };

  // ---------------------------------------------------------------------
  // Alles rendern
  // ---------------------------------------------------------------------
  const KOMPONENTEN = {
    'm-feld': mFeld, 'm-aufgabe': mAufgabe, 'm-rechenweg': mRechenweg, 'm-zehnerfeld': mZehnerfeld,
    'm-zwanzigerfeld': mZwanzigerfeld, 'm-zehnerfelder': mZehnerfelder, 'm-wuerfel': mWuerfel, 'm-punkte': mPunkte,
    'm-zahlenhaus': mZahlenhaus, 'm-zahlenmauer': mZahlenmauer, 'm-zahlenstrahl': mZahlenstrahl,
    'm-rechenstrich': mRechenstrich, 'm-kaestchen': mKaestchen, 'm-spielfeld': mSpielfeld, 'm-bild': mBild,
    'm-stern': mStern, 'm-karten': mKarten,
  };

  function start() {
    try {
      nummeriereBlaetter();
      // Blätter-Quelltext sichern, bevor etwas gerendert wird
      const quellen = Array.from(document.querySelectorAll('section.blatt')).map((b) => ({
        einheit: b.dataset.einheit, nr: b.dataset.blatt, titel: b.dataset.titel || '', html: b.outerHTML,
      }));
      baueLoesungen(quellen);
      document.querySelectorAll('section.blatt').forEach((b) => {
        baueBlatt(b);
        if (!b.closest('.loesungsmodus')) {
          b.setAttribute('data-toc', 'Blatt ' + b.dataset.blatt + ': ' + (b.dataset.titel || ''));
          b.setAttribute('data-toc-ebene', 'unter');
        }
      });
      document.querySelectorAll('section.anleitung').forEach(baueAnleitung);
      // Karten zuerst (sie verschieben Kinder), dann der Rest
      document.querySelectorAll('m-karten').forEach((el) => { try { mKarten(el); } catch (e) { fehler(el, 'Absturz: ' + e.message); } });
      for (const [tag, fn] of Object.entries(KOMPONENTEN)) {
        if (tag === 'm-karten') continue;
        document.querySelectorAll(tag).forEach((el) => {
          try { fn(el); } catch (e) { fehler(el, 'Absturz: ' + e.message); }
        });
      }
      baueInhalt();
      // unbekannte m-Elemente melden
      document.querySelectorAll('*').forEach((el) => {
        const t = el.tagName.toLowerCase();
        if (t.startsWith('m-') && !KOMPONENTEN[t] && !['m-loesungen', 'm-inhalt'].includes(t)) fehler(el, 'Unbekannter Baustein <' + t + '>');
      });
    } catch (e) {
      FEHLER.push('Absturz beim Aufbauen: ' + e.message + '\n' + e.stack);
    }
    window.__fertig = true;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  // ---------------------------------------------------------------------
  // Prüfungen nach dem Layout (von build.mjs aufgerufen)
  // ---------------------------------------------------------------------
  const MM = 96 / 25.4;
  const VERBOTEN = [
    [/\bJanuar\b/, 'Jänner'], [/\bTüte\b/, 'Sackerl'], [/\bBonbons?\b/, 'Zuckerl'], [/\bGummib(and|änder)\b/, 'Gummiringerl'],
    [/\bHausaufgabe/, 'Hausübung'], [/\bGrundschule/, 'Volksschule'], [/\bBrötchen\b/, 'Semmel'], [/\bSahne\b/, 'Schlagobers'],
    [/\bQuark\b/, 'Topfen'], [/\bAprikose/, 'Marille'], [/\bKartoffel/, 'Erdapfel'], [/\bTomate/, 'Paradeiser'],
    [/\bPfannkuchen/, 'Palatschinke'], [/\bMülleimer/, 'Mistkübel'], [/\bTreppe\b/, 'Stiege'], [/\bSchrank\b/, 'Kasten'],
    [/\bKlebeband\b/, 'Tixo/Klebestreifen'], [/\bPlätzchen\b/, 'Kekse'], [/\bJunge\b/, 'Bub'], [/\bGrundschul/, 'Volksschul'],
    [/\bHausaufgaben\b/, 'Hausübung'], [/\bSchulranzen\b/, 'Schultasche'], [/\bWürfelbecher\b/, null],
  ];

  function textOhneKomponenten(el) {
    const k = el.cloneNode(true);
    k.querySelectorAll('.komp, .keine-pruefung, svg, script, style, .lsg-nur').forEach((x) => x.replaceWith(' ⧫ '));
    return k.textContent.replace(/[  ]/g, ' ');
  }

  window.__pruefe = function () {
    const fehlerL = FEHLER.slice();
    const warnL = WARNUNGEN.slice();
    const stat = { gleichungenText: 0, gleichungenKomponenten: document.querySelectorAll('.geprueft').length, blaetter: 0 };
    const F = (el, m) => fehlerL.push(wo(el) + '\n    → ' + m);
    const W = (el, m) => warnL.push(wo(el) + '\n    → ' + m);

    // 1. Rechnungen im Fließtext
    const blockTags = new Set(['P', 'LI', 'TD', 'TH', 'DD', 'DT', 'H1', 'H2', 'H3', 'H4', 'FIGCAPTION', 'DIV', 'SPAN', 'B', 'STRONG', 'EM']);
    const kandidaten = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const t = walker.currentNode;
      if (!/\d/.test(t.nodeValue)) continue;
      let p = t.parentElement;
      if (!p || p.closest('.loesungsmodus, .komp, .keine-pruefung, svg, script, style')) continue;
      // nächstes Block-Element suchen
      while (p && p !== document.body) {
        const d = getComputedStyle(p).display;
        if (d !== 'inline' && d !== 'contents') break;
        p = p.parentElement;
      }
      if (p && blockTags.has(p.tagName)) kandidaten.add(p);
    }
    const ZAHL = '\\d+';
    const OP = '(?:\\s*[+\\u2212·]\\s*|\\s+[-:]\\s+)';
    const AUSDR = ZAHL + '(?:' + OP + ZAHL + ')*';
    const REL = '\\s*[=<>]\\s*';
    const re = new RegExp('(?<![\\d,.\\/])' + AUSDR + '(?:' + REL + AUSDR + ')+(?![\\d]|,\\d)', 'g');
    const gesehen = new Set();
    for (const el of kandidaten) {
      const text = textOhneKomponenten(el);
      if (/[×÷]/.test(text)) F(el, 'Verbotenes Rechenzeichen × oder ÷ (in Österreich: · und :)');
      if (/\d\s*[x*]\s*\d/.test(text)) F(el, 'Malzeichen als x oder * – bitte · verwenden');
      for (const [r, ersatz] of VERBOTEN) if (r.test(text) && ersatz) W(el, 'Wort „' + text.match(r)[0] + '“ – in Österreich eher „' + ersatz + '“');
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(text))) {
        const g = m[0];
        const key = g + '|' + (el.closest('section') ? el.closest('section').id : '');
        const teile = g.split(/\s*([=<>])\s*/);
        const seiten = [], rels = [];
        teile.forEach((x, i) => (i % 2 ? rels : seiten).push(x));
        const werte = seiten.map((s) => {
          const tk = s.trim().split(/\s*([+−·]|(?<=\s)[-:](?=\s))\s*/).filter((x) => x !== '' && x !== undefined);
          const zahlen = [], ops = [];
          tk.forEach((x, i) => (i % 2 ? ops : zahlen).push(i % 2 ? x.trim() : +x));
          return rechne(zahlen, ops);
        });
        let ok = !werte.some(isNaN);
        for (let i = 0; ok && i < rels.length; i++) ok = vergleiche(werte[i], rels[i], werte[i + 1]);
        if (!gesehen.has(key)) { stat.gleichungenText++; gesehen.add(key); }
        if (!ok) F(el, 'RECHENFEHLER im Text: „' + g + '“');
      }
    }

    // 2. Feste Seiten: nichts darf überlaufen
    document.querySelectorAll('.seite').forEach((s) => {
      if (s.closest('.loesungsmodus')) return;
      if (getComputedStyle(s).display === 'none') return;
      const r = s.getBoundingClientRect();
      if (s.scrollHeight > s.clientHeight + 1) F(s, 'Seite läuft unten über (' + Math.round((s.scrollHeight - s.clientHeight) / MM) + ' mm zu lang)');
      if (s.scrollWidth > s.clientWidth + 1) F(s, 'Seite läuft seitlich über');
      const inhalt = s.querySelector(':scope > .inhalt');
      if (inhalt && inhalt.scrollHeight > inhalt.clientHeight + 1) F(s, 'Inhalt des Blatts zu hoch (' + Math.round((inhalt.scrollHeight - inhalt.clientHeight) / MM) + ' mm)');
      const rand = 7 * MM;
      const gemeldet = [];
      s.querySelectorAll('*').forEach((x) => {
        if (x.closest('svg') && x.tagName.toLowerCase() !== 'svg') return;
        if (gemeldet.some((g) => g.contains(x))) return;
        const q = x.getBoundingClientRect();
        if (!q.width || !q.height) return;
        if (q.left < r.left + rand - 1 || q.right > r.right - rand + 1 || q.top < r.top + rand - 1 || q.bottom > r.bottom - rand + 1) {
          gemeldet.push(x);
          F(x, 'Element ragt in den Druckrand (7 mm) oder über die Seite');
        }
      });
      if (s.classList.contains('blatt')) {
        stat.blaetter++;
        // Schriftgröße auf Mathildas Blättern
        const tw = document.createTreeWalker(s, NodeFilter.SHOW_TEXT);
        const zuKlein = new Set();
        while (tw.nextNode()) {
          const t = tw.currentNode;
          if (!t.nodeValue.trim()) continue;
          const p = t.parentElement;
          if (!p || p.closest('svg, .fuss, .klein, .blatt-kopf, .marke, .lsg, .karte')) continue;
          const fs = parseFloat(getComputedStyle(p).fontSize) * 0.75;
          if (fs < 13.9) zuKlein.add(p);
        }
        zuKlein.forEach((p) => F(p, 'Schrift auf Mathildas Blatt zu klein (' + (parseFloat(getComputedStyle(p).fontSize) * 0.75).toFixed(1) + ' pt, mindestens 14 pt; sonst class="klein")'));
        if (!s.querySelector('.profi, .knobel')) W(s, 'Blatt ohne Profi- oder Knobel-Ecke');
        if (!/Mathilda/.test(s.textContent)) W(s, 'Mathilda kommt auf dem Blatt nicht namentlich vor');
      }
    });

    // 3. Anleitung: nichts breiter als der Satzspiegel
    document.querySelectorAll('.anleitung, .fliess').forEach((a) => {
      const r = a.getBoundingClientRect();
      const gemeldetA = [];
      a.querySelectorAll('*').forEach((x) => {
        if (x.closest('svg') && x.tagName.toLowerCase() !== 'svg') return;
        if (x.closest('.rahmen-mini')) return;
        const q = x.getBoundingClientRect();
        if (q.width && (q.right > r.right + 1.5 || q.left < r.left - 1.5)) {
          if (gemeldetA.some((g) => g.contains(x))) return;
          gemeldetA.push(x);
          F(x, 'Element breiter als die Seite (' + Math.round((q.right - r.right) / MM) + ' mm)');
        }
      });
    });

    // 4. Blätter pro Einheit
    const proEinheit = {};
    document.querySelectorAll('section.blatt').forEach((b) => {
      if (b.closest('.loesungsmodus')) return;
      proEinheit[b.dataset.einheit] = (proEinheit[b.dataset.einheit] || 0) + 1;
    });
    for (const [e, k] of Object.entries(proEinheit)) if (k > 3) fehlerL.push('Einheit ' + e + ': ' + k + ' Blätter (höchstens 3)');
    document.querySelectorAll('section.anleitung').forEach((a) => {
      if (!proEinheit[a.dataset.einheit]) fehlerL.push('Einheit ' + a.dataset.einheit + ': keine Blätter');
      if (!a.querySelector('m-loesungen[einheit="' + a.dataset.einheit + '"]')) fehlerL.push('Einheit ' + a.dataset.einheit + ': <m-loesungen einheit="' + a.dataset.einheit + '"> fehlt');
    });
    return { fehler: fehlerL, warnungen: warnL, statistik: stat };
  };
})();

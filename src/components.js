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
      if (extra[v]) inner += bildSVG(extra[v], d * 0.45, false, r2(x + d * 0.18), r2(y - d * 0.62), '') || '';
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
  // Erzeugte Bilder (bilder/erzeugt/, von build.mjs als window.__erzeugt mitgegeben): Linienzeichnung zum Anmalen (umriss)
  // oder Farbbild (farbe). Gibt es keins, gilt die eigene Zeichnung aus BILDER.
  const ERZEUGT = window.__erzeugt || { umriss: {}, farbe: {} };
  // Ohne x/y ein eigenes Bild in mm, mit x/y (und einheit '') eingebettet in ein anderes SVG, z. B. das Spielfeld.
  function bildSVG(name, gr, farbe, x, y, einheit = 'mm') {
    const ort = (x === undefined ? '' : 'x="' + x + '" y="' + y + '" ') + 'width="' + gr + einheit + '" height="' + gr + einheit + '" ';
    const e = ERZEUGT[farbe ? 'farbe' : 'umriss'][name] || (farbe ? ERZEUGT.umriss[name] : null);
    if (e) return e.replace('<svg ', '<svg ' + ort);
    if (!BILDER[name]) return null;
    return '<svg xmlns="http://www.w3.org/2000/svg" ' + ort + 'viewBox="0 0 100 100">' + BILDER[name] + '</svg>';
  }
  // <m-bild name="drache" gr="20" [farbe="ja"]>
  function mBild(el) {
    const name = attr(el, 'name', '');
    const s = bildSVG(name, parseFloat(attr(el, 'gr', '20')), attr(el, 'farbe', '') === 'ja');
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

  // =====================================================================
  // Bausteine ab Einheit 6 (Zahlenraum 100, untereinander rechnen, Mal,
  // Knobeln, Geometrie, Zaubertricks)
  // =====================================================================
  function zahlenListe(s) { return liste(s).map(zahl); }
  function txt(x, y, s, gr, cls, extra) {
    return '<text class="' + (cls || 'zahl') + '" x="' + r2(x) + '" y="' + r2(y) + '" font-size="' + r2(gr) + '"' + (extra || '') + '>' + esc(s) + '</text>';
  }
  function rectSVG(x, y, w, h, cls, extra) {
    return '<rect class="' + cls + '" x="' + r2(x) + '" y="' + r2(y) + '" width="' + r2(w) + '" height="' + r2(h) + '"' + (extra || '') + '/>';
  }
  function linie(x1, y1, x2, y2, extra) {
    return '<line x1="' + r2(x1) + '" y1="' + r2(y1) + '" x2="' + r2(x2) + '" y2="' + r2(y2) + '"' + (extra || ' stroke="var(--tinte)" stroke-width="0.35"') + '/>';
  }
  const LSG_ROT = '#f9c9d6', LSG_GOLD = '#ffe08a';

  // ---------------------------------------------------------------------
  // <m-hundertertafel zelle="10" von="1" zeilen="1-10" luecken="23,45" zeige="1,10"
  //   markiert="…" markiert2="…" loesung-markiert="…" loesung-markiert2="…">
  // ---------------------------------------------------------------------
  function mHundertertafel(el) {
    const z = parseFloat(attr(el, 'zelle', '10'));
    const von = zahl(attr(el, 'von', '1'));
    if (isNaN(von) || von < 0) return fehler(el, 'von muss eine Zahl ≥ 0 sein');
    const bis = von + 99;
    const zr = attr(el, 'zeilen', '1-10').split('-').map(zahl);
    const z1 = zr[0], z2 = zr.length > 1 ? zr[1] : zr[0];
    if (isNaN(z1) || isNaN(z2) || z1 < 1 || z2 > 10 || z1 > z2) return fehler(el, 'zeilen="1-10" (z. B. "3-5")');
    const lkRoh = attr(el, 'luecken', '').trim();
    const zeigeRoh = el.getAttribute('zeige');
    const zeigeL = zeigeRoh === null ? null : zahlenListe(zeigeRoh);
    const lkAlle = lkRoh === 'alle';
    const lk = lkAlle ? [] : zahlenListe(lkRoh);
    const m1 = zahlenListe(attr(el, 'markiert', '')), m2 = zahlenListe(attr(el, 'markiert2', ''));
    const l1 = zahlenListe(attr(el, 'loesung-markiert', '')), l2 = zahlenListe(attr(el, 'loesung-markiert2', ''));
    for (const v of [].concat(lk, zeigeL || [], m1, m2, l1, l2)) {
      if (isNaN(v) || v < von || v > bis) return fehler(el, 'Zahl ' + v + ' liegt nicht auf der Tafel (' + von + '–' + bis + ')');
    }
    if (lkAlle && zeigeL === null) return fehler(el, 'luecken="alle" braucht zeige="…" (welche Zahlen stehen da?)');
    const reihen = z2 - z1 + 1;
    const W = 10 * z, H = reihen * z;
    const gr = z * (String(bis).length >= 3 ? 0.36 : 0.44);
    let inner = rectSVG(0.3, 0.3, W, H, 'rahmen');
    let texte = '';
    for (let r = z1 - 1; r < z2; r++) {
      for (let c = 0; c < 10; c++) {
        const v = von + r * 10 + c;
        const x = 0.3 + c * z, y = 0.3 + (r - z1 + 1) * z;
        if (m1.includes(v)) inner += rectSVG(x, y, z, z, 'hell-f');
        if (m2.includes(v)) inner += rectSVG(x, y, z, z, 'gold-hell-f');
        if (l1.includes(v)) inner += rectSVG(x, y, z, z, 'lsg', ' fill="' + LSG_ROT + '"');
        if (l2.includes(v)) inner += rectSVG(x, y, z, z, 'lsg', ' fill="' + LSG_GOLD + '"');
        const gezeigt = zeigeL === null ? !lk.includes(v) : zeigeL.includes(v);
        const luecke = !gezeigt && (lkAlle || lk.includes(v));
        if (gezeigt || luecke) {
          texte += txt(x + z / 2, y + z / 2 + 0.2, String(v), gr, luecke ? 'zahl lsg' : 'zahl',
            (m1.includes(v) || m2.includes(v)) && !luecke ? ' font-weight="700"' : '');
        }
      }
    }
    for (let c = 1; c < 10; c++) inner += linie(0.3 + c * z, 0.3, 0.3 + c * z, 0.3 + H, c === 5 ? ' stroke="var(--tinte)" stroke-width="0.6"' : undefined);
    for (let r = z1; r < z2; r++) inner += linie(0.3, 0.3 + (r - z1 + 1) * z, 0.3 + W, 0.3 + (r - z1 + 1) * z, r === 5 ? ' stroke="var(--tinte)" stroke-width="0.6"' : undefined);
    inner += rectSVG(0.3, 0.3, W, H, 'gitter', ' stroke-width="0.6"');
    el.innerHTML = svg(r2(W + 0.6), r2(H + 0.6), inner + texte);
    el.classList.add('komp');
  }

  // ---------------------------------------------------------------------
  // <m-tafelstueck form="kreuz|block|diagonal" mitte="45" [zeige="45|alle|…"] [von="1"] [zelle="12"]>
  // <m-tafelstueck form="XX. ; .XX" oben-links="34" zeige="34">   (X = Feld, . = kein Feld)
  // Ausschnitt aus der Hundertertafel, alle Felder außer „zeige“ sind Lücken.
  // ---------------------------------------------------------------------
  const TAFEL_FORMEN = { kreuz: ['.X.', 'XXX', '.X.'], block: ['XXX', 'XXX', 'XXX'], diagonal: ['X.X', '.X.', 'X.X'] };
  function mTafelstueck(el) {
    const z = parseFloat(attr(el, 'zelle', '12'));
    const von = zahl(attr(el, 'von', '1'));
    const fName = attr(el, 'form', 'kreuz').trim();
    let form, ol;
    if (TAFEL_FORMEN[fName]) {
      form = TAFEL_FORMEN[fName];
      const mitte = zahl(attr(el, 'mitte', ''));
      if (isNaN(mitte)) return fehler(el, 'mitte="45" fehlt');
      ol = mitte - 11;
    } else {
      form = fName.split(/\s*[;\/]\s*/).filter(Boolean);
      ol = zahl(attr(el, 'oben-links', ''));
      if (isNaN(ol)) return fehler(el, 'oben-links="34" fehlt (Zahl links oben im Ausschnitt)');
      if (!form.length || form.some((f) => !/^[X.]+$/.test(f))) return fehler(el, 'form="XX. ; .XX" (X = Feld, . = leer) oder kreuz/block/diagonal');
    }
    if (isNaN(von)) return fehler(el, 'von');
    const spalte = (n) => (((n - von) % 10) + 10) % 10;
    const breite = Math.max.apply(null, form.map((f) => f.length));
    if (spalte(ol) + breite > 10 || ol < von - 10) return fehler(el, 'Ausschnitt ragt über den Rand der Hundertertafel');
    const zellen = [];
    form.forEach((zeile, r) => zeile.split('').forEach((ch, c) => {
      if (ch === 'X') zellen.push({ r, c, v: ol + r * 10 + c });
    }));
    if (!zellen.length) return fehler(el, 'Ausschnitt ohne Felder');
    if (zellen.some((q) => q.v < von || q.v > von + 99)) return fehler(el, 'Ausschnitt ragt über den Rand der Hundertertafel');
    const zr = attr(el, 'zeige', TAFEL_FORMEN[fName] ? String(ol + 11) : String(zellen[0].v)).trim();
    const zeige = zr === 'alle' ? zellen.map((q) => q.v) : zahlenListe(zr);
    if (zeige.some((v) => !zellen.some((q) => q.v === v))) return fehler(el, 'zeige: Zahl liegt nicht im Ausschnitt');
    const gr = z * (String(von + 99).length >= 3 ? 0.36 : 0.44);
    let inner = '';
    for (const q of zellen) {
      const x = 0.4 + q.c * z, y = 0.4 + q.r * z;
      const luecke = !zeige.includes(q.v);
      inner += rectSVG(x, y, z, z, 'rahmen') + txt(x + z / 2, y + z / 2 + 0.2, String(q.v), gr, luecke ? 'zahl lsg' : 'zahl');
    }
    el.innerHTML = svg(r2(breite * z + 0.8), r2(form.length * z + 0.8), inner);
    el.classList.add('komp', 'geprueft');
  }

  // ---------------------------------------------------------------------
  // <m-stellenwerttafel spalten="H Z E" zeilen="3 4 = _ ; [5] [7] = 57 ; 2 13 = [33] ; . 4 = 4">
  //   Zahl, [Lösung] = Lücke, _ = Lücke (wird ausgerechnet), . = leeres Feld
  // ---------------------------------------------------------------------
  const STELLEN = { T: 1000, H: 100, Z: 10, E: 1 };
  function mStellenwerttafel(el) {
    const sp = liste(attr(el, 'spalten', 'Z E'));
    if (!sp.length || sp.some((s) => !STELLEN[s])) return fehler(el, 'spalten="H Z E" (aus T H Z E)');
    const zeilenRoh = attr(el, 'zeilen', '').split(';').map((s) => s.trim()).filter(Boolean);
    if (!zeilenRoh.length) return fehler(el, 'zeilen="3 4 = _ ; …" fehlt');
    const zeilen = [];
    for (const zr of zeilenRoh) {
      const teile = zr.split('=');
      if (teile.length > 2) return fehler(el, 'Höchstens ein = pro Zeile: ' + zr);
      const zellen = teile[0].trim().split(/\s+/).map((s) => (s === '.' ? { leer: true, wert: 0 } : zelle(s)));
      if (zellen.length !== sp.length) return fehler(el, 'Jede Zeile braucht ' + sp.length + ' Einträge: ' + zr);
      const ges = teile.length === 2 ? zelle(teile[1]) : null;
      const autos = zellen.filter((c) => c.auto).length + (ges && ges.auto ? 1 : 0);
      if (autos > 1) return fehler(el, 'Höchstens ein „_“ pro Zeile: ' + zr);
      const summe = () => zellen.reduce((a, c, i) => a + c.wert * STELLEN[sp[i]], 0);
      if (autos === 1) {
        if (ges && ges.auto) ges.wert = summe();
        else {
          if (!ges) return fehler(el, '„_“ in der Tafel geht nur mit „= Zahl“');
          const i = zellen.findIndex((c) => c.auto);
          zellen[i].wert = 0;
          const rest = ges.wert - summe();
          if (rest < 0 || rest % STELLEN[sp[i]]) return fehler(el, 'Lücke geht nicht auf: ' + zr);
          zellen[i].wert = rest / STELLEN[sp[i]];
        }
      }
      if (zellen.some((c) => isNaN(c.wert) || c.wert < 0) || (ges && (isNaN(ges.wert) || ges.wert < 0))) return fehler(el, 'Zahl fehlt oder negativ: ' + zr);
      if (ges && summe() !== ges.wert) return fehler(el, 'FALSCH: ' + zr + ' (Tafel ergibt ' + summe() + ')');
      zeilen.push({ zellen, ges });
    }
    const w = parseFloat(attr(el, 'zelle', '15')), hk = w * 0.62, hz = w * 0.8;
    const gr = hz * 0.6;
    const mitGes = zeilen.some((z) => z.ges);
    const gesStellen = Math.max(2, ...zeilen.filter((z) => z.ges).map((z) => String(z.ges.wert).length));
    const tafelW = sp.length * w;
    const gesX = tafelW + 4;
    const W = tafelW + (mitGes ? 4 + 8 + gesStellen * 10 + 1 : 0);
    const H = hk + zeilen.length * hz;
    let inner = rectSVG(0.4, 0.4, tafelW, hk, 'hell-f') + rectSVG(0.4, 0.4, tafelW, H, 'gitter', ' stroke-width="0.6"');
    sp.forEach((s, i) => {
      inner += txt(0.4 + i * w + w / 2, 0.4 + hk / 2 + 0.2, s, hk * 0.62, 'zahl', ' font-weight="700"');
      if (i) inner += linie(0.4 + i * w, 0.4, 0.4 + i * w, 0.4 + H, ' stroke="var(--tinte)" stroke-width="0.5"');
    });
    zeilen.forEach((z, r) => {
      const y = 0.4 + hk + r * hz;
      inner += linie(0.4, y, 0.4 + tafelW, y, r === 0 ? ' stroke="var(--tinte)" stroke-width="0.6"' : ' stroke="var(--tinte)" stroke-width="0.35"');
      z.zellen.forEach((c, i) => {
        const x = 0.4 + i * w;
        if (c.luecke) inner += rectSVG(x + w * 0.14, y + hz * 0.1, w * 0.72, hz * 0.8, 'rahmen', ' rx="1"');
        if (!c.leer) inner += txt(x + w / 2, y + hz / 2 + 0.2, fmt(c.wert), gr, c.luecke ? 'zahl lsg' : 'zahl');
      });
      if (z.ges) {
        inner += txt(gesX + 3, y + hz / 2 + 0.2, '=', gr, 'zahl');
        const s = String(z.ges.wert), bx = gesX + 8, bw = gesStellen * 10;
        if (z.ges.luecke) {
          inner += rectSVG(bx, y + (hz - 10) / 2, bw, 10, 'rahmen', ' rx="1"');
          for (let k = 1; k < gesStellen; k++) inner += linie(bx + k * 10, y + (hz - 10) / 2, bx + k * 10, y + (hz + 10) / 2, ' stroke="var(--kaestchen)" stroke-width="0.3"');
        }
        if (z.ges.luecke) {
          s.split('').forEach((ch, k) => {
            inner += txt(bx + bw - (s.length - k) * 10 + 5, y + hz / 2 + 0.2, ch, gr, 'zahl lsg');
          });
        } else inner += txt(bx + s.length * 5, y + hz / 2 + 0.2, s, gr, 'zahl');
      }
    });
    el.innerHTML = svg(r2(W + 0.8), r2(H + 0.8), inner);
    el.classList.add('komp', 'geprueft');
  }

  // ---------------------------------------------------------------------
  // <m-schriftlich [luecken="ergebnis|keine|frei"] [uebertrag="luecke|zeigen|nein"] [zelle="10"]>47 + 35</m-schriftlich>
  // Untereinander rechnen (österreichisch). Plus mit 2–4 Zahlen, Minus mit dem
  // Ergänzungsverfahren („1 weiter“). Einzelne Ziffern als [7] werden Lücken.
  // Mit „= 82“ am Ende wird das Ergebnis vorgegeben (Ziffern in [ ] sind Lücken).
  // ---------------------------------------------------------------------
  function ziffern(s) {
    const ds = [];
    const re = /\[(\d)\]|(\d)/g;
    let m, pos = 0;
    while ((m = re.exec(s))) {
      if (m.index !== pos) return null;
      pos = re.lastIndex;
      ds.push(m[1] !== undefined ? { d: +m[1], luecke: true } : { d: +m[2] });
    }
    if (pos !== s.length || !ds.length) return null;
    return ds;
  }
  const zifWert = (ds) => ds.reduce((a, x) => a * 10 + x.d, 0);
  function mSchriftlich(el) {
    const src = el.getAttribute('data-src') || el.textContent.trim().replace(/\s+/g, ' ');
    el.setAttribute('data-src', src);
    const tok = src.split(' ');
    const zahlen = [], ops = [];
    let ergTok = null;
    for (let i = 0; i < tok.length; i++) {
      const t = tok[i];
      if (i % 2 === 0) {
        const ds = ziffern(t);
        if (!ds) return fehler(el, 'Unbekannte Zahl „' + t + '“ (Leerzeichen zwischen allen Teilen!)');
        if (ergTok === '=') { ergTok = ds; if (i !== tok.length - 1) return fehler(el, 'Nach dem Ergebnis darf nichts mehr kommen'); } else zahlen.push(ds);
      } else {
        if (t === '=') { if (ergTok !== null) return fehler(el, 'Nur ein ='); ergTok = '='; } else if (OPS[t] === '+' || OPS[t] === MINUS) ops.push(OPS[t]);
        else return fehler(el, 'Untereinander nur mit + oder − (nicht „' + t + '“)');
      }
    }
    if (ergTok === '=') return fehler(el, 'Nach = fehlt das Ergebnis');
    if (zahlen.length < 2) return fehler(el, 'Mindestens zwei Zahlen');
    const plus = ops[0] === '+';
    if (ops.some((o) => o !== ops[0])) return fehler(el, 'Nur Plus oder nur Minus');
    if (!plus && zahlen.length !== 2) return fehler(el, 'Minus untereinander nur mit zwei Zahlen');
    if (zahlen.length > 4) return fehler(el, 'Höchstens 4 Zahlen');
    if (zahlen.some((ds) => ds.length > 1 && ds[0].d === 0)) return fehler(el, 'Zahl beginnt mit 0');
    const werte = zahlen.map(zifWert);
    const soll = plus ? werte.reduce((a, b) => a + b, 0) : werte[0] - werte[1];
    if (soll < 0) return fehler(el, 'Ergebnis wäre negativ');
    let erg;
    const lk = attr(el, 'luecken', 'ergebnis');
    if (!/^(ergebnis|keine|frei)$/.test(lk)) return fehler(el, 'luecken= ergebnis|keine|frei');
    if (ergTok) {
      erg = ergTok;
      if (zifWert(erg) !== soll) return fehler(el, 'FALSCH: Ergebnis ' + zifWert(erg) + ', richtig ist ' + soll);
      if (String(soll) !== erg.map((x) => x.d).join('')) return fehler(el, 'Ergebnis ohne führende Nullen schreiben');
    } else {
      erg = String(soll).split('').map((ch) => ({ d: +ch, luecke: lk !== 'keine' }));
    }
    // Spalten von rechts rechnen, Überträge bestimmen
    const L0 = Math.max(...zahlen.map((d) => d.length), erg.length);
    const zif = (ds, c) => (c < ds.length ? ds[ds.length - 1 - c].d : 0);
    const uebertrag = [0];
    const ergZ = [];
    for (let c = 0; c < L0 + 2; c++) {
      let e;
      if (plus) {
        const s = zahlen.reduce((a, ds) => a + zif(ds, c), 0) + uebertrag[c];
        e = s % 10; uebertrag[c + 1] = Math.floor(s / 10);
      } else {
        const oben = zif(zahlen[0], c), unten = zif(zahlen[1], c) + uebertrag[c];
        if (unten <= oben) { e = oben - unten; uebertrag[c + 1] = 0; } else { e = oben + 10 - unten; uebertrag[c + 1] = 1; }
      }
      ergZ.push(e);
    }
    const ergSpalten = String(soll).split('').reverse().map(Number);
    for (let c = 0; c < ergSpalten.length; c++) if (ergZ[c] !== ergSpalten[c]) return fehler(el, 'Interner Rechenfehler in Spalte ' + c);
    let hoechsteU = 0;
    uebertrag.forEach((u, c) => { if (u && c < L0 + 1) hoechsteU = Math.max(hoechsteU, c); });
    const L = Math.max(L0, hoechsteU + 1);
    const nCols = L + 1;
    const k = zahlen.length;
    const z = parseFloat(attr(el, 'zelle', '10'));
    const uMode = attr(el, 'uebertrag', 'luecke');
    if (!/^(luecke|zeigen|nein)$/.test(uMode)) return fehler(el, 'uebertrag= luecke|zeigen|nein');
    const W = nCols * z, H = (k + 2) * z;
    const gr = z * 0.7;
    let inner = '';
    for (let c = 0; c <= nCols; c++) inner += '<line class="kaestchen" x1="' + r2(0.3 + c * z) + '" y1="0.3" x2="' + r2(0.3 + c * z) + '" y2="' + r2(0.3 + H) + '"/>';
    for (let r = 0; r <= k + 2; r++) inner += '<line class="kaestchen" x1="0.3" y1="' + r2(0.3 + r * z) + '" x2="' + r2(0.3 + W) + '" y2="' + r2(0.3 + r * z) + '"/>';
    let texte = '';
    const zeichneZiffern = (ds, r, rahmenFrei) => {
      ds.forEach((x, j) => {
        const c = nCols - ds.length + j;
        const X = 0.3 + c * z, Y = 0.3 + r * z;
        if (x.luecke && !rahmenFrei) inner += rectSVG(X, Y, z, z, 'gitter', ' stroke-width="0.55" fill="white"');
        texte += txt(X + z / 2, Y + z / 2 + 0.3, String(x.d), gr, x.luecke ? 'zahl lsg' : 'zahl');
      });
    };
    zahlen.forEach((ds, r) => {
      zeichneZiffern(ds, r, false);
      if (r > 0) texte += txt(0.3 + z / 2, 0.3 + r * z + z / 2 + 0.3, ops[0], gr, 'zahl');
    });
    if (uMode !== 'nein') {
      for (let c = 1; c < L + 1; c++) {
        if (!uebertrag[c]) continue;
        const col = nCols - 1 - c;
        texte += txt(0.3 + col * z + z * 0.5, 0.3 + k * z + z * 0.66, String(uebertrag[c]), z * 0.42, uMode === 'luecke' ? 'zahl lsg' : 'zahl');
      }
    }
    zeichneZiffern(erg, k + 1, !ergTok && lk === 'frei');
    inner += linie(0.3, 0.3 + (k + 1) * z, 0.3 + W, 0.3 + (k + 1) * z, ' stroke="var(--tinte)" stroke-width="0.7"');
    el.innerHTML = svg(r2(W + 0.6), r2(H + 0.6), inner + texte);
    el.classList.add('komp', 'geprueft');
  }

  // ---------------------------------------------------------------------
  // <m-punktefeld reihen="3" spalten="4" [abstand="7"] [fuenfer] [teile-reihen="2"] [teile-spalten="5"]
  //   [farbe-reihen="2"] [farbe-spalten="5"] [symbol="stern"] [rahmen]>
  // ---------------------------------------------------------------------
  function mPunktefeld(el) {
    const R = zahl(attr(el, 'reihen', '3')), C = zahl(attr(el, 'spalten', '4'));
    if (isNaN(R) || isNaN(C) || R < 1 || C < 1 || R > 20 || C > 20) return fehler(el, 'reihen und spalten 1–20');
    const d = parseFloat(attr(el, 'abstand', '7'));
    const fuenfer = el.hasAttribute('fuenfer');
    const gap = fuenfer ? d * 0.5 : 0;
    const rand = d * 0.25;
    const tr = zahl(attr(el, 'teile-reihen', '')), ts = zahl(attr(el, 'teile-spalten', ''));
    const fr = zahl(attr(el, 'farbe-reihen', '')), fsp = zahl(attr(el, 'farbe-spalten', ''));
    if ((!isNaN(tr) && (tr < 1 || tr >= R)) || (!isNaN(ts) && (ts < 1 || ts >= C))) return fehler(el, 'teile-reihen/teile-spalten liegt außerhalb');
    const sym = attr(el, 'symbol', 'punkt');
    const xv = (c) => rand + d / 2 + c * d + Math.floor(c / 5) * gap;
    const yv = (r) => rand + d / 2 + r * d + Math.floor(r / 5) * gap;
    const W = xv(C - 1) + d / 2 + rand, H = yv(R - 1) + d / 2 + rand;
    let inner = el.hasAttribute('rahmen') ? rectSVG(0.3, 0.3, W - 0.6, H - 0.6, 'rahmen', ' rx="1.5"') : '';
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      let cls = 'p1';
      if (!isNaN(fr) && r >= fr) cls = 'p2';
      if (!isNaN(fsp) && c >= fsp) cls = 'p2';
      inner += form(sym, xv(c), yv(r), d * 0.3, cls);
    }
    const strich = ' stroke="var(--akzent)" stroke-width="0.7" stroke-dasharray="2 1.2"';
    if (!isNaN(tr)) { const y = (yv(tr - 1) + yv(tr)) / 2; inner += linie(0.5, y, W - 0.5, y, strich); }
    if (!isNaN(ts)) { const x = (xv(ts - 1) + xv(ts)) / 2; inner += linie(x, 0.5, x, H - 0.5, strich); }
    el.innerHTML = svg(r2(W), r2(H), inner);
    el.classList.add('komp');
  }

  // ---------------------------------------------------------------------
  // <m-rechendreieck innen="oben links rechts" aussen="links rechts unten" [gr="64"]>
  //   Jede Außenzahl ist die Summe der zwei Innenzahlen an ihrer Seite:
  //   linke Seite = oben + links, rechte Seite = oben + rechts, unten = links + rechts
  // ---------------------------------------------------------------------
  function mRechendreieck(el) {
    const innen = liste(attr(el, 'innen', '')).map(zelle);
    const aussen = liste(attr(el, 'aussen', '')).map(zelle);
    if (innen.length !== 3 || aussen.length !== 3) return fehler(el, 'innen="oben links rechts" aussen="links rechts unten"');
    const [o, l, r] = innen, [L, R, U] = aussen;
    const tripel = [[L, o, l], [R, o, r], [U, l, r]];
    const bek = (c) => !c.auto;
    const setze = (c, v) => { c.wert = v; c.auto = false; c.luecke = true; };
    const propagiere = () => {
      let g = true;
      while (g) {
        g = false;
        for (const [s, a, b] of tripel) {
          const k = [s, a, b].filter(bek).length;
          if (k === 2) {
            if (!bek(s)) setze(s, a.wert + b.wert);
            else if (!bek(a)) setze(a, s.wert - b.wert);
            else setze(b, s.wert - a.wert);
            g = true;
          }
        }
      }
    };
    propagiere();
    if ([o, l, r].every((c) => !bek(c)) && [L, R, U].every(bek)) {
      const zo = L.wert + R.wert - U.wert, zl = L.wert + U.wert - R.wert, zr = R.wert + U.wert - L.wert;
      if (zo % 2 || zl % 2 || zr % 2) return fehler(el, 'Rechendreieck geht nicht glatt auf (Innenzahlen wären keine ganzen Zahlen)');
      setze(o, zo / 2); setze(l, zl / 2); setze(r, zr / 2);
    }
    propagiere();
    if (innen.concat(aussen).some((c) => c.auto)) return fehler(el, 'Rechendreieck nicht eindeutig lösbar – [Lösung] angeben');
    if (innen.concat(aussen).some((c) => isNaN(c.wert) || c.wert < 0)) return fehler(el, 'Zahl fehlt oder negativ');
    for (const [s, a, b] of tripel) if (s.wert !== a.wert + b.wert) return fehler(el, 'FALSCH: ' + s.wert + ' ≠ ' + a.wert + ' + ' + b.wert);
    const a = parseFloat(attr(el, 'gr', '64'));
    if (a < 54) return fehler(el, 'Rechendreieck braucht gr ≥ 54 (sonst passen die Felder nicht hinein)');
    const m = 15, h = a * Math.sqrt(3) / 2;
    const top = 2;
    const T = [m + a / 2, top], BL = [m, top + h], BR = [m + a, top + h];
    const G = [(T[0] + BL[0] + BR[0]) / 3, (T[1] + BL[1] + BR[1]) / 3];
    const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const ML = mid(T, BL), MR = mid(T, BR), MB = mid(BL, BR);
    let inner = '<path class="hell-f" d="M' + r2(T[0]) + ' ' + r2(T[1]) + ' L' + r2(BR[0]) + ' ' + r2(BR[1]) + ' L' + r2(BL[0]) + ' ' + r2(BL[1]) + ' Z" stroke="var(--tinte)" stroke-width="0.6" stroke-linejoin="round"/>';
    for (const p of [ML, MR, MB]) inner += linie(G[0], G[1], p[0], p[1], ' stroke="var(--tinte)" stroke-width="0.45"');
    const bw = 14, bh = 10.5, gr = 6.2;
    const ecke = (p, f) => [p[0] + (G[0] - p[0]) * f, p[1] + (G[1] - p[1]) * f];
    const pos = [ecke(T, 0.62), ecke(BL, 0.46), ecke(BR, 0.46)];
    innen.forEach((c, i) => { inner += boxSVG(pos[i][0] - bw / 2, pos[i][1] - bh / 2, bw, bh, c, gr); });
    const n60 = [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)];
    const aPos = [[ML[0] - n60[0] * 11.5, ML[1] - n60[1] * 11.5], [MR[0] + n60[0] * 11.5, MR[1] - n60[1] * 11.5], [MB[0], MB[1] + 8.5]];
    aussen.forEach((c, i) => { inner += boxSVG(aPos[i][0] - bw / 2, aPos[i][1] - bh / 2, bw, bh, c, gr); });
    el.innerHTML = svg(r2(a + 2 * m), r2(top + h + 15), inner);
    el.classList.add('komp', 'geprueft');
  }

  // ---------------------------------------------------------------------
  // <m-magisch zellen="2 7 6 ; 9 5 _ ; 4 [3] 8" [summe="15"] [diagonalen="nein"] [verschieden] [zelle="18"]>
  // ---------------------------------------------------------------------
  function mMagisch(el) {
    const reihen = attr(el, 'zellen', '').split(';').map((s) => s.trim()).filter(Boolean).map((s) => s.split(/\s+/).map(zelle));
    const n = reihen.length;
    if (n < 2 || reihen.some((r) => r.length !== n)) return fehler(el, 'zellen="a b c ; d e f ; g h i" (quadratisch)');
    const mitDiag = attr(el, 'diagonalen', 'ja') !== 'nein';
    const linien = [];
    for (let i = 0; i < n; i++) { linien.push(reihen[i]); linien.push(reihen.map((r) => r[i])); }
    if (mitDiag) { linien.push(reihen.map((r, i) => r[i])); linien.push(reihen.map((r, i) => r[n - 1 - i])); }
    let S = el.hasAttribute('summe') ? zahl(el.getAttribute('summe')) : NaN;
    const sum = (L) => L.reduce((a, c) => a + c.wert, 0);
    if (isNaN(S)) {
      const voll = linien.find((L) => L.every((c) => !c.auto));
      if (!voll) return fehler(el, 'summe="15" angeben (keine volle Reihe)');
      S = sum(voll);
    }
    let g = true;
    while (g) {
      g = false;
      for (const L of linien) {
        const offen = L.filter((c) => c.auto);
        if (offen.length === 1) {
          const c = offen[0];
          c.wert = 0;
          c.wert = S - sum(L);
          c.auto = false; c.luecke = true; g = true;
        }
      }
    }
    if (reihen.some((r) => r.some((c) => c.auto))) return fehler(el, 'Magisches Quadrat nicht eindeutig lösbar – [Lösung] angeben');
    if (reihen.some((r) => r.some((c) => isNaN(c.wert) || c.wert < 0))) return fehler(el, 'Zahl fehlt oder negativ');
    for (const L of linien) if (sum(L) !== S) return fehler(el, 'FALSCH: Eine Reihe ergibt ' + sum(L) + ' statt ' + S);
    if (el.hasAttribute('verschieden')) {
      const alle = [].concat(...reihen).map((c) => c.wert);
      if (new Set(alle).size !== alle.length) return fehler(el, 'Zahlen kommen doppelt vor');
    }
    const z = parseFloat(attr(el, 'zelle', '18')), gr = z * 0.5;
    let inner = '';
    inner += rectSVG(0.5, 0.5, n * z, n * z, 'rahmen');
    for (let i = 1; i < n; i++) inner += linie(0.5 + i * z, 0.5, 0.5 + i * z, 0.5 + n * z, ' stroke="var(--tinte)" stroke-width="0.45"') + linie(0.5, 0.5 + i * z, 0.5 + n * z, 0.5 + i * z, ' stroke="var(--tinte)" stroke-width="0.45"');
    reihen.forEach((r, i) => r.forEach((c, j) => { inner += txt(0.5 + j * z + z / 2, 0.5 + i * z + z / 2 + 0.3, fmt(c.wert), gr, c.luecke ? 'zahl lsg' : 'zahl'); }));
    inner += rectSVG(0.5, 0.5, n * z, n * z, 'gitter', ' stroke-width="0.9"');
    el.innerHTML = svg(r2(n * z + 1), r2(n * z + 1), inner);
    el.classList.add('komp', 'geprueft');
  }

  // ---------------------------------------------------------------------
  // <m-zehnerstangen h="1" z="3" e="4" [art="stangen|buendel"] [gr="4"]>
  //   stangen: Hunderterplatte, Zehnerstange (10 Würfel), Einerwürfel
  //   buendel: Zahnstocher-Bündel mit Gummiringerl und einzelne Zahnstocher
  // ---------------------------------------------------------------------
  function mZehnerstangen(el) {
    const h = zahl(attr(el, 'h', '0')), zz = zahl(attr(el, 'z', '0')), e = zahl(attr(el, 'e', '0'));
    const art = attr(el, 'art', 'stangen');
    if ([h, zz, e].some((v) => isNaN(v) || v < 0) || h > 9 || zz > 30 || e > 40) return fehler(el, 'h 0–9, z 0–30, e 0–40');
    let inner = '', W = 0, H = 0;
    if (art === 'stangen') {
      const u = parseFloat(attr(el, 'gr', '4'));
      let x = 0.4;
      const quad = (qx, qy) => rectSVG(qx, qy, u, u, 'rahmen', ' stroke-width="0.3"');
      for (let i = 0; i < h; i++) {
        inner += rectSVG(x, 0.4, 10 * u, 10 * u, 'hell-f', ' stroke="var(--tinte)" stroke-width="0.5"');
        for (let k = 1; k < 10; k++) inner += linie(x + k * u, 0.4, x + k * u, 0.4 + 10 * u, ' stroke="var(--tinte)" stroke-width="0.2"') + linie(x, 0.4 + k * u, x + 10 * u, 0.4 + k * u, ' stroke="var(--tinte)" stroke-width="0.2"');
        x += 10 * u + u;
      }
      for (let i = 0; i < zz; i++) {
        inner += rectSVG(x, 0.4, u, 10 * u, 'hell-f', ' stroke="var(--tinte)" stroke-width="0.5"');
        for (let k = 1; k < 10; k++) inner += linie(x, 0.4 + k * u, x + u, 0.4 + k * u, ' stroke="var(--tinte)" stroke-width="0.2"');
        x += u * 1.6;
      }
      if (zz && e) x += u * 0.6;
      const spalten = Math.ceil(e / 5);
      for (let i = 0; i < e; i++) {
        const sx = x + Math.floor(i / 5) * u * 1.5, sy = 0.4 + 10 * u - (i % 5 + 1) * u * 1.15;
        inner += quad(sx, sy);
      }
      if (e) x += spalten * u * 1.5 - u * 0.5;
      W = Math.max(x, 1) + 0.4; H = 10 * u + 0.8;
    } else if (art === 'buendel') {
      if (h) return fehler(el, 'Hunderter nur mit art="stangen"');
      const len = parseFloat(attr(el, 'gr', '22'));
      let x = 0.8;
      const stab = (sx) => '<line x1="' + r2(sx) + '" y1="1.2" x2="' + r2(sx) + '" y2="' + r2(len) + '" stroke="#a0722a" stroke-width="0.7" stroke-linecap="round"/>' +
        '<circle cx="' + r2(sx) + '" cy="1.2" r="0.45" fill="#a0722a"/>';
      for (let i = 0; i < zz; i++) {
        for (let k = 0; k < 10; k++) inner += stab(x + k * 0.8);
        inner += rectSVG(x - 0.9, len / 2 - 1.3, 9 * 0.8 + 1.8, 2.6, '', ' rx="1.2" fill="none" stroke="var(--rot)" stroke-width="0.8"');
        x += 9 * 0.8 + 3.6;
      }
      if (zz && e) x += 1.5;
      for (let i = 0; i < e; i++) { inner += stab(x); x += (i % 5 === 4) ? 3.6 : 2.2; }
      W = x + 0.4; H = len + 1;
    } else return fehler(el, 'art="stangen" oder "buendel"');
    el.innerHTML = svg(r2(W), r2(H), inner);
    el.classList.add('komp');
  }

  // ---------------------------------------------------------------------
  // <m-geld werte="10 10 5 2 1 50c 20c" [gr="1"]>   (Scheine und Münzen, schematisch)
  // ---------------------------------------------------------------------
  const SCHEINE = [5, 10, 20, 50, 100, 200, 500], MUENZEN = [1, 2], CENT = [1, 2, 5, 10, 20, 50];
  function mGeld(el) {
    const werte = liste(attr(el, 'werte', ''));
    const f = parseFloat(attr(el, 'gr', '1'));
    if (!werte.length) return fehler(el, 'werte="10 5 2 1 50c"');
    let html = '<span class="geld-reihe">';
    for (const w of werte) {
      const cent = /c$/.test(w);
      const v = zahl(w.replace(/c$/, ''));
      if (cent ? !CENT.includes(v) : !(SCHEINE.includes(v) || MUENZEN.includes(v))) return fehler(el, 'Unbekannter Geldwert „' + w + '“');
      if (!cent && SCHEINE.includes(v)) {
        const bw = 30 * f, bh = 16 * f;
        html += svg(r2(bw + 0.8), r2(bh + 0.8), rectSVG(0.4, 0.4, bw, bh, '', ' rx="' + r2(1.6 * f) + '" fill="#eef6ec" stroke="var(--tinte)" stroke-width="0.5"') +
          rectSVG(0.4 + 1.6 * f, 0.4 + 1.6 * f, bw - 3.2 * f, bh - 3.2 * f, '', ' rx="' + r2(1 * f) + '" fill="none" stroke="var(--tinte)" stroke-width="0.25" stroke-dasharray="0.8 0.6"') +
          txt(0.4 + bw / 2, 0.4 + bh / 2 + 0.3, v + ' €', 6.2 * f, 'zahl', ' font-weight="700"') +
          txt(0.4 + 4.2 * f, 0.4 + 4 * f, String(v), 2.6 * f, 'zahl') + txt(0.4 + bw - 4.2 * f, 0.4 + bh - 4 * f, String(v), 2.6 * f, 'zahl'));
      } else {
        const r = (cent ? 4 + CENT.indexOf(v) * 0.35 : (v === 1 ? 6.4 : 7)) * f;
        let s = '<circle cx="' + r2(r + 0.4) + '" cy="' + r2(r + 0.4) + '" r="' + r2(r) + '" fill="' + (cent ? '#fbeedd' : '#fff6d6') + '" stroke="var(--tinte)" stroke-width="0.5"/>';
        if (!cent) s += '<circle cx="' + r2(r + 0.4) + '" cy="' + r2(r + 0.4) + '" r="' + r2(r * 0.72) + '" fill="none" stroke="var(--tinte)" stroke-width="0.3"/>';
        if (cent) s += txt(r + 0.4, r + 0.4 - r * 0.18, String(v), r * 0.85, 'zahl', ' font-weight="700"') + txt(r + 0.4, r + 0.4 + r * 0.5, 'Cent', r * 0.36, 'zahl');
        else s += txt(r + 0.4, r + 0.6, v + ' €', r * 0.62, 'zahl', ' font-weight="700"');
        html += svg(r2(2 * r + 0.8), r2(2 * r + 0.8), s);
      }
    }
    el.innerHTML = html + '</span>';
    el.classList.add('komp');
  }

  // ---------------------------------------------------------------------
  // <m-tangram gr="150" [nummern] [farbig]>   7 Teile aus einem Quadrat
  // ---------------------------------------------------------------------
  const TANGRAM = [
    { n: 1, p: [[0, 0], [4, 0], [2, 2]], f: '#f1ebff' },          // großes Dreieck
    { n: 2, p: [[0, 0], [2, 2], [0, 4]], f: '#e3f6f4' },          // großes Dreieck
    { n: 3, p: [[4, 0], [4, 2], [3, 1]], f: '#fff0e3' },          // kleines Dreieck
    { n: 4, p: [[2, 2], [3, 1], [4, 2], [3, 3]], f: '#fde9f4' },  // Quadrat
    { n: 5, p: [[2, 2], [3, 3], [1, 3]], f: '#fff4cc' },          // kleines Dreieck
    { n: 6, p: [[4, 2], [4, 4], [2, 4]], f: '#eef5ff' },          // mittleres Dreieck
    { n: 7, p: [[0, 4], [1, 3], [3, 3], [2, 4]], f: '#eef8ee' },  // Parallelogramm
  ];
  window.__tangram = TANGRAM;
  function mTangram(el) {
    const gr = parseFloat(attr(el, 'gr', '150'));
    const s = gr / 4;
    const farbig = el.hasAttribute('farbig'), nr = el.hasAttribute('nummern');
    let inner = '';
    for (const t of TANGRAM) {
      const pts = t.p.map(([x, y]) => r2(0.6 + x * s) + ',' + r2(0.6 + y * s)).join(' ');
      inner += '<polygon points="' + pts + '" fill="' + (farbig ? t.f : 'white') + '" stroke="var(--tinte)" stroke-width="0.7" stroke-linejoin="round"/>';
      if (nr) {
        const cx = t.p.reduce((a, q) => a + q[0], 0) / t.p.length, cy = t.p.reduce((a, q) => a + q[1], 0) / t.p.length;
        inner += txt(0.6 + cx * s, 0.6 + cy * s, String(t.n), s * 0.22, 'zahl', ' fill="var(--grau)"');
      }
    }
    el.innerHTML = svg(r2(gr + 1.2), r2(gr + 1.2), inner);
    el.classList.add('komp');
  }

  // ---------------------------------------------------------------------
  // <m-zauberkarte wert="4" [bis="31"] [spalten="4"] [gr="15"]>
  //   Gedankenlese-Karte: alle Zahlen bis „bis“, in denen „wert“ (1, 2, 4, 8, 16 …) steckt
  // ---------------------------------------------------------------------
  function mZauberkarte(el) {
    const w = zahl(attr(el, 'wert', '1')), bis = zahl(attr(el, 'bis', '31'));
    const sp = zahl(attr(el, 'spalten', '4'));
    const gr = parseFloat(attr(el, 'gr', '15'));
    if (!(w > 0 && (w & (w - 1)) === 0)) return fehler(el, 'wert muss 1, 2, 4, 8, 16, 32 sein');
    if (isNaN(bis) || bis < w || bis > 127) return fehler(el, 'bis zwischen wert und 127');
    const zahlen = [];
    for (let n = 1; n <= bis; n++) if (n & w) zahlen.push(n);
    el.innerHTML = '<span class="zk" style="grid-template-columns: repeat(' + sp + ', auto); font-size: ' + gr + 'pt">' +
      zahlen.map((n, i) => '<span' + (i === 0 ? ' class="zk-erste"' : '') + '>' + n + '</span>').join('') + '</span>';
    el.setAttribute('data-anzahl', zahlen.length);
    el.classList.add('komp');
  }

  // ---------------------------------------------------------------------
  // <m-familie oben="13" links="5" rechts="8" [op="·"] [gr="44"]>
  //   Aufgabenfamilie als Dreieck: oben = links + rechts (oder links · rechts)
  // ---------------------------------------------------------------------
  function mFamilie(el) {
    const o = zelle(attr(el, 'oben', '_')), a = zelle(attr(el, 'links', '_')), b = zelle(attr(el, 'rechts', '_'));
    const mal = OPS[attr(el, 'op', '+')] === '·';
    const autos = [o, a, b].filter((c) => c.auto);
    if (autos.length > 1) return fehler(el, 'Höchstens ein „_“ – sonst [Lösung] angeben');
    if (o.auto) o.wert = mal ? a.wert * b.wert : a.wert + b.wert;
    if (a.auto) a.wert = mal ? (b.wert ? o.wert / b.wert : NaN) : o.wert - b.wert;
    if (b.auto) b.wert = mal ? (a.wert ? o.wert / a.wert : NaN) : o.wert - a.wert;
    if ([o, a, b].some((c) => isNaN(c.wert) || c.wert < 0 || c.wert % 1)) return fehler(el, 'Zahl fehlt, negativ oder nicht ganz');
    if (o.wert !== (mal ? a.wert * b.wert : a.wert + b.wert)) return fehler(el, 'FALSCH: ' + a.wert + (mal ? ' · ' : ' + ') + b.wert + ' ≠ ' + o.wert);
    const g = parseFloat(attr(el, 'gr', '44'));
    const r = g * 0.17, hh = g * 0.62;
    const P = [[g / 2, r + 0.6], [r + 0.6, r + 0.6 + hh], [g - r - 0.6, r + 0.6 + hh]];
    let inner = '<path class="hell-f" d="M' + P.map((p) => r2(p[0]) + ' ' + r2(p[1])).join(' L') + ' Z" stroke="var(--akzent)" stroke-width="0.8" stroke-linejoin="round"/>';
    [o, a, b].forEach((c, i) => {
      inner += '<circle cx="' + r2(P[i][0]) + '" cy="' + r2(P[i][1]) + '" r="' + r2(r) + '" fill="white" stroke="var(--tinte)" stroke-width="0.6"/>';
      inner += txt(P[i][0], P[i][1] + 0.3, fmt(c.wert), r * (String(c.wert).length > 2 ? 0.8 : 1.0), c.luecke ? 'zahl lsg' : 'zahl');
    });
    el.innerHTML = svg(r2(g), r2(2 * r + hh + 1.2), inner);
    el.classList.add('komp', 'geprueft');
  }

  // ---------------------------------------------------------------------
  // <m-wuerfelnetz gr="30" augen="1 2 6 5 3 4" [leer]>
  //   Reihenfolge: oben, vorne, unten, hinten, links, rechts (0 = leeres Feld).
  //   Volle Würfel werden geprüft: Gegenseiten ergeben 7.
  // ---------------------------------------------------------------------
  function mWuerfelnetz(el) {
    const s = parseFloat(attr(el, 'gr', '30'));
    const leer = el.hasAttribute('leer');
    const augen = leer ? [0, 0, 0, 0, 0, 0] : liste(attr(el, 'augen', '1 2 6 5 3 4')).map(zahl);
    if (augen.length !== 6 || augen.some((v) => isNaN(v) || v < 0 || v > 6)) return fehler(el, 'augen="oben vorne unten hinten links rechts" (1–6, 0 = leer)');
    if (augen.every((v) => v > 0) && (augen[0] + augen[2] !== 7 || augen[1] + augen[3] !== 7 || augen[4] + augen[5] !== 7)) {
      return fehler(el, 'Gegenseiten eines Würfels ergeben immer 7 (oben+unten, vorne+hinten, links+rechts)');
    }
    const t = s * 0.22, o = 0.6;
    const lage = [[1, 0], [1, 1], [1, 2], [1, 3], [0, 1], [2, 1]]; // oben vorne unten hinten links rechts
    const X = (c) => o + c * s, Y = (r) => o + r * s;
    let inner = '';
    const lasche = (x1, y1, x2, y2, nx, ny) => {
      const dx = (x2 - x1), dy = (y2 - y1);
      const p = [[x1, y1], [x1 + dx * 0.18 + nx * t, y1 + dy * 0.18 + ny * t], [x2 - dx * 0.18 + nx * t, y2 - dy * 0.18 + ny * t], [x2, y2]];
      return '<polygon points="' + p.map((q) => r2(q[0]) + ',' + r2(q[1])).join(' ') + '" fill="#f6f7fb" stroke="var(--tinte)" stroke-width="0.5" stroke-linejoin="round"/>';
    };
    // Laschen: links oben/unten, rechts oben/unten, hinten links/rechts/unten
    inner += lasche(X(0), Y(1), X(1), Y(1), 0, -1) + lasche(X(0), Y(2), X(1), Y(2), 0, 1);
    inner += lasche(X(2), Y(1), X(3), Y(1), 0, -1) + lasche(X(2), Y(2), X(3), Y(2), 0, 1);
    inner += lasche(X(1), Y(3), X(1), Y(4), -1, 0) + lasche(X(2), Y(3), X(2), Y(4), 1, 0) + lasche(X(1), Y(4), X(2), Y(4), 0, 1);
    lage.forEach(([c, r], i) => {
      inner += rectSVG(X(c), Y(r), s, s, '', ' fill="white"');
      if (augen[i]) for (const [px, py] of AUGEN[augen[i]]) inner += '<circle class="p1" cx="' + r2(X(c) + px * s) + '" cy="' + r2(Y(r) + py * s) + '" r="' + r2(s * 0.08) + '"/>';
    });
    // Kanten: innen gestrichelt (falten), außen durchgehend (schneiden)
    const kanten = {};
    const key = (a, b) => [a, b].sort().join('|');
    lage.forEach(([c, r]) => {
      const e = [[[c, r], [c + 1, r]], [[c + 1, r], [c + 1, r + 1]], [[c, r + 1], [c + 1, r + 1]], [[c, r], [c, r + 1]]];
      for (const [p, q] of e) { const k = key(p.join(','), q.join(',')); kanten[k] = (kanten[k] || 0) + 1; }
    });
    const laschenKanten = ['0,1|1,1', '0,2|1,2', '2,1|3,1', '2,2|3,2', '1,3|1,4', '2,3|2,4', '1,4|2,4'];
    for (const [k, anz] of Object.entries(kanten)) {
      const [p, q] = k.split('|').map((v) => v.split(',').map(Number));
      const falten = anz > 1 || laschenKanten.includes(k);
      inner += linie(X(p[0]), Y(p[1]), X(q[0]), Y(q[1]), falten ? ' stroke="var(--tinte)" stroke-width="0.35" stroke-dasharray="1.2 0.9"' : ' stroke="var(--tinte)" stroke-width="0.6"');
    }
    el.innerHTML = svg(r2(3 * s + 2 * o), r2(4 * s + t + 2 * o), inner);
    el.classList.add('komp');
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
    'm-hundertertafel': mHundertertafel, 'm-tafelstueck': mTafelstueck, 'm-stellenwerttafel': mStellenwerttafel,
    'm-schriftlich': mSchriftlich, 'm-punktefeld': mPunktefeld, 'm-rechendreieck': mRechendreieck, 'm-magisch': mMagisch,
    'm-zehnerstangen': mZehnerstangen, 'm-geld': mGeld, 'm-tangram': mTangram, 'm-zauberkarte': mZauberkarte,
    'm-familie': mFamilie, 'm-wuerfelnetz': mWuerfelnetz,
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

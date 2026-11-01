# Autoren-Leitfaden: eine Einheit schreiben

Eine Einheit ist **eine HTML-Datei** in `src/einheiten/NN-name.html` (nur der Inhalt, kein `<html>`/`<head>`). Sie enthält zuerst die Anleitung für Mama oder Papa, danach 1–3 Blätter für Mathilda. Reihenfolge im Buch: `src/buch.json`.

Vorbild mit allen Bausteinen: `src/einheiten/00-muster.html`. Begriffe und Wortwahl: `plan/lehrplan.md` (Abschnitt 6) **verbindlich**. Österreichische Rechenweise: `plan/oesterreich-notizen.md`.

```bash
./baue.sh --nur 03 --png          # nur Einheit 3, Seitenbilder in out/seiten-03/
./baue.sh --nur 03 --png --dpi 110 # schärfere Bilder zum Kontrollieren
./baue.sh                          # ganzes Buch + Kopiervorlagen
```

Der Build bricht mit ❌ ab, wenn eine Rechnung falsch ist, ein Blatt überläuft, ein Pflichtteil fehlt oder die Schrift auf einem Blatt zu klein ist. Warnungen (⚠️) bitte auch beheben.

---

## 1. Grundgerüst

```html
<section class="anleitung" data-einheit="3" data-titel="Doppelt &amp; halb">
  … Anleitung …
  <h2>Lösungen</h2>
  <m-loesungen einheit="3"></m-loesungen>
</section>

<section class="blatt" data-einheit="3" data-titel="Spiegel-Zauber">  … </section>
<section class="blatt" data-einheit="3" data-titel="Doppel-Würfeln" data-art="Spielplan"> … </section>
```

- Kopf der Anleitung (Nummer, Titel, Block, Minuten) entsteht automatisch.
- Blätter werden automatisch nummeriert (Blatt 3-1, 3-2 …), bekommen Kopf mit Titel und „Geschafft?“-Stern und eine Fußzeile. `data-art` (Arbeitsblatt, Spielplan, Karten, Bastelvorlage) steht in der Fußzeile, Standard „Blatt“.
- Verweis auf ein Blatt in der Anleitung: `<a class="blattref" href="#blatt-3-2"></a>` → „Blatt 3-2 (S. 17)“.

## 2. Anleitung: Pflichtteile

Fehlt einer davon, bricht der Build ab. Überschriften der Kästen entstehen automatisch.

| Markup | Überschrift |
|---|---|
| `<div class="kasten ziel">` | Darum geht's heute |
| `<div class="kasten material">` | Material & Vorbereitung |
| `<ol class="ablauf"><li data-min="5"><span class="schritt-titel">…</span> …</li></ol>` | Schritte mit Minuten; Summe wird angezeigt, Ziel 20–30 |
| `<div class="sag"><p class="du">„…“</p><p class="sie">„…“</p><p class="dann">…</p></div>` | Beispielsätze (Du / Mathilda / Hinweis) |
| `<div class="kasten stolper">` | Stolpersteine |
| `<div class="kasten leichter">` | Leichter machen |
| `<div class="kasten schwerer">` | Schwerer machen (**ausführlich!**) |
| `<div class="kasten bonus">` | Bonus-Knobelei für zwischendurch |
| `<div class="kasten warum">` | Warum funktioniert das? |
| `<m-loesungen einheit="N">` | alle Blätter verkleinert mit roten Lösungen |

Weitere Kästen: `kasten spiel` (mit `data-titel="Volltanken"` → „Spiel: Volltanken“), `kasten bewegung`, `kasten basteln`, `kasten tipp`, `kasten einschaetzung`, `kasten loesung` (Text-Lösungen), `kasten material`. Zwei Kästen nebeneinander: `<div class="zwei">…</div>`. Tabellen: `<table class="tab">`. Ein Begriff aus der Begriffsliste beim ersten Auftreten: `<span class="begriff">Kraft der 5</span>`.

Spielregeln immer so, dass sie **zu zweit** mit Haushaltsmaterial funktionieren: Material, Vorbereitung, Ziel, Ablauf eines Zuges, Ende/Gewinner, Varianten. Einmal im Kopf durchspielen.

Überschriften `<h2>` in der Anleitung (in dieser Reihenfolge, wenn passend): „Ablauf Schritt für Schritt“, „Spiele, Bewegung und Basteln“, „Wenn es hakt oder zu leicht ist“, „Hintergrund“, „Lösungen“.

## 3. Mathildas Blätter

- **Eine A4-Seite pro Blatt**, nichts darf überlaufen (wird geprüft). Lieber weniger Aufgaben, dafür luftig.
- Schrift mindestens 14 pt (geprüft; Standard 16 pt). Kleinerer Hilfstext nur mit `class="klein"`.
- Kurze Hauptsätze, „du“, Mathilda namentlich („Mathilda, wie viele …?“).
- Unten eine `<div class="profi">` (Krone, „Profi-Aufgabe“) oder `<div class="knobel">` (Eule, „Knobel-Ecke“). Eigener Titel: `data-titel="Drachen-Profi"`.
- Aufgaben: `<div class="aufg"><p class="anw">Anweisung</p> … </div>` → automatisch nummeriert. Ohne Nummer: `class="aufg ohne-nr"`.
- Anordnung: `<div class="reihe">` (nebeneinander, umbrechend), `<div class="raster s3">` (Spalten s2–s5), `.mitte`, `.zentriert`.
- `data-verteilt` am Blatt verteilt die Aufgaben gleichmäßig über die Höhe.
- **Jede Lücke braucht eine Lösung** (durch die Bausteine automatisch). Freie Aufgaben (z. B. „Erfinde eine Aufgabe“) bekommen einen Lösungshinweis `<p class="lsg-nur">Mehrere Lösungen möglich, z. B. 4 + 6.</p>`. Das steht nur in der Lösungsansicht.
- Knobeleien sind eindeutig lösbar oder ausdrücklich „mehrere Lösungen möglich“.
- Jede Einheit hat auf mindestens einem Blatt eine Kästchenpapier-Fläche (`<m-kaestchen>`, echte 1-cm-Kästchen wie im Rechenheft).
- Rechnungen im Fließtext der Anleitung, die nicht umbrechen sollen: `<span class="rechnung">8 + 5 = 13</span>`.

## 4. Bausteine

Alle Rechnungen in Bausteinen werden geprüft. Rechnungen im Fließtext (`8 + 5 = 13`) werden ebenfalls geprüft, wenn sie Zahlen, Rechenzeichen und `=`, `<` oder `>` enthalten. Achtung: `:` und `-` zählen nur mit Leerzeichen davor und danach als Rechenzeichen.

### Antwortfeld
```html
<m-feld l="7"></m-feld>                 <!-- Kästchen, Lösung 7 -->
<m-feld l="Drache" art="text"></m-feld> <!-- breites Feld für Wörter -->
```
Antwortfelder sind 1 cm hoch und wie im Rechenheft in 1-cm-Kästchen geteilt (eine Ziffer pro Kästchen). Standard: 2 Kästchen. `art`: `k` (1 Kästchen), `b3` (3 Kästchen), `text` (ohne Raster, für Wörter), `rel` (Kreis für < > =).

### Rechnung mit Lücken
```html
<m-aufgabe>8 + 5 = _</m-aufgabe>        <!-- _ wird ausgerechnet -->
<m-aufgabe>_ + 7 = 15</m-aufgabe>
<m-aufgabe>13 − 3 − [2] = 8</m-aufgabe> <!-- [2] = Lücke mit angegebener Lösung (geprüft) -->
<m-aufgabe>7 + 5 [>] 11</m-aufgabe>     <!-- Kreis für < > = -->
<m-aufgabe>6 [+] 6 = 12</m-aufgabe>     <!-- Rechenzeichen einsetzen -->
<m-aufgabe feld="k">3 + 4 = _</m-aufgabe> <!-- kleine Kästchen -->
```
Alle Teile mit Leerzeichen trennen. Mehrere `_` auf einer Seite gehen nicht → `[Lösung]` verwenden.

### Rechenweg mit Zahlenbeinen (über die Zehn)
```html
<m-rechenweg>8 + 5</m-rechenweg>                    <!-- Lücken: Teile 2, 3 und Ergebnis -->
<m-rechenweg luecken="ergebnis">13 − 5</m-rechenweg> <!-- Zahlenbeine 3 und 2 vorgegeben -->
<m-rechenweg luecken="keine" schritte>8 + 5</m-rechenweg> <!-- Beispiel, mit 8 + 2 = 10, 10 + 3 = 13 -->
```
`luecken`: `alle` (Standard), `ergebnis`, `teile`, `keine`. `schritte` zeigt rechts die zwei Teilschritte. Fehler, wenn die Aufgabe gar nicht über die Zehn geht. Funktioniert auch mit 28 + 5 oder 52 − 7. Braucht viel Höhe (ca. 35 mm).

### Zehnerfeld, Zwanzigerfeld, mehrere Zehnerfelder
```html
<m-zehnerfeld n="7"></m-zehnerfeld>              <!-- 7 Punkte, 1-cm-Kästchen -->
<m-zehnerfeld n="7" farben="5,2"></m-zehnerfeld> <!-- 5 blau, 2 rot -->
<m-zehnerfeld n="0" zeichne="6"></m-zehnerfeld>  <!-- leer; in der Lösung 6 rote Punkte -->
<m-zehnerfeld n="7" zelle="6" symbol="stern"></m-zehnerfeld>
<m-zwanzigerfeld n="13" farben="10,3"></m-zwanzigerfeld>  <!-- zelle Standard 8 mm -->
<m-zehnerfelder n="34" zelle="5" proreihe="5"></m-zehnerfelder>  <!-- bis 100 -->
```

### Punktbilder und Würfel
```html
<m-punkte n="7" art="haufen" saat="2" gr="30" rahmen></m-punkte>
```
`art`: `haufen` (durcheinander, `saat` ändert die Anordnung), `reihe`, `fuenfer` (Reihen à 5), `paare`, `kreis`, `wuerfel` (1–6). `symbol`: `punkt`, `stern`, `herz`, `edelstein`. `farben="5,2"`. `gr` = Größe in mm.
`<m-wuerfel n="5" gr="14"></m-wuerfel>` (n 1–6, `leer` für leeren Würfel).

### Zahlenhaus und Zahlenmauer
```html
<m-zahlenhaus dach="10" zeilen="3 _ ; _ 6 ; [5] [5]"></m-zahlenhaus>
<m-zahlenhaus dach="_" zeilen="4 3 ; 5 _"></m-zahlenhaus>   <!-- Dach gesucht -->
<m-zahlenmauer reihen="_ ; _ _ ; 3 4 5"></m-zahlenmauer>    <!-- oben → unten -->
```
`zelle` (mm, Standard 17) bzw. `stein` (Standard 19) für die Größe. Unlösbare oder mehrdeutige Häuser/Mauern sind Fehler.

### Zahlenstrahl (mit Strichen) und Rechenstrich (leer)
```html
<m-zahlenstrahl von="0" bis="20" luecken="7,13" markiert="8" spruenge="8>10>13"></m-zahlenstrahl>
<m-zahlenstrahl von="0" bis="20" beschriftung="fuenfer" spruenge="8>10>13" sprung-luecken></m-zahlenstrahl>
<m-rechenstrich start="8" spruenge="+2 +3" luecken="zwischen,ziel"></m-rechenstrich>
<m-rechenstrich start="13" spruenge="−3 −2" luecken="spruenge,ziel"></m-rechenstrich>
<m-rechenstrich blanko breite="160" hoehe="30"></m-rechenstrich>   <!-- leere Linie zum Selberzeichnen -->
```
Zahlenstrahl: `breite` (mm, Standard 170), `beschriftung` = `alle | fuenfer | zehner | keine | 0,10,20`, `schritt`. Lücken stehen eine Zeile tiefer. Rechenstrich: `luecken` = Kombination aus `start`, `zwischen`, `ziel`, `spruenge` oder `alle`, `keine`.

### Kästchenpapier, Spielfeld, Karten, Bilder
```html
<m-kaestchen b="18" h="3"></m-kaestchen>   <!-- 18 · 3 echte 1-cm-Kästchen -->
<m-spielfeld von="0" bis="20" spalten="7" feld="17" extra="7:stern,13:drache"></m-spielfeld>
<m-karten spalten="4" zeilen="3" hoehe="55" breite="176">
  <div><m-zehnerfeld n="7" zelle="6"></m-zehnerfeld></div>
  <div><span class="gross">7</span></div>
  …
</m-karten>
<m-bild name="drache" gr="20"></m-bild>
<m-stern gr="14"></m-stern>
```
Karten: Schnittlinien gestrichelt, Schere oben links. `.gross` (40 pt) und `.mittel` (24 pt) für Kartentext. Bilder (Strichzeichnungen zum Anmalen): stern, zauberstab, krone, mond, edelstein, trank, zauberhut, schloss, drache, einhorn, fee, schere, gluehbirne, eule, wuerfel, rakete, karten, ei, kreide, haken, ziel, achtung, feder, huepfen, lupe, medaille (nur für Urkunden; die Krone bedeutet immer „Profi-Aufgabe“).

## 4b. Bausteine ab Einheit 6

Muster mit allen neuen Bausteinen: `src/einheiten/99-muster-neu.html` (`./baue.sh --nur 99 --png`). Alle Lücken werden geprüft und in der Lösungsansicht rot gezeigt.

### Hundertertafel und Ausschnitte
```html
<m-hundertertafel zelle="10"></m-hundertertafel>                       <!-- 1–100, 10 · 10 cm -->
<m-hundertertafel luecken="23,45,67"></m-hundertertafel>               <!-- Lücken, Lösung rot -->
<m-hundertertafel zeige="1,10,55" luecken="alle"></m-hundertertafel>   <!-- fast leer: nur 1, 10, 55 stehen da -->
<m-hundertertafel zeige="" ></m-hundertertafel>                        <!-- ganz leer (z. B. als Spielplan) -->
<m-hundertertafel markiert="5,15,25" markiert2="50" loesung-markiert="2,4,6" loesung-markiert2="5,10"></m-hundertertafel>
<m-hundertertafel zeilen="3-5" von="101"></m-hundertertafel>          <!-- nur Zeilen 3–5, Tafel 101–200 -->
<m-tafelstueck form="kreuz" mitte="45"></m-tafelstueck>               <!-- kreuz | block | diagonal (3 · 3) -->
<m-tafelstueck form="XX. ; .XX ; ..X" oben-links="34" zeige="34"></m-tafelstueck>  <!-- eigene Form -->
```
`markiert`/`markiert2` färben Felder hell (Akzent/Gold) und sind auf dem Blatt sichtbar, `loesung-markiert`/`loesung-markiert2` nur in der Lösung („Mal alle Zahlen mit 5 Einern an“). Bei `m-tafelstueck` sind alle Felder außer `zeige` Lücken (Standard: die Mitte bzw. das erste Feld). Ausschnitte, die über den Rand der Tafel gehen, sind Fehler. Die Tafel mit `zelle="15"` ist 15 cm breit und passt als Spielplan auf ein Blatt.

### Stellenwerttafel, Zehnerstangen, Bündel, Geld
```html
<m-stellenwerttafel spalten="Z E" zeilen="3 4 = _ ; [5] [7] = 57 ; 2 13 = [33]"></m-stellenwerttafel>
<m-stellenwerttafel spalten="H Z E" zelle="13" zeilen="1 2 5 ; [2] [0] [4] = 204 ; . _ 0 = 60"></m-stellenwerttafel>
<m-zehnerstangen z="3" e="4"></m-zehnerstangen>                      <!-- Zehnerstangen und Einerwürfel -->
<m-zehnerstangen h="1" z="2" e="7" gr="3"></m-zehnerstangen>         <!-- mit Hunderterplatte -->
<m-zehnerstangen z="2" e="13" art="buendel"></m-zehnerstangen>       <!-- Zahnstocher-Bündel mit Gummiringerl -->
<m-geld werte="10 10 5 2 1 50c 20c"></m-geld>                        <!-- Scheine 5–500 €, Münzen 1 €, 2 €, 1c–50c -->
```
Stellenwerttafel: je Zeile ein Eintrag pro Spalte, dann optional `= Zahl`. `[5]` ist eine Lücke mit Lösung 5, `_` wird ausgerechnet (nur eines pro Zeile), `.` ist ein leeres Feld. Einträge über 9 sind erlaubt (ungebündelt: 2 Z 13 E = 33). `spalten` aus T, H, Z, E. Geld ist absichtlich schematisch (Rechteck bzw. Kreis mit Betrag), keine echten Banknoten.

### Untereinander rechnen (österreichisch)
```html
<m-schriftlich>47 + 35</m-schriftlich>                         <!-- Ergebnis als Lücke, Übertrag nur in der Lösung -->
<m-schriftlich luecken="keine" uebertrag="zeigen">47 + 35</m-schriftlich>  <!-- vorgerechnetes Beispiel -->
<m-schriftlich>63 − 27</m-schriftlich>                         <!-- Ergänzungsverfahren, „1 weiter“ -->
<m-schriftlich>28 + 37 + 16</m-schriftlich>                    <!-- bis zu 4 Zahlen -->
<m-schriftlich luecken="frei">86 − 42</m-schriftlich>          <!-- Ergebnis ohne Kästchenrahmen -->
<m-schriftlich uebertrag="nein">4[7] + 3[5] = 82</m-schriftlich> <!-- Ziffernrätsel: [7] ist eine Lücke -->
<m-schriftlich zelle="7" luecken="keine" uebertrag="zeigen">63 − 27</m-schriftlich>  <!-- kleiner, für die Anleitung -->
```
Echte 1-cm-Kästchen wie im Rechenheft. Einer unter Einer, das Rechenzeichen steht links in der letzten Zeile, der Übertrag klein in der Zeile direkt über dem Strich (bei Minus: das „1 weiter“ in der nächsten Spalte). `uebertrag`: `luecke` (Standard: Mathilda schreibt ihn selbst, Lösung rot), `zeigen`, `nein`. Mit `= Ergebnis` am Ende ist das Ergebnis vorgegeben; einzelne Ziffern in `[ ]` sind dann die Lücken. Alles wird nachgerechnet, auch die Überträge. Braucht (Zahlen + 2) cm Höhe.

### Mal und Geteilt
```html
<m-punktefeld reihen="3" spalten="4"></m-punktefeld>                          <!-- 3 · 4: 3 Reihen mit je 4 Punkten -->
<m-punktefeld reihen="7" spalten="4" teile-reihen="5" farbe-reihen="5"></m-punktefeld>  <!-- 7 · 4 = 5 · 4 + 2 · 4 -->
<m-punktefeld reihen="10" spalten="10" fuenfer abstand="3"></m-punktefeld>    <!-- Hunderterfeld mit Fünfer-Lücken -->
<m-familie oben="13" links="5" rechts="_"></m-familie>                        <!-- Aufgabenfamilie: oben = links + rechts -->
<m-familie oben="_" links="3" rechts="4" op="·"></m-familie>                  <!-- Malfamilie: oben = links · rechts -->
```
Punktefeld: `abstand` in mm (Standard 7), `teile-reihen`/`teile-spalten` zeichnen eine gestrichelte Trennlinie, `farbe-reihen`/`farbe-spalten` färben ab dieser Reihe/Spalte rot, `symbol` wie bei `m-punkte`, `rahmen`. **Vereinbarung für alle Einheiten:** 3 · 4 heißt „3-mal die 4“ = 4 + 4 + 4, im Punktefeld 3 Reihen mit je 4 Punkten, am Zahlenstrahl 3 Sprünge zu je 4.

### Knobeln: Rechendreieck, magisches Quadrat
```html
<m-rechendreieck innen="3 _ 5" aussen="7 _ _"></m-rechendreieck>    <!-- innen: oben links rechts; außen: links rechts unten -->
<m-rechendreieck innen="_ _ _" aussen="9 7 10"></m-rechendreieck>   <!-- nur Außenzahlen: Profi -->
<m-magisch zellen="2 _ 6 ; _ 5 _ ; 4 3 8" verschieden></m-magisch>  <!-- Summe aus einer vollen Reihe oder summe="15" -->
```
Rechendreieck: Jede Außenzahl ist die Summe der zwei Innenzahlen an ihrer Seite (links = oben + links, rechts = oben + rechts, unten = links + rechts). `gr` ≥ 54 (Standard 64). Mehrdeutige oder unlösbare Dreiecke und Quadrate sind Fehler. Magisches Quadrat: Zeilen, Spalten und Diagonalen (`diagonalen="nein"` schaltet sie ab) haben dieselbe Summe; `verschieden` prüft, dass keine Zahl doppelt vorkommt; `zelle` in mm (Standard 18). Nur Lücken, die sich Schritt für Schritt aus einer Reihe mit genau einer Lücke ergeben, werden automatisch gelöst, sonst `[Lösung]` angeben.

### Geometrie und Zaubertricks
```html
<m-tangram gr="150" nummern farbig></m-tangram>            <!-- Bastelvorlage: 7 Teile aus einem Quadrat -->
<m-wuerfelnetz gr="35"></m-wuerfelnetz>                   <!-- Würfel zum Basteln mit Klebelaschen -->
<m-wuerfelnetz gr="35" augen="1 0 0 0 3 0"></m-wuerfelnetz> <!-- oben vorne unten hinten links rechts, 0 = leer -->
<m-wuerfelnetz gr="35" leer></m-wuerfelnetz>
<m-zauberkarte wert="4" bis="31" spalten="4"></m-zauberkarte> <!-- Gedankenlese-Karte: alle Zahlen mit der 4 drin -->
```
Tangram-Teile (Quadrat 4 · 4 Einheiten): 1 und 2 große Dreiecke, 3 und 5 kleine Dreiecke, 4 Quadrat, 6 mittleres Dreieck, 7 Parallelogramm. Die Eckpunkte stehen in `window.__tangram`, damit man Legefiguren aus echten Teilen zusammensetzen kann. Volle Würfelnetze werden geprüft (Gegenseiten ergeben 7). Zauberkarten: `wert` 1, 2, 4, 8, 16 (32, 64); die erste Zahl jeder Karte ist fett, sie ist der „Schlüssel“ des Tricks.

### Urkunden
Die zwei Urkunden sind eigene Seiten in `src/rahmen/` (`id="urkunde-1"` nach Einheit 10, `id="urkunde-2"` nach Einheit 20) und kommen auch in die Kopiervorlagen. Verweis aus der Anleitung: `<a class="blattref" href="#urkunde-1">Urkunde 1</a>`. Für den Teil-Build dann `./baue.sh --nur 10,urkunde --png`.

### Was der Build bei Geteilt prüft
Rechnungen mit Rest („13 : 3 = 4 Rest 1“) erkennt die Textprüfung als falsch, weil 13 : 3 nicht aufgeht. Solche Stellen in `<span class="keine-pruefung">…</span>` setzen und selbst nachrechnen.

## 5. Qualität vor dem Abgeben

1. `./baue.sh --nur NN --png --dpi 110` ohne ❌ und ohne ⚠️.
2. **Jede Seite als Bild ansehen** (`out/seiten-NN/`): nichts abgeschnitten, nichts überlappt, Kästchen groß genug, Blatt luftig, Lösungsansicht lesbar.
3. Jede Zahl im Text, in Spielregeln, Beispielsätzen und Lösungen nachrechnen (auch „8 und 2 sind 10“ in Worten, das prüft der Build nicht).
4. Spiele einmal gedanklich zu zweit durchspielen: Geht es auf? Gibt es ein Ende? Reicht das Material (Kartenanzahl, Würfel)?
5. Österreichisches Deutsch und Begriffe aus der Begriffsliste.

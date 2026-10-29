# Mathildas Rechen-Werkstatt

Druckbarer Rechen-Guide für Mathilda (1. Klasse Volksschule): Anleitung für Mama oder Papa plus Kopiervorlagen, gebaut aus HTML/CSS zu PDF.

## Ergebnis

`./baue.sh` erzeugt:

| Datei | Inhalt |
|---|---|
| `out/rechen-werkstatt.pdf` | alles: Titel, Inhalt, Einleitung, Sammelpass, Einheiten (Anleitung + Blätter + Lösungen), Rückmeldebogen |
| `out/kopiervorlagen.pdf` | nur Mathildas Seiten: Hallo Mathilda, Sammelpass, alle Blätter |

Drucken in **Originalgröße (100 %)**, damit die Kästchen genau 1 cm groß sind.

## Bauen

```bash
./baue.sh                      # ganzes Buch + Kopiervorlagen
./baue.sh --nur 03 --png       # nur Einheit 3, Seitenbilder in out/seiten-03/
./baue.sh --nur rahmen --png   # nur Titel, Einleitung, Sammelpass, Rückmeldebogen
./baue.sh --png --dpi 110      # alle Seiten als Bild in out/seiten/
```

Benötigt: Google Chrome (oder `MATHILDA_CHROME=/pfad/zu/chrome`), Node.js 20+ und poppler (`pdfinfo`, `pdftoppm`). `baue.sh` holt Node und poppler über Nix, wenn sie nicht installiert sind, und installiert beim ersten Lauf `playwright-core` lokal.

Der Build prüft automatisch und bricht bei Fehlern ab:

- jede Rechnung in den Bausteinen und im Fließtext (`8 + 5 = 13`), Lösungen werden von den Bausteinen selbst ausgerechnet
- kein Blatt läuft über die A4-Seite, nichts ragt in den Druckrand, keine Leerseiten
- Schrift auf Mathildas Blättern mindestens 14 pt
- Pflichtteile jeder Anleitung, höchstens 3 Blätter pro Einheit
- kein × oder ÷, bundesdeutsche Wörter werden gemeldet (Jänner statt Januar …)

## Aufbau

```
AUFTRAG.md                     Auftrag mit allen Wünschen
plan/lehrplan.md               Plan für 20 Einheiten + verbindliche Begriffsliste
plan/oesterreich-notizen.md    österreichische Rechen- und Sprechweise
vorlagen/AUTOREN-LEITFADEN.md  wie man eine Einheit schreibt, alle Bausteine
src/buch.json                  Reihenfolge der Teile
src/rahmen/                    Titel, Inhalt, Einleitung, Hallo Mathilda, Sammelpass, Rückmeldebogen
src/einheiten/NN-*.html        eine Datei pro Einheit (Anleitung + Blätter)
src/einheiten/00-muster.html   Muster mit allen Bausteinen (nicht im Buch)
src/styles.css                 Design (A4, Schriften, Farben pro Block)
src/components.js              Bausteine: Zehnerfeld, Rechenweg, Rechenstrich, Zahlenhaus … und Prüfungen
src/fonts/                     Andika und Nunito (SIL Open Font License)
build.mjs, baue.sh             Bauen
```

## Etwas ändern

Text oder Aufgabe in `src/einheiten/NN-*.html` ändern und `./baue.sh --nur NN --png` laufen lassen. Lösungen muss man nicht nachtragen: Bausteine wie `<m-aufgabe>8 + 5 = _</m-aufgabe>` rechnen sie selbst aus und zeigen sie in der Lösungsansicht der Anleitung. Details: `vorlagen/AUTOREN-LEITFADEN.md`.

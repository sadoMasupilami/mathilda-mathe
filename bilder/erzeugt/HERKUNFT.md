# Herkunft der Bilder

Alle Dateien in diesem Ordner sind eigens für die Rechen-Werkstatt erzeugt, die Beschreibungen stehen in `bilder/motive.json`.
Drache, Einhorn, Fee, Eule und Edelstein haben dieselben Farbbilder wie die Denk- und Programmier-Werkstatt.

- `umriss/`: Linienzeichnung zum Anmalen, als Vektor (nur Weiß und Tinte). So steht ein Bild auf den Blättern: `<m-bild name="drache" gr="20">`.
- `farbe/`: das Farbbild als WebP in einem SVG (512 px). Auf einem Blatt mit `<m-bild name="drache" gr="20" farbe="ja">`.

`build.mjs` gibt beide Ordner als `window.__erzeugt` an `src/components.js` weiter. Bilder ohne erzeugte Fassung (kleine Symbole wie Schere, Lupe, Würfel) bleiben gezeichnet.

Erzeugen (Codex CLI, braucht ein Konto mit Bild-Erzeugung), erst die Farbbilder, dann die Linienbilder daraus:

```bash
nix shell nixpkgs#nodejs_22 -c node werkzeuge/bilder-erzeugen.mjs farbe
nix shell nixpkgs#nodejs_22 -c node werkzeuge/bilder-erzeugen.mjs umriss
```

Aufbereiten:

```bash
nix shell nixpkgs#imagemagick nixpkgs#potrace -c werkzeuge/bilder-verarbeiten.sh
```

Ein Bild neu: Rohbild in `bilder/roh/farbe/` (und `bilder/roh/linie/`) löschen, dann beide Schritte noch einmal. Die Rohbilder (`bilder/roh/`) werden nicht eingecheckt.

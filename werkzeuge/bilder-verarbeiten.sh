#!/usr/bin/env bash
# Macht aus den Rohbildern (bilder/roh/, siehe werkzeuge/bilder-erzeugen.mjs) die eingecheckten Bilder in bilder/erzeugt/:
#   farbe/<id>.svg     das Farbbild als WebP in einem SVG, 512 px, Rand gesäubert, alle Motive gleich groß im Bild
#   umriss/<id>.svg    aus dem Linienbild, als Vektor: weiße Fläche und Linien in Tinte (zum Anmalen)
# Vorhandene Ergebnisse werden neu gebaut, wenn das Rohbild neuer ist. Braucht ImageMagick und potrace:
#   nix shell nixpkgs#imagemagick nixpkgs#potrace -c werkzeuge/bilder-verarbeiten.sh
set -euo pipefail
cd "$(dirname "$0")/.."
ROH=bilder/roh; AUS=bilder/erzeugt
TINTE='#1f2340'
mkdir -p "$AUS/farbe" "$AUS/umriss"
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
fehler=0

# Vektor aus einer Schwarz-Weiß-Bitmap (schwarz = Fläche): gibt "<transform>|<d>" aus
pfad() {
  potrace "$1" -b svg --flat -t "$2" -a 1.2 -O 0.6 -W 512pt -H 512pt -o "$t/p.svg"
  tr '\n' ' ' < "$t/p.svg" | sed -E 's/.*<g transform="([^"]*)"[^>]*>.* d="([^"]*)".*<\/g>.*/\1|\2/'
}

for roh in "$ROH"/farbe/*.png; do
  [ -e "$roh" ] || continue
  id=$(basename "$roh" .png)
  if [ "$AUS/farbe/$id.svg" -nt "$roh" ]; then continue; fi
  deckung=$(magick "$roh" -alpha extract -format '%[fx:mean]' info:)
  if awk "BEGIN{exit !($deckung > 0.97)}"; then echo "❌ $id: kein durchsichtiger Hintergrund"; fehler=1; continue; fi
  # Maske: Alpha hart, kleine Reste und Löcher weg (mehrteilige Motive bleiben ganz), Rand 3 px einziehen gegen den Farbsaum
  magick "$roh" -alpha extract -threshold 50% -define connected-components:area-threshold=2500 -define connected-components:mean-color=true -connected-components 8 -threshold 50% -morphology Close Disk:3 -morphology Erode Disk:3 "$t/maske.png"
  # Weiche Kante, auf den Inhalt zuschneiden, alle gleich groß mit gleichem Rand
  magick "$roh" \( "$t/maske.png" -blur 0x1.2 \) -alpha off -compose CopyOpacity -composite -compose Over -trim +repage -resize 944x944 -background none -gravity center -extent 1024x1024 "$t/voll.png"
  magick "$t/voll.png" -resize 512x512 -quality 85 -define webp:alpha-quality=90 "$t/farbe.webp"
  printf '<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><image width="512" height="512" href="data:image/webp;base64,%s"/></svg>\n' "$(base64 < "$t/farbe.webp" | tr -d '\n')" > "$AUS/farbe/$id.svg"
done

for roh in "$ROH"/linie/*.png; do
  [ -e "$roh" ] || continue
  id=$(basename "$roh" .png)
  if [ "$AUS/umriss/$id.svg" -nt "$roh" ]; then continue; fi
  # Linien hart, auf den Inhalt zuschneiden, gleich groß wie das Farbbild
  magick "$roh" -background white -alpha remove -colorspace Gray -threshold 55% -trim +repage -resize 944x944 -background white -gravity center -extent 1024x1024 -threshold 55% "$t/l.png"
  magick "$t/l.png" "$t/l.pbm"
  # Außen fluten (kleine Lücken vorher schließen), der Rest ist die weiße Fläche
  magick "$t/l.png" -morphology Erode Disk:3 -bordercolor white -border 1 -fill red -draw 'color 0,0 floodfill' -shave 1x1 -fill black +opaque red -fill white -opaque red -morphology Erode Disk:3 "$t/s.pbm"
  rl=$(pfad "$t/l.pbm" 12); rs=$(pfad "$t/s.pbm" 20)
  printf '<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><path transform="%s" fill="#fff" d="%s"/><path transform="%s" fill="%s" d="%s"/></svg>\n' "${rs%%|*}" "${rs#*|}" "${rl%%|*}" "$TINTE" "${rl#*|}" > "$AUS/umriss/$id.svg"
done


echo "✅ farbe $(/bin/ls "$AUS/farbe" | wc -l | tr -d ' '), umriss $(/bin/ls "$AUS/umriss" | wc -l | tr -d ' '), zusammen $(du -sh "$AUS" | cut -f1)"
exit $fehler

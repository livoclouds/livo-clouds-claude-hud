#!/usr/bin/env bash
# Regenerate PWA icons and iPad splash images from the SVG sources under
# scripts/assets/. Requires ImageMagick (`convert`) on PATH.
#
# Outputs are committed under apps/hud/public/{icons,splash} so the runtime
# never depends on this script. Rerun only when the source SVGs change.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ASSETS_DIR="$SCRIPT_DIR/assets"
ICONS_DIR="$ROOT_DIR/public/icons"
SPLASH_DIR="$ROOT_DIR/public/splash"

mkdir -p "$ICONS_DIR" "$SPLASH_DIR"

IM="$(command -v magick || command -v convert)"
if [ -z "$IM" ]; then
  echo "ImageMagick not found (need 'magick' or 'convert' on PATH)." >&2
  exit 1
fi

"$IM" -background none "$ASSETS_DIR/icon.svg"           -resize 192x192 "$ICONS_DIR/icon-192.png"
"$IM" -background none "$ASSETS_DIR/icon.svg"           -resize 512x512 "$ICONS_DIR/icon-512.png"
"$IM" -background none "$ASSETS_DIR/icon-maskable.svg"  -resize 512x512 "$ICONS_DIR/icon-maskable-512.png"
"$IM" -background none "$ASSETS_DIR/icon.svg"           -resize 180x180 "$ICONS_DIR/apple-touch-icon.png"

# iPad splash sizes (portrait + landscape). Apple expects exact device pixels.
declare -a SPLASH_SIZES=(
  "ipad-portrait-1620x2160.png 1620 2160"
  "ipad-landscape-2160x1620.png 2160 1620"
  "ipad-portrait-1668x2388.png 1668 2388"
  "ipad-landscape-2388x1668.png 2388 1668"
  "ipad-portrait-2048x2732.png 2048 2732"
  "ipad-landscape-2732x2048.png 2732 2048"
)

for entry in "${SPLASH_SIZES[@]}"; do
  read -r name w h <<<"$entry"
  "$IM" -background "#0a0a0a" "$ASSETS_DIR/splash.svg" -resize "${w}x${h}" \
    -gravity center -extent "${w}x${h}" "$SPLASH_DIR/$name"
done

echo "Generated icons:"
ls -la "$ICONS_DIR"
echo
echo "Generated splash screens:"
ls -la "$SPLASH_DIR"

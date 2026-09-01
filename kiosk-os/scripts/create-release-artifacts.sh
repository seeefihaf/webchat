#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${OUT_DIR:-$ROOT_DIR/out/images}"
RELEASE_DIR="${RELEASE_DIR:-$ROOT_DIR/release}"
VERSION="${VERSION:-$(date +%Y.%m.%d)}"

mkdir -p "$RELEASE_DIR"
cp "$OUT_DIR/webchat-kiosk.img" "$RELEASE_DIR/webchat-kiosk-${VERSION}.img"

if command -v xorriso >/dev/null 2>&1; then
  xorriso -as mkisofs \
    -iso-level 3 \
    -full-iso9660-filenames \
    -volid WEBCHAT_KIOSK \
    -output "$RELEASE_DIR/webchat-kiosk-${VERSION}.iso" \
    "$OUT_DIR/efi-boot"
fi

(
  cd "$RELEASE_DIR"
  sha256sum "webchat-kiosk-${VERSION}.img" > "SHA256SUMS"
  if [ -f "webchat-kiosk-${VERSION}.iso" ]; then
    sha256sum "webchat-kiosk-${VERSION}.iso" >> "SHA256SUMS"
  fi
)

if [ -n "${GPG_KEY_ID:-}" ]; then
  gpg --batch --yes --detach-sign --armor \
    -u "$GPG_KEY_ID" \
    -o "$RELEASE_DIR/SHA256SUMS.asc" \
    "$RELEASE_DIR/SHA256SUMS"
fi

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILDROOT_VERSION="${BUILDROOT_VERSION:-2024.02.8}"
BUILDROOT_ARCHIVE="buildroot-${BUILDROOT_VERSION}.tar.xz"
BUILDROOT_URL="https://buildroot.org/downloads/${BUILDROOT_ARCHIVE}"
BUILDROOT_DIR="${BUILDROOT_DIR:-$ROOT_DIR/buildroot-src}"
OUT_DIR="${OUT_DIR:-$ROOT_DIR/out}"
EXTERNAL_DIR="$ROOT_DIR/buildroot-external"
DEFCONFIG="webchat_kiosk_x86_64_defconfig"

mkdir -p "$OUT_DIR"

if [ ! -d "$BUILDROOT_DIR" ]; then
  mkdir -p "$(dirname "$BUILDROOT_DIR")"
  curl -fsSL "$BUILDROOT_URL" -o "/tmp/${BUILDROOT_ARCHIVE}"
  tar -xf "/tmp/${BUILDROOT_ARCHIVE}" -C "$(dirname "$BUILDROOT_DIR")"
  mv "$(dirname "$BUILDROOT_DIR")/buildroot-${BUILDROOT_VERSION}" "$BUILDROOT_DIR"
fi

make -C "$BUILDROOT_DIR" O="$OUT_DIR" BR2_EXTERNAL="$EXTERNAL_DIR" "$DEFCONFIG"
make -C "$BUILDROOT_DIR" O="$OUT_DIR"

echo "Artifacts available in: $OUT_DIR/images"

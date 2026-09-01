#!/usr/bin/env sh
set -eu
TARGET_DIR="$1"

if ! grep -q '^kiosk:' "$TARGET_DIR/etc/passwd"; then
    echo 'kiosk:x:1000:1000:Kiosk User:/home/kiosk:/bin/sh' >> "$TARGET_DIR/etc/passwd"
fi
if ! grep -q '^kiosk:' "$TARGET_DIR/etc/group"; then
    echo 'kiosk:x:1000:' >> "$TARGET_DIR/etc/group"
fi
mkdir -p "$TARGET_DIR/home/kiosk"
chown -R 1000:1000 "$TARGET_DIR/home/kiosk"
chmod 0750 "$TARGET_DIR/home/kiosk"

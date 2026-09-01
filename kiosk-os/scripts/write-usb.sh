#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 <image.img> <target-device>"
  echo "Example: $0 release/webchat-kiosk-2026.09.01.img /dev/sdX"
  exit 1
fi

IMAGE="$1"
TARGET="$2"

sudo umount "${TARGET}"* 2>/dev/null || true
sudo dd if="$IMAGE" of="$TARGET" bs=16M status=progress conv=fsync
sync

echo "USB image written to $TARGET"

#!/usr/bin/env sh
set -eu
BINARIES_DIR="$1"

mkdir -p "$BINARIES_DIR/efi-boot/EFI/BOOT"
if [ -f "$BINARIES_DIR/grubx64.efi" ]; then
  cp "$BINARIES_DIR/grubx64.efi" "$BINARIES_DIR/efi-boot/EFI/BOOT/BOOTX64.EFI"
elif [ -f "$BINARIES_DIR/EFI/BOOT/BOOTX64.EFI" ]; then
  cp "$BINARIES_DIR/EFI/BOOT/BOOTX64.EFI" "$BINARIES_DIR/efi-boot/EFI/BOOT/BOOTX64.EFI"
else
  echo "Missing GRUB EFI binary in $BINARIES_DIR" >&2
  exit 1
fi

mkdir -p "$BINARIES_DIR/efi-boot/boot"
cp "$BINARIES_DIR/bzImage" "$BINARIES_DIR/efi-boot/boot/bzImage"

"${HOST_DIR}/bin/genimage" \
  --rootpath "${TARGET_DIR}" \
  --tmppath "${BUILD_DIR}/genimage.tmp" \
  --inputpath "${BINARIES_DIR}" \
  --outputpath "${BINARIES_DIR}" \
  --config "${BR2_EXTERNAL_WEBCHAT_KIOSK_PATH}/board/webchat/kiosk/genimage.cfg"

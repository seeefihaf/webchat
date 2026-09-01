# Webchat Kiosk OS (Buildroot)

This directory contains a minimal x86_64 live USB kiosk operating system build based on Buildroot.

## Goals implemented

- UEFI-bootable live USB image (`webchat-kiosk.img`)
- Read-only squashfs root filesystem
- GUI stack (DRM/KMS + Weston)
- Browser kiosk mode (Chromium autostart)
- Optional persistence on second USB partition (`KIOSK-PERSIST`)
- RAM-only profile via `copytoram=1` kernel command line
- Reproducible scripted build and release artifact generation
- CI workflow for artifact builds, checksums, and release uploads

## Layout

- `buildroot-external/`: Buildroot external tree with defconfig, board files, overlays
- `scripts/build.sh`: downloads Buildroot and builds image artifacts
- `scripts/create-release-artifacts.sh`: creates versioned IMG/ISO + checksums (+ optional signatures)
- `scripts/write-usb.sh`: writes generated image to a USB block device

## Build

```bash
cd /home/runner/work/webchat/webchat
chmod +x kiosk-os/scripts/*.sh
kiosk-os/scripts/build.sh
```

Artifacts are created under:

- `/home/runner/work/webchat/webchat/kiosk-os/out/images/webchat-kiosk.img`

## Runtime profiles

- Default boot: read-only OS + persistence partition if present
- RAM profile: choose `Webchat Kiosk OS (RAM-only profile)` in GRUB, or add `copytoram=1`

## Persistence behavior

At boot, init script `S40persist`:

1. Mounts `/dev/disk/by-label/KIOSK-PERSIST` to `/persist` when available
2. Uses tmpfs for `/persist` in RAM-only mode
3. Bind-mounts browser cache/config from `/persist` into `/home/kiosk`

## Security defaults

- Browser runs as non-root user `kiosk`
- Root filesystem is squashfs and mounted read-only
- Chromium kiosk policies restrict URLs with blocklist/allowlist
- Browser runs with hardened runtime flags and crash-loop restart

## CI

GitHub Actions workflow builds on tag/release dispatch, then:

- uploads `.img` / `.iso`
- publishes `SHA256SUMS`
- optionally signs checksums when GPG secret is configured

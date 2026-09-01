#!/usr/bin/env sh
set -eu

URL="${KIOSK_URL:-https://example.org}"

while true; do
  chromium \
    --kiosk "$URL" \
    --ozone-platform=wayland \
    --no-first-run \
    --no-default-browser-check \
    --disable-sync \
    --disable-translate \
    --disable-features=AutofillServerCommunication,MediaRouter \
    --disable-session-crashed-bubble \
    --disable-pinch \
    --overscroll-history-navigation=0 \
    --disk-cache-dir=/home/kiosk/.cache/chromium \
    --user-data-dir=/home/kiosk/.config/chromium || true
  sleep 1
done

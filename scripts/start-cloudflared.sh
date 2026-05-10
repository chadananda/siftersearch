#!/bin/bash
# Wrapper for cloudflared tunnel — cleans up stale connectors before connecting.
# Without cleanup, dead QUIC connections linger in Cloudflare's edge and cause
# 502s for minutes after any restart, because CF routes to the dead connector
# before discovering it's gone.
set -e

CONFIG="$HOME/.cloudflared/config-siftersearch.yml"
TUNNEL="siftersearch-api"

echo "[cloudflared] Cleaning up stale connections..."
cloudflared tunnel cleanup "$TUNNEL" 2>&1 || true

echo "[cloudflared] Starting tunnel..."
exec cloudflared tunnel --config "$CONFIG" run "$TUNNEL"

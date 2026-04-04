# SifterSearch Server Migration Guide

How to migrate SifterSearch to a new Linux server. Last performed: 2026-04-02 (boss to tower-nas).

## Architecture

SifterSearch runs on two machines connected via Tailscale:

- **App server** (currently `tower-nas`): API, Meilisearch, worker, Cloudflare tunnel, Dropbox
- **AI server** (currently `boss`): vLLM for local LLM inference, accessed via Tailscale

## Prerequisites

| Requirement | Version | Install |
|-------------|---------|---------|
| Node.js | v25+ | `curl -fsSL https://deb.nodesource.com/setup_current.x \| sudo bash - && sudo apt install -y nodejs` |
| PM2 | latest | `sudo npm i -g pm2` |
| Meilisearch | latest | `curl -L https://install.meilisearch.com \| sh && sudo mv meilisearch /usr/local/bin/` |
| Cloudflared | latest | `curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared && chmod +x cloudflared && sudo mv cloudflared /usr/local/bin/` |
| sqlite3 | any | `sudo apt install -y sqlite3` |
| Tailscale | latest | [tailscale.com/download](https://tailscale.com/download) |
| Git | any | `sudo apt install -y git` |

## Step 1: Install Dropbox (Headless)

```bash
cd ~ && curl -Lo dropbox.tar.gz "https://www.dropbox.com/download?plat=lnx.x86_64"
tar xzf dropbox.tar.gz && rm dropbox.tar.gz
~/.dropbox-dist/dropboxd
# Visit the printed URL to link your account, then Ctrl+C
```

### Selective sync (optional — sync only what's needed first)

```bash
# Install CLI helper
curl -Lo /tmp/dropbox.py "https://www.dropbox.com/download?dl=packages/dropbox.py"
chmod +x /tmp/dropbox.py

# Start Dropbox, wait for folders to appear, then exclude everything except what you need
python3 /tmp/dropbox.py exclude add ~/Dropbox/<folder-to-exclude>

# Remove exclusions later to sync everything
python3 /tmp/dropbox.py exclude remove ~/Dropbox/<folder>

# Set unlimited bandwidth
python3 /tmp/dropbox.py throttle unlimited unlimited
```

### Move Dropbox to bulk storage (if applicable)

```bash
# Stop Dropbox first
pkill -f dropboxd

# Move and symlink
mv ~/Dropbox /tank/dropbox
ln -s /tank/dropbox ~/Dropbox

# Restart
~/.dropbox-dist/dropboxd &
```

### Dropbox systemd service (auto-start on boot)

```bash
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/dropbox.service << 'EOF'
[Unit]
Description=Dropbox Daemon
After=network.target

[Service]
ExecStart=/home/chad/.dropbox-dist/dropboxd
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable dropbox.service
systemctl --user start dropbox.service
loginctl enable-linger chad   # run without active login session
```

## Step 2: Clone Repo and Install

```bash
mkdir -p ~/sifter
cd ~/sifter
git clone https://github.com/chadananda/siftersearch.git
cd siftersearch
npm install
mkdir -p data logs data/meilisearch
```

## Step 3: Copy Data from Old Server

### SQLite database (the critical asset)

Use `.backup` to get a WAL-safe copy. This integrates any pending WAL transactions into a clean single file.

```bash
# On old server: create safe backup
ssh chad@<old-server> 'sqlite3 ~/sifter/siftersearch/data/sifter.db ".backup /tmp/sifter-migrate.db"'

# Transfer to new server (may need to relay through a machine with SSH keys to both)
scp chad@<old-server>:/tmp/sifter-migrate.db /tmp/sifter-migrate.db
scp /tmp/sifter-migrate.db chad@<new-server>:~/sifter/siftersearch/data/sifter.db

# Clean up temp file
rm /tmp/sifter-migrate.db
ssh chad@<old-server> 'rm /tmp/sifter-migrate.db'
```

### Environment files

```bash
# Copy from old server
scp chad@<old-server>:~/sifter/siftersearch/.env-secrets ~/sifter/siftersearch/.env-secrets
scp chad@<old-server>:~/sifter/siftersearch/.env-public ~/sifter/siftersearch/.env-public
```

### Cloudflare tunnel credentials

```bash
# Copy the entire .cloudflared directory
scp -r chad@<old-server>:~/.cloudflared/ ~/.cloudflared/
```

## Step 4: Copy Additional Databases

SifterSearch uses three SQLite databases. Copy all three:

```bash
# embedding_cache.db — deduplicated 512-dim embeddings (large, ~several GB)
ssh chad@<old-server> 'sqlite3 ~/sifter/siftersearch/data/embedding_cache.db ".backup /tmp/embedding_cache-migrate.db"'
scp chad@<old-server>:/tmp/embedding_cache-migrate.db /tmp/embedding_cache-migrate.db
scp /tmp/embedding_cache-migrate.db chad@<new-server>:~/sifter/siftersearch/data/embedding_cache.db
rm /tmp/embedding_cache-migrate.db
ssh chad@<old-server> 'rm /tmp/embedding_cache-migrate.db'

# graph.db — entity/concept graph
ssh chad@<old-server> 'sqlite3 ~/sifter/siftersearch/data/graph.db ".backup /tmp/graph-migrate.db"'
scp chad@<old-server>:/tmp/graph-migrate.db /tmp/graph-migrate.db
scp /tmp/graph-migrate.db chad@<new-server>:~/sifter/siftersearch/data/graph.db
rm /tmp/graph-migrate.db
ssh chad@<old-server> 'rm /tmp/graph-migrate.db'
```

If `embedding_cache.db` does not exist on the old server (fresh deployment), it will be created automatically on first use. Re-populating it requires re-embedding all paragraphs — this takes significant time and API cost, so always copy it if available.

## Step 5: Verify Databases

```bash
sqlite3 data/sifter.db "SELECT COUNT(*) FROM docs WHERE deleted_at IS NULL;"
# Expected: ~7,900+

sqlite3 data/sifter.db "SELECT religion, COUNT(*) FROM docs WHERE deleted_at IS NULL GROUP BY religion;"
# Expected: 11 religions

sqlite3 data/sifter.db "SELECT COUNT(*) FROM content WHERE deleted_at IS NULL;"
# Expected: ~3.6M+

sqlite3 data/embedding_cache.db "SELECT COUNT(*) FROM embedding_cache;" 2>/dev/null || echo "embedding_cache.db not present (will be created on first use)"
# Expected: ~2.5M+ rows if copied

sqlite3 data/graph.db "SELECT COUNT(*) FROM graph_entities;" 2>/dev/null || echo "graph.db not present (will be created on first use)"
```

## Step 6: Update Configuration

Check `.env-secrets` and `.env-public` for paths that need updating:

- **LIBRARY_BASE_PATH**: Defaults to `$HOME/Dropbox/Ocean2.0 Supplemental/ocean-supplemental-markdown/Ocean Library`. If Dropbox is symlinked at `~/Dropbox`, no change needed.
- **LMSTUDIO_HOST / AI endpoints**: Update to point to the AI server via Tailscale IP.
- **MEILI_HOST**: Should be `http://localhost:7700` (Meilisearch runs locally).

## Step 7: Start Meilisearch

### As a systemd user service (recommended)

```bash
mkdir -p ~/.config/systemd/user

cat > ~/.config/systemd/user/meilisearch.service << 'EOF'
[Unit]
Description=Meilisearch Search Engine
After=network.target

[Service]
ExecStart=/usr/local/bin/meilisearch \
  --db-path /home/chad/sifter/siftersearch/data/meilisearch \
  --http-addr localhost:7700 \
  --no-analytics \
  --master-key 797f54ee48797f54ee48797f54ee48 \
  --max-indexing-threads 16
Restart=on-failure
RestartSec=5
LimitNOFILE=65536
WorkingDirectory=/home/chad/sifter/siftersearch

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable meilisearch.service
systemctl --user start meilisearch.service
```

### Verify

```bash
curl -s http://localhost:7700/health
# Returns: {"status":"available"}
```

## Step 8: Start SifterSearch via PM2

```bash
cd ~/sifter/siftersearch
MEILI_MASTER_KEY=797f54ee48797f54ee48797f54ee48 pm2 start ecosystem.config.cjs
pm2 save
```

### PM2 auto-start on boot

```bash
pm2 startup
# Copy and run the sudo command it prints, e.g.:
# sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u chad --hp /home/chad
pm2 save
```

### Verify

```bash
pm2 list                    # All services online
curl -s http://localhost:7839/api/library/stats   # Returns doc counts
```

## Step 9: Verify Cloudflare Tunnel

The tunnel is started by PM2 via `ecosystem.config.cjs`. It reads `~/.cloudflared/config-siftersearch.yml`:

```yaml
tunnel: <tunnel-id>
credentials-file: /home/chad/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: api.siftersearch.com
    service: http://127.0.0.1:7839
  - service: http_status:404
```

### Verify end-to-end

```bash
curl -s https://api.siftersearch.com/api/v1/health
# Returns: {"status":"ok","version":"..."}
```

## Step 10: Shut Down Old Server

```bash
ssh chad@<old-server> 'cd ~/sifter/siftersearch && pm2 stop all && pm2 delete all && pm2 save'
```

Keep vLLM / AI services running if the old server is the AI server.

## Step 11: Rebuild Meilisearch Index (when ready)

Meilisearch will be empty on the new server. When ready to rebuild:

```bash
# Reset all three sync layers
sqlite3 data/sifter.db "UPDATE layer_sync_state SET synced = 0 WHERE deleted_at IS NULL;"
# Or if layer_sync_state doesn't exist yet (pre-migration-44):
sqlite3 data/sifter.db "UPDATE content SET synced = 0 WHERE deleted_at IS NULL;"

pm2 restart siftersearch-worker
pm2 logs siftersearch-worker --lines 20   # Monitor progress
```

Note: Base layer rebuild can take hours for millions of paragraphs. Object extraction and enrichment layers require vLLM access to `boss` and will run incrementally as pipeline jobs complete. Consider doing schema migrations first (`POST /api/admin/server/migrate`) before triggering a full rebuild.

## Current Server Details (as of 2026-04-02)

### tower-nas (App Server)
- **Hardware:** Dell Xeon 80-core, 188GB RAM
- **OS:** Ubuntu 24.04 LTS
- **Tailscale:** tower-nas / 100.77.148.41
- **Storage:**
  - `/` (ext4, 218GB) — OS
  - `/fast` (ZFS NVMe+SSD, 861GB) — indexes, databases
  - `/tank` (ZFS, 20TB) — bulk storage, backups, Dropbox
  - `/vault` (ZFS, 3.6TB) — snapshots, mirrors
- **Dropbox:** `/tank/dropbox` symlinked to `~/Dropbox`

### boss (AI Server)
- **Hardware:** Strix Halo, 128GB RAM + GPU
- **OS:** Arch Linux
- **Tailscale:** boss / 100.103.78.63
- **Services:** vLLM (port 8000), LM Studio (port 1234)

### Tailscale Network
All machines communicate via Tailscale. Use hostnames (`boss`, `tower-nas`) or IPs.

## Checklist

- [ ] Tailscale installed and connected
- [ ] Dropbox installed, linked, and syncing (at least Ocean Library)
- [ ] Dropbox systemd service enabled
- [ ] Node.js, PM2, Meilisearch, Cloudflared, sqlite3 installed
- [ ] Repo cloned and `npm install` complete
- [ ] sifter.db copied (WAL-safe via `.backup`)
- [ ] embedding_cache.db copied (or accepted that re-embedding will be needed)
- [ ] graph.db copied (or accepted that re-extraction will be needed)
- [ ] `.env-secrets` and `.env-public` copied and paths verified
- [ ] `~/.cloudflared/` credentials copied
- [ ] Meilisearch systemd service running
- [ ] PM2 services started and saved
- [ ] PM2 startup configured (`pm2 startup` + sudo command)
- [ ] Cloudflare tunnel routing verified
- [ ] Public API health check passing
- [ ] Old server services stopped

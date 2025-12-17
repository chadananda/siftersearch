#!/bin/bash
#
# Meilisearch Upgrade Script
#
# Safely upgrades Meilisearch by:
# 1. Creating a backup of current data
# 2. Creating a dump (portable across versions)
# 3. Stopping the service
# 4. Upgrading Meilisearch
# 5. Importing the dump into the new version
#
# Usage:
#   ./upgrade-meilisearch.sh           # Check for updates and upgrade if available
#   ./upgrade-meilisearch.sh --check   # Just check versions, don't upgrade
#   ./upgrade-meilisearch.sh --force   # Force upgrade even if versions match
#
# IMPORTANT: Always run this script instead of directly upgrading via pacman!

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
MEILI_DATA_DIR="$PROJECT_ROOT/data/meilisearch"
BACKUP_DIR="$HOME/sifter-backups/meilisearch"
MEILI_HOST="${MEILI_HOST:-http://localhost:7700}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[upgrade]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[upgrade]${NC} $1"; }
log_error() { echo -e "${RED}[upgrade]${NC} $1"; }

# Get installed Meilisearch version
get_installed_version() {
    meilisearch --version 2>/dev/null | grep -o '[0-9]\+\.[0-9]\+\.[0-9]\+' | head -1 || echo "not_installed"
}

# Get data version
get_data_version() {
    if [ -f "$MEILI_DATA_DIR/VERSION" ]; then
        cat "$MEILI_DATA_DIR/VERSION"
    else
        echo "no_data"
    fi
}

# Get available version from pacman
get_available_version() {
    pacman -Si meilisearch 2>/dev/null | grep "Version" | awk '{print $3}' | sed 's/.*://' || echo "unknown"
}

# Check if Meilisearch is running
is_meili_running() {
    curl -s "$MEILI_HOST/health" > /dev/null 2>&1
}

# Get master key
get_master_key() {
    if [ -f "$PROJECT_ROOT/.env-secrets" ]; then
        grep "^MEILI_MASTER_KEY=" "$PROJECT_ROOT/.env-secrets" | cut -d'=' -f2 | tr -d '"'
    fi
}

# Create dump via API
create_dump() {
    log_info "Creating dump for migration..."

    local key=$(get_master_key)
    local auth_header=""
    if [ -n "$key" ]; then
        auth_header="-H \"Authorization: Bearer $key\""
    fi

    # Start dump
    local response=$(eval curl -s -X POST "$MEILI_HOST/dumps" $auth_header)
    local task_uid=$(echo "$response" | grep -o '"taskUid":[0-9]*' | cut -d':' -f2)

    if [ -z "$task_uid" ]; then
        log_error "Failed to start dump: $response"
        return 1
    fi

    log_info "Dump task: $task_uid"

    # Wait for completion
    local max_wait=300  # 5 minutes
    local waited=0
    while [ $waited -lt $max_wait ]; do
        local status=$(eval curl -s "$MEILI_HOST/tasks/$task_uid" $auth_header | grep -o '"status":"[^"]*"' | cut -d'"' -f4)

        if [ "$status" = "succeeded" ]; then
            log_info "Dump completed"
            return 0
        elif [ "$status" = "failed" ]; then
            log_error "Dump failed"
            return 1
        fi

        sleep 2
        waited=$((waited + 2))
        echo -n "."
    done

    echo ""
    log_error "Dump timed out after ${max_wait}s"
    return 1
}

# Import dump into new Meilisearch
import_dump() {
    local dump_file="$1"

    log_info "Importing dump: $dump_file"

    # Start Meilisearch with import flag
    meilisearch \
        --db-path "$MEILI_DATA_DIR" \
        --import-dump "$dump_file" \
        --master-key "$(get_master_key)" \
        &

    local pid=$!
    sleep 10  # Give it time to import

    # Check if it's still running
    if kill -0 $pid 2>/dev/null; then
        log_info "Import started successfully"
        kill $pid 2>/dev/null || true
        wait $pid 2>/dev/null || true
        return 0
    else
        log_error "Import failed"
        return 1
    fi
}

# Main upgrade process
do_upgrade() {
    local installed=$(get_installed_version)
    local data_ver=$(get_data_version)
    local available=$(get_available_version)

    echo ""
    echo -e "${BLUE}Meilisearch Version Status${NC}"
    echo "─────────────────────────────"
    echo -e "Installed:  ${GREEN}$installed${NC}"
    echo -e "Data:       ${GREEN}$data_ver${NC}"
    echo -e "Available:  ${YELLOW}$available${NC}"
    echo ""

    # Check if upgrade is needed
    if [ "$installed" = "$available" ] && [ "$1" != "--force" ]; then
        log_info "Already at latest version ($installed)"

        # Check for version mismatch between installed and data
        if [ "$data_ver" != "no_data" ] && [ "$installed" != "$data_ver" ]; then
            log_warn "Data version ($data_ver) doesn't match installed ($installed)"
            log_warn "You may need to migrate or restore from backup"
        fi
        return 0
    fi

    log_warn "Upgrade will change Meilisearch from $installed to $available"
    log_warn "This requires migrating your data via dump/import"
    echo ""

    read -p "Proceed with upgrade? (y/N) " confirm
    if [ "$confirm" != "y" ]; then
        log_info "Upgrade cancelled"
        return 0
    fi

    # Step 1: Create backup
    log_info "Step 1/5: Creating backup..."
    "$SCRIPT_DIR/backup-meilisearch.sh"

    # Step 2: Create dump (if Meilisearch is running)
    if is_meili_running; then
        log_info "Step 2/5: Creating dump for migration..."
        create_dump
    else
        log_warn "Step 2/5: Meilisearch not running, starting it for dump..."

        # Try to start with old version temporarily
        meilisearch --db-path "$MEILI_DATA_DIR" --master-key "$(get_master_key)" &
        local temp_pid=$!
        sleep 5

        if is_meili_running; then
            create_dump
            kill $temp_pid 2>/dev/null || true
            wait $temp_pid 2>/dev/null || true
        else
            log_error "Could not start Meilisearch to create dump"
            log_error "You may need to downgrade or restore from backup"
            kill $temp_pid 2>/dev/null || true
            return 1
        fi
    fi

    # Find the dump file
    local dump_file=$(ls -t "$MEILI_DATA_DIR/dumps/"*.dump 2>/dev/null | head -1)
    if [ -z "$dump_file" ]; then
        log_error "Dump file not found"
        return 1
    fi

    # Move dump to backup location
    local dump_backup="$BACKUP_DIR/upgrade_dump_$(date +%Y%m%d_%H%M%S).dump"
    cp "$dump_file" "$dump_backup"
    log_info "Dump saved to: $dump_backup"

    # Step 3: Stop Meilisearch
    log_info "Step 3/5: Stopping Meilisearch..."
    pm2 stop siftersearch-api 2>/dev/null || true
    pkill -f meilisearch 2>/dev/null || true
    sleep 3

    # Step 4: Upgrade via pacman
    log_info "Step 4/5: Upgrading Meilisearch..."
    sudo pacman -S meilisearch --noconfirm

    # Clear old data (dump will be imported)
    rm -rf "$MEILI_DATA_DIR"
    mkdir -p "$MEILI_DATA_DIR"

    # Step 5: Import dump
    log_info "Step 5/5: Importing dump into new version..."
    import_dump "$dump_backup"

    # Verify
    local new_data_ver=$(get_data_version)
    log_info "Upgrade complete!"
    log_info "New data version: $new_data_ver"
    log_info "Restart the server: pm2 restart siftersearch-api"
}

# Just check versions
check_versions() {
    local installed=$(get_installed_version)
    local data_ver=$(get_data_version)
    local available=$(get_available_version)

    echo ""
    echo -e "${BLUE}Meilisearch Version Status${NC}"
    echo "─────────────────────────────"
    echo -e "Installed:  $installed"
    echo -e "Data:       $data_ver"
    echo -e "Available:  $available"
    echo ""

    if [ "$installed" != "$data_ver" ] && [ "$data_ver" != "no_data" ]; then
        log_error "VERSION MISMATCH: Data is v$data_ver but Meilisearch is v$installed"
        log_warn "Options:"
        log_warn "  1. Downgrade Meilisearch: sudo pacman -U /var/cache/pacman/pkg/meilisearch-$data_ver-*.pkg.tar.zst"
        log_warn "  2. Restore from backup: $SCRIPT_DIR/backup-meilisearch.sh --restore <backup>"
        log_warn "  3. Re-index (costs money for embeddings)"
    elif [ "$installed" != "$available" ]; then
        log_info "Update available: $installed -> $available"
        log_info "Run: $0 to upgrade safely"
    else
        log_info "Everything up to date"
    fi
}

# Main
case "${1:-}" in
    --check)
        check_versions
        ;;
    --force)
        do_upgrade --force
        ;;
    --help|-h)
        echo "Meilisearch Upgrade Script"
        echo ""
        echo "Usage:"
        echo "  $0              Check and upgrade if available"
        echo "  $0 --check      Just check versions"
        echo "  $0 --force      Force upgrade even if same version"
        echo ""
        echo "IMPORTANT: Always use this script instead of 'pacman -S meilisearch'"
        echo "to avoid data loss from version mismatches."
        ;;
    *)
        do_upgrade
        ;;
esac

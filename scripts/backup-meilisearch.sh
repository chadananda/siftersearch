#!/bin/bash
#
# Meilisearch Backup Script
#
# Creates timestamped backups of Meilisearch data to protect valuable embeddings.
# Supports both dump-based backups (portable across versions) and direct copies.
#
# Usage:
#   ./backup-meilisearch.sh              # Create backup
#   ./backup-meilisearch.sh --dump       # Create dump (for migrations)
#   ./backup-meilisearch.sh --list       # List existing backups
#   ./backup-meilisearch.sh --restore <backup_name>  # Restore from backup
#
# Backups are stored in: ~/sifter-backups/meilisearch/

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
MEILI_DATA_DIR="$PROJECT_ROOT/data/meilisearch"
BACKUP_BASE_DIR="$HOME/sifter-backups/meilisearch"
MEILI_HOST="${MEILI_HOST:-http://localhost:7700}"
MAX_BACKUPS=7  # Keep last 7 backups

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[backup]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[backup]${NC} $1"; }
log_error() { echo -e "${RED}[backup]${NC} $1"; }

# Ensure backup directory exists
mkdir -p "$BACKUP_BASE_DIR"

# Get current Meilisearch version from data
get_data_version() {
    if [ -f "$MEILI_DATA_DIR/VERSION" ]; then
        cat "$MEILI_DATA_DIR/VERSION"
    else
        echo "unknown"
    fi
}

# Create a direct copy backup (fast, preserves everything)
create_backup() {
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local version=$(get_data_version)
    local backup_name="backup_${timestamp}_v${version}"
    local backup_path="$BACKUP_BASE_DIR/$backup_name"

    if [ ! -d "$MEILI_DATA_DIR" ] || [ ! -f "$MEILI_DATA_DIR/VERSION" ]; then
        log_error "No Meilisearch data found at $MEILI_DATA_DIR"
        exit 1
    fi

    log_info "Creating backup: $backup_name"
    log_info "Data version: $version"

    # Copy the entire data directory
    cp -r "$MEILI_DATA_DIR" "$backup_path"

    # Create metadata file
    cat > "$backup_path/BACKUP_INFO" << EOF
backup_date: $(date -Iseconds)
meilisearch_version: $version
source_path: $MEILI_DATA_DIR
backup_type: direct_copy
EOF

    # Calculate size
    local size=$(du -sh "$backup_path" | cut -f1)
    log_info "Backup created: $backup_path ($size)"

    # Cleanup old backups
    cleanup_old_backups

    echo "$backup_path"
}

# Create a dump (portable across Meilisearch versions)
create_dump() {
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local dump_name="dump_${timestamp}"

    log_info "Creating Meilisearch dump via API..."

    # Check if Meilisearch is running
    if ! curl -s "$MEILI_HOST/health" > /dev/null 2>&1; then
        log_error "Meilisearch is not running at $MEILI_HOST"
        log_warn "Start Meilisearch first, or use direct backup (no --dump flag)"
        exit 1
    fi

    # Get master key from env
    if [ -f "$PROJECT_ROOT/.env-secrets" ]; then
        MEILI_KEY=$(grep "^MEILI_MASTER_KEY=" "$PROJECT_ROOT/.env-secrets" | cut -d'=' -f2 | tr -d '"')
    fi

    # Trigger dump creation
    local auth_header=""
    if [ -n "$MEILI_KEY" ]; then
        auth_header="-H \"Authorization: Bearer $MEILI_KEY\""
    fi

    local response=$(curl -s -X POST "$MEILI_HOST/dumps" $auth_header)
    local task_uid=$(echo "$response" | grep -o '"taskUid":[0-9]*' | cut -d':' -f2)

    if [ -z "$task_uid" ]; then
        log_error "Failed to create dump: $response"
        exit 1
    fi

    log_info "Dump task started: $task_uid"
    log_info "Waiting for dump to complete..."

    # Wait for task to complete
    while true; do
        local status=$(curl -s "$MEILI_HOST/tasks/$task_uid" $auth_header | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
        if [ "$status" = "succeeded" ]; then
            log_info "Dump completed successfully"
            break
        elif [ "$status" = "failed" ]; then
            log_error "Dump failed"
            exit 1
        fi
        sleep 1
    done

    # Find and move the dump file
    local dump_file=$(ls -t "$MEILI_DATA_DIR/dumps/"*.dump 2>/dev/null | head -1)
    if [ -n "$dump_file" ]; then
        mv "$dump_file" "$BACKUP_BASE_DIR/$dump_name.dump"
        log_info "Dump saved to: $BACKUP_BASE_DIR/$dump_name.dump"
    else
        log_warn "Dump file not found in expected location"
    fi
}

# List existing backups
list_backups() {
    log_info "Existing backups in $BACKUP_BASE_DIR:"
    echo ""

    if [ ! -d "$BACKUP_BASE_DIR" ] || [ -z "$(ls -A "$BACKUP_BASE_DIR" 2>/dev/null)" ]; then
        log_warn "No backups found"
        return
    fi

    for backup in "$BACKUP_BASE_DIR"/*; do
        if [ -d "$backup" ]; then
            local name=$(basename "$backup")
            local size=$(du -sh "$backup" | cut -f1)
            local version="unknown"
            if [ -f "$backup/VERSION" ]; then
                version=$(cat "$backup/VERSION")
            fi
            echo -e "  ${BLUE}$name${NC} (v$version, $size)"
        elif [[ "$backup" == *.dump ]]; then
            local name=$(basename "$backup")
            local size=$(du -sh "$backup" | cut -f1)
            echo -e "  ${BLUE}$name${NC} (dump, $size)"
        fi
    done
}

# Restore from backup
restore_backup() {
    local backup_name="$1"
    local backup_path="$BACKUP_BASE_DIR/$backup_name"

    if [ ! -d "$backup_path" ]; then
        log_error "Backup not found: $backup_path"
        list_backups
        exit 1
    fi

    local backup_version=$(cat "$backup_path/VERSION" 2>/dev/null || echo "unknown")
    local current_meili_version=$(meilisearch --version 2>/dev/null | grep -o '[0-9]\+\.[0-9]\+\.[0-9]\+' || echo "unknown")

    log_warn "Restoring backup: $backup_name"
    log_info "Backup version: $backup_version"
    log_info "Current Meilisearch: $current_meili_version"

    if [ "$backup_version" != "$current_meili_version" ] && [ "$backup_version" != "unknown" ]; then
        log_error "Version mismatch! Backup is v$backup_version but Meilisearch is v$current_meili_version"
        log_warn "You need to either:"
        log_warn "  1. Downgrade Meilisearch to v$backup_version"
        log_warn "  2. Use a dump file for migration"
        read -p "Continue anyway? (y/N) " confirm
        if [ "$confirm" != "y" ]; then
            exit 1
        fi
    fi

    # Stop any running Meilisearch
    log_info "Stopping Meilisearch if running..."
    pkill -f "meilisearch" 2>/dev/null || true
    sleep 2

    # Backup current data if it exists
    if [ -d "$MEILI_DATA_DIR" ] && [ -f "$MEILI_DATA_DIR/VERSION" ]; then
        local current_backup="$BACKUP_BASE_DIR/pre_restore_$(date +%Y%m%d_%H%M%S)"
        log_info "Backing up current data to $current_backup"
        mv "$MEILI_DATA_DIR" "$current_backup"
    else
        rm -rf "$MEILI_DATA_DIR" 2>/dev/null || true
    fi

    # Restore
    log_info "Restoring data..."
    cp -r "$backup_path" "$MEILI_DATA_DIR"
    rm -f "$MEILI_DATA_DIR/BACKUP_INFO"  # Remove backup metadata from restored data

    log_info "Restore complete. Restart the server to use restored data."
}

# Cleanup old backups, keeping only MAX_BACKUPS
cleanup_old_backups() {
    local backup_count=$(ls -d "$BACKUP_BASE_DIR"/backup_* 2>/dev/null | wc -l)

    if [ "$backup_count" -gt "$MAX_BACKUPS" ]; then
        local to_delete=$((backup_count - MAX_BACKUPS))
        log_info "Cleaning up $to_delete old backup(s)..."

        ls -dt "$BACKUP_BASE_DIR"/backup_* | tail -n "$to_delete" | while read old_backup; do
            log_info "Removing old backup: $(basename "$old_backup")"
            rm -rf "$old_backup"
        done
    fi
}

# Main
case "${1:-}" in
    --dump)
        create_dump
        ;;
    --list)
        list_backups
        ;;
    --restore)
        if [ -z "${2:-}" ]; then
            log_error "Usage: $0 --restore <backup_name>"
            list_backups
            exit 1
        fi
        restore_backup "$2"
        ;;
    --help|-h)
        echo "Meilisearch Backup Script"
        echo ""
        echo "Usage:"
        echo "  $0              Create a direct copy backup"
        echo "  $0 --dump       Create a dump (for version migrations)"
        echo "  $0 --list       List existing backups"
        echo "  $0 --restore <name>  Restore from backup"
        echo ""
        echo "Backups are stored in: $BACKUP_BASE_DIR"
        ;;
    *)
        create_backup
        ;;
esac

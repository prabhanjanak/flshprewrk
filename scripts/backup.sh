#!/bin/bash
# ==============================================================================
# SANKARA FELLOWSHIP EXAM — MANUAL BACKUP SCRIPT
# Run this script anytime to take an immediate database backup into ./backups/
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${ROOT_DIR}/backups"

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="manual_backup_fellowship_${TIMESTAMP}.sql.gz"
FILEPATH="${BACKUP_DIR}/${FILENAME}"

echo "================================================================="
echo "Taking immediate database backup..."
echo "Destination: ${FILEPATH}"
echo "================================================================="

if docker ps | grep -q fellowship-postgres; then
    docker exec -t fellowship-postgres pg_dump -U fellowship_admin fellowship_db | gzip -9 > "$FILEPATH"
    SIZE=$(du -h "$FILEPATH" | cut -f1)
    echo "✓ SUCCESS: Backup saved to: ${FILEPATH} (${SIZE})"
else
    # Fallback to local postgres if docker is not running
    echo "Notice: fellowship-postgres container not active, trying local PostgreSQL..."
    pg_dump -U prabhanjan -d fellowship_db 2>/dev/null | gzip -9 > "$FILEPATH" || pg_dump -d fellowship_db | gzip -9 > "$FILEPATH"
    SIZE=$(du -h "$FILEPATH" | cut -f1)
    echo "✓ SUCCESS: Local database backup saved to: ${FILEPATH} (${SIZE})"
fi

echo "================================================================="

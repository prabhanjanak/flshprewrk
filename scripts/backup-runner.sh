#!/bin/sh
set -e

BACKUP_DIR="/backups"
DB_HOST="${DB_HOST:-fellowship-db}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${POSTGRES_USER:-fellowship_admin}"
DB_NAME="${POSTGRES_DB:-fellowship_db}"
PGPASSWORD="${POSTGRES_PASSWORD:-FellowshipSecure2026!}"
export PGPASSWORD

mkdir -p "$BACKUP_DIR"

perform_backup() {
    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    FILENAME="backup_${DB_NAME}_${TIMESTAMP}.sql.gz"
    FILEPATH="${BACKUP_DIR}/${FILENAME}"

    echo "[$(date -u +"%Y-%m-%d %H:%M:%S UTC")] Starting automated database backup: ${FILENAME}..."

    if pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" | gzip -9 > "$FILEPATH"; then
        SIZE=$(du -h "$FILEPATH" | cut -f1)
        echo "[$(date -u +"%Y-%m-%d %H:%M:%S UTC")] SUCCESS: Database backup completed! File: ${FILENAME} (Size: ${SIZE})"
    else
        echo "[$(date -u +"%Y-%m-%d %H:%M:%S UTC")] ERROR: Backup failed!" >&2
        rm -f "$FILEPATH"
    fi

    # Prune old backups (keep last 30 backups or 14 days)
    find "$BACKUP_DIR" -name "backup_${DB_NAME}_*.sql.gz" -mtime +14 -delete 2>/dev/null || true
}

# If arguments were passed (e.g. --now), run single backup and exit
if [ "$1" = "--now" ]; then
    perform_backup
    exit 0
fi

# Run an initial backup when the container boots up
echo "=== FELLOWSHIP AUTOMATED BACKUP SERVICE STARTED ==="
echo "Schedule: 5 times daily (00:00, 05:00, 10:00, 15:00, 20:00)"
echo "Target Directory: ${BACKUP_DIR}"

perform_backup

# Create cron job file for 5 daily backups: 00:00, 05:00, 10:00, 15:00, 20:00
CRON_SCHEDULE="${BACKUP_SCHEDULE:-0 0,5,10,15,20 * * *}"
CRON_FILE="/etc/crontabs/root"

echo "${CRON_SCHEDULE} /scripts/backup-runner.sh --now >> /var/log/backup.log 2>&1" > "$CRON_FILE"

# Start crond in foreground with log level 2
echo "Starting crond scheduler..."
exec crond -f -l 2

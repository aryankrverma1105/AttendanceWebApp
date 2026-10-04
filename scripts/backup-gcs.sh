#!/usr/bin/env bash
# ==============================================================================
# Sologix Energy — Daily PostgreSQL Backup to Google Cloud Storage (GCS)
# ==============================================================================
set -euo pipefail

# Load environment
ENV_FILE="$(dirname "$0")/../.env"
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  export $(grep -v '^#' "$ENV_FILE" | xargs)
fi

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="${BACKUP_DIR:-/tmp/sologix-backups}"
BACKUP_FILENAME="sologix_db_${TIMESTAMP}.sql.gz"
BACKUP_FILEPATH="${BACKUP_DIR}/${BACKUP_FILENAME}"

mkdir -p "${BACKUP_DIR}"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting automated database backup..."

# 1. Execute pg_dump from the docker network
docker compose exec -T postgres pg_dump -U "${POSTGRES_USER:-sologix_user}" "${POSTGRES_DB:-sologix_db}" | gzip > "${BACKUP_FILEPATH}"

BACKUP_SIZE=$(du -h "${BACKUP_FILEPATH}" | cut -f1)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Dump created successfully: ${BACKUP_FILENAME} (${BACKUP_SIZE})"

# 2. Upload to Google Cloud Storage
if [ -n "${GCS_BACKUP_BUCKET:-}" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Uploading to gs://${GCS_BACKUP_BUCKET}/backups/${BACKUP_FILENAME}..."
  if command -v gcloud &> /dev/null; then
    gcloud storage cp "${BACKUP_FILEPATH}" "gs://${GCS_BACKUP_BUCKET}/backups/${BACKUP_FILENAME}"
  elif command -v gsutil &> /dev/null; then
    gsutil cp "${BACKUP_FILEPATH}" "gs://${GCS_BACKUP_BUCKET}/backups/${BACKUP_FILENAME}"
  else
    echo "WARNING: Neither 'gcloud' nor 'gsutil' CLI is installed. Backup saved locally only."
  fi
else
  echo "INFO: GCS_BACKUP_BUCKET not configured. Backup retained locally in ${BACKUP_DIR}."
fi

# 3. Clean up local backups older than 7 days
find "${BACKUP_DIR}" -type f -name "sologix_db_*.sql.gz" -mtime +7 -delete

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup process complete."

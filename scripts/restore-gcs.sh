#!/usr/bin/env bash
# ==============================================================================
# Sologix Energy — PostgreSQL Restore from Backup
# Usage: ./scripts/restore-gcs.sh <path_to_backup.sql.gz or gcs_uri>
# ==============================================================================
set -euo pipefail

ENV_FILE="$(dirname "$0")/../.env"
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  export $(grep -v '^#' "$ENV_FILE" | xargs)
fi

if [ $# -lt 1 ]; then
  echo "Usage: $0 <path_to_backup.sql.gz | gs://bucket/path/backup.sql.gz>"
  exit 1
fi

SOURCE="$1"
LOCAL_FILE="$SOURCE"

if [[ "$SOURCE" =~ ^gs:// ]]; then
  TMP_DIR="/tmp/sologix-restore"
  mkdir -p "$TMP_DIR"
  LOCAL_FILE="${TMP_DIR}/restore_$(basename "$SOURCE")"
  echo "Downloading backup from ${SOURCE}..."
  if command -v gcloud &> /dev/null; then
    gcloud storage cp "$SOURCE" "$LOCAL_FILE"
  elif command -v gsutil &> /dev/null; then
    gsutil cp "$SOURCE" "$LOCAL_FILE"
  else
    echo "ERROR: Neither 'gcloud' nor 'gsutil' CLI is available to download from GCS."
    exit 1
  fi
fi

if [ ! -f "$LOCAL_FILE" ]; then
  echo "ERROR: Backup file ${LOCAL_FILE} not found."
  exit 1
fi

echo "WARNING: This will overwrite data in database '${POSTGRES_DB:-sologix_db}'."
read -p "Are you sure you want to proceed? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Restore cancelled."
  exit 0
fi

echo "Restoring database from ${LOCAL_FILE}..."
zcat "${LOCAL_FILE}" | docker compose exec -T postgres psql -U "${POSTGRES_USER:-sologix_user}" -d "${POSTGRES_DB:-sologix_db}"

echo "Database restore completed successfully!"

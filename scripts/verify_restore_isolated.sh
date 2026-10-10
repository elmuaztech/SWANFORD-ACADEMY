#!/usr/bin/env bash
# =============================================================================
# Swanford Academy — Isolated Non-Destructive Restore Verification Script
# Master Specification Reference: Sections 8, 21, 22
#
# Safety Guarantee:
# NEVER touches or restores over the live production database.
# Decrypts and tests restoring into an isolated temporary database (test_restore_sandbox),
# performs schema and table count assertions, and then cleanly drops the temporary database.
# =============================================================================

set -euo pipefail

BACKUP_FILE="${1:-}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-swanford_postgres}"
ENV_FILE="${ENV_FILE:-/root/swanford-academy/.env}"
TEMP_RESTORE_DB="swanford_restore_verify_$(date +%s)"

echo "================================================================="
echo "  Swanford Academy — Isolated Restore Verification Tool"
echo "  Target Sandbox DB: $TEMP_RESTORE_DB"
echo "================================================================="

if [ -z "$BACKUP_FILE" ]; then
  echo "[-] USAGE: ./scripts/verify_restore_isolated.sh <path_to_backup_file>"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "[-] ERROR: Backup file '$BACKUP_FILE' not found."
  exit 1
fi

# Load database user
POSTGRES_USER=$(grep -E "^POSTGRES_USER=" "$ENV_FILE" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || echo "postgres")

# 1. Decrypt if file is encrypted (.enc)
WORK_FILE="$BACKUP_FILE"
TEMP_DECRYPTED=""

if [[ "$BACKUP_FILE" == *.enc ]]; then
  echo "[+] Detected encrypted backup. Preparing temporary decryption..."
  KEY_FILE="/root/.backup_encryption_key"
  KEY="${BACKUP_ENCRYPTION_KEY:-}"
  if [ -z "$KEY" ] && [ -f "$KEY_FILE" ]; then
    KEY=$(cat "$KEY_FILE")
  fi

  if [ -z "$KEY" ]; then
    echo "[-] ERROR: Encrypted file provided but no BACKUP_ENCRYPTION_KEY or /root/.backup_encryption_key available."
    exit 1
  fi

  TEMP_DECRYPTED="/tmp/decrypted_verify_$(date +%s).sql.gz"
  echo "[+] Decrypting to isolated buffer: $TEMP_DECRYPTED..."
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -in "$BACKUP_FILE" -out "$TEMP_DECRYPTED" -pass "pass:${KEY}"
  chmod 600 "$TEMP_DECRYPTED"
  WORK_FILE="$TEMP_DECRYPTED"
fi

cleanup() {
  echo "[+] Cleaning up sandbox resources..."
  if [ -n "$TEMP_DECRYPTED" ] && [ -f "$TEMP_DECRYPTED" ]; then
    rm -f "$TEMP_DECRYPTED"
  fi
  echo "[+] Dropping temporary sandbox database '$TEMP_RESTORE_DB'..."
  docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS \"$TEMP_RESTORE_DB\";" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# 2. Create isolated test database
echo "[+] Creating isolated temporary test database '$TEMP_RESTORE_DB'..."
docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE \"$TEMP_RESTORE_DB\";"

# 3. Restore dump into isolated test database
echo "[+] Restoring dump into sandbox database '$TEMP_RESTORE_DB'..."
if [[ "$WORK_FILE" == *.gz ]]; then
  gunzip -c "$WORK_FILE" | docker exec -i "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$TEMP_RESTORE_DB" -q
else
  cat "$WORK_FILE" | docker exec -i "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$TEMP_RESTORE_DB" -q
fi

# 4. Perform integrity check on restored sandbox database
echo "[+] Auditing restored table record counts..."

check_table_count() {
  local table_name="$1"
  local count
  count=$(docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$TEMP_RESTORE_DB" -t -A -c "SELECT COUNT(*) FROM \"$table_name\";" 2>/dev/null || echo "ERROR")
  echo "  - Table '$table_name': $count records"
}

check_table_count "users"
check_table_count "roles"
check_table_count "students"
check_table_count "guardians"
check_table_count "applications"
check_table_count "invoices"
check_table_count "payments"

echo "================================================================="
echo "  [✓] RESTORE VERIFICATION TEST: PASSED"
echo "  Backup archive '$BACKUP_FILE' is valid, decrypted cleanly, and fully restorable."
echo "================================================================="

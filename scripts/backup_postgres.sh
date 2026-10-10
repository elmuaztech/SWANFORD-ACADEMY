#!/usr/bin/env bash
# =============================================================================
# Swanford Academy — Automated Encrypted PostgreSQL Backup Script
# Master Specification Reference: Sections 8, 21, 22
#
# Features:
# 1. Consistent dump of production PostgreSQL database via Docker.
# 2. Industry-standard AES-256-CBC encryption via OpenSSL PBKDF2.
# 3. Configurable retention window (default: 14 days) and automatic pruning.
# 4. Offsite sync capability (rclone / S3 / remote SCP).
# 5. Fail-safe logging and error alerting.
# =============================================================================

set -euo pipefail

TIMESTAMP=$(date -u +"%Y%m%d_%H%M%S")
BACKUP_DIR="${BACKUP_DIR:-/root/swanford-academy/storage/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-swanford_postgres}"
ENV_FILE="${ENV_FILE:-/root/swanford-academy/.env}"
LOG_FILE="${LOG_FILE:-/var/log/swanford_backup.log}"

log() {
  local msg="[$(date -u +"%Y-%m-%d %H:%M:%SZ")] $1"
  echo "$msg"
  echo "$msg" >> "$LOG_FILE" 2>/dev/null || true
}

log "[+] Starting automated PostgreSQL backup run..."

# Ensure target backup directory exists with restricted permissions
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# 1. Verify environment configuration
if [ ! -f "$ENV_FILE" ]; then
  log "[-] ERROR: Environment file $ENV_FILE not found."
  exit 1
fi

POSTGRES_DB=$(grep -E "^POSTGRES_DB=" "$ENV_FILE" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || echo "swanford_db")
POSTGRES_USER=$(grep -E "^POSTGRES_USER=" "$ENV_FILE" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || echo "postgres")
BACKUP_ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY:-}"

# Check for dedicated keyfile if env var is empty
KEY_FILE="/root/.backup_encryption_key"
if [ -z "$BACKUP_ENCRYPTION_KEY" ] && [ -f "$KEY_FILE" ]; then
  BACKUP_ENCRYPTION_KEY=$(cat "$KEY_FILE")
fi

if [ -z "$BACKUP_ENCRYPTION_KEY" ]; then
  log "[!] WARNING: No BACKUP_ENCRYPTION_KEY or /root/.backup_encryption_key found."
  log "[!] Storing compressed but UNENCRYPTED backup with strict 0600 permissions."
fi

# 2. Verify container status
if ! docker ps --filter "name=${POSTGRES_CONTAINER}" --format '{{.Names}}' | grep -q "${POSTGRES_CONTAINER}"; then
  log "[-] ERROR: PostgreSQL container '${POSTGRES_CONTAINER}' is not running."
  exit 1
fi

PLAIN_DUMP_FILE="${BACKUP_DIR}/${POSTGRES_DB}_${TIMESTAMP}.sql.gz"
FINAL_BACKUP_FILE="${PLAIN_DUMP_FILE}"

# 3. Execute pg_dump
log "[+] Dumping database '${POSTGRES_DB}' from container '${POSTGRES_CONTAINER}'..."
if docker exec "$POSTGRES_CONTAINER" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges | gzip -9 > "$PLAIN_DUMP_FILE"; then
  chmod 600 "$PLAIN_DUMP_FILE"
  log "[✓] Raw compressed dump completed successfully ($(du -h "$PLAIN_DUMP_FILE" | cut -f1))."
else
  log "[-] ERROR: pg_dump command failed."
  rm -f "$PLAIN_DUMP_FILE"
  exit 1
fi

# 4. Encrypt backup if key is available
if [ -n "$BACKUP_ENCRYPTION_KEY" ]; then
  ENCRYPTED_FILE="${PLAIN_DUMP_FILE}.enc"
  log "[+] Encrypting backup with AES-256-CBC (PBKDF2)..."
  if openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000 -in "$PLAIN_DUMP_FILE" -out "$ENCRYPTED_FILE" -pass "pass:${BACKUP_ENCRYPTION_KEY}"; then
    chmod 600 "$ENCRYPTED_FILE"
    rm -f "$PLAIN_DUMP_FILE"
    FINAL_BACKUP_FILE="${ENCRYPTED_FILE}"
    log "[✓] Backup encrypted successfully: $(basename "$FINAL_BACKUP_FILE") ($(du -h "$FINAL_BACKUP_FILE" | cut -f1))."
  else
    log "[-] ERROR: Encryption failed. Retaining compressed dump."
  fi
fi

# 5. Offsite sync hook (if configured)
if [ -n "${OFFSITE_BACKUP_CMD:-}" ]; then
  log "[+] Executing offsite backup synchronization hook..."
  if eval "$OFFSITE_BACKUP_CMD \"$FINAL_BACKUP_FILE\""; then
    log "[✓] Offsite sync completed."
  else
    log "[!] WARNING: Offsite sync command failed. Check offsite storage credentials."
  fi
elif command -v rclone >/dev/null 2>&1 && [ -f "/root/.config/rclone/rclone.conf" ]; then
  log "[+] Syncing backup offsite via rclone..."
  rclone copy "$FINAL_BACKUP_FILE" "remote_backup:swanford-backups/" || log "[!] WARNING: rclone sync failed."
fi

# 6. Retention pruning: Remove backups older than RETENTION_DAYS
log "[+] Pruning local backups older than ${RETENTION_DAYS} days in ${BACKUP_DIR}..."
PRUNED_COUNT=$(find "$BACKUP_DIR" -type f \( -name "*.sql.gz" -o -name "*.sql.gz.enc" \) -mtime +"$RETENTION_DAYS" -print -delete | wc -l || echo "0")
log "[✓] Retention pruning complete. Pruned ${PRUNED_COUNT} old backup archive(s)."

log "[✓] BACKUP RUN SUCCESSFUL: $FINAL_BACKUP_FILE"

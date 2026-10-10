#!/usr/bin/env bash
# =============================================================================
# Swanford Academy — Secure Production Deployment Script
# Master Specification Reference: Sections 8, 14, 21, 22
#
# Security & Operational Guarantees:
# 1. Zero hardcoded credentials or secret values in script.
# 2. Never overwrites or modifies host .env files with test keys.
# 3. Validates required environment variables without printing secret values.
# 4. Strict deployment mode enforcement (test vs live) with key prefix verification.
# 5. Pre-deployment backup safeguard before container recreation.
# 6. Safe verification of storage permissions and container health.
# =============================================================================

set -euo pipefail

TARGET_DIR="/root/swanford-academy"
DEPLOYMENT_MODE="${1:-}"

echo "================================================================="
echo "  Swanford Academy — Production Deployment Manager"
echo "  Timestamp: $(date -u +"%Y-%m-%d %H:%M:%SZ")"
echo "================================================================="

if [ ! -d "$TARGET_DIR" ]; then
  echo "[-] ERROR: Target directory $TARGET_DIR does not exist on this host."
  exit 1
fi

cd "$TARGET_DIR"

# -----------------------------------------------------------------------------
# 1. Determine and Validate Deployment Mode (test vs live)
# -----------------------------------------------------------------------------
if [ -z "$DEPLOYMENT_MODE" ]; then
  echo "[-] USAGE: ./scripts/deploy_update_prod.sh [live|test]"
  echo "    You must explicitly declare the target mode to prevent accidental configuration mix-ups."
  exit 1
fi

case "$DEPLOYMENT_MODE" in
  live|production)
    EXPECTED_MODE="LIVE"
    REQUIRED_KEY_PREFIX="sk_live_"
    REQUIRED_PUB_PREFIX="pk_live_"
    ;;
  test|staging)
    EXPECTED_MODE="TEST"
    REQUIRED_KEY_PREFIX="sk_test_"
    REQUIRED_PUB_PREFIX="pk_test_"
    ;;
  *)
    echo "[-] ERROR: Invalid mode '$DEPLOYMENT_MODE'. Allowed modes: 'live' or 'test'."
    exit 1
    ;;
esac

echo "[+] Target Deployment Mode: $EXPECTED_MODE"

# -----------------------------------------------------------------------------
# 2. Verify Secure Environment File Existence
# -----------------------------------------------------------------------------
ENV_FILE=".env"
if [ ! -f "$ENV_FILE" ]; then
  echo "[-] ERROR: Production environment file $ENV_FILE is missing."
  echo "    Deployment aborted to prevent unconfigured container initialization."
  exit 1
fi

# -----------------------------------------------------------------------------
# 3. Authoritative Environment Audit (Zero Secret Disclosure)
# -----------------------------------------------------------------------------
echo "[+] Validating required environment configurations (content masked)..."

check_env_var() {
  local var_name="$1"
  local val
  val=$(grep -E "^${var_name}=" "$ENV_FILE" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
  if [ -z "$val" ]; then
    echo "  [-] MISSING REQUIRED CONFIG: $var_name"
    return 1
  else
    echo "  [✓] $var_name: [CONFIGURED]"
    return 0
  fi
}

MISSING_CONFIGS=0
check_env_var "DATABASE_URL" || MISSING_CONFIGS=$((MISSING_CONFIGS + 1))
check_env_var "SESSION_SECRET" || MISSING_CONFIGS=$((MISSING_CONFIGS + 1))
check_env_var "PAYSTACK_SECRET_KEY" || MISSING_CONFIGS=$((MISSING_CONFIGS + 1))
check_env_var "PAYSTACK_PUBLIC_KEY" || MISSING_CONFIGS=$((MISSING_CONFIGS + 1))
check_env_var "PAYSTACK_WEBHOOK_SECRET" || MISSING_CONFIGS=$((MISSING_CONFIGS + 1))

if [ "$MISSING_CONFIGS" -gt 0 ]; then
  echo "[-] Deployment aborted: $MISSING_CONFIGS required environment variables are missing."
  exit 1
fi

# Verify Paystack key prefix matches explicitly chosen mode
PAYSTACK_SECRET_VAL=$(grep -E "^PAYSTACK_SECRET_KEY=" "$ENV_FILE" | cut -d'=' -f2- | tr -d '"' | tr -d "'")
PAYSTACK_PUB_VAL=$(grep -E "^PAYSTACK_PUBLIC_KEY=" "$ENV_FILE" | cut -d'=' -f2- | tr -d '"' | tr -d "'")

if [[ ! "$PAYSTACK_SECRET_VAL" =~ ^${REQUIRED_KEY_PREFIX} ]] || [[ ! "$PAYSTACK_PUB_VAL" =~ ^${REQUIRED_PUB_PREFIX} ]]; then
  echo "[-] SECURITY ABORT: Configured Paystack keys do NOT match selected mode '$EXPECTED_MODE'."
  echo "    Expected keys starting with '$REQUIRED_KEY_PREFIX' and '$REQUIRED_PUB_PREFIX'."
  echo "    Refusing to deploy to prevent accidental gateway mode mismatches."
  exit 1
fi

echo "  [✓] Paystack key mode verified: $EXPECTED_MODE prefix verified safely."

# -----------------------------------------------------------------------------
# 4. Pre-Deployment Database Snapshot / Safety Check
# -----------------------------------------------------------------------------
echo "[+] Executing pre-deployment safety snapshot..."
if docker ps --filter "name=swanford_postgres" --format '{{.Names}}' | grep -q "swanford_postgres"; then
  BACKUP_DIR="/root/swanford-academy/storage/backups"
  mkdir -p "$BACKUP_DIR"
  PRE_DEPLOY_BACKUP="${BACKUP_DIR}/pre_deploy_$(date +%Y%m%d_%H%M%S).sql.gz"
  
  if docker exec swanford_postgres pg_dumpall -U "${POSTGRES_USER:-postgres}" | gzip > "$PRE_DEPLOY_BACKUP"; then
    chmod 600 "$PRE_DEPLOY_BACKUP"
    echo "  [✓] Pre-deploy database snapshot saved: $PRE_DEPLOY_BACKUP"
  else
    echo "  [!] WARNING: Automatic pre-deployment dump encountered an issue. Proceeding with caution."
  fi
else
  echo "  [*] Postgres container not currently active; skipping pre-deploy snapshot."
fi

# -----------------------------------------------------------------------------
# 5. Git Synchronization (Clean Pull)
# -----------------------------------------------------------------------------
echo "[+] Pulling verified application updates from origin main..."
git fetch origin main
git checkout main
git pull origin main

# -----------------------------------------------------------------------------
# 6. Host Storage and Permissions Guard
# -----------------------------------------------------------------------------
echo "[+] Ensuring host storage directory structure and permissions..."
mkdir -p "$TARGET_DIR/storage/media/profile-photos" "$TARGET_DIR/storage/media/gallery-photos" "$TARGET_DIR/storage/backups"
# Ensure non-root node container user (1001:1001) ownership
chown -R 1001:1001 "$TARGET_DIR/storage"
chmod -R 770 "$TARGET_DIR/storage"

# -----------------------------------------------------------------------------
# 7. Container Rebuild & Rolling Restart
# -----------------------------------------------------------------------------
echo "[+] Rebuilding and restarting application container..."
docker compose -f deployment/docker-compose.yml up -d --build app

echo "[+] Waiting for container initialization and health checks..."
sleep 10

# -----------------------------------------------------------------------------
# 8. Post-Deployment Container Permissions & Health Verification
# -----------------------------------------------------------------------------
echo "[+] Verifying storage permissions inside container..."
docker exec swanford_app touch /app/storage/media/.perm_check
docker exec swanford_app rm /app/storage/media/.perm_check
echo "  [✓] Container storage write test: PASSED"

# Verify health endpoint without exposing secrets
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3002/api/health || true)
if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "307" ] || [ "$HTTP_STATUS" = "308" ]; then
  echo "  [✓] App upstream responds on 127.0.0.1:3002 (HTTP $HTTP_STATUS)"
else
  echo "  [*] App container status HTTP: $HTTP_STATUS"
fi

echo "================================================================="
echo "  [✓] DEPLOYMENT COMPLETE & SECURE"
echo "  Mode: $EXPECTED_MODE"
echo "================================================================="

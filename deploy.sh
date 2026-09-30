#!/bin/bash
set -e

echo "=========================================="
echo "Swanford Academy - Auto Deployment Runner"
echo "=========================================="

cd /root/swanford-academy

echo "1. Pulling latest code from GitHub..."
git pull origin main

echo "2. Applying container updates..."
docker compose -f deployment/docker-compose.yml up -d --build

echo "3. Synchronizing database state and superadmin..."
docker compose -f deployment/docker-compose.yml exec -T app node /app/scripts/bootstrap.mjs

echo "4. Verifying superadmin account..."
docker compose -f deployment/docker-compose.yml exec -T app node /app/scripts/check_user.cjs

echo "=========================================="
echo "✔ Deployment complete and verified!"
echo "=========================================="

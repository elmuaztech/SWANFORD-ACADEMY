#!/usr/bin/env bash
set -e

cd /root/swanford-academy

echo "=== 1. Updating Paystack keys in /root/swanford-academy/.env ==="
sed -i 's|^PAYSTACK_SECRET_KEY=.*|PAYSTACK_SECRET_KEY="sk_test_94cafc1b95e0305c77fcab0746fc7d1fdd443ef5"|' .env
sed -i 's|^PAYSTACK_PUBLIC_KEY=.*|PAYSTACK_PUBLIC_KEY="pk_test_3be32d69ad99be51a7e4dd572046c3ae04b95069"|' .env

echo "=== Verified Paystack keys in .env ==="
grep "PAYSTACK" .env

echo "=== 2. Pulling latest code from origin main ==="
git pull origin main

echo "=== 3. Ensuring host storage directories and permissions ==="
mkdir -p /root/swanford-academy/storage/media/profile-photos /root/swanford-academy/storage/media/gallery-photos
chown -R 1001:1001 /root/swanford-academy/storage
chmod -R 775 /root/swanford-academy/storage

echo "=== 4. Rebuilding and restarting swanford_app container ==="
docker compose -f deployment/docker-compose.yml up -d --build app

echo "=== 5. Waiting for container to initialize ==="
sleep 8

echo "=== 6. Verifying storage permissions inside container ==="
docker exec -u 0 swanford_app mkdir -p /app/storage/media/profile-photos /app/storage/media/gallery-photos
docker exec -u 0 swanford_app chown -R nextjs:nodejs /app/storage
docker exec -u 0 swanford_app chmod -R 775 /app/storage
docker exec swanford_app touch /app/storage/test_perm.txt
docker exec swanford_app rm /app/storage/test_perm.txt
echo "Storage Write Test: PASSED"

echo "=== 7. Verifying Paystack env inside container ==="
docker exec swanford_app env | grep PAYSTACK

echo "=== 8. Checking Docker containers ==="
docker ps --filter "name=swanford"

echo "=== DEPLOYMENT AND CONFIGURATION COMPLETE ==="

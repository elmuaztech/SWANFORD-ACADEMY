#!/usr/bin/env bash
set -e

echo "=== 1. Checking Website Availability ==="
curl -s -o /dev/null -w "Homepage HTTP status: %{http_code}\n" http://127.0.0.1:3002/
curl -s -o /dev/null -w "Login page HTTP status: %{http_code}\n" http://127.0.0.1:3002/auth/login
curl -s -o /dev/null -w "Admissions page HTTP status: %{http_code}\n" http://127.0.0.1:3002/admissions

echo -e "\n=== 2. Admissions Fee Display in Options API ==="
curl -s http://127.0.0.1:3002/api/public/admission-options
echo ""

echo -e "\n=== 3. Payment Initialization Gate (Must return 503 Maintenance) ==="
echo -n "POST /api/payments/session: "
curl -s -X POST http://127.0.0.1:3002/api/payments/session -H "Content-Type: application/json" -d '{"invoiceId":"test-inv"}'
echo ""
echo -n "POST /api/payments/initialize: "
curl -s -X POST http://127.0.0.1:3002/api/payments/initialize -H "Content-Type: application/json" -d '{"amountKobo":50000,"email":"test@swanford.org"}'
echo ""
echo -n "POST /api/admissions/payment/initialize: "
curl -s -X POST http://127.0.0.1:3002/api/admissions/payment/initialize -H "Content-Type: application/json" -d '{"applicationId":"test-app"}'
echo ""

echo -e "\n=== 4. Unblocked Verification & Webhooks (Must NOT return 503) ==="
echo -n "GET /api/payments/verify: "
curl -s -w " [status: %{http_code}]\n" "http://127.0.0.1:3002/api/payments/verify?reference=non_existent_ref"

echo -n "GET /api/admissions/payment/verify: "
curl -s -w " [status: %{http_code}]\n" "http://127.0.0.1:3002/api/admissions/payment/verify?reference=non_existent_ref"

echo -n "POST /api/webhooks/paystack (invalid sig): "
curl -s -X POST -w " [status: %{http_code}]\n" http://127.0.0.1:3002/api/webhooks/paystack -H "Content-Type: application/json" -d '{}'

echo -e "\n=== 5. OTP / Forgot Password Cooldown API ==="
echo -n "POST /api/auth/forgot-password/request-otp (attempt 1): "
curl -s -X POST http://127.0.0.1:3002/api/auth/forgot-password/request-otp -H "Content-Type: application/json" -d '{"email":"admin@swanford.org"}'
echo ""
echo -n "POST /api/auth/forgot-password/request-otp (attempt 2 immediate cooldown): "
curl -s -X POST http://127.0.0.1:3002/api/auth/forgot-password/request-otp -H "Content-Type: application/json" -d '{"email":"admin@swanford.org"}'
echo ""

echo -e "\n=== 6. Database Record Integrity Check ==="
docker exec swanford_postgres psql -U swanford -d swanford_prod -c "
SELECT 
  (SELECT count(*) FROM users) as users,
  (SELECT count(*) FROM roles) as roles,
  (SELECT count(*) FROM students) as students,
  (SELECT count(*) FROM guardians) as guardians,
  (SELECT count(*) FROM admission_applications) as applications,
  (SELECT count(*) FROM invoices) as invoices,
  (SELECT count(*) FROM payments) as payments;
"

echo -e "\n=== 7. Recent Docker App Error Logs (last 30 lines) ==="
docker logs swanford_app --tail 30

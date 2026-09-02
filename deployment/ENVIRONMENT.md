# Environment Separation & Configuration Architecture

**Swanford Academy Management System**  
**Master Specification Reference:** Sections 8, 9, 14, 16, 21, 22

---

## 1. Environment Topology Overview

To guarantee financial data integrity, security, and operational reliability, the project maintains three strictly isolated environments:

| Environment | Hosting Target | Database | Paystack Mode | Purpose |
|---|---|---|---|---|
| **LOCAL** | Developer Machine | Local PostgreSQL 16 (`swanford_local`) | Test (`sk_test_...`) | Active feature development & unit/integration testing |
| **STAGING** | Vercel / Cloud Test Host | Managed PostgreSQL (`swanford_staging`) | Test (`sk_test_...`) | UAT, webhook validation, and client demonstrations |
| **PRODUCTION** | Hostinger VPS (Docker + Nginx) | Dedicated PostgreSQL 16 (`swanford_prod`) | Live (`sk_live_...`) | Live school operations and official student/fee records |

---

## 2. Environment Rules & Security Boundaries

1. **Zero Secret Leakage:**
   * Never commit `.env` or real credentials into Git.
   * Only `.env.example` is tracked in version control.
2. **Strict Payment Credential Isolation:**
   * **Local & Staging:** Must exclusively use Paystack Test Keys. Live keys are forbidden.
   * **Production:** Only the production VPS environment variables contain live keys.
3. **Database Isolation:**
   * Staging and Production databases must never share hosts, credentials, or connection strings.
   * Staging data is considered ephemeral test data. Production data is permanent, immutable history.
4. **No Production Synthetic Data:**
   * Production strictly begins at zero records. No fake students, teachers, or transactions may ever be seeded into production.

---

## 3. Environment Variable Reference

### Required Variables

| Variable | Description | Example (Local) | Example (Production) |
|---|---|---|---|
| `NODE_ENV` | Runtime mode | `development` | `production` |
| `APP_URL` | Canonical application URL | `http://localhost:3000` | `https://swanfordacademy.edu.ng` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5432/swanford_local?schema=public` | Managed VPS connection string |
| `DIRECT_URL` | Direct connection string for migrations | Same as above | Direct VPS connection string |
| `SESSION_SECRET` | 32+ character key for signing session cookies | Dev string (min 32 chars) | Cryptographically secure random string |
| `PAYSTACK_SECRET_KEY` | Paystack secret key | `sk_test_...` | `sk_live_...` |
| `PAYSTACK_PUBLIC_KEY` | Paystack public key | `pk_test_...` | `pk_live_...` |
| `PAYSTACK_WEBHOOK_SECRET` | Paystack webhook signature verification secret | Dev string | Production webhook secret |
| `NOTIFICATION_PROVIDER` | Notification backend (`mock`, `smtp`, `termii`) | `mock` | `smtp` |

---

## 4. Production Hostinger VPS Deployment Guidelines

* **Compute:** Hostinger VPS (KVM1: 1 vCPU, 4GB RAM, 50GB NVMe SSD).
* **Isolation:** Swanford Academy runs in its own isolated Docker network and database container.
* **Process Management:** Docker Compose with health checks and restart policies.
* **Reverse Proxy:** Nginx with SSL termination via Let's Encrypt Certbot, HTTP/2, and rate limiting.
* **Database Backups:** Daily automated `pg_dump` with off-site retention and verified restoration procedures.

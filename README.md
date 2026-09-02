# Swanford Academy Management System

[![Stage 1: Foundation Verified](https://img.shields.io/badge/Stage%201-Foundation%20Verified-emerald.svg)](#)
[![TypeScript: Strict](https://img.shields.io/badge/TypeScript-Strict-blue.svg)](#)
[![Database: PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL-336791.svg)](#)
[![ORM: Prisma 6](https://img.shields.io/badge/ORM-Prisma%206-2D3748.svg)](#)

> **Motto:** Illuminating the Path to Success  
> **Location:** PLOT 212, DR NUHU MUHAMMADU SANUSI WAY, DUTSE, JIGAWA STATE  
> **Programmes:** Nursery, Primary &amp; Tahfeez

---

## 1. Overview

Swanford Academy is an enterprise-grade school management platform built on Next.js App Router, TypeScript, Tailwind CSS, PostgreSQL, and Prisma. The architecture guarantees:
* **Single Source of Truth:** PostgreSQL database authoritative records.
* **Separation of Concerns:** Strict server-side enforcement of `Role ≠ Permission ≠ Scope`.
* **Multi-Child Parent Portal:** Unified parent accounts managing multiple siblings without record duplication.
* **Financial Precision:** Integer minor units (Kobo) arithmetic eliminating floating-point rounding errors.
* **Zero Mock Policy:** Production starts at zero; all dashboard numbers derive from authentic database records.

---

## 2. Project Structure

```
.
├── .env.example              # Documented environment variables template
├── deployment/               # Production deployment files (Docker, Compose, Nginx)
├── docs/                     # Architectural, financial, and deployment documentation
├── prisma/                   # Prisma database schema and migrations
├── public/                   # Static assets
├── scripts/                  # Operational maintenance scripts
├── src/
│   ├── app/                  # Next.js App Router pages and layouts
│   ├── components/           # Reusable UI components
│   └── lib/                  # Core domain logic (Prisma singleton, money, env)
└── tests/                    # Vitest unit and integration test suites
```

---

## 3. Quick Start (Local Development)

### Prerequisites
* Node.js `>=20.9.0`
* PostgreSQL 16 (local or cloud instance)
* npm `>=10.0.0`

### Setup Instructions

1. **Clone and Install Dependencies:**
   ```bash
   npm install
   ```

2. **Configure Environment:**
   ```bash
   cp .env.example .env
   # Update DATABASE_URL with your local PostgreSQL credentials
   ```

3. **Initialize Database:**
   ```bash
   npx prisma db push
   node scripts/db-smoke-test.mjs
   ```

4. **Run Test Suite:**
   ```bash
   npm run test
   ```

5. **Start Development Server:**
   ```bash
   npm run dev
   # Open http://localhost:3000 in your browser
   ```

---

## 4. Key Available Scripts

* `npm run dev`: Launch local Next.js development server.
* `npm run build`: Compile production-optimized Next.js bundle.
* `npm run lint`: Run ESLint analysis across the repository.
* `npm run typecheck`: Run TypeScript compiler type checking (`tsc --noEmit`).
* `npm run test`: Execute Vitest unit test suite.
* `npm run db:generate`: Regenerate typed Prisma Client.
* `npm run db:smoke`: Run PostgreSQL connectivity smoke test.

---

## 5. Development Roadmap & Stages

- [x] **Stage 1:** Foundation, Repository & Environment Setup
- [ ] **Stage 2:** Database Schema, Migrations & Seed Strategy
- [ ] **Stage 3:** Authentication, Session & Account Lifecycle
- [ ] **Stage 4:** Roles, Permissions & Scopes
- [ ] **Stage 5:** School Configuration & Academic Periods
- [ ] **Stage 6:** Students, Parents/Guardians & Relationships
- [ ] **Stage 7:** Admission & Application Workflow
- [ ] **Stage 8:** Finance Engine (Invoices, Payments, Receipts, Balances)
- [ ] **Stage 9:** Paystack Integration & Idempotent Webhooks
- [ ] **Stage 10:** Notification Abstraction (Email / SMS)
- [ ] **Stage 11:** Teacher & Parent Portals
- [ ] **Stage 12:** Admin & Super Admin Dashboards
- [ ] **Stage 13:** Public School Website & Online Admission
- [ ] **Stage 14:** Academic Reports & PDF Generation
- [ ] **Stage 15:** Security, Performance & Audit Hardening
- [ ] **Stage 16:** Staging Deployment (Vercel)
- [ ] **Stage 17:** Acceptance & Regression Testing
- [ ] **Stage 18:** Hostinger VPS Production Deployment & Handover

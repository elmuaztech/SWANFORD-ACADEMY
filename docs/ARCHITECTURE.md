# Swanford Academy: Technical Architecture Guide

**Document Status:** Approved Architectural Baseline  
**Master Specification Reference:** Sections 7, 8, 10, 11, 12, 13, 21, 24

---

## 1. System Vision & Foundational Tenets

Swanford Academy is an enterprise school management system designed for longevity, auditability, and absolute data integrity.

### Foundational Principles
1. **PostgreSQL as the Single Source of Truth:**
   All persistent state, identity, admissions, relationships, and financial records reside authoritatively in PostgreSQL.
2. **Server-Side Enforcement (Role ≠ Permission ≠ Scope):**
   * **Role:** Who the user is (`SUPER_ADMIN`, `ADMIN`, `ACCOUNTANT`, `TEACHER`, `PARENT`).
   * **Permission:** What capability the user has (e.g. `attendance:record`, `invoice:create`).
   * **Scope:** Which specific records the user is authorized to interact with (e.g. Teacher scoped only to assigned classes; Parent scoped only to verified children).
   * UI visibility rules are purely UX affordances; server-side APIs and Server Actions enforce all access boundaries.
3. **Multi-Child Parent Model:**
   A parent account represents an independent guardian entity capable of linking to one or more children. Admission applications for siblings reuse the existing verified parent record without duplication.
4. **Zero-State Dashboards:**
   Production starts at zero. No synthetic counters or mock values. Dashboard metrics are dynamically computed from underlying database records.

---

## 2. Directory Architecture & Domain Separation

The repository adheres strictly to domain-separated layers to prevent cross-cutting entanglements:

```
c:/SWANFORD ACADEMY/
├── .env.example              # Documented environment variables template
├── .gitignore                # Comprehensive secret & build artifact protection
├── deployment/               # Container & proxy configuration (Docker, Nginx, Compose)
├── docs/                     # Architectural, financial, and runbook documentation
├── prisma/                   # Database schema, migrations, and seed scripts
├── public/                   # Static assets (favicons, logos)
├── scripts/                  # Operational scripts (database smoke tests, maintenance)
├── src/
│   ├── app/                  # Next.js App Router routes and layouts
│   ├── components/           # Reusable UI components & layouts
│   └── lib/                  # Core domain logic, validation, money engine, DB client
└── tests/                    # Unit, integration, and security test suites
```

---

## 3. Performance & KVM1 Resource Optimization

The production environment is hosted on a Hostinger KVM1 VPS (1 vCPU, 4GB RAM). To maintain fast response times and low memory overhead:
* **Server-Side Rendering & Streaming:** Use React Server Components for initial page generation.
* **Database Connection Management:** Singleton Prisma connection pattern with connection limits.
* **Indexing Strategy:** Composite indexes on high-frequency query paths (`guardian_id`, `student_id`, `session_id`, `term_id`).
* **Pagination & Filtering:** Paginate all lists server-side; never load unconstrained result sets into memory.
* **Asset Optimization:** Minimal JavaScript bundle size with no superfluous animation or UI runtime bloat.

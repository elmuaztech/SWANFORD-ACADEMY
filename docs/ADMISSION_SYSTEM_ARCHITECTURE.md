# Swanford Academy Management System — Admission System Architecture (Stage 7)

**Document Classification:** Internal Technical Architecture Specification  
**System Module:** Stage 7 — Admissions Lifecycle, Multi-Programme Applications & Atomic Matriculation  
**Target Runtime:** Next.js (App Router), Node.js, PostgreSQL (Prisma ORM)  
**Security & Concurrency Standard:** Enterprise Grade, PCI-DSS Aware Boundary, Africa/Lagos Canonical  

---

## 1. Executive Summary & Design Invariants

Stage 7 implements the authoritative admission engine for Swanford Academy. It manages the recruitment intake from public application submission through administrative review and atomic student matriculation.

### Core Architectural Invariants:

1. **Strict Identifier Separation:**
   - **Application Numbers:** `APP-YYYY-NNNN` (e.g. `APP-2026-0001`), server-generated, immutable, globally unique.
   - **Student Numbers:** `SA-YYYY-NNNN` (e.g. `SA-2026-0001`), server-generated, immutable, globally unique.
   - Applications and Students maintain separate sequence tables (`application_number_sequences` vs `admission_number_sequences`), preventing collision or namespace pollution.

2. **No Hardcoded Pricing:**
   - The application form fee is read dynamically from `SystemConfig` (`key: "admissions.form_fee_kobo"`).
   - Multi-programme itemized charges are read dynamically from active `FeeStructure` and `FeeItem` records matching the applicant's demographics and target session/term.
   - All charges are permanently snapshotted into `ApplicationChargeItem` rows at submission time. Future fee changes never alter historical applications.

3. **Temporal Invariance (Africa/Lagos Canonical):**
   - All admission cycle start and end boundaries are evaluated strictly in `Africa/Lagos` time (West Africa Time, UTC+1, No DST) via `@/lib/admission_window`.
   - Cycle chronological invariants (`startDate < endDate`) and forward lifecycle progressions (`UPCOMING` -> `OPEN` -> `CLOSED` -> `ARCHIVED`) are strictly validated.

4. **Trusted Payment Confirmation Boundary:**
   - Ordinary client requests cannot self-declare payment.
   - Payment confirmation requires an authorized administrative actor (`ADMISSION_APPLICATION_APPROVE` or `FINANCE_PAYMENT_RECONCILE`) with an external `paymentReference`, transitioning status to `PAYMENT_CONFIRMED` and `UNDER_REVIEW`.

5. **Truly Atomic Matriculation:**
   - Student profile creation (`createStudent`), Guardian provisioning/reuse (`createGuardian`), Guardian-Student relationship linking (`linkGuardianToStudent`), multi-programme enrollments (`enrollStudentInProgramme`), and Application state finalization (`ENROLLED`) execute within a single PostgreSQL transaction (`prisma.$transaction`).
   - If any step fails, the entire transaction rolls back cleanly with zero orphaned records.
   - Directives reuses existing Stage 6 domain services rather than duplicating student/guardian logic.

6. **MAIN_ACADEMIC Rule Enforcement:**
   - At least one approved programme in an application must have `programme.isMainAcademic === true`.
   - Additional programmes (such as Tahfeez) cannot be matriculated without an accompanying main academic programme, respecting programme domain configuration.

7. **Concurrency-Safe Capacity Quotas:**
   - Authoritative capacity verification checks `AdmissionCycleProgramme.maxCapacity` transactionally at the exact point of enrollment, preventing race conditions from oversubscribing programmes.

8. **State-Aware Duplicate Detection:**
   - Active duplicate states (`DRAFT`, `SUBMITTED`, `UNDER_REVIEW`, `APPROVED`, `PARTIALLY_APPROVED`, `ENROLLED`) prevent duplicate applications for the same child in the same cycle.
   - Applications in `REJECTED` status do not block legitimate subsequent reapplications.

---

## 2. Entity Model & Schema Extensions

```
+-----------------------------------------------------------------------------------+
|                              AdmissionCycle                                       |
|  - id: UUID                                                                       |
|  - academicSessionId: UUID                                                        |
|  - code: String (Unique)                                                          |
|  - name: String                                                                   |
|  - startDate: DateTime                                                            |
|  - endDate: DateTime                                                              |
|  - status: UPCOMING | OPEN | CLOSED | ARCHIVED                                    |
+-----------------------------------------+-----------------------------------------+
                                          |
                      +-------------------+-------------------+
                      |                                       | 1:N
                      v 1:N                                   v
+------------------------------------+   +------------------------------------------+
|      AdmissionCycleProgramme       |   |               Application                |
|  - admissionCycleId: UUID          |   |  - id: UUID                              |
|  - programmeId: UUID               |   |  - applicationNumber: APP-YYYY-NNNN      |
|  - status: OPEN | CLOSED | FULL    |   |  - status: DRAFT -> SUBMITTED            |
|  - maxCapacity: Int?               |   |            -> UNDER_REVIEW               |
+------------------------------------+   |            -> APPROVED / PARTIAL         |
                                         |            -> ENROLLED                   |
                                         |  - paymentStatus: UNPAID                 |
                                         |            -> PAYMENT_PENDING            |
                                         |            -> PAYMENT_CONFIRMED          |
                                         |  - admittedStudentId: UUID? (Unique)     |
                                         +--------------------+---------------------+
                                                              |
                                  +---------------------------+---------------------------+
                                  | 1:N                                                   | 1:N
                                  v                                                       v
            +-------------------------------------------+   +-------------------------------------------+
            |        ApplicationProgrammeSelection      |   |            ApplicationChargeItem          |
            |  - id: UUID                               |   |  - id: UUID                               |
            |  - programmeId: UUID                      |   |  - chargeType: APPLICATION_FORM_FEE       |
            |  - status: PENDING | APPROVED | REJECTED  |   |                | PROGRAMME_TUITION ...    |
            |  - decisionNotes: String?                 |   |  - unitAmountKobo: BigInt                 |
            +-------------------------------------------+   |  - totalAmountKobo: BigInt                |
                                                            +-------------------------------------------+
```

---

## 3. Matriculation State Transition Matrix

| Current Application Status | Target Status | Pre-Conditions | Outcome |
| :--- | :--- | :--- | :--- |
| `DRAFT` | `SUBMITTED` | Cycle window open; valid applicant & guardian data | Status = `SUBMITTED`, Payment = `PAYMENT_PENDING` |
| `SUBMITTED` | `UNDER_REVIEW` | Trusted payment verified (`confirmApplicationPayment`) | Payment = `PAYMENT_CONFIRMED`, Status = `UNDER_REVIEW` |
| `UNDER_REVIEW` | `APPROVED` | All programme selections reviewed and marked `APPROVED` | Status = `APPROVED` |
| `UNDER_REVIEW` | `PARTIALLY_APPROVED` | At least 1 selection `APPROVED` and at least 1 `REJECTED` | Status = `PARTIALLY_APPROVED` |
| `UNDER_REVIEW` | `REJECTED` | All programme selections marked `REJECTED` | Status = `REJECTED` |
| `APPROVED` / `PARTIAL` | `ENROLLED` | Fee confirmed; at least 1 `isMainAcademic` programme approved; capacity check passes | Student created (`SA-YYYY-NNNN`), guardian provisioned, enrolled in classes, application status = `ENROLLED` |

---

## 4. Security & Auditability

All administrative operations are gated through `@/lib/auth/authorization`:
- `ADMISSION_CYCLE_MANAGE`: Create and update admission cycles, toggle programme availabilities, set capacity quotas.
- `ADMISSION_APPLICATION_VIEW`: List and inspect applications, charges, and selections.
- `ADMISSION_APPLICATION_REVIEW`: Review individual programme selections (`APPROVED` / `REJECTED`).
- `ADMISSION_APPLICATION_APPROVE`: Authoritatively verify application fee payments and trigger atomic student matriculation.

Every state change, fee verification, review decision, and matriculation writes an immutable entry into `AuditLog` with structured actor IDs and JSON deltas.

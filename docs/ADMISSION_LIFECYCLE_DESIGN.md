# Swanford Academy — Admission Lifecycle & Business Rules Architecture

**Document Version:** 1.1 (Incorporating Stage 2C Approved Corrections)  
**Status:** Approved Architecture Implementation (Stage 2C)  
**Author:** Antigravity / Core Engineering  
**Canonical Timezone:** `Africa/Lagos` (WAT, UTC+1, No DST)  
**Centralized Utility:** `src/lib/admission_window.ts`  
**Reference Specifications:** Swanford Master Project Specification (Sections 5, 8, 10, 11, 21, 24), `docs/DATABASE_ARCHITECTURE_DESIGN.md`

---

## 1. Admission Lifecycle Overview

The Swanford Academy admission system governs how prospective students are recruited, evaluated, billed for entry charges, and formally matriculated into the school's academic registries.

The lifecycle consists of six discrete, sequential phases:
```
[Phase 1: Cycle Configuration]
  ├── Admin establishes Admission Cycle (Opening & Closing dates in Africa/Lagos)
  └── Admin sets Programme Availability (Open/Closed/Full per programme)
         ↓
[Phase 2: Public Application & Selection]
  ├── Parent verifies email ownership
  ├── Parent enters child demographics
  ├── Parent selects 1 or more Available Programmes (e.g. Primary + Tahfeez)
  └── System calculates itemized charges (Form Fee + Programme Entry Fees)
         ↓
[Phase 3: Application Submission & Gateway Checkout (SUBMITTED ≠ PAID)]
  ├── Parent reviews frozen itemized charge breakdown
  ├── Parent SUBMITS application -> ApplicationStatus: SUBMITTED, PaymentStatus: PAYMENT_PENDING
  ├── Parent initiates ONE unified Paystack payment transaction for totalAmountKobo
  └── Server-side webhook / verification independently updates PaymentStatus: PAYMENT_CONFIRMED
         ↓
[Phase 4: Administrative Evaluation]
  ├── Admin verifies application details, documents, and PaymentStatus == PAYMENT_CONFIRMED
  ├── Admin evaluates EACH programme selection independently (APPROVED / REJECTED)
  └── Application Status becomes PARTIALLY_APPROVED or APPROVED
         ↓
[Phase 5: Student Matriculation & Enrollment]
  ├── Single atomic transaction creates ONE Student entity (SA-YYYY-NNNN)
  ├── Links Guardian to Student via guardian_student_relationships
  ├── Creates StudentProgrammeEnrollment rows ONLY for APPROVED programmes
  └── Rejected programme charges preserved for audit/credit/refund ledger
         ↓
[Phase 6: Parent Portal Provisioning]
  ├── If existing guardian: Links new student to existing portal profile
  └── If new guardian: Dispatches welcome activation email to set portal credentials
```

---

## 2. Admission Cycle Architecture

Admissions cannot be modeled as a single global boolean (`admissionOpen = true/false`). Doing so destroys historical records, prevents multi-session planning, and prevents mid-year cohorts.

An **Admission Cycle** is a formal administrative container defining:
1. **Identifier & Name:** e.g., `2026/2027 Main Admission`, `2026/2027 Supplementary Intake`.
2. **Target Academic Session:** The academic session for which applicants are seeking entry (e.g., `2026/2027`).
3. **Temporal Window:** `startDate` and `endDate` stored in UTC and interpreted canonically in `Africa/Lagos`.
4. **Lifecycle State (`AdmissionCycleStatus`):** 
   * `UPCOMING`: Configured by administrators; not yet accepting applications.
   * `OPEN`: Active window; accepts drafts, submissions, and payments for open programmes.
   * `CLOSED`: Window elapsed or manually closed; rejects new submissions and unsubmitted drafts.
   * `ARCHIVED`: Historical read-only record.

All historical applications remain permanently linked to the `admission_cycle_id` under which they were initiated.

---

## 3. Admission Cycle vs. Academic Session

| Attribute | Academic Session | Admission Cycle |
| :--- | :--- | :--- |
| **Concept** | Operational schooling calendar | Temporal recruitment window |
| **Duration** | Full school year (~11 months) | Defined recruitment window (~1 to 3 months) |
| **Contents** | Terms, classes, attendance, exams, grades | Applications, reviews, upfront applicant payments |
| **Cardinality** | Exactly ONE is active at a time | Multiple cycles can target the same session |
| **Relationship** | Parent entity | Child entity (targets an `academic_session_id`) |

### Multi-Cycle Targeting Example:
* Target Academic Session: `2026/2027` (Sept 2026 – July 2027)
  * Cycle 1: `2026/2027 Main Admission Window` (01-Aug-2026 to 30-Sep-2026) -> Closed
  * Cycle 2: `2026/2027 Supplementary Admission` (15-Oct-2026 to 15-Nov-2026) -> Open
  * Cycle 3: `2026/2027 Mid-Year Transfer Intake` (01-Dec-2026 to 15-Jan-2027) -> Upcoming

---

## 4. Opening & Closing Rules

Opening and closing rules are strictly enforced on backend APIs via `src/lib/admission_window.ts`.

```
                  Opening DateTime (WAT)             Closing DateTime (WAT)
                           │                                   │
       BEFORE WINDOW       │          ACTIVE WINDOW            │        AFTER WINDOW
   ────────────────────────┼───────────────────────────────────┼────────────────────────►
   • Drafts: BLOCKED       │ • Drafts: ALLOWED                 │ • Drafts: BLOCKED
   • Submissions: BLOCKED  │ • Submissions: ALLOWED            │ • Submissions: BLOCKED
   • Payments: BLOCKED     │ • Payments: ALLOWED               │ • Payments: BLOCKED
                           │                                   │ • Submitted apps: VALID
```

1. **Before Opening:**
   * Public admission portal displays: *"Admissions for [Cycle Name] open on [Date] at 08:00 AM West Africa Time."*
   * Backend rejects application creation, submissions, and payments with HTTP 403 Forbidden.
2. **During Active Window:**
   * Applications can be initiated, saved as drafts, submitted, and paid.
   * Selections are restricted to programmes marked `OPEN` in the cycle.
3. **After Closing:**
   * No new applications can be created.
   * Unsubmitted drafts cannot be submitted or paid. Stale checkout links are rejected.
   * Submitted applications (whether `PAYMENT_PENDING` or `PAYMENT_CONFIRMED`) remain 100% active for admin processing. Closing admissions does **not** invalidate or cancel submitted applications.

---

## 5. Programme-Specific Availability Rules

Swanford Academy offers diverse programmes (Creche, Pre-Scholars, Pre-Nursery, Nursery, Primary, Tahfeez). Programme availability is configurable per cycle via `AdmissionCycleProgramme`:

* Status flags (`ProgrammeAvailabilityStatus`):
  * `OPEN`: Currently accepting applications.
  * `CLOSED`: Admin closed admissions for this programme.
  * `FULL`: Capacity reached; applicants cannot select this programme.
* **School Independence Invariant:** If Tahfeez reaches full capacity or closes early, Primary and Nursery admissions remain open and unimpeded.
* **Public Selection Invariant:** The public application form only renders programmes where `status = OPEN`. Backend validation rejects payloads containing closed or full programmes.

---

## 6. Application Lifecycle State Machine (Separation of Submission & Payment)

```
      ┌────────────────────────────────────────────────────────────────────────┐
      │                                 DRAFT                                  │
      │                  (paymentStatus = UNPAID)                              │
      └───────────────────────────────────┬────────────────────────────────────┘
                                          │ Parent Submits Form
                                          ▼
      ┌────────────────────────────────────────────────────────────────────────┐
      │                               SUBMITTED                                │
      │               (paymentStatus = PAYMENT_PENDING / UNPAID)               │
      └───────────────────────────────────┬────────────────────────────────────┘
                                          │ Gateway Webhook Confirms Checkout
                                          ▼
      ┌────────────────────────────────────────────────────────────────────────┐
      │                        PAYMENT_CONFIRMED                               │
      │           (ApplicationStatus = SUBMITTED or UNDER_REVIEW)               │
      └───────────────────────────────────┬────────────────────────────────────┘
                                          │ Admin opens for evaluation
                                          ▼
      ┌────────────────────────────────────────────────────────────────────────┐
      │                              UNDER_REVIEW                              │
      └───────────────┬───────────────────┬────────────────────┬───────────────┘
                      │                   │                    │
                      │ Discrepancy       │ All Approved       │ All Rejected
                      ▼                   ▼                    ▼
              ┌───────────────┐   ┌───────────────┐    ┌───────────────┐
              │CONFLICT_REVIEW│   │   APPROVED    │    │   REJECTED    │
              └───────┬───────┘   └───────┬───────┘    └───────────────┘
                      │                   │
                      │ Resolved          │
                      └─────────► ┌───────┴───────────────┐
                                  │  PARTIALLY_APPROVED   │ (Some Approved, Some Rejected)
                                  └───────┬───────────────┘
                                          │ Admin triggers enrollment
                                          ▼
                                  ┌───────────────┐
                                  │   ENROLLED    │ (Student entity created)
                                  └───────────────┘
```

---

## 7. Draft Behavior

* **Definition:** An application created by a parent who has entered demographic information but has not yet completed final submission.
* **Storage:** Persisted in `applications` with `status = DRAFT` and `paymentStatus = UNPAID`.
* **Access Security:** Secured via verified parent email session or cryptographic resume token.
* **Expiration at Window Close:** If the admission window closes on 30-September at 23:59:59 WAT, any application remaining in `DRAFT` status at that timestamp is immediately locked from submission. The parent cannot complete submission on 01-October using an existing draft URL.

---

## 8. Submitted Application Behavior

* **Definition:** An application that has satisfied all required demographic and programme selection fields and has been formally submitted by the parent.
* **Payment State Independence:** An application becomes `SUBMITTED` upon form submission. Its `paymentStatus` remains `PAYMENT_PENDING` until Paystack payment confirmation is received.
* **Post-Close Guarantee:** An application submitted on 30-September at 23:30:00 WAT remains in `SUBMITTED` status on 01-October. Administrators can review, evaluate, and approve it at any time during October without restriction.

---

## 9. Payment Behavior & Gateway Decoupling

1. **One Application = One Gateway Checkout:**
   * Regardless of whether an applicant selects 1 programme or 4 programmes, exactly **one** Paystack checkout transaction is initialized for `totalAmountKobo`.
2. **Server-Side Fee Integrity:**
   * The checkout amount is calculated exclusively by the backend engine by summing active fee structures. The client never passes the amount to be charged.
3. **Asynchronous Verification:**
   * Payment confirmation relies on Paystack webhook signature verification (`payment_webhook_events`), updating `paymentStatus = PAYMENT_CONFIRMED`.
4. **Separation from Tuition Ledger:**
   * Application checkout funds are recorded in `payment_transactions` and tagged to `application_id`. They do **not** touch `invoices` or `payments` until after administrative matriculation.
5. **Approval Prerequisite:**
   * An application with `paymentStatus = PAYMENT_PENDING` cannot be approved for final enrollment unless payment is confirmed or explicitly `WAIVED` by Super Admin.

---

## 10. Application Expiration Policy (V1)

* **No Intra-Cycle Expiration:** While the admission window is active, drafts do not expire after an arbitrary 24 or 48 hours. A parent can start an application on Monday and complete checkout on Friday, provided the admission cycle remains open.
* **Cycle-Bound Expiration:** All unsubmitted drafts expire simultaneously at the exact moment the `AdmissionCycle.endDate` is reached.
* **Stale Checkout Link Protection:** Paystack checkout access codes are configured with a 2-hour TTL. If expired, the backend re-validates that the admission window is still open before generating a fresh checkout URL.

---

## 11. Fee Snapshot & Pricing Lock Behavior

* **The Lock Moment:** Pricing is locked at the exact moment the parent initiates checkout (`application_charge_items` written to DB).
* **Itemized Snapshotting:** Each fee item is written to `application_charge_items` with its explicit `unitAmountKobo` and `totalAmountKobo`.
* **Immutability Guarantee:** If school management increases Primary tuition from ₦110,000 to ₦120,000 in `fee_structures`, existing `application_charge_items` remain 100% untouched.

---

## 12. Multi-Programme Application Architecture

* ONE `Application` record holds applicant demographics and guardian contact.
* Multiple `ApplicationProgrammeSelection` records link the child to chosen programmes.
* Database constraint: `@@unique([applicationId, programmeId])` enforces zero duplicate selections within a single application.

---

## 13. Partial Programme Approval Workflow

* Parent applies for: Primary 4 + Islamic Studies + Music Academy + Tahfeez.
* Admin decision:
  * Primary 4 → `APPROVED`
  * Islamic Studies → `APPROVED`
  * Music Academy → `REJECTED`
  * Tahfeez → `APPROVED`
* Application status becomes `PARTIALLY_APPROVED`.
* Single atomic transaction matriculates ONE student and creates enrollments ONLY for the 3 approved programmes. Music Academy charge remains historically preserved in `application_charge_items` for audit/credit/refund.

---

## 14. Programme & Class Capacity Rules

* **Class Capacity vs. Programme Capacity:**
  * `SchoolClass.capacity`: Physical room/seat ceiling (e.g. Primary 4A = 30 students).
  * `AdmissionCycleProgramme.maxCapacity`: Administrative quota for new intake in a given cycle (e.g. 60 new Primary entrants across all arms).
* **V1 Capacity Policy:**
  * When approved enrollments + pending accepted offers equal `maxCapacity`, the programme status switches to `FULL`.
  * The public UI marks the programme as *"Intake Full"*.
* **V1 Waitlist Exclusion:** A dynamic auto-promoting waitlist queue is explicitly excluded from V1 to prevent operational complexity.

---

## 15. Duplicate Application Detection Strategy

* Signals: Verified guardian email + child (first name, last name, DOB, gender) + admission cycle.
* **Deterministic Match:** Halts submission with clear reference to existing active application.
* **Ambiguous Match:** Flags as `CONFLICT_REVIEW` for Super Admin manual resolution.

---

## 16. Canonical Timezone Policy & Implementation

* **Location:** Dutse, Jigawa State, Nigeria.
* **Canonical Timezone:** `Africa/Lagos` (West Africa Time — strictly UTC+1 year-round, no Daylight Saving Time).
* **Centralized Implementation:** `src/lib/admission_window.ts` provides:
  * `SWANFORD_TIMEZONE = 'Africa/Lagos'`
  * `LAGOS_UTC_OFFSET_HOURS = 1`
  * `createLagosInstant(dateStr, timeStr)`: Converts local Lagos dates into exact UTC `Date` objects.
  * `evaluateAdmissionWindow(cycle, now)`: Compares UTC instants consistently.
  * `formatLagosDate(date, includeTime)`: Formats timestamps in West Africa Time.
* **Zero Machine Variance:** Evaluation is identical whether executed on local Windows dev machines, CI/CD runners in US-East, or Hostinger production servers.

---

## 17. Historical Data Integrity

* Closed admission cycles are immutable. Their opening and closing dates, participating programmes, and associated applications cannot be deleted or overwritten.
* Applications are permanently linked to `admission_cycle_id`.

---

## 18. Admin Control & Permissions

Only authorized administrative roles can mutate cycles:
* `admissions:cycles:manage` (Super Admin, Admin): Create, schedule, open, close admission cycles.
* `admissions:programmes:manage` (Admin): Toggle programme status (`OPEN`/`CLOSED`/`FULL`).
* `admissions:review` (Admin): Review submissions and record per-programme decisions.

---

## 19. Audit Logging Requirements

All critical lifecycle actions emit immutable rows to `audit_logs`:
* `ADMISSION_CYCLE_CREATED`
* `ADMISSION_CYCLE_DATES_MODIFIED`
* `PROGRAMME_AVAILABILITY_CHANGED`
* `APPLICATION_SUBMITTED`
* `APPLICATION_FEE_VERIFIED`
* `PROGRAMME_SELECTION_APPROVED`
* `PROGRAMME_SELECTION_REJECTED`
* `STUDENT_MATRICULATED_FROM_APPLICATION`

---

## 20. Parent Account Lifecycle Integration

1. Verified parent email captured during public application.
2. Upon admin approval and student matriculation:
   * Existing parent: child attached to existing portal account.
   * New parent: system generates a single-use onboarding token and emails activation link.

---

## 21. Database Architecture Summary

Entities added in Migration `20260902233358_add_admission_cycle_and_window_controls`:
* `enum AdmissionCycleStatus` (`UPCOMING`, `OPEN`, `CLOSED`, `ARCHIVED`)
* `enum ProgrammeAvailabilityStatus` (`OPEN`, `CLOSED`, `FULL`)
* `enum ApplicationPaymentStatus` (`UNPAID`, `PAYMENT_PENDING`, `PAYMENT_CONFIRMED`, `WAIVED`, `REFUNDED`)
* `model AdmissionCycle`
* `model AdmissionCycleProgramme`
* `Application.admissionCycleId` (FK referencing `AdmissionCycle`, `onDelete: Restrict`)
* `Application.paymentStatus` (`ApplicationPaymentStatus`)

---

## 22. API / Business Rule Enforcement Requirements

1. `GET /api/admissions/active-cycle`: Returns active cycle and open programmes in `Africa/Lagos` timezone.
2. `POST /api/admissions/apply`:
   * Validates `evaluateAdmissionWindow(cycle)`.
   * Validates each selected programme has `isProgrammeAvailableForApplication()`.
   * Creates application with `status = DRAFT` or `SUBMITTED`.
3. `POST /api/admissions/checkout`:
   * Re-evaluates admission window before generating Paystack checkout session.
   * Sets `paymentStatus = PAYMENT_PENDING`.

---

## 23. V1 Inclusions

* Multi-programme unified applications.
* Discrete `AdmissionCycle` models targeting an `AcademicSession`.
* Programme availability controls (`OPEN`/`CLOSED`/`FULL`).
* Backend timezone enforcement in `Africa/Lagos` via `src/lib/admission_window.ts`.
* Independent `SUBMITTED` and `PAYMENT_CONFIRMED` statuses.
* Frozen itemized charge items under a single checkout payment.
* Independent per-programme review decisions (`APPROVED`/`REJECTED`).
* Partial approval matriculation into `StudentProgrammeEnrollment`.
* Duplicate application detection with `CONFLICT_REVIEW` fallback.

---

## 24. V1 Exclusions

* Dynamic auto-advancing waitlist management.
* Public entrance examination computer-based testing (CBT) engine.
* Automated parent interview self-scheduling calendars.
* Automated refund gateway execution.

---

## 25. Future Enhancements

* Parent self-service interview booking slots.
* Automated sibling discount application during checkout calculation.
* Document OCR / automated certificate verification.

---

## 26. Stage 3 Implications

With Stage 2C complete:
* The database foundation and admission lifecycle rules are solid.
* Stage 3 (Core Authentication & Identity Infrastructure) can proceed with complete clarity on how `User` accounts link to `Guardian`s created during the admission lifecycle.

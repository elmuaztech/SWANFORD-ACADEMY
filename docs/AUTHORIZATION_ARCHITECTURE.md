# Swanford Academy — Authorization, Permissions & Scopes Architecture

**Document Version:** 1.0  
**Phase:** Stage 4 Delivery  
**Status:** Active Architectural Standard  
**Master Specification Reference:** Sections 2, 5, 6, 18, 25

---

## 1. Core Architectural Principle

$$\text{ROLE} \ne \text{PERMISSION} \ne \text{SCOPE}$$

The Swanford Academy authorization system enforces a strict distinction between identity, privilege, and data partitioning:
1. **Authentication (Stage 3):** *"Who is this user?"* (Identity, verified email/phone, persistent session, account status).
2. **Permission (Stage 4):** *"What is this user allowed to do?"* (Fine-grained operational privilege, e.g. `ATTENDANCE_RECORD`, `FINANCE_INVOICE_MANAGE`).
3. **Scope (Stage 4):** *"Which records, programmes, classes, subjects, or children may this user access?"* (Data partition boundary).

### The Invariant
* **Server-Side Enforcement:** Authorization is enforced 100% on the server in database queries and service boundaries. Frontend UI hiding is never treated as security.
* **No Hardcoded Roles:** Business logic checks permissions (e.g., `hasPermission(user, 'STUDENT_VIEW')`), never broad role strings (`if (role === 'ADMIN')`).
* **Zero God Mode:** Even the Super Administrator's high-risk operations (role assignments, scope assignments, deactivations) are explicitly auditable.

---

## 2. Canonical System Roles

Swanford Academy recognizes exactly five operational roles:

| Role Code | Name | Operational Description |
| :--- | :--- | :--- |
| `SUPER_ADMIN` | Super Administrator | System configuration, governance, user/role management, full oversight. |
| `ADMIN` | School Administrator | Academic operations, admissions review/approval, attendance/assessment oversight. |
| `ACCOUNTANT` | Bursar / Accountant | Tuition, fee structures, invoices, payment reconciliation, expenses, financial reports. |
| `TEACHER` | Instructional Staff | Attendance and continuous assessment **strictly within assigned class and subject scopes**. |
| `PARENT` | Parent / Guardian | Access to own linked children's attendance, report cards, and fee invoices **strictly via active relationships**. |

---

## 3. Canonical Permission Catalog

Permissions are system-controlled, immutable constants categorized by operational domain:

### 1. System & Administration
* `system_config:manage`: Configure school-wide parameters, terms, and feature flags.
* `users:manage`: Deactivate, reactivate, or unlock user accounts.
* `roles:manage`: Assign or revoke system-defined roles to/from users.
* `audit_logs:view`: Inspect system security, operational, and authorization audit logs.

### 2. People (Students, Guardians, Teachers)
* `students:view`: View student profiles and demographic details (scoped for teachers).
* `students:create`: Enroll students individually or via bulk intake.
* `students:edit`: Modify student demographic and medical records.
* `guardians:view`: View parent contact profiles and linked family data.
* `guardians:edit`: Modify guardian contact details.
* `guardian_relationships:manage`: Create, reassign, or revoke parent-student family relationships.
* `teachers:manage`: Create teachers and configure teacher programme, class, and subject scopes.

### 3. Academic Structures
* `academic_sessions:manage`: Create and configure academic sessions and term dates.
* `programmes:manage`: Configure curricular programmes (Creche, Pre-Scholars, Pre-Nursery, Nursery, Primary, Tahfeez).
* `classes:manage`: Create and configure school classes, arms, and capacities.
* `subjects:manage`: Configure curricular offerings and subjects.
* `enrollments:manage`: Enroll or withdraw students across multiple curricular programmes.

### 4. Admissions
* `admission_cycles:manage`: Open, close, and configure temporal admission intake cycles.
* `admission_applications:view`: View public applicant dossiers and programme selections.
* `admission_applications:review`: Conduct applicant reviews, interviews, and entrance assessment notes.
* `admission_applications:approve`: Approve, reject, or partially approve applicant programmes.

### 5. Finance & Ledger
* `fee_structures:manage`: Configure fee line items, tuitions, and amounts.
* `finance_invoices:view`: View student fee invoices and payment statuses.
* `finance_invoices:manage`: Generate, issue, adjust, or cancel invoices.
* `finance_payments:view`: View transaction history and offline deposit logs.
* `finance_payments:reconcile`: Reconcile Paystack payments, bank transfers, and issue official receipts.
* `finance_expenses:manage`: Record, verify, and categorize operational school expenses.
* `finance_reports:view`: Generate income statements, debt lists, and revenue summaries.

### 6. Attendance & Assessment
* `attendance:view`: View daily student attendance registers (scoped for teachers).
* `attendance:record`: Take and submit daily attendance registers (scoped for teachers).
* `assessments:enter`: Enter continuous assessment (CA) scores and exam marks (scoped for teachers).
* `assessments:view`: View class gradebooks and computed academic marks (scoped for teachers).
* `results:publish`: Approve and release official term report cards to parents.
* `reports:generate`: Compile academic transcripts, broadsheets, and master class summaries.

### 7. Communication
* `communication:announce`: Broadcast announcements to school, programme, or class channels.
* `notifications:view`: Monitor communication delivery logs and outbox queue.

### 8. Parent (Strictly Subordinate to GuardianStudentRelationship)
* `parent_child:view`: View profiles of own linked children only.
* `parent_attendance:view`: View attendance records of own linked children only.
* `parent_results:view`: View published report cards of own linked children only.
* `parent_invoices:view`: View and pay fee invoices belonging to own linked children only.

---

## 4. System-Controlled Role-Permission Matrix

```
┌──────────────────────────────┬─────────────┬────────┬────────────┬─────────┬────────┐
│ Operational Domain           │ SUPER_ADMIN │ ADMIN  │ ACCOUNTANT │ TEACHER │ PARENT │
├──────────────────────────────┼─────────────┼────────┼────────────┼─────────┼────────┤
│ System Config                │     YES     │   NO   │     NO     │   NO    │   NO   │
│ User Management              │     YES     │   NO   │     NO     │   NO    │   NO   │
│ Role Assignment (Audited)    │     YES     │   NO   │     NO     │   NO    │   NO   │
│ Audit Log Viewing            │     YES     │  YES   │     NO     │   NO    │   NO   │
│ Student Create / Edit        │     YES     │  YES   │     NO     │   NO    │   NO   │
│ Student View                 │     YES     │  YES   │ VIEW ONLY  │ SCOPED  │   NO   │
│ Guardian Management          │     YES     │  YES   │ VIEW ONLY  │   NO    │   NO   │
│ Teacher / Scope Management   │     YES     │  YES   │     NO     │   NO    │   NO   │
│ Academic Structure Config    │     YES     │  YES   │     NO     │   NO    │   NO   │
│ Admissions Review & Approve  │     YES     │  YES   │ VIEW FEES  │   NO    │   NO   │
│ Fee Structures & Invoicing   │     YES     │ VIEW   │    YES     │   NO    │   NO   │
│ Payment Reconcile & Expenses │     YES     │   NO   │    YES     │   NO    │   NO   │
│ Attendance Recording         │     YES     │  YES   │     NO     │ SCOPED  │   NO   │
│ Assessment Grading           │     YES     │  YES   │     NO     │ SCOPED  │   NO   │
│ Result Publishing            │     YES     │  YES   │     NO     │   NO    │   NO   │
│ Communication Broadcast      │     YES     │  YES   │     NO     │ SCOPED  │   NO   │
│ Own Children Data Only       │     N/A     │  N/A   │    N/A     │   N/A   │ SCOPED │
└──────────────────────────────┴─────────────┴────────┴────────────┴─────────┴────────┘
```

---

## 5. Teacher Scope Model & Multi-Programme Scoping

### 1. Conceptual Hierarchy
Teacher scoping follows a strict 4-dimensional hierarchy anchored to the academic session:
$$\text{Teacher} \longrightarrow \text{Programme} \longrightarrow \text{SchoolClass (Optional)} \longrightarrow \text{Subject (Optional)} \longrightarrow \text{AcademicSession}$$

Database representation in `teacher_scopes`:
* `teacherId` (UUID): The teacher profile.
* `academicSessionId` (UUID): The session for which the scope is valid.
* `programmeId` (UUID): Required curricular programme (e.g. `PRIMARY`, `TAHFEEZ`).
* `schoolClassId` (UUID?): Optional specific class. If `NULL`, teacher covers all classes in that programme.
* `subjectId` (UUID?): Optional specific subject. If `NULL`, teacher covers all subjects in that class (e.g. Form Teacher).
* `isFormTeacher` (Boolean): Pastoral/attendance authority for the class arm.

### 2. Multi-Programme Student Scoping (The "Ahmed" Invariant)
In Swanford Academy, students commonly participate in multiple programmes simultaneously (e.g., Primary 4 + Tahfeez).

**Architectural Rule:**
A teacher's authority is bounded to the student's *specific programme enrollment* being accessed. Enrolling in Primary does NOT grant Primary teachers access to the student's Tahfeez records.

**Concrete Scenario Verified by Automated Tests:**
* **Student Ahmed:**
  * Enrollment 1: `Programme = PRIMARY`, `Class = Primary 4`
  * Enrollment 2: `Programme = TAHFEEZ`, `Class = Tahfeez Class A`
* **Teacher A:**
  * Scope: `Programme = PRIMARY`, `Class = Primary 4`, `Subject = Mathematics`
* **Enforcement:**
  * Teacher A accessing Ahmed's Primary 4 Mathematics record $\longrightarrow$ **ALLOWED**.
  * Teacher A accessing Ahmed's Tahfeez records $\longrightarrow$ **DENIED (403)**.
  * Teacher A accessing Primary 5 records $\longrightarrow$ **DENIED (403)**.
  * Teacher A accessing Primary 4 English records $\longrightarrow$ **DENIED (403)**.
  * Teacher A accessing an unrelated student outside Primary 4 $\longrightarrow$ **DENIED (403)**.

---

## 6. Parent Scope Model

* Parent authorization is **subordinate** to an active `GuardianStudentRelationship` record.
* `PARENT_RESULT_VIEW` or `PARENT_INVOICE_VIEW` means *"view published results / invoices for children linked to this guardian."* It never grants global result or fee access.
* **Tampering Guard:** If a parent supplies or manipulates a `studentId` in an API call to target a child not linked to their profile, the request is immediately rejected with HTTP 403 `STUDENT_ACCESS_DENIED`.

---

## 7. Account Lifecycle & Security Guards

```
Incoming Server Request
         │
         ▼
Load Authoritative User Record
         │
         ▼
Check Account Lifecycle Status:
  ├── DEACTIVATED?            ──► Throws 403 ACCOUNT_DEACTIVATED
  ├── SUSPENDED?              ──► Throws 403 ACCOUNT_SUSPENDED
  ├── PENDING_VERIFICATION?   ──► Throws 403 ACCOUNT_PENDING_ACTIVATION
  └── lockedUntil > now()?    ──► Throws 423 ACCOUNT_LOCKED
         │
         ▼
Compute Union of Active Roles
         │
         ▼
Assert Fine-Grained Permission Granted
         │
         ▼
Assert Scope Constraints:
  ├── If Parent: Check active GuardianStudentRelationship
  └── If Teacher: Check TeacherScope against student's target programme enrollment
         │
         ▼
Execute Operation & Audit (if sensitive)
```

---

## 8. Audit Logging

All security-sensitive and scope-modifying actions write persistent audit records to `AuditLog`:
* `ROLE_ASSIGNED` / `ROLE_REMOVED`
* `TEACHER_SCOPE_ASSIGNED` / `TEACHER_SCOPE_REVOKED`
* `GUARDIAN_RELATIONSHIP_CREATED` / `GUARDIAN_RELATIONSHIP_REVOKED`
* `ACCOUNT_DEACTIVATED` / `ACCOUNT_REACTIVATED` / `ACCOUNT_UNLOCKED`

Audit records capture `userId`, `action`, `entityType`, `entityId`, `oldValues`, and `newValues`. Audit records are write-only and immutable by normal application users.

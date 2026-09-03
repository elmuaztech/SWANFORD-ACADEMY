# Swanford Academy — Bulk Student Enrollment Architecture

**Document Version:** 1.1 (Incorporating Final Architectural Corrections)  
**Status:** Approved Architecture Design (Stage 2D)  
**Author:** Antigravity / Core Engineering  
**Canonical Timezone:** `Africa/Lagos` (WAT, UTC+1)  
**Reference Specifications:** Swanford Master Project Specification (Sections 5, 8, 10, 11, 14, 21), `docs/DATABASE_ARCHITECTURE_DESIGN.md`

---

## 1. Executive Summary & Core Concept

Swanford Academy has approximately 40 existing students who must be onboarded into the new management system immediately, with capacity to onboard hundreds more across future sessions.

The primary student onboarding mechanism for existing students is **BULK STUDENT ENROLLMENT** via an intuitive, interactive, editable in-app table interface. CSV / Excel file import is an optional supporting accelerator that feeds into the **exact same validation, admission-number generation, and enrollment pipeline**.

Bulk enrollment is cleanly separated from **Public Admissions**:
* **Public Admission (Stage 2B/2C/7):** Prospective public applicants submit applications via `AdmissionCycle`, pay upfront application/tuition checkouts via Paystack, undergo admin review, and are matriculated upon approval.
* **Bulk Student Enrollment (Stage 2D/3):** Authorized administrators onboard existing or direct-intake students into active classes and programmes with immediate matriculation, optional guardian matching, and asynchronous parent portal activation.

---

## 2. Interactive Bulk Enrollment Table Workflow

Administrators navigate: **Students → Add Students → Bulk Student Enrollment**.

### 2.1 The Editable Table Interface
The user interface presents an editable data grid:
```
┌───┬──────────────────┬────────────┬────────┬───────────┬───────────────────┬───────────────────┬──────────────────┬─────────────────┬────────┐
│ # │ Student Name     │ DOB        │ Gender │ Class     │ Programme(s)      │ Guardian Name     │ Guardian Email   │ Guardian Phone  │ Action │
├───┼──────────────────┼────────────┼────────┼───────────┼───────────────────┼───────────────────┼──────────────────┼─────────────────┼────────┤
│ 1 │ Ahmed Sani       │ 12/04/2014 │ Male   │ Primary 6 │ Primary, Tahfeez  │ Muhammad Sani     │ parent@email.com │ 08031234567     │ [Del]  │
│ 2 │ Aisha Bello      │ 08/09/2016 │ Female │ Primary 4 │ Primary           │ Ibrahim Bello     │ parent2@mail.com │ 08098765432     │ [Del]  │
│ 3 │ Fatima Umar      │ 21/02/2018 │ Female │ Nursery 2 │ Nursery, Tahfeez  │ Umar Musa         │ (No email)       │ 08011223344     │ [Del]  │
└───┴──────────────────┴────────────┴────────┴───────────┴───────────────────┴───────────────────┴──────────────────┴─────────────────┴────────┘
[ + Add Row ]   [ Paste from Spreadsheet ]   [ Import CSV/Excel ]   [ Download Template ]       [ Validate & Review Batch (3 Rows) ]
```

### 2.2 Table Features
1. **Dynamic Grid Management:** Add row, remove row, clone row, inline dropdown selectors for Gender, SchoolClass, and multi-select Programme tags.
2. **Keyboard Navigation:** Arrow keys, Tab, Enter, and bulk clipboard paste (TSV/Excel format).
3. **Draft Retention:** Unsubmitted table contents are held in local state or browser storage until submitted, preventing data loss on accidental navigation.
4. **Performance Ceiling:** Virtualized grid rendering supports hundreds of student rows smoothly without DOM sluggishness.

---

## 3. Optional CSV / Excel Import Accelerator

CSV and Excel uploads are treated as file ingestion helpers that parse raw rows into the editable table:
1. Administrator downloads standard template: `swanford_bulk_student_template.xlsx` / `.csv`.
2. Administrator uploads filled file.
3. Parser extracts rows and loads them directly into the interactive bulk table.
4. Administrator inspects, modifies, and validates rows in the table.
5. **Single Shared Ingestion Engine:** Both manual entry and CSV import submit through the exact same server API (`POST /api/students/bulk-enroll`).

---

## 4. Bulk Import Batch Concept & Normalized Traceability

To ensure complete traceability and operational auditing, all bulk enrollments belong to a persistent **Import Batch**:

### 4.1 Normalized Traceability (Student Model Unpolluted)
The `Student` entity represents an academic scholar throughout their multi-year schooling lifecycle and is **not** polluted with an `importBatchId` foreign key. Traceability from batch to student is maintained via `StudentImportRow.studentId`:
* `StudentImportBatch` has many `StudentImportRow`s.
* Each successful `StudentImportRow` records `studentId` pointing to the matriculated `Student`.
* If an auditor asks which batch created a student, the query is simply: `SELECT * FROM student_import_rows WHERE student_id = :id`.

### 4.2 Data Models
```prisma
enum ImportBatchStatus {
  PROCESSING
  COMPLETED
  PARTIALLY_COMPLETED
  FAILED
}

enum ImportRowStatus {
  SUCCESS
  FAILED
  SKIPPED
}

model StudentImportBatch {
  id                String             @id @default(uuid()) @db.Uuid
  batchNumber       String             @unique @map("batch_number") // BATCH-YYYY-NNNNN
  createdById       String?            @map("created_by_id") @db.Uuid
  academicSessionId String             @map("academic_session_id") @db.Uuid
  totalSubmitted    Int                @map("total_submitted")
  totalSuccessful   Int                @default(0) @map("total_successful")
  totalFailed       Int                @default(0) @map("total_failed")
  status            ImportBatchStatus  @default(PROCESSING)
  sourceType        String             @default("MANUAL_BULK_ENTRY") @map("source_type") // MANUAL_BULK_ENTRY | CSV_IMPORT
  notes             String?
  createdAt         DateTime           @default(now()) @map("created_at")
  updatedAt         DateTime           @updatedAt @map("updated_at")

  createdBy         User?              @relation(fields: [createdById], references: [id], onDelete: SetNull)
  academicSession   AcademicSession    @relation(fields: [academicSessionId], references: [id], onDelete: Restrict)
  rows              StudentImportRow[]

  @@index([status])
  @@index([academicSessionId])
  @@map("student_import_batches")
}

model StudentImportRow {
  id           String          @id @default(uuid()) @db.Uuid
  batchId      String          @map("batch_id") @db.Uuid
  rowNumber    Int             @map("row_number")
  studentId    String?         @map("student_id") @db.Uuid
  status       ImportRowStatus @default(SUCCESS)
  rawDataJson  Json            @map("raw_data_json")
  errorMessage String?         @map("error_message")
  createdAt    DateTime        @default(now()) @map("created_at")

  batch        StudentImportBatch @relation(fields: [batchId], references: [id], onDelete: Cascade)
  student      Student?           @relation(fields: [studentId], references: [id], onDelete: SetNull)

  @@unique([batchId, rowNumber])
  @@index([batchId, status])
  @@index([studentId])
  @@map("student_import_rows")
}
```

---

## 5. Concurrency-Safe Admission Number Generation & Permitted Gaps

Admission numbers follow the canonical format: **`SA-YYYY-NNNN`** (e.g. `SA-2026-0001`).

### Invariants:
1. **Globally Unique:** Guaranteed by primary sequence and unique index on `Student.admissionNumber`.
2. **Server-Side Generated:** The frontend never decides, generates, or requests a specific admission number.
3. **Permanent & Non-Reused:** Once issued, an admission number remains with the student permanently.
4. **Gaps Permitted:** If a bulk block reserves numbers (e.g. 40 numbers from 101 to 140) and rows 105 and 112 fail validation, numbers 105 and 112 remain as unassigned gaps. **They are never reused or backfilled.** Gaps in sequential audit numbers are standard and acceptable; attempts to backfill cause concurrency locks and race conditions.

### The Atomic Generator Table:
```prisma
model AdmissionNumberSequence {
  year         Int      @id
  lastSequence Int      @default(0) @map("last_sequence")
  updatedAt    DateTime @updatedAt @map("updated_at")

  @@map("admission_number_sequences")
}
```

---

## 6. Multi-Programme & Historical Class Placement

* **Multi-Programme Support:** A student can participate in multiple programmes simultaneously (e.g., Primary 6 + Tahfeez). The bulk enrollment interface accepts an array of programme IDs.
* **Historical Placement Invariant:** Class assignment is stored in `student_programme_enrollments`:
  * `studentId`
  * `programmeId`
  * `schoolClassId` (e.g. Primary 6A)
  * `academicSessionId` (e.g. 2026/2027)
  * `academicTermId` (e.g. First Term)
  * `enrollmentType`: `MAIN_ACADEMIC` (for Primary) vs `ADDITIONAL_PROGRAMME` (for Tahfeez).
* When the student advances to Primary 7 in session 2027/2028, a new enrollment row is created. The 2026/2027 record remains permanently intact.

---

## 7. Guardian Architecture & Direct Database Link to User

### 7.1 Authoritative Database Relationship Flow
The connection between an authenticated parent user and their children is an authoritative database relationship:
```
[User] (Logged in via session)
   │ 1-to-1
   ▼
[Guardian] (guardian.userId = user.id)
   │ 1-to-many
   ▼
[GuardianStudentRelationship] (guardian_id = guardian.id)
   │ many-to-1
   ▼
[Student] (student_id = student.id)
```
* **Zero Login-Time Email Matching:** The system does **not** perform heuristic email matching on login. The database foreign key `Guardian.userId` is the permanent, authoritative link established upon account invitation/activation.

### 7.2 Safe Guardian Matching Algorithm (Bulk Enrollment)
During bulk entry:
1. **No Email Provided:**
   * Create new `Guardian` with name, phone, and `email = null`.
   * Create `GuardianStudentRelationship`.
   * **Zero User Account Created:** Parent portal remains uninvited until a verified email is provided. Student enrollment is NOT blocked.
2. **Email Provided:**
   * Normalize email (`trim().toLowerCase()`).
   * Lookup existing `Guardian` by email:
     * **Match Found (Name consistent):** Link child to existing guardian. (Prevents duplicate "Muhammad Sani" records for siblings).
     * **Match Found (Name conflict):** Flag row for administrative review; do not silently merge.
     * **No Match Found:** Create new `Guardian` record and initiate Parent Account Invitation Lifecycle.

---

## 8. Parent Account Invitation & Persistent Notification Outbox

### Anti-Markazu Rule: Never Generate or Email Plaintext Passwords
Emailing passwords violates basic security practices. The school, admins, and network transit nodes must never see the parent’s password.

### 8.1 Enumerated Verification & Activation Tokens
Tokens are strictly categorized using an enum to avoid arbitrary strings or mixing with password resets:
```prisma
enum VerificationTokenType {
  EMAIL_VERIFICATION
  ACCOUNT_ACTIVATION
}

model EmailVerification {
  id         String                @id @default(uuid()) @db.Uuid
  userId     String                @map("user_id") @db.Uuid
  tokenHash  String                @unique @map("token_hash")
  email      String
  tokenType  VerificationTokenType @default(EMAIL_VERIFICATION) @map("token_type")
  expiresAt  DateTime              @map("expires_at")
  usedAt     DateTime?             @map("used_at")
  createdAt  DateTime              @default(now()) @map("created_at")

  user       User                  @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, expiresAt])
  @@index([tokenType, expiresAt])
  @@map("email_verifications")
}
```

### 8.2 Persistent Outbox & Failure Decoupling
To ensure that database enrollment never depends on external email APIs, the `Notification` model is upgraded to serve as an outbox:
```prisma
enum NotificationChannel {
  EMAIL
  SMS
  WHATSAPP
}

enum NotificationStatus {
  PENDING
  SENT
  DELIVERED
  FAILED
  RETRYABLE
}

model Notification {
  id                String              @id @default(uuid()) @db.Uuid
  recipientUserId   String?             @map("recipient_user_id") @db.Uuid
  recipientEmail    String?             @map("recipient_email")
  recipientPhone    String?             @map("recipient_phone")
  channel           NotificationChannel
  templateName      String              @map("template_name")
  subject           String
  bodyText          String              @map("body_text")
  status            NotificationStatus  @default(PENDING)
  metadata          Json?
  attempts          Int                 @default(0)
  maxAttempts       Int                 @default(3) @map("max_attempts")
  nextRetryAt       DateTime?           @map("next_retry_at")
  providerMessageId String?             @map("provider_message_id")
  errorMessage      String?             @map("error_message")
  sentAt            DateTime?           @map("sent_at")
  createdAt         DateTime            @default(now()) @map("created_at")

  @@index([status, channel])
  @@index([recipientEmail])
  @@map("notifications")
}
```

### 8.3 Onboarding Flow:
1. Student transaction creates `User` (`status = PENDING_VERIFICATION`, sentinel password hash), creates `EmailVerification` token, and inserts `Notification` (`status = PENDING`).
2. Transaction commits.
3. Asynchronous sender delivers activation link: `https://swanfordacademy.edu.ng/auth/activate?token=RAW_TOKEN`.
4. If SMTP fails: `Notification.status = RETRYABLE`, backoff scheduled. **Student and Guardian records are never rolled back.**
5. Parent clicks activation link, enters their private password, and account becomes `ACTIVE`.

---

## 9. Transaction Integrity Boundary

Every student row in a bulk enrollment batch executes within an isolated, atomic database transaction:
```
db.$transaction(async (tx) => {
  // Step 1: Generate next admission number from sequence
  const admissionNumber = await generateAdmissionNumber(tx, year);

  // Step 2: Create Student
  const student = await tx.student.create({ data: { admissionNumber, ... } });

  // Step 3: Match or create Guardian
  const guardian = await resolveOrCreateGuardian(tx, guardianData);

  // Step 4: Create GuardianStudentRelationship
  await tx.guardianStudentRelationship.create({ data: { guardianId: guardian.id, studentId: student.id, ... } });

  // Step 5: Create StudentProgrammeEnrollment for EACH selected programme
  for (const prog of programmes) {
    await tx.studentProgrammeEnrollment.create({ data: { studentId: student.id, programmeId: prog.id, schoolClassId, ... } });
  }

  // Step 6: If guardian has email & no User account: Create User + EmailVerification + Notification Outbox
  if (guardian.email && !guardian.userId) {
    const user = await tx.user.create({ ... });
    await tx.guardian.update({ where: { id: guardian.id }, data: { userId: user.id } });
    await tx.emailVerification.create({ ... });
    await tx.notification.create({ ... });
  }

  // Step 7: Record success in StudentImportRow
  await tx.studentImportRow.create({
    data: { batchId, rowNumber, studentId: student.id, status: 'SUCCESS', rawDataJson: row }
  });
});
```

* **Failure Isolation:** If row 3 fails, steps 1–7 for row 3 are rolled back atomically, and an error row is recorded in `StudentImportRow` (`status = FAILED`, `errorMessage = error.message`). Rows 1, 2, and 4 are completely unaffected.
* **No Corrupt Partial States:** It is impossible for a student to exist without their programme enrollment, or for a guardian relationship to be half-created.

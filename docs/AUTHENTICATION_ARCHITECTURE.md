# Swanford Academy — Authentication & Account Lifecycle Architecture

**Document Version:** 1.0 (Stage 3 Implementation)  
**Status:** Approved & Implemented  
**Scope:** "WHO ARE YOU?" (Authentication & Account Lifecycle)  
**Boundary:** Stage 3 implements identity, sessions, and account states. It does NOT implement Stage 4 RBAC, scopes, or authorization checks.

---

## 1. Architectural Philosophy & Zero In-Memory Rule

Swanford Academy enforces strict security boundaries to prevent vulnerabilities experienced in legacy systems:
1. **Zero In-Memory Authentication State:** All security-critical state (sessions, lockout counts, reset tokens, verification tokens) is persisted exclusively in PostgreSQL via Prisma. Authentication state survives server restarts, application restarts, and multi-instance container deployments.
2. **Zero Plaintext Passwords in Transit or Storage:**
   * Passwords are hashed with `bcryptjs` using 12 salt rounds.
   * Parents are never emailed plaintext or randomly generated passwords.
   * Initial parent accounts are created with unmatchable cryptographic sentinels (`!UNACTIVATED_ACCOUNT_*`), requiring zero CPU work during bulk creation while mathematically preventing login until the parent completes activation.
3. **High-Entropy Tokens & Hash-Only Storage:**
   * Session tokens, password reset tokens, and email verification tokens are generated with 256 bits of cryptographic randomness (`crypto.randomBytes(32)`).
   * The database stores only the SHA-256 hash of the token. Raw tokens are never stored in the database and never logged.
4. **Authoritative Database Relationships:**
   * Authenticated `User` accounts link directly to `Guardian` records via the unique foreign key `Guardian.userId`.
   * Parent access to student profiles is resolved through database foreign keys (`User` → `Guardian` → `GuardianStudentRelationship` → `Student`), never through heuristic email matching at login time.
5. **Decoupled Notification Outbox:**
   * Database transactions commit persistent `Notification` outbox records (`status = PENDING`).
   * Asynchronous email dispatch ensures that external SMTP failures never roll back student enrollment or parent account creation.

---

## 2. Core Entities & Security Models

```
[User]
  ├── id (UUID PK)
  ├── email (unique, lowercase)
  ├── phoneNumber (unique, optional)
  ├── passwordHash (bcrypt 12 rounds or !UNACTIVATED_ACCOUNT_*)
  ├── status (ACTIVE | PENDING_VERIFICATION | SUSPENDED | DEACTIVATED)
  ├── emailVerifiedAt (timestamp)
  ├── failedLoginAttempts (integer)
  ├── lockedUntil (timestamp)
  ├── lastLoginAt (timestamp)
  ├── sessions (1:N -> Session)
  ├── passwordResets (1:N -> PasswordReset)
  ├── emailVerifications (1:N -> EmailVerification)
  └── guardianProfile (1:1 -> Guardian)

[Session]
  ├── id (UUID PK)
  ├── userId (UUID FK)
  ├── sessionTokenHash (SHA-256 unique)
  ├── ipAddress (string, optional)
  ├── userAgent (string, optional)
  ├── expiresAt (timestamp, 7 days default)
  └── revokedAt (timestamp, optional)

[EmailVerification]
  ├── id (UUID PK)
  ├── userId (UUID FK)
  ├── tokenHash (SHA-256 unique)
  ├── email (string)
  ├── tokenType (EMAIL_VERIFICATION | ACCOUNT_ACTIVATION)
  ├── expiresAt (timestamp)
  └── usedAt (timestamp, optional)

[PasswordReset]
  ├── id (UUID PK)
  ├── userId (UUID FK)
  ├── tokenHash (SHA-256 unique)
  ├── expiresAt (timestamp, 1 hour default)
  └── usedAt (timestamp, optional)
```

---

## 3. Authentication Workflows

### 3.1 Login Workflow
1. Client submits email and password.
2. Email is normalized (`trim().toLowerCase()`).
3. User looked up in database. If not found or status is `DEACTIVATED` / `SUSPENDED` / `PENDING_VERIFICATION`, request is rejected with a generic message.
4. **Temporary Lockout Check:** If `lockedUntil > now()`, request is rejected with the remaining lockout duration.
5. **Password Verification:** Password checked against `passwordHash` via `verifyPassword`.
   * If invalid: Increment `failedLoginAttempts`. If attempts $\ge 5$, set `lockedUntil = now() + 15 min`. Record `AuditLog(action: LOGIN_FAILED | ACCOUNT_LOCKED)`.
   * If valid: Reset `failedLoginAttempts = 0`, `lockedUntil = null`, update `lastLoginAt = now()`.
6. **Session Creation:** Generate 256-bit token. Store SHA-256 hash in `Session` with a 7-day expiration. Record `AuditLog(action: LOGIN_SUCCESS)`.
7. **Cookie Setting:** Issue HTTP-only cookie (`swanford_session`).

### 3.2 Session Validation & Current User
1. Server reads `swanford_session` cookie.
2. Computes SHA-256 hash and queries `Session` where `sessionTokenHash = hash`, `expiresAt > now()`, and `revokedAt IS NULL`.
3. Checks that `User.status === ACTIVE`.
4. Returns sanitized `SafeUser` object (excluding `passwordHash` and sensitive tokens).

### 3.3 Logout Workflow
1. Read session token from cookie.
2. Lookup session and set `revokedAt = now()`.
3. Record `AuditLog(action: LOGOUT)`.
4. Clear `swanford_session` cookie.

### 3.4 Password Reset Workflow
1. Client requests reset for an email.
2. **Anti-Enumeration:** Server returns a generic success response regardless of whether the email exists.
3. If user exists: Generate 256-bit token. Insert `PasswordReset` row (`expiresAt = now() + 1 hour`).
4. Insert `Notification` in outbox (`templateName: 'PASSWORD_RESET_REQUEST'`).
5. User clicks reset link (`/auth/reset-password?token=RAW_TOKEN`).
6. User enters new password. Server verifies token hash, expiration, and `usedAt IS NULL`.
7. Server validates password strength (min 8, max 72 chars), hashes with `bcryptjs` (12 rounds), marks reset token used, updates `passwordHash`, clears any lockout, and **revokes all active sessions** for that user.

### 3.5 Parent Account Activation (Never Email Passwords)
1. During bulk enrollment or manual student creation, parent account is created with `status: PENDING_VERIFICATION` and sentinel password hash.
2. Single-use `EmailVerification` token generated with `tokenType = ACCOUNT_ACTIVATION` (7-day expiration).
3. Outbox notification queued with activation link: `/auth/activate?token=RAW_TOKEN`.
4. Parent clicks activation link and enters their own private password.
5. Server validates token, hashes new password with `bcryptjs` (12 rounds), sets `User.status = ACTIVE`, sets `User.emailVerifiedAt = now()`, marks token used, and marks `Guardian.isVerified = true`.
6. Parent logs in with their newly established credentials.

---

## 4. Account Lifecycle States

| State | Login Permitted | Description | Transition Triggers |
| :--- | :--- | :--- | :--- |
| **`PENDING_VERIFICATION`** | No | Initial state for parent accounts created via bulk enrollment. | Transitions to `ACTIVE` upon successful activation token submission. |
| **`ACTIVE`** | Yes | Normal operational state for verified users. | Can be temporarily locked by failed logins, or deactivated by admins. |
| **`TEMPORARILY LOCKED`** | No | Automated security lockout after 5 consecutive failed logins. Lasts 15 minutes. | Automatically unlocks when `lockedUntil` passes, or when admin clears lockout. |
| **`DEACTIVATED`** | No | Administrative disabling of an account. All active sessions immediately revoked. | Historical data preserved permanently. Only admin can reactivate. |
| **`SUSPENDED`** | No | Administrative hold on an account pending review. | Only admin can reinstate. |

---

## 5. Security & Invariant Checklist

* [x] Zero in-memory state in production.
* [x] Zero plaintext passwords emailed to parents.
* [x] Passwords hashed with bcryptjs (12 rounds).
* [x] Raw security tokens never stored in database.
* [x] Raw security tokens never logged.
* [x] Tokens are single-use, high-entropy, and expiring.
* [x] HTTP-only, secure, SameSite=Lax session cookies.
* [x] Automatic session revocation upon password reset or deactivation.
* [x] Anti-enumeration error messages on login and password reset.
* [x] Outbox notifications decouple database transactions from external SMTP.

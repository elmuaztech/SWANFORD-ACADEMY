# Swanford Academy — Email Delivery Specification & Operations Guide

This document defines the email transport architecture, infrastructure requirements, DNS authenticity policies (SPF, DKIM, DMARC), outbox queuing mechanics, retry handling, and operational verification procedures for Swanford Academy.

---

## 1. System Philosophy & Delivery Guarantee

Swanford Academy enforces strict security and delivery guarantees across all notification pipelines:

1. **Zero Plaintext Password Transmission**: Passwords are never sent by email, displayed in logs, or rendered in email bodies. All account onboarding uses single-use 24-hour cryptographic activation links.
2. **Honest Delivery Reporting**: A notification is **NEVER** marked as `SENT` based merely on enqueueing or local memory dispatch. Status transitions to `SENT` only when the SMTP server confirms message acceptance with standard `250 OK` SMTP response codes.
3. **Transactional Outbox Durability**: All transactional emails (security alerts, 4-digit OTPs, invoices, receipts, activation links) are staged inside PostgreSQL transactions within the `notifications` table before transmission. If an application server crashes, no notifications are lost.
4. **Anti-Duplicate Idempotency**: Every notification has a deterministic `idempotencyKey` preventing duplicate dispatch.

---

## 2. Environment Configuration & SMTP Settings

Configure the following environment variables in `.env` or the production secret store:

```env
# Application Host
APP_URL="https://portal.swanfordacademy.edu.ng"

# SMTP Transport Settings
SMTP_HOST="smtp.mailgun.org"            # or smtp.sendgrid.net / email-smtp.eu-west-1.amazonaws.com
SMTP_PORT=587                          # 587 (STARTTLS) or 465 (SSL/TLS)
SMTP_SECURE=false                      # true for port 465, false for port 587
SMTP_USER="postmaster@mg.swanfordacademy.edu.ng"
SMTP_PASSWORD="[SECURE_SMTP_API_PASSWORD]"
SMTP_FROM_EMAIL="Swanford Academy <no-reply@swanfordacademy.edu.ng>"
SMTP_REPLY_TO="admissions@swanfordacademy.edu.ng"

# Notification Worker Tuning
NOTIFICATION_WORKER_CONCURRENCY=5
NOTIFICATION_MAX_RETRIES=5
NOTIFICATION_POLL_INTERVAL_MS=3000
```

---

## 3. Domain Authentication & Anti-Spoofing (SPF, DKIM, DMARC)

To guarantee high deliverability into Gmail, Yahoo, Microsoft Outlook, and corporate inboxes without being marked as SPAM, the school domain DNS must configure the following records:

### A. SPF (Sender Policy Framework)
Authorizes the designated mail server IP / provider to transmit mail on behalf of `@swanfordacademy.edu.ng`.

- **Type**: `TXT`
- **Host / Name**: `@` (or `swanfordacademy.edu.ng`)
- **Value**:
  ```text
  v=spf1 include:mailgun.org ~all
  ```
  *(Replace `include:mailgun.org` with `include:sendgrid.net` or `include:amazonses.com` if using those providers).*

### B. DKIM (DomainKeys Identified Mail)
Cryptographically signs every outbound email header and body, proving the message was not altered in transit.

- **Type**: `TXT` or `CNAME` (provided by mail service provider)
- **Host / Name**: `k1._domainkey.swanfordacademy.edu.ng`
- **Value**:
  ```text
  k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC3...[2048-bit Public Key]...
  ```

### C. DMARC (Domain-based Message Authentication, Reporting & Conformance)
Instructs receiving mail servers how to treat unauthorized mail spoofing the school's identity.

- **Type**: `TXT`
- **Host / Name**: `_dmarc.swanfordacademy.edu.ng`
- **Value**:
  ```text
  v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc-reports@swanfordacademy.edu.ng; aspf=r; adkim=r
  ```
  *(Start in `p=none` for initial monitoring, then advance to `p=quarantine` and `p=reject` once SPF and DKIM pass 100% of legitimate traffic).*

---

## 4. Transactional Outbox Pattern & Worker Mechanics

The notification system uses a two-phase transactional outbox architecture located in `src/lib/notifications`:

```
Domain Event (e.g. Forgot Password)
         │
         ▼
[PostgreSQL Transaction]
  ├── Persist User / PasswordReset Record
  └── Persist Notification in `notifications` Table (Status: PENDING)
         │
         ▼
Outbox Worker Daemon (`processPendingNotifications`)
  ├── Locks batch of PENDING records (`FOR UPDATE SKIP LOCKED`)
  ├── Renders HTML & Plaintext via Master Template Catalog
  ├── Dispatches via NodeMailer SMTP Transport
  ├── Evaluates SMTP Provider Response:
  │     ├── Accepted (Code 250): Update Status to SENT, Record sentAt
  │     └── Error / Reject: Compute Exponential Backoff, Increment retryCount
  └── Records Delivery Audit Logs
```

### Retry Strategy & Exponential Backoff
Failed deliveries (e.g. temporary SMTP timeout or rate limiting) are retried automatically:
- Attempt 1: Immediate + 30 seconds
- Attempt 2: + 2 minutes
- Attempt 3: + 10 minutes
- Attempt 4: + 30 minutes
- Attempt 5: + 2 hours
- After 5 consecutive failures: marked as `FAILED_PERMANENT`.

---

## 5. Security Templates Catalog

Every email sent by the system is generated from responsive, branded HTML and plaintext templates defined in `src/lib/notifications/templates/catalog.ts`:

1. **4-Digit OTP Password Reset (`PASSWORD_RESET_OTP`)**:
   - Contains exactly 4 numeric digits (`0000`–`9999`) formatted with leading zeros (e.g. `0427`).
   - Clearly states 5-minute strict expiry.
   - Includes standard security notice: *"Never share this code with anyone. Swanford Academy staff will never ask for your verification code."*
2. **First-Time Account Activation (`WELCOME_NEW_USER`)**:
   - Sent when an administrator creates a new staff or parent account.
   - Contains a single-use 24-hour activation link with high-entropy token (`/auth/activate?token=...`).
   - Informs the user that administrators do not know or set passwords.
3. **Administrative Email Change Alert (`EMAIL_CHANGED_ALERT`)**:
   - Dispatched to the user's **old** email address alerting them of administrative modification.
   - Dispatched to the user's **new** email address with an email ownership verification link.
4. **Administrative Password Reset (`ADMIN_PASSWORD_RESET`)**:
   - Sent when an administrator initiates credential recovery.
   - Informs user of single-use 24-hour link and invalidation of prior sessions.

---

## 6. Live Mailbox Verification Procedure

Before approving or deploying to production, verify actual delivery using a live test mailbox:

### Verification Checklist:
1. **Request 4-Digit OTP**:
   - Submit real test address in `/auth/forgot-password`.
   - Inspect inbox: Verify message arrives within 15 seconds.
   - Verify sender header: `Swanford Academy <no-reply@swanfordacademy.edu.ng>`.
   - Verify OTP is exactly 4 digits, including leading zero if applicable (e.g. `0427`).
   - Check raw email headers in mail client (`Show Original` / `View Headers`):
     - SPF: `PASS`
     - DKIM: `PASS`
     - DMARC: `PASS`
2. **Attempt Login with Unactivated Account**:
   - Verify that an unactivated account created with sentinel hash cannot log in.
3. **Execute First-Time Activation**:
   - Click link in activation email. Verify token resolves account email.
   - Set password (min 6 chars). Sign in successfully.
4. **Verify Administrative Email Change**:
   - Admin changes user email in directory.
   - Check old email inbox: Security alert arrives.
   - Check new email inbox: Verification link arrives. Click link, verify status transitions.
5. **Inspect Outbox Records**:
   - Check PostgreSQL `notifications` table:
     ```sql
     SELECT id, recipient_email, status, retry_count, sent_at, error_details 
     FROM notifications 
     ORDER BY created_at DESC 
     LIMIT 10;
     ```
   - Ensure `status` is `SENT` and `error_details` is null.

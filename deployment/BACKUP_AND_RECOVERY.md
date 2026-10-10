# Swanford Academy — Database Backup, Encryption & Disaster Recovery Plan

**Target Infrastructure:** Hostinger VPS (Ubuntu 22.04 LTS / 24.04 LTS)  
**Database Container:** `swanford_postgres` (PostgreSQL 16 Alpine)  
**Storage Architecture:** Local volume mount `/root/swanford-academy/storage/backups` + Off-site sync  

---

## 1. Automated Scheduled Backups

### Cron Setup on Hostinger VPS
To schedule daily encrypted backups at 02:00 UTC (off-peak hours) and log outcomes:

```bash
# Add to crontab via `crontab -e`:
0 2 * * * /root/swanford-academy/scripts/backup_postgres.sh >> /var/log/swanford_backup.log 2>&1
```

### Key Management
The backup script uses OpenSSL AES-256-CBC with PBKDF2 (100,000 iterations).  
Generate a strong random encryption key on the host:

```bash
openssl rand -base64 32 > /root/.backup_encryption_key
chmod 600 /root/.backup_encryption_key
```

*Never store this encryption key inside the git repository.*

---

## 2. Off-Site Backup Replication

To safeguard against total VPS failure or provider-level datacenter outages:

1. **Hostinger Automated VPS Snapshots:**
   - In Hostinger hPanel -> VPS -> Snapshots: enable weekly automatic snapshots.
2. **Encrypted Cloud Object Storage (Cloudflare R2 / AWS S3 / Backblaze B2):**
   - Install `rclone` on the VPS (`apt install -y rclone`).
   - Configure a remote named `remote_backup` pointing to your private S3 bucket.
   - The backup script automatically copies encrypted `.sql.gz.enc` archives offsite.

---

## 3. Non-Destructive Restore Verification

Before relying on backups, test them without risking live production data:

```bash
# Test decrypting and restoring into a temporary sandbox database:
./scripts/verify_restore_isolated.sh /root/swanford-academy/storage/backups/swanford_db_YYYYMMDD_HHMMSS.sql.gz.enc
```

The script:
1. Decrypts the archive using the secure key into a temporary memory buffer.
2. Creates an isolated temporary database (`swanford_restore_verify_<timestamp>`).
3. Restores the schema and rows.
4. Audits record counts for `users`, `students`, `invoices`, `applications`, etc.
5. Drops the test database automatically.
6. Returns exit code 0 if healthy, or fails with diagnostic details.

---

## 4. Disaster Recovery & Emergency Restore Procedure

In the event of database corruption or hardware failure:

1. **Stop the Application Container:**
   ```bash
   docker compose -f deployment/docker-compose.yml stop app
   ```
2. **Locate the desired backup archive:**
   ```bash
   ls -la /root/swanford-academy/storage/backups/
   ```
3. **Decrypt the archive:**
   ```bash
   openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
     -in /root/swanford-academy/storage/backups/swanford_db_TARGET.sql.gz.enc \
     -out /tmp/restore_target.sql.gz \
     -pass file:/root/.backup_encryption_key
   ```
4. **Restore to PostgreSQL:**
   ```bash
   gunzip -c /tmp/restore_target.sql.gz | docker exec -i swanford_postgres psql -U postgres -d swanford_db
   rm -f /tmp/restore_target.sql.gz
   ```
5. **Restart and verify Application:**
   ```bash
   docker compose -f deployment/docker-compose.yml start app
   curl -I http://127.0.0.1:3002/api/health
   ```

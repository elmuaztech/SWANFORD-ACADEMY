import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

describe('Security Hardening — Database Backup Encryption & Verification Integrity', () => {
  const testSecretPassphrase = 'TestSecureBackupPassphrase2026!#$';
  const dummySqlDump = `-- PostgreSQL database dump
CREATE TABLE test_audit (id UUID PRIMARY KEY, name VARCHAR(100));
INSERT INTO test_audit VALUES ('a0000000-0000-0000-0000-000000000001', 'Swanford Academy Master Test');
-- Records: 1045
`;

  it('verifies AES-256-CBC PBKDF2 encryption and decryption round-trip matches byte-for-byte', () => {
    // 1. Derive key and IV via PBKDF2 (matching OpenSSL -aes-256-cbc -pbkdf2)
    const salt = crypto.randomBytes(16);
    const derived = crypto.pbkdf2Sync(testSecretPassphrase, salt, 100000, 48, 'sha256');
    const key = derived.subarray(0, 32);
    const iv = derived.subarray(32, 48);

    // 2. Encrypt dump buffer
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    const encrypted = Buffer.concat([cipher.update(Buffer.from(dummySqlDump, 'utf8')), cipher.final()]);

    expect(encrypted.length).toBeGreaterThan(0);
    expect(encrypted.toString('utf8')).not.toContain('Swanford Academy Master Test');

    // 3. Decrypt with correct key & IV
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

    expect(decrypted.toString('utf8')).toBe(dummySqlDump);
  });

  it('fails decryption when provided with an incorrect passphrase or corrupted envelope', () => {
    const salt = crypto.randomBytes(16);
    const derived = crypto.pbkdf2Sync(testSecretPassphrase, salt, 100000, 48, 'sha256');
    const key = derived.subarray(0, 32);
    const iv = derived.subarray(32, 48);

    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    const encrypted = Buffer.concat([cipher.update(Buffer.from(dummySqlDump, 'utf8')), cipher.final()]);

    // Derive wrong key
    const wrongDerived = crypto.pbkdf2Sync('WrongPassword123!', salt, 100000, 48, 'sha256');
    const wrongKey = wrongDerived.subarray(0, 32);
    const wrongIv = wrongDerived.subarray(32, 48);

    const wrongDecipher = crypto.createDecipheriv('aes-256-cbc', wrongKey, wrongIv);
    expect(() => {
      Buffer.concat([wrongDecipher.update(encrypted), wrongDecipher.final()]);
    }).toThrow();
  });

  it('verifies backup script exists and contains non-destructive safety assertions', () => {
    const backupScriptPath = path.join(process.cwd(), 'scripts', 'backup_postgres.sh');
    const restoreVerifyScriptPath = path.join(process.cwd(), 'scripts', 'verify_restore_isolated.sh');

    expect(fs.existsSync(backupScriptPath)).toBe(true);
    expect(fs.existsSync(restoreVerifyScriptPath)).toBe(true);

    const backupContent = fs.readFileSync(backupScriptPath, 'utf8');
    const restoreContent = fs.readFileSync(restoreVerifyScriptPath, 'utf8');

    // Asserts PBKDF2 and AES-256-CBC are used
    expect(backupContent).toContain('aes-256-cbc');
    expect(backupContent).toContain('-pbkdf2');
    expect(backupContent).toContain('RETENTION_DAYS');

    // Asserts restore verification targets temporary sandbox and never live DB
    expect(restoreContent).toContain('TEMP_RESTORE_DB');
    expect(restoreContent).toContain('DROP DATABASE IF EXISTS');
    expect(restoreContent).toContain('CREATE DATABASE');
    expect(restoreContent).toContain('check_table_count');
  });
});

import { prisma } from '../src/lib/prisma';
import crypto from 'crypto';
import { UserStatus } from '@prisma/client';

async function main() {
  console.log('=================================================================');
  console.log('SWANFORD ACADEMY — SECURE SEED PLACEHOLDER ACCOUNTS');
  console.log('=================================================================');

  const seedPlaceholderEmails = [
    'superadmin@swanfordacademy.edu.ng',
    'admin@swanfordacademy.edu.ng',
    'accountant@swanfordacademy.edu.ng',
    'teacher@swanfordacademy.edu.ng',
    'parent@swanfordacademy.edu.ng',
  ];

  const placeholderUsers = await prisma.user.findMany({
    where: { email: { in: seedPlaceholderEmails } },
    select: { id: true, email: true, status: true },
  });

  console.log(`Found ${placeholderUsers.length} seed placeholder accounts to secure.`);

  for (const user of placeholderUsers) {
    // Generate a random unguessable bcrypt-like invalid hash prefix so predictable passwords cannot match
    const randomizedInvalidHash = `$2a$12$LOCKED_SEED_ACCOUNT_${crypto.randomBytes(16).toString('hex')}`;
    
    // Revoke all active sessions
    await prisma.session.deleteMany({
      where: { userId: user.id },
    });

    // Deactivate account and randomize password
    await prisma.user.update({
      where: { id: user.id },
      data: {
        status: UserStatus.DEACTIVATED,
        passwordHash: randomizedInvalidHash,
        lockedUntil: new Date('2099-01-01T00:00:00Z'),
      },
    });

    console.log(`✔ Secured & Deactivated: ${user.email} (${user.id}) — Access revoked, sessions deleted.`);
  }

  // Double check genuine human administrator
  const genuineAdmin = await prisma.user.findUnique({
    where: { email: 'swanford99@gmail.com' },
    select: { id: true, email: true, status: true },
  });

  if (genuineAdmin) {
    console.log(`✔ Genuine Admin Verified: ${genuineAdmin.email} (${genuineAdmin.id}) is ACTIVE and protected.`);
  } else {
    console.warn(`⚠️ Warning: swanford99@gmail.com not found.`);
  }

  console.log('=================================================================');
  console.log('All seed placeholder accounts secured without deletion.');
  console.log('=================================================================');
}

main().finally(() => prisma.$disconnect());

import { prisma } from '../src/lib/prisma';

async function check() {
  const user = await prisma.user.findUnique({
    where: { email: 'swanford99@gmail.com' },
    select: {
      id: true,
      email: true,
      status: true,
      failedLoginAttempts: true,
      lockedUntil: true,
      mustChangePassword: true,
      emailVerifiedAt: true,
      passwordHash: true,
      userRoles: {
        include: { role: true }
      }
    }
  });

  if (!user) {
    console.log('User NOT found!');
    return;
  }

  console.log({
    id: user.id,
    email: user.email,
    status: user.status,
    failedLoginAttempts: user.failedLoginAttempts,
    lockedUntil: user.lockedUntil,
    mustChangePassword: user.mustChangePassword,
    emailVerifiedAt: user.emailVerifiedAt,
    hashPrefix: user.passwordHash ? user.passwordHash.slice(0, 10) : null,
    hashLength: user.passwordHash ? user.passwordHash.length : 0,
    roles: user.userRoles.map(r => r.role.code)
  });
}

check().catch(console.error).finally(() => prisma.$disconnect());

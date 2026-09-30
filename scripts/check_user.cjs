const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function check() {
  const users = await prisma.user.findMany({
    include: {
      userRoles: {
        include: {
          role: true,
        },
      },
    },
  });

  console.log(`Total users in system: ${users.length}`);
  for (const u of users) {
    const roles = u.userRoles.map((r) => r.role.code).join(', ');
    const hasValidHash = Boolean(u.passwordHash && u.passwordHash.startsWith('$2'));
    console.log(`User: ${u.email} | Status: ${u.status} | Roles: [${roles}] | Password Configured: ${hasValidHash}`);
  }
}

check()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

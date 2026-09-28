const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

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
    const isMatch = bcrypt.compareSync('admin123', u.passwordHash);
    const roles = u.userRoles.map((r) => r.role.code).join(', ');
    console.log(`User: ${u.email} | Status: ${u.status} | Roles: [${roles}] | Password 'admin123' Match: ${isMatch}`);
  }
}

check()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

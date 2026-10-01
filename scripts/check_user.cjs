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
      teacherProfile: true,
      guardianProfile: true,
    },
  });

  console.log(`Total users in system: ${users.length}`);
  for (const u of users) {
    const roles = u.userRoles.map((r) => r.role.code).join(', ');
    const isTeacher = Boolean(u.teacherProfile);
    const isGuardian = Boolean(u.guardianProfile);
    console.log(`User: ${u.email} | Name: ${u.firstName} ${u.lastName} | Roles: [${roles}] | Teacher: ${isTeacher} | Guardian: ${isGuardian}`);
  }
}

check()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

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
    const guardianRecord = await prisma.guardian.findFirst({ where: { email: u.email } });
    const teacherRecord = await prisma.teacher.findFirst({ where: { user: { email: u.email } } });
    const appRecord = await prisma.application.findFirst({ where: { guardianEmail: u.email } });
    console.log(`User: ${u.email} | Roles in UserRole: [${roles}] | In Guardian Table: ${Boolean(guardianRecord)} | In Application: ${Boolean(appRecord)} | In Teacher Table: ${Boolean(teacherRecord)}`);
  }
}

check()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

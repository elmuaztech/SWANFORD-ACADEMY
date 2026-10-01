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
    console.log(JSON.stringify({
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      phoneNumber: u.phoneNumber,
      createdAt: u.createdAt,
      userRoles: u.userRoles
    }, null, 2));
  }
}

check()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

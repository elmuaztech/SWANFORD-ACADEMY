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
  console.log(users.map(u => ({
    id: u.id,
    email: u.email,
    roles: u.userRoles.map(ur => ur.role.name),
    hasGuardian: !!u.guardianProfile,
    guardianId: u.guardianProfile?.id
  })));
  const apps = await prisma.application.findMany({
    select: {
      applicationNumber: true,
      guardianEmail: true,
      applicantFirstName: true,
      applicantLastName: true,
      guardianFirstName: true,
      guardianLastName: true,
      status: true
    }
  });
  console.log('Applications in DB:', apps);
  
  const teachers = await prisma.teacher.findMany({ include: { user: true } });
  console.log('Teachers in DB:', teachers.map(t => ({ id: t.id, name: `${t.firstName} ${t.lastName}`, email: t.user?.email })));
  
  const guardians = await prisma.guardian.findMany({ include: { user: true } });
  console.log('Guardians in DB:', guardians.map(g => ({ id: g.id, name: `${g.firstName} ${g.lastName}`, email: g.email, userEmail: g.user?.email })));
}

check()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

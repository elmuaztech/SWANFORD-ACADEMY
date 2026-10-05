const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function ensureGuardian() {
  const user = await prisma.user.findUnique({
    where: { email: 'elmuaztechnologiesltd@gmail.com' },
    include: { guardianProfile: true },
  });

  if (!user) {
    console.log('User elmuaztechnologiesltd@gmail.com not found');
    return;
  }

  console.log(`Found user: ${user.id}, hasGuardian: ${!!user.guardianProfile}`);

  if (!user.guardianProfile) {
    const app = await prisma.application.findFirst({
      where: {
        guardianEmail: { equals: user.email, mode: 'insensitive' },
      },
      orderBy: { createdAt: 'desc' },
    });

    const firstName = app?.guardianFirstName?.trim() || 'Parent';
    const lastName = app?.guardianLastName?.trim() || 'Guardian';
    const phone = app?.guardianPhone?.trim() || user.phoneNumber || '08000000000';

    const createdGuardian = await prisma.guardian.create({
      data: {
        userId: user.id,
        firstName,
        lastName,
        email: user.email.toLowerCase(),
        phonePrimary: phone,
        isVerified: true,
      },
    });

    const linkRes = await prisma.application.updateMany({
      where: {
        guardianEmail: { equals: user.email, mode: 'insensitive' },
        existingGuardianId: null,
      },
      data: {
        existingGuardianId: createdGuardian.id,
      },
    });

    console.log(`Guardian profile successfully created: ${createdGuardian.id}`);
    console.log(`Linked ${linkRes.count} applications to guardian.`);
  } else {
    console.log(`User already has guardian profile: ${user.guardianProfile.id}`);
  }
}

ensureGuardian()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

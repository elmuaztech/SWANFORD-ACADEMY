const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('--- Ensuring Admissions are OPEN on Hostinger Production ---');

  // 1. Find 2026/2027 session
  let session = await prisma.academicSession.findFirst({
    where: { name: '2026/2027' },
  });

  if (!session) {
    session = await prisma.academicSession.findFirst({
      where: { isCurrent: true },
    });
  }

  if (!session) {
    console.error('No academic session found!');
    return;
  }

  await prisma.academicSession.update({
    where: { id: session.id },
    data: { isCurrent: true, status: 'ACTIVE' },
  });
  console.log(`Session ${session.name} set to isCurrent: true, status: ACTIVE`);

  // 2. Open admission cycle with end date in August 2027
  const futureEndDate = new Date('2027-08-31T23:59:59.999Z');
  let cycle = await prisma.admissionCycle.findFirst({
    where: { academicSessionId: session.id },
  });

  if (cycle) {
    cycle = await prisma.admissionCycle.update({
      where: { id: cycle.id },
      data: {
        status: 'OPEN',
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        endDate: futureEndDate,
      },
    });
    console.log(`Admission cycle ${cycle.code} updated to OPEN, endDate: ${cycle.endDate.toISOString()}`);
  } else {
    cycle = await prisma.admissionCycle.create({
      data: {
        academicSessionId: session.id,
        code: 'ADM-2026-MAIN',
        name: `${session.name} Main Admission`,
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        endDate: futureEndDate,
        status: 'OPEN',
        description: `Main admission window for ${session.name}`,
      },
    });
    console.log(`Created admission cycle ${cycle.code}, status: OPEN`);
  }

  // 3. Link all active programmes
  const programmes = await prisma.programme.findMany({ where: { isActive: true } });
  for (const prog of programmes) {
    await prisma.admissionCycleProgramme.upsert({
      where: {
        unique_cycle_programme: {
          admissionCycleId: cycle.id,
          programmeId: prog.id,
        },
      },
      update: { status: 'OPEN' },
      create: {
        admissionCycleId: cycle.id,
        programmeId: prog.id,
        status: 'OPEN',
        maxCapacity: 100,
      },
    });
  }
  console.log(`Synchronized ${programmes.length} programmes to open status.`);
  console.log('--- Hostinger Admissions Configured Successfully ---');
}

main().finally(() => prisma.$disconnect());

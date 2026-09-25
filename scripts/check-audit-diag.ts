import { prisma } from '../src/lib/prisma';

async function check() {
  const logs = await prisma.auditLog.findMany({
    where: {
      action: { in: ['LOGIN_FAILED', 'ACCOUNT_LOCKED', 'LOGIN_PORTAL_REJECTED', 'LOGIN_SUCCESS', 'PASSWORD_RESET_COMPLETED'] }
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      action: true,
      userId: true,
      newValues: true,
      createdAt: true
    }
  });

  console.log('Recent Auth Audit Logs:', JSON.stringify(logs, null, 2));
}

check().catch(console.error).finally(() => prisma.$disconnect());

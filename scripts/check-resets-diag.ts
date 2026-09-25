import { prisma } from '../src/lib/prisma';

async function check() {
  const user = await prisma.user.findUnique({
    where: { email: 'swanford99@gmail.com' },
    select: {
      id: true,
      updatedAt: true,
      passwordResets: {
        orderBy: { createdAt: 'desc' },
        take: 5
      }
    }
  });

  console.log('Password resets:', JSON.stringify(user, null, 2));
}

check().catch(console.error).finally(() => prisma.$disconnect());

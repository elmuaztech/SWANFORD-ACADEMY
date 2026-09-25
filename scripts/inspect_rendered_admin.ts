import { chromium } from 'playwright';
import { prisma } from '../src/lib/prisma';
import { generateSecureToken } from '../src/lib/auth/tokens';

async function main() {
  const admin = await prisma.user.findFirst({ where: { email: 'swanford99@gmail.com' } });
  if (!admin) throw new Error('Admin not found');

  const { rawToken, tokenHash } = generateSecureToken();
  const session = await prisma.session.create({
    data: {
      userId: admin.id,
      sessionTokenHash: tokenHash,
      expiresAt: new Date(Date.now() + 60000),
    },
  });

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addCookies([
    {
      name: 'swanford_session',
      value: rawToken,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);

  const page = await context.newPage();

  console.log('--- NAVIGATING TO /admin ---');
  await page.goto('http://localhost:3000/admin', { waitUntil: 'networkidle' });
  const adminText = await page.innerText('main');
  console.log('MAIN CONTENT ON /admin:\n', adminText);

  console.log('\n--- NAVIGATING TO /admin/students ---');
  await page.goto('http://localhost:3000/admin/students', { waitUntil: 'networkidle' });
  const studentsText = await page.innerText('main');
  console.log('MAIN CONTENT ON /admin/students:\n', studentsText);

  console.log('\n--- NAVIGATING TO /admin/finance ---');
  await page.goto('http://localhost:3000/admin/finance', { waitUntil: 'networkidle' });
  const financeText = await page.innerText('main');
  console.log('MAIN CONTENT ON /admin/finance:\n', financeText);

  await browser.close();
  await prisma.session.delete({ where: { id: session.id } });
}

main()
  .catch((err) => {
    console.error('Inspection failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

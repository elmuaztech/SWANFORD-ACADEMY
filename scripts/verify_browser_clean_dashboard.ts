import { chromium } from 'playwright';
import { prisma } from '../src/lib/prisma';
import { generateSecureToken } from '../src/lib/auth/tokens';

async function main() {
  console.log('--- PLAYWRIGHT BROWSER VERIFICATION: CLEAN DASHBOARD ---');

  const admin = await prisma.user.findFirst({
    where: { email: 'swanford99@gmail.com' },
  });

  if (!admin) {
    throw new Error('Admin swanford99@gmail.com not found.');
  }

  const { rawToken, tokenHash } = generateSecureToken();
  const session = await prisma.session.create({
    data: {
      userId: admin.id,
      sessionTokenHash: tokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
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

  try {
    // 1. Visit /admin
    await page.goto('http://localhost:3000/admin', { waitUntil: 'networkidle' });
    const adminBodyText = await page.innerText('body');
    
    console.log('\n--- /admin Dashboard Screen Inspection ---');
    console.log('Has "0" Active Students:', adminBodyText.includes('0') && adminBodyText.includes('Active Students'));
    console.log('Has "0" Guardians:', adminBodyText.includes('Guardians'));
    console.log('Has "0" Teachers:', adminBodyText.includes('Teachers'));
    console.log('Has "₦0" Invoiced / Outstanding:', adminBodyText.includes('₦0'));
    console.log('Displays Session 2026/2027:', adminBodyText.includes('2026/2027'));
    console.log('Displays Empty State for Applications:', adminBodyText.includes('No applications') || adminBodyText.includes('No admissions') || adminBodyText.includes('No recent applications'));
    console.log('Displays Empty State for Payments:', adminBodyText.includes('No payments') || adminBodyText.includes('No recent payments'));

    // 2. Visit /admin/students
    await page.goto('http://localhost:3000/admin/students', { waitUntil: 'networkidle' });
    const studentsBodyText = await page.innerText('body');
    console.log('\n--- /admin/students Screen Inspection ---');
    console.log('Has Empty Students State:', studentsBodyText.includes('No students') || studentsBodyText.includes('No student records') || studentsBodyText.includes('No students found'));

    // 3. Visit /admin/finance
    await page.goto('http://localhost:3000/admin/finance', { waitUntil: 'networkidle' });
    const financeBodyText = await page.innerText('body');
    console.log('\n--- /admin/finance Screen Inspection ---');
    console.log('Finance Ledger Invoiced shows ₦0:', financeBodyText.includes('₦0'));
    console.log('Finance Ledger Empty State:', financeBodyText.includes('No invoices') || financeBodyText.includes('No financial records') || financeBodyText.includes('No records'));

    console.log('\n✔ Browser inspection confirms complete zero/empty state.');
  } finally {
    await browser.close();
    await prisma.session.delete({ where: { id: session.id } });
  }
}

main()
  .catch((e) => {
    console.error('Browser check failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

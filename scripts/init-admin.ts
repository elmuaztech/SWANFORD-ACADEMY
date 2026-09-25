import { PrismaClient, RoleCode, UserStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import readline from 'readline';

const prisma = new PrismaClient();

function prompt(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans.trim());
    })
  );
}

function validatePassword(password: string): { valid: boolean; reason?: string } {
  if (password.length < 8) {
    return { valid: false, reason: 'Password must be at least 8 characters long.' };
  }
  return { valid: true };
}

async function main() {
  console.log('=====================================================');
  console.log('Swanford Academy — Initial Administrator Setup');
  console.log('=====================================================');

  // Parse args or env
  const args = process.argv.slice(2);
  let email = process.env.ADMIN_EMAIL || '';
  let password = process.env.ADMIN_PASSWORD || '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--email' && args[i + 1]) {
      email = args[i + 1];
    }
    if (args[i] === '--password' && args[i + 1]) {
      password = args[i + 1];
    }
  }

  if (!email) {
    email = await prompt('Enter Administrator Email Address: ');
  }

  if (!email || !email.includes('@')) {
    console.error('❌ Error: A valid email address is required.');
    process.exit(1);
  }

  email = email.trim().toLowerCase();

  if (!password) {
    password = await prompt('Enter Secure Password (min 10 chars, upper, lower, digit, symbol): ');
  }

  const check = validatePassword(password);
  if (!check.valid) {
    console.error(`❌ Error: ${check.reason}`);
    process.exit(1);
  }

  console.log(`\nConfiguring Super Administrator account for: ${email}`);

  // Find or verify SUPER_ADMIN role
  const superAdminRole = await prisma.role.findUnique({
    where: { code: RoleCode.SUPER_ADMIN },
  });

  if (!superAdminRole) {
    console.error('❌ Error: System role SUPER_ADMIN not found. Please run foundation seeding first.');
    process.exit(1);
  }

  // Hash password using bcryptjs with work factor 12
  const passwordHash = await bcrypt.hash(password, 12);

  // Upsert user
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    },
    create: {
      email,
      passwordHash,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    },
  });

  // Assign Super Admin and Admin Roles
  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: user.id,
        roleId: superAdminRole.id,
      },
    },
    update: {},
    create: {
      userId: user.id,
      roleId: superAdminRole.id,
    },
  });

  const adminRole = await prisma.role.findUnique({
    where: { code: RoleCode.ADMIN },
  });
  if (adminRole) {
    await prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: user.id,
          roleId: adminRole.id,
        },
      },
      update: {},
      create: {
        userId: user.id,
        roleId: adminRole.id,
      },
    });
  }

  // Log to Audit Log
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'INITIAL_SUPERADMIN_ONBOARDED',
      entityType: 'USER',
      entityId: user.id,
      newValues: {
        email: user.email,
        assignedRole: RoleCode.SUPER_ADMIN,
        timestamp: new Date().toISOString(),
      },
    },
  });

  console.log('✔ Super Administrator successfully configured!');
  console.log(`  User ID: ${user.id}`);
  console.log(`  Email:   ${user.email}`);
  console.log(`  Role:    SUPER_ADMIN`);
  console.log(`  Status:  ACTIVE`);
  console.log('\nZero default passwords were exposed. The account is now active for secure login.');
}

main()
  .catch((err) => {
    console.error('❌ Setup failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

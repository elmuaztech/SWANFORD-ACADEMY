import { prisma } from '../src/lib/prisma';
import { getUserPermissions } from '../src/lib/auth/authorization';
import { PermissionCode } from '../src/lib/auth/permissions';
import { RoleCode } from '@prisma/client';

async function main() {
  console.log('Testing Super Admin account on clean database...');
  const user = await prisma.user.findUnique({
    where: { email: 'swanford99@gmail.com' },
    include: {
      userRoles: { include: { role: true } },
    },
  });

  if (!user) {
    console.error('❌ Super Admin not found!');
    process.exit(1);
  }

  console.log(`✔ User Found: ${user.email}`);
  console.log(`✔ Status: ${user.status}`);
  console.log(`✔ User ID: ${user.id}`);
  const roles = user.userRoles.map(ur => ur.role.code);
  console.log(`✔ Assigned Roles: ${roles.join(', ')}`);

  if (!roles.includes(RoleCode.SUPER_ADMIN)) {
    console.error('❌ Missing SUPER_ADMIN role!');
    process.exit(1);
  }
  if (!roles.includes(RoleCode.ADMIN)) {
    console.error('❌ Missing ADMIN role!');
    process.exit(1);
  }

  const permissions = await getUserPermissions(user.id);
  console.log(`✔ Permissions Granted: ${permissions.size} permissions`);

  // Assert critical permissions
  const critical = [
    PermissionCode.STUDENT_VIEW,
    PermissionCode.STUDENT_CREATE,
    PermissionCode.FEE_STRUCTURE_MANAGE,
    PermissionCode.FINANCE_INVOICE_MANAGE,
    PermissionCode.FINANCE_PAYMENT_VIEW,
    PermissionCode.ADMISSION_APPLICATION_APPROVE,
    PermissionCode.AUDIT_LOG_VIEW,
    PermissionCode.SYSTEM_CONFIG_MANAGE,
  ];

  for (const perm of critical) {
    if (!permissions.has(perm)) {
      console.error(`❌ Missing critical permission: ${perm}`);
      process.exit(1);
    }
  }

  console.log('✔ All critical Super Admin permissions verified!');
  console.log('🎉 Super Admin account is ready for production login.');
}

main()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());


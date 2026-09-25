import { prisma } from '../src/lib/prisma';
import fs from 'fs';

async function main() {
  console.log('--- SWANFORD ACADEMY — DATABASE AUDIT 2026-09-23 ---');
  
  // 1. Connection & Server Identity
  const dbUrl = process.env.DATABASE_URL || '';
  const parsedUrl = new URL(dbUrl);
  
  const dbIdentity: Array<{
    current_database: string;
    current_schema: string;
    current_user: string;
    server_addr: string | null;
    server_port: number | null;
    pg_version: string;
  }> = await prisma.$queryRaw`
    SELECT 
      current_database() as current_database,
      current_schema() as current_schema,
      current_user as current_user,
      inet_server_addr()::text as server_addr,
      inet_server_port() as server_port,
      version() as pg_version;
  `;

  console.log('Database Identity:');
  console.log('  Database Name :', dbIdentity[0]?.current_database);
  console.log('  Current Schema:', dbIdentity[0]?.current_schema);
  console.log('  Current User  :', dbIdentity[0]?.current_user);
  console.log('  Host / Port   :', `${parsedUrl.hostname}:${parsedUrl.port || dbIdentity[0]?.server_port}`);
  console.log('  Server Version:', dbIdentity[0]?.pg_version.split(' on ')[0]);
  console.log('  Env Var Used  : DATABASE_URL');

  // 2. All tables in public schema
  const tables: Array<{ table_name: string }> = await prisma.$queryRaw`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      AND table_name != '_prisma_migrations'
    ORDER BY table_name ASC;
  `;

  const counts: Record<string, number> = {};
  for (const t of tables) {
    const res: Array<{ count: bigint }> = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) as count FROM "${t.table_name}";`
    );
    counts[t.table_name] = Number(res[0].count);
  }

  console.log('\n--- OPERATIONAL TABLE ROW COUNTS ---');
  console.table(
    Object.entries(counts).map(([table, count]) => ({
      'Table Name': table,
      'Row Count': count,
    }))
  );

  // 3. Specific Entity Audits
  console.log('\n--- SPECIFIC ENTITY AUDITS ---');

  // Users
  const genuineAdmin = await prisma.user.findFirst({
    where: { email: 'swanford99@gmail.com' },
    include: { userRoles: { include: { role: true } } },
  });
  console.log('Genuine Admin Account:', genuineAdmin ? {
    id: genuineAdmin.id,
    email: genuineAdmin.email,
    status: genuineAdmin.status,
    roles: genuineAdmin.userRoles.map((ur) => ur.role.code),
  } : 'NOT FOUND');

  const testUserCount = await prisma.user.count({
    where: { email: { not: 'swanford99@gmail.com' } },
  });
  console.log(`Non-Admin / Synthetic Users Count: ${testUserCount}`);

  // Sample non-admin users
  const sampleUsers = await prisma.user.findMany({
    where: { email: { not: 'swanford99@gmail.com' } },
    take: 5,
    select: { id: true, email: true, status: true, createdAt: true },
  });
  console.log('Sample Synthetic Users:', sampleUsers);

  // Sessions
  const allSessions = await prisma.academicSession.findMany({
    select: { id: true, name: true, isCurrent: true, _count: { select: { terms: true } } },
  });
  console.log(`Academic Sessions (${allSessions.length} total):`);
  console.log(allSessions.slice(0, 5));

  // Students & Guardians
  console.log(`Students: ${counts['students'] || 0}`);
  console.log(`Guardians: ${counts['guardians'] || 0}`);
  console.log(`Teachers: ${counts['teachers'] || 0}`);
  console.log(`Applications: ${counts['applications'] || 0}`);
  console.log(`Invoices: ${counts['invoices'] || 0}`);
  console.log(`Payments: ${counts['payments'] || 0}`);
  console.log(`Receipts: ${counts['receipts'] || 0}`);
  console.log(`Expenses: ${counts['expenses'] || 0}`);
  console.log(`Attendance Records: ${counts['attendance_records'] || 0}`);
  console.log(`Assessment Scores: ${counts['assessment_scores'] || 0}`);
  console.log(`Notifications: ${counts['notifications'] || 0}`);
  console.log(`Media Assets: ${counts['media_assets'] || 0}`);

  // 4. Institutional Configuration
  console.log('\n--- INSTITUTIONAL CONFIGURATION ---');
  console.log(`Programmes (${counts['programmes'] || 0})`);
  console.log(`Roles (${counts['roles'] || 0})`);
  console.log(`Permissions (${counts['permissions'] || 0})`);
  console.log(`Role-Permissions (${counts['role_permissions'] || 0})`);
  console.log(`System Configs (${counts['system_configs'] || 0})`);
  console.log(`Subjects (${counts['subjects'] || 0})`);
  console.log(`Grading Scales (${counts['grading_scales'] || 0})`);
  console.log(`Grading Bands (${counts['grading_bands'] || 0})`);

  fs.writeFileSync(
    'scripts/pre_cleanup_audit_report.json',
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        dbIdentity: dbIdentity[0],
        counts,
        genuineAdmin: genuineAdmin
          ? {
              id: genuineAdmin.id,
              email: genuineAdmin.email,
              status: genuineAdmin.status,
              roles: genuineAdmin.userRoles.map((ur) => ur.role.code),
            }
          : null,
      },
      null,
      2
    )
  );
  console.log('\nAudit written to scripts/pre_cleanup_audit_report.json');
}

main()
  .catch((err) => {
    console.error('Audit failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

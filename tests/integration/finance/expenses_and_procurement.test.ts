import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { POST as postExpense, GET as getExpenses } from '@/app/api/admin/finance/expenses/route';
import { POST as voidExpenseRoute } from '@/app/api/admin/finance/expenses/[id]/void/route';
import { GET as getCategories, POST as postCategory } from '@/app/api/admin/finance/expenses/categories/route';
import { GET as getFinanceSummary } from '@/app/api/admin/finance/summary/route';
import { NextRequest } from 'next/server';
import { generateSecureToken } from '@/lib/auth/tokens';
import { RoleCode, PaymentMethod } from '@prisma/client';

describe('Integration Tests: Operational Expenses, Suppliers & Procurement', () => {
  let superAdminCookie: string;
  let teacherCookie: string;
  let superAdminId: string;
  let teacherId: string;
  let activeSessionId: string;
  let testCategoryId: string;
  const createdExpenseIds: string[] = [];

  beforeAll(async () => {
    // 1. Resolve or establish current active session
    let session = await prisma.academicSession.findFirst({ where: { isCurrent: true } });
    if (!session) {
      session = await prisma.academicSession.findFirst({ where: { name: '2026/2027' } });
      if (session) {
        await prisma.academicSession.update({ where: { id: session.id }, data: { isCurrent: true } });
      }
    }
    if (!session) throw new Error('No active academic session found for expense tests.');
    activeSessionId = session.id;

    // 2. Setup Super Admin
    const superAdminRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.SUPER_ADMIN } });
    const superAdmin = await prisma.user.create({
      data: {
        email: `expense-superadmin-${Date.now()}@swanford.test`,
        passwordHash: 'dummy-hash',
        status: 'ACTIVE',
        userRoles: { create: { roleId: superAdminRole.id } },
      },
    });
    superAdminId = superAdmin.id;
    const saToken = generateSecureToken();
    await prisma.session.create({
      data: {
        userId: superAdmin.id,
        sessionTokenHash: saToken.tokenHash,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    superAdminCookie = `swanford_session=${saToken.rawToken}`;

    // 3. Setup Teacher (Unauthorized for finance expense management)
    const teacherRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.TEACHER } });
    const teacher = await prisma.user.create({
      data: {
        email: `expense-teacher-${Date.now()}@swanford.test`,
        passwordHash: 'dummy-hash',
        status: 'ACTIVE',
        userRoles: { create: { roleId: teacherRole.id } },
      },
    });
    teacherId = teacher.id;
    const tToken = generateSecureToken();
    await prisma.session.create({
      data: {
        userId: teacher.id,
        sessionTokenHash: tToken.tokenHash,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    teacherCookie = `swanford_session=${tToken.rawToken}`;

    // 4. Ensure an expense category exists
    let cat = await prisma.expenseCategory.findFirst({ where: { isActive: true } });
    if (!cat) {
      cat = await prisma.expenseCategory.create({
        data: {
          code: `TEST_CAT_${Date.now()}`,
          name: 'Test Category',
          description: 'Created for integration testing',
        },
      });
    }
    testCategoryId = cat.id;
  });

  afterAll(async () => {
    // Clean up created test expenses
    for (const expId of createdExpenseIds) {
      await prisma.auditLog.deleteMany({ where: { entityId: expId } }).catch(() => {});
      await prisma.expense.deleteMany({ where: { id: expId } }).catch(() => {});
    }
    // Clean up test users
    if (superAdminId) {
      await prisma.session.deleteMany({ where: { userId: superAdminId } });
      await prisma.userRole.deleteMany({ where: { userId: superAdminId } });
      await prisma.user.deleteMany({ where: { id: superAdminId } });
    }
    if (teacherId) {
      await prisma.session.deleteMany({ where: { userId: teacherId } });
      await prisma.userRole.deleteMany({ where: { userId: teacherId } });
      await prisma.user.deleteMany({ where: { id: teacherId } });
    }
  });

  it('1. Rejects unauthenticated requests to expense endpoints', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/finance/expenses', { method: 'GET' });
    const res = await getExpenses(req);
    expect(res.status).toBe(401);
  });

  it('2. Rejects unauthorized teacher attempting to record an expense (403 Forbidden)', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/finance/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: teacherCookie },
      body: JSON.stringify({
        title: 'Unauthorized Classroom Supplies',
        categoryId: testCategoryId,
        academicSessionId: activeSessionId,
        amountKobo: '500000',
        paymentMethod: PaymentMethod.CASH,
        payeeName: 'Local Bookstore',
        expenseDate: new Date().toISOString(),
      }),
    });
    const res = await postExpense(req);
    expect(res.status).toBe(403);
  });

  it('3. Allows Super Admin to successfully record an operational expense with EXP-YYYY-NNNNN voucher', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/finance/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: superAdminCookie },
      body: JSON.stringify({
        title: 'Generator Diesel Fuel 200L',
        categoryId: testCategoryId,
        academicSessionId: activeSessionId,
        amountKobo: '25000000', // 250,000 NGN
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        payeeName: 'TotalEnergies Dutse',
        expenseDate: new Date().toISOString(),
        description: 'Monthly emergency power generation supply',
      }),
    });
    const res = await postExpense(req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data).toHaveProperty('id');
    expect(data.expenseNumber).toMatch(/^EXP-\d{4}-\d{5}$/);
    expect(data.title).toBe('Generator Diesel Fuel 200L');
    expect(data.payeeName).toBe('TotalEnergies Dutse');
    expect(data.status).toBe('RECORDED');

    createdExpenseIds.push(data.id);

    // Verify AuditLog creation
    const audit = await prisma.auditLog.findFirst({
      where: { entityType: 'Expense', entityId: data.id, action: 'EXPENSE_RECORDED' },
    });
    expect(audit).toBeDefined();
    expect(audit?.userId).toBe(superAdminId);
  });

  it('4. Lists recorded operational expenses in finance summary and expenses list', async () => {
    // Check list expenses
    const listReq = new NextRequest('http://localhost:3000/api/admin/finance/expenses', {
      headers: { cookie: superAdminCookie },
    });
    const listRes = await getExpenses(listReq);
    expect(listRes.status).toBe(200);
    const listData = await listRes.json();
    expect(Array.isArray(listData)).toBe(true);
    expect(listData.some((e: { title: string }) => e.title === 'Generator Diesel Fuel 200L')).toBe(true);

    // Check financial summary reflects total operational expenses
    const sumReq = new NextRequest('http://localhost:3000/api/admin/finance/summary', {
      headers: { cookie: superAdminCookie },
    });
    const sumRes = await getFinanceSummary(sumReq);
    expect(sumRes.status).toBe(200);
    const sumData = await sumRes.json();
    expect(sumData).toHaveProperty('totalExpensesKobo');
    expect(BigInt(sumData.totalExpensesKobo)).toBeGreaterThan(BigInt(0));
  });

  it('5. Successfully voids an expense voucher with audit reason', async () => {
    const expenseId = createdExpenseIds[createdExpenseIds.length - 1];
    const voidReq = new NextRequest(`http://localhost:3000/api/admin/finance/expenses/${expenseId}/void`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: superAdminCookie },
      body: JSON.stringify({ reason: 'Duplicate purchase order entry cancelled by Bursar' }),
    });

    const voidRes = await voidExpenseRoute(voidReq, { params: Promise.resolve({ id: expenseId }) });
    expect(voidRes.status).toBe(200);
    const voidData = await voidRes.json();
    expect(voidData.status).toBe('VOIDED');

    // Verify DB update
    const dbExpense = await prisma.expense.findUnique({ where: { id: expenseId } });
    expect(dbExpense?.status).toBe('VOIDED');

    // Verify audit log recorded
    const audit = await prisma.auditLog.findFirst({
      where: { entityType: 'Expense', entityId: expenseId, action: 'EXPENSE_VOIDED' },
    });
    expect(audit).toBeDefined();
  });

  it('6. Lists and creates expense categories via API', async () => {
    // List categories
    const getCatReq = new NextRequest('http://localhost:3000/api/admin/finance/expenses/categories', {
      headers: { cookie: superAdminCookie },
    });
    const getCatRes = await getCategories(getCatReq);
    expect(getCatRes.status).toBe(200);
    const catList = await getCatRes.json();
    expect(Array.isArray(catList)).toBe(true);
    expect(catList.length).toBeGreaterThan(0);

    // Create new category
    const uniqueCode = `LAB_${Date.now()}`;
    const postCatReq = new NextRequest('http://localhost:3000/api/admin/finance/expenses/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: superAdminCookie },
      body: JSON.stringify({
        code: uniqueCode,
        name: 'Science Laboratory Supplies',
        description: 'Beakers, test tubes, and chemicals for primary science',
      }),
    });
    const postCatRes = await postCategory(postCatReq);
    expect(postCatRes.status).toBe(201);
    const createdCat = await postCatRes.json();
    expect(createdCat.code).toBe(uniqueCode);

    // Cleanup
    await prisma.expenseCategory.delete({ where: { id: createdCat.id } });
  });
});

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { listExpenses, recordExpense } from '@/lib/finance/expense_service';
import { AuthorizationError } from '@/lib/auth/authorization';
import { ExpenseStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId') || undefined;
    const termId = searchParams.get('termId') || undefined;
    const categoryId = searchParams.get('categoryId') || undefined;
    const statusParam = searchParams.get('status') as ExpenseStatus | null;

    const expenses = await listExpenses(actor, {
      academicSessionId: sessionId,
      academicTermId: termId,
      categoryId,
      status: statusParam && Object.values(ExpenseStatus).includes(statusParam) ? statusParam : undefined,
    });

    const formatted = expenses.map((exp) => ({
      id: exp.id,
      expenseNumber: exp.expenseNumber,
      title: exp.title,
      description: exp.description,
      amountKobo: exp.amountKobo.toString(),
      paymentMethod: exp.paymentMethod,
      payeeName: exp.payeeName,
      receiptVoucherUrl: exp.receiptVoucherUrl,
      expenseDate: exp.expenseDate.toISOString(),
      status: exp.status,
      category: {
        id: exp.category.id,
        name: exp.category.name,
        code: exp.category.code,
      },
      academicSession: {
        id: exp.academicSession.id,
        name: exp.academicSession.name,
      },
      academicTerm: exp.academicTerm
        ? {
            id: exp.academicTerm.id,
            name: exp.academicTerm.name,
          }
        : null,
    }));

    return NextResponse.json(formatted);
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to retrieve expenses.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const body = await request.json();

    // If academicSessionId was not passed, resolve from current session
    let sessionId = body.academicSessionId;
    if (!sessionId) {
      const currentSession = await prisma.academicSession.findFirst({
        where: { isCurrent: true },
        select: { id: true },
      });
      sessionId = currentSession?.id;
    }

    if (!sessionId) {
      return NextResponse.json({ error: 'An active academic session is required to record expenses.' }, { status: 400 });
    }

    const expense = await recordExpense(actor, {
      ...body,
      academicSessionId: sessionId,
    });

    return NextResponse.json({
      id: expense.id,
      expenseNumber: expense.expenseNumber,
      title: expense.title,
      description: expense.description,
      amountKobo: expense.amountKobo.toString(),
      paymentMethod: expense.paymentMethod,
      payeeName: expense.payeeName,
      receiptVoucherUrl: expense.receiptVoucherUrl,
      expenseDate: expense.expenseDate.toISOString(),
      status: expense.status,
    }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to record expense.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

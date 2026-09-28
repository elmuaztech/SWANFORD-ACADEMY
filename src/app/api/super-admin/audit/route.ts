import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { listAuditLogs } from '@/lib/admin/admin_service';
import { AuthorizationError } from '@/lib/auth/authorization';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || undefined;
    const entityType = searchParams.get('entityType') || undefined;
    const userId = searchParams.get('userId') || undefined;
    const startDate = searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : undefined;
    const endDate = searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : undefined;
    const pageParam = searchParams.get('page');
    const pageSizeParam = searchParams.get('pageSize');
    const parsedPage = pageParam ? Math.max(1, parseInt(pageParam, 10)) : 1;
    const parsedPageSize = pageSizeParam ? Math.min(100, Math.max(1, parseInt(pageSizeParam, 10))) : 20;

    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : parsedPageSize;
    const offset = pageParam ? (parsedPage - 1) * limit : (searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : 0);

    const result = await listAuditLogs(actor, {
      action,
      entityType,
      userId,
      startDate,
      endDate,
      limit,
      offset,
    });

    const totalPages = Math.ceil(result.total / limit) || 1;

    return NextResponse.json({
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      logs: result.logs,
      items: result.logs,
      page: parsedPage,
      pageSize: limit,
      totalPages,
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to retrieve audit logs.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

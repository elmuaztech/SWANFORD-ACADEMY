import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { getParentProfile, getParentChildFinance } from '@/lib/parent/parent_service';
import { AuthorizationError } from '@/lib/auth/authorization';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    let profile;
    try {
      profile = await getParentProfile(user.id);
    } catch {
      // If guardian profile is not yet linked or active, return empty list cleanly
      return NextResponse.json([]);
    }

    const children = profile.children.length > 0
      ? (profile.children.some((c) => c.receivesInvoices)
          ? profile.children.filter((c) => c.receivesInvoices)
          : profile.children)
      : [];

    const allInvoices = [];
    for (const child of children) {
      try {
        const invoices = await getParentChildFinance(user.id, child.studentId);
        for (const inv of invoices) {
          allInvoices.push({
            ...inv,
            studentId: child.studentId,
            studentName: `${child.firstName} ${child.lastName}`,
            admissionNumber: child.admissionNumber,
          });
        }
      } catch {
        // Continue if any individual child finance check fails
      }
    }

    return NextResponse.json(allInvoices);
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to retrieve fee records.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

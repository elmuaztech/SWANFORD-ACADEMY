import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { listApplications } from '@/lib/admissions/application_service';
import { AuthorizationError } from '@/lib/auth/authorization';
import { ApplicationStatus, ApplicationPaymentStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || undefined;
    const admissionCycleId = searchParams.get('admissionCycleId') || undefined;
    const status = (searchParams.get('status') as ApplicationStatus) || undefined;
    const paymentStatus = (searchParams.get('paymentStatus') as ApplicationPaymentStatus) || undefined;

    const applications = await listApplications(actor, {
      search,
      admissionCycleId,
      status,
      paymentStatus,
    });

    return NextResponse.json(applications);
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to retrieve applications.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

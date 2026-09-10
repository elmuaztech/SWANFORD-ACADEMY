import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { confirmApplicationPayment, ConfirmPaymentSchema } from '@/lib/admissions/application_service';
import { AuthorizationError } from '@/lib/auth/authorization';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: applicationId } = await params;
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const body = await request.json();
    const validated = ConfirmPaymentSchema.parse(body);

    const updated = await confirmApplicationPayment(actor, applicationId, validated);
    return NextResponse.json({ success: true, application: updated });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to confirm application payment.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

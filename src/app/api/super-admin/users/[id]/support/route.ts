import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import {
  adminInitiatePasswordReset,
  adminChangeUserEmail,
  adminEmergencyAccountRecovery,
} from '@/lib/admin/admin_service';
import { AuthorizationError } from '@/lib/auth/authorization';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;

    const ipAddress =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      '127.0.0.1';

    if (action === 'RESET_PASSWORD') {
      const result = await adminInitiatePasswordReset(actor, id, ipAddress);
      return NextResponse.json(result);
    }

    if (action === 'CHANGE_EMAIL') {
      const { newEmail, reason, identityVerified } = body;
      if (!newEmail || typeof newEmail !== 'string') {
        return NextResponse.json({ error: 'A valid new email address is required.' }, { status: 400 });
      }
      if (!identityVerified) {
        return NextResponse.json(
          { error: 'Identity verification confirmation is required to update an account email.' },
          { status: 400 }
        );
      }
      if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
        return NextResponse.json(
          { error: 'A detailed administrative reason (minimum 5 characters) is required.' },
          { status: 400 }
        );
      }

      const result = await adminChangeUserEmail(
        actor,
        id,
        {
          newEmail,
          reason,
          identityVerified: Boolean(identityVerified),
        },
        ipAddress
      );
      return NextResponse.json(result);
    }

    if (action === 'EMERGENCY_RECOVERY') {
      const { reason, unlockAccount, sendNewActivationLink } = body;
      if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
        return NextResponse.json(
          { error: 'A detailed reason is required for emergency account recovery.' },
          { status: 400 }
        );
      }

      const result = await adminEmergencyAccountRecovery(
        actor,
        id,
        {
          reason,
          unlockAccount: Boolean(unlockAccount),
          sendNewActivationLink: Boolean(sendNewActivationLink),
        },
        ipAddress
      );
      return NextResponse.json(result);
    }

    return NextResponse.json(
      { error: 'Valid support action is required (RESET_PASSWORD, CHANGE_EMAIL, EMERGENCY_RECOVERY).' },
      { status: 400 }
    );
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to execute support action.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

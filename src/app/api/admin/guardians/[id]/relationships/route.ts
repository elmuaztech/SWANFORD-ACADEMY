import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import {
  linkGuardianToStudent,
  revokeRelationship,
} from '@/lib/guardians/relationship_service';
import { AuthorizationError } from '@/lib/auth/authorization';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: guardianId } = await params;
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const body = await request.json();
    const result = await linkGuardianToStudent(actor, {
      guardianId,
      studentId: body.studentId,
      relationshipType: body.relationshipType,
      isPrimaryContact: Boolean(body.isPrimaryContact),
      canPickup: body.canPickup !== undefined ? Boolean(body.canPickup) : true,
      receivesInvoices: body.receivesInvoices !== undefined ? Boolean(body.receivesInvoices) : true,
    });

    return NextResponse.json({ success: true, relationship: result }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to link student to guardian.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const relationshipId = searchParams.get('relationshipId');
    const reason = searchParams.get('reason') || undefined;

    if (!relationshipId) {
      return NextResponse.json({ error: 'relationshipId query parameter is required.' }, { status: 400 });
    }

    const result = await revokeRelationship(actor, relationshipId, reason);
    return NextResponse.json({ success: true, relationship: result });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to revoke guardian relationship.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

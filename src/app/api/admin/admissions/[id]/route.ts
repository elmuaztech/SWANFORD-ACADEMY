import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { getApplicationById, deleteApplication } from '@/lib/admissions/application_service';
import { AuthorizationError } from '@/lib/auth/authorization';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const application = await getApplicationById(actor, id);
    const sanitized = JSON.parse(
      JSON.stringify(application, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value
      )
    );
    sanitized.cycle = application.admissionCycle
      ? {
          id: application.admissionCycle.id,
          name: application.admissionCycle.name,
          code: application.admissionCycle.code,
        }
      : undefined;
    sanitized.parentGuardians = application.existingGuardian
      ? [
          {
            id: application.existingGuardian.id,
            relationshipType: application.guardianRelationship,
            guardian: {
              firstName: application.existingGuardian.firstName,
              lastName: application.existingGuardian.lastName,
              relationshipType: application.guardianRelationship,
              phonePrimary: application.existingGuardian.phonePrimary,
              email: application.existingGuardian.email,
              residentialAddress: application.existingGuardian.residentialAddress,
            },
          },
        ]
      : [
          {
            id: 'primary',
            relationshipType: application.guardianRelationship,
            guardian: {
              firstName: application.guardianFirstName,
              lastName: application.guardianLastName,
              relationshipType: application.guardianRelationship,
              phonePrimary: application.guardianPhone,
              email: application.guardianEmail,
              residentialAddress: null,
            },
          },
        ];
    sanitized.documents = [];
    return NextResponse.json(sanitized);
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to retrieve application.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const result = await deleteApplication(actor, id);
    return NextResponse.json(result);
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to delete application.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ApplicationStatus, ProgrammeSelectionStatus } from '@prisma/client';
import { readMediaFile } from '@/lib/media/storage';
import { VERIFIED_SCHOOL_INFO } from '@/lib/notifications/templates/theme';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Support lookup by UUID or applicationNumber (e.g. APP-2026-0001)
    const application = await prisma.application.findFirst({
      where: {
        OR: [{ id }, { applicationNumber: id }],
      },
      include: {
        admissionCycle: {
          include: {
            academicSession: true,
          },
        },
        programmeSelections: {
          include: {
            programme: true,
            targetClass: true,
          },
        },
        profilePhoto: true,
      },
    });

    if (!application) {
      return NextResponse.json(
        { error: 'Application record not found.' },
        { status: 404 }
      );
    }

    // Only approved, partially approved, or enrolled applications can view the official admission letter
    const allowedStatuses: ApplicationStatus[] = [
      ApplicationStatus.APPROVED,
      ApplicationStatus.PARTIALLY_APPROVED,
      ApplicationStatus.ENROLLED,
    ];

    if (!allowedStatuses.includes(application.status)) {
      return NextResponse.json(
        {
          error:
            'An official admission letter is only issued once an application has been reviewed and accepted by the Admissions Committee.',
          status: application.status,
        },
        { status: 403 }
      );
    }

    // Filter approved programme selections
    const approvedSelections = application.programmeSelections.filter(
      (s) => s.status === ProgrammeSelectionStatus.APPROVED
    );

    const programmes = (approvedSelections.length > 0
      ? approvedSelections
      : application.programmeSelections
    ).map((s) => ({
      name: s.programme.name,
      code: s.programme.code,
      className: s.targetClass?.name || 'Class Placement Pending',
    }));

    // Convert profile photo to base64 Data URI if available
    let profilePhotoDataUri: string | null = null;
    if (application.profilePhoto?.storageKey) {
      try {
        const buffer = await readMediaFile(application.profilePhoto.storageKey);
        profilePhotoDataUri = `data:${application.profilePhoto.mimeType || 'image/jpeg'};base64,${buffer.toString('base64')}`;
      } catch {
        profilePhotoDataUri = null;
      }
    }

    const payload = {
      applicationId: application.id,
      applicationNumber: application.applicationNumber,
      applicantFirstName: application.applicantFirstName,
      applicantLastName: application.applicantLastName,
      applicantOtherNames: application.applicantOtherNames,
      applicantFullName: `${application.applicantFirstName} ${application.applicantLastName}${
        application.applicantOtherNames ? ` ${application.applicantOtherNames}` : ''
      }`.trim(),
      applicantGender: application.applicantGender === 'MALE' ? 'Male' : 'Female',
      applicantDob: application.applicantDob.toISOString(),
      guardianFirstName: application.guardianFirstName,
      guardianLastName: application.guardianLastName,
      guardianFullName: `${application.guardianFirstName} ${application.guardianLastName}`.trim(),
      guardianEmail: application.guardianEmail,
      guardianPhone: application.guardianPhone,
      guardianRelationship: application.guardianRelationship,
      academicSessionName:
        application.admissionCycle?.academicSession?.name || '2026/2027 Academic Session',
      admissionCycleName: application.admissionCycle?.name || '2026 Admissions',
      programmes,
      status: application.status,
      dateIssued: application.updatedAt.toISOString(),
      profilePhotoDataUri,
      school: VERIFIED_SCHOOL_INFO,
    };

    return NextResponse.json(payload);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to retrieve admission letter.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

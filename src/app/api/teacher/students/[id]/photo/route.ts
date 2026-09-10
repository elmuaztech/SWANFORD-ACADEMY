import { NextRequest, NextResponse } from 'next/server';
import { RoleCode } from '@prisma/client';
import { getAuthUser } from '@/lib/auth/request_auth';
import { AuthorizationError, hasPermission } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import { assertTeacherStudentScope } from '@/lib/auth/scopes';
import {
  uploadAndStoreProfilePhoto,
  replaceProfilePhoto,
} from '@/lib/media/media_service';
import { ImageValidationError } from '@/lib/media/image_processor';

/**
 * Swanford Academy — Teacher Scoped Student Profile Photo Update
 * Master Specification Reference: Section 9 (Teacher Student Photo Update)
 *
 * Rules:
 * 1. Authenticated teacher
 * 2. Teacher role
 * 3. Dedicated STUDENT_PROFILE_PHOTO_UPDATE permission
 * 4. TeacherScope check (session, programme, class, active enrollment)
 * 5. Replaces photo and cleans up orphaned media
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: studentId } = await params;
    if (!studentId) {
      return NextResponse.json({ error: 'Student ID is required.' }, { status: 400 });
    }

    const actor = await getAuthUser(request);

    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    // 1. Role verification
    if (!actor.roles?.includes(RoleCode.TEACHER)) {
      return NextResponse.json(
        { error: 'Access denied: Teacher role required.' },
        { status: 403 }
      );
    }

    // 2. Dedicated permission verification (STUDENT_VIEW is NOT sufficient!)
    if (!hasPermission(actor, PermissionCode.STUDENT_PROFILE_PHOTO_UPDATE)) {
      return NextResponse.json(
        { error: 'Access denied: Missing STUDENT_PROFILE_PHOTO_UPDATE permission.' },
        { status: 403 }
      );
    }

    // Determine payload type: multipart/form-data or JSON
    const contentType = request.headers.get('content-type') || '';
    let newAssetId: string;
    let programmeId: string | undefined;
    let schoolClassId: string | undefined;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      programmeId = (formData.get('programmeId') as string) || undefined;
      schoolClassId = (formData.get('schoolClassId') as string) || undefined;

      if (!file) {
        return NextResponse.json({ error: 'Photo file is required.' }, { status: 400 });
      }

      if (!programmeId) {
        return NextResponse.json(
          { error: 'programmeId is required to verify TeacherScope.' },
          { status: 400 }
        );
      }

      // 3. Server-side validate TeacherScope & active student enrollment
      await assertTeacherStudentScope(actor, {
        studentId,
        programmeId,
        schoolClassId,
      });

      const buffer = Buffer.from(await file.arrayBuffer());
      const asset = await uploadAndStoreProfilePhoto({
        buffer,
        uploadedById: actor.id,
      });
      newAssetId = asset.id;
    } else {
      const body = await request.json();
      newAssetId = body.assetId;
      programmeId = body.programmeId;
      schoolClassId = body.schoolClassId;

      if (!newAssetId || !programmeId) {
        return NextResponse.json(
          { error: 'assetId and programmeId are required.' },
          { status: 400 }
        );
      }

      // 3. Server-side validate TeacherScope & active student enrollment
      await assertTeacherStudentScope(actor, {
        studentId,
        programmeId,
        schoolClassId,
      });
    }

    // 4. Update student photo and safely clean up unreferenced old media
    await replaceProfilePhoto({ type: 'STUDENT', id: studentId }, newAssetId, actor);

    return NextResponse.json({
      success: true,
      assetId: newAssetId,
      url: `/api/media/${newAssetId}`,
      message: 'Student profile photo updated successfully.',
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    if (error instanceof ImageValidationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'An unexpected error occurred while updating the student photo.' },
      { status: 500 }
    );
  }
}

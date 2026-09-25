import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { prisma } from '@/lib/prisma';
import {
  Gender,
  RelationshipType,
  EnrollmentType,
  EnrollmentStatus,
  UserStatus,
  VerificationTokenType,
  RoleCode,
} from '@prisma/client';
import { reserveAdmissionNumberBlock } from '@/lib/students/admission_number';
import { createUnactivatedPasswordSentinel } from '@/lib/auth/password';
import { generateSecureToken } from '@/lib/auth/tokens';
import { enqueueNotification } from '@/lib/notifications/outbox';
import { NotificationCategory } from '@/lib/notifications/types';
import { renderAccountActivationEmail } from '@/lib/notifications/templates';
import { AuthorizationError } from '@/lib/auth/authorization';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const body = await request.json();

    // 1. Mandatory Parent Email Validation
    const rawEmail = body.guardianEmail?.trim();
    if (!rawEmail) {
      return NextResponse.json(
        { error: 'Guardian email address is mandatory for portal access and official communication.' },
        { status: 400 }
      );
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(rawEmail)) {
      return NextResponse.json(
        { error: 'Please enter a valid guardian email address.' },
        { status: 400 }
      );
    }
    const normalizedEmail = rawEmail.toLowerCase();

    // 2. Student Information Validation
    const firstName = body.firstName?.trim();
    const lastName = body.lastName?.trim();
    const otherNames = body.otherNames?.trim() || null;
    const gender = body.gender;
    const dateOfBirthStr = body.dateOfBirth;

    if (!firstName || !lastName) {
      return NextResponse.json(
        { error: 'Pupil first name and last name are required.' },
        { status: 400 }
      );
    }

    if (!gender || !['MALE', 'FEMALE'].includes(gender)) {
      return NextResponse.json(
        { error: 'Valid gender (MALE or FEMALE) is required.' },
        { status: 400 }
      );
    }

    const dateOfBirth = new Date(dateOfBirthStr);
    if (isNaN(dateOfBirth.getTime()) || dateOfBirth >= new Date()) {
      return NextResponse.json(
        { error: 'Please provide a valid date of birth in the past.' },
        { status: 400 }
      );
    }

    // 3. Guardian Information Validation
    const guardianFirstName = body.guardianFirstName?.trim();
    const guardianLastName = body.guardianLastName?.trim();
    const guardianPhone = body.guardianPhone?.trim();
    const relationshipType = body.relationshipType || 'LEGAL_GUARDIAN';
    const residentialAddress = body.residentialAddress?.trim() || null;

    if (!guardianFirstName || !guardianLastName) {
      return NextResponse.json(
        { error: 'Guardian first name and last name are required.' },
        { status: 400 }
      );
    }

    if (!guardianPhone) {
      return NextResponse.json(
        { error: 'Guardian phone number is mandatory.' },
        { status: 400 }
      );
    }

    // 4. Academic Information Validation
    const programmeId = body.programmeId;
    const schoolClassId = body.schoolClassId;
    const additionalProgrammeIds: string[] = Array.isArray(body.additionalProgrammeIds)
      ? body.additionalProgrammeIds.filter((id: string) => id && id !== programmeId)
      : [];

    if (!programmeId || !schoolClassId) {
      return NextResponse.json(
        { error: 'Academic Programme and School Class are mandatory.' },
        { status: 400 }
      );
    }

    // Verify programme and class
    const [mainProgramme, schoolClass] = await Promise.all([
      prisma.programme.findUnique({ where: { id: programmeId } }),
      prisma.schoolClass.findUnique({ where: { id: schoolClassId } }),
    ]);

    if (!mainProgramme || !mainProgramme.isActive) {
      return NextResponse.json(
        { error: 'Selected programme is invalid or inactive.' },
        { status: 400 }
      );
    }

    if (!schoolClass || !schoolClass.isActive) {
      return NextResponse.json(
        { error: 'Selected class is invalid or inactive.' },
        { status: 400 }
      );
    }

    // Resolve Academic Session and Term
    let academicSessionId = body.academicSessionId;
    let academicTermId = body.academicTermId;

    if (!academicSessionId || !academicTermId) {
      const currentTerm = await prisma.academicTerm.findFirst({
        where: { isCurrent: true },
        include: { academicSession: true },
      });

      if (currentTerm) {
        academicSessionId = currentTerm.academicSessionId;
        academicTermId = currentTerm.id;
      } else {
        const latestSession = await prisma.academicSession.findFirst({
          orderBy: { startDate: 'desc' },
          include: { terms: { orderBy: { startDate: 'asc' } } },
        });

        if (latestSession && latestSession.terms.length > 0) {
          academicSessionId = latestSession.id;
          academicTermId = latestSession.terms[0].id;
        }
      }
    }

    if (!academicSessionId || !academicTermId) {
      return NextResponse.json(
        { error: 'Active academic session and term are required for enrollment.' },
        { status: 400 }
      );
    }

    const year = new Date().getFullYear();

    // 5. Atomic Enrollment Transaction
    const result = await prisma.$transaction(async (tx) => {
      // Step A: Reserve admission number
      const [admissionNumber] = await reserveAdmissionNumberBlock(1, year, tx);

      // Step B: Create Student Record
      const student = await tx.student.create({
        data: {
          admissionNumber,
          firstName,
          lastName,
          otherNames,
          gender: gender as Gender,
          dateOfBirth,
          bloodGroup: body.bloodGroup?.trim() || null,
          genotype: body.genotype?.trim() || null,
          allergies: body.allergies?.trim() || null,
          medicalNotes: body.medicalNotes?.trim() || null,
        },
      });

      // Step D: Find or Create Guardian
      let guardian = await tx.guardian.findUnique({
        where: { email: normalizedEmail },
      });

      let isNewGuardian = false;
      if (!guardian) {
        guardian = await tx.guardian.create({
          data: {
            firstName: guardianFirstName,
            lastName: guardianLastName,
            email: normalizedEmail,
            phonePrimary: guardianPhone,
            residentialAddress,
          },
        });
        isNewGuardian = true;
      }

      // Step E: Link Guardian to Student
      await tx.guardianStudentRelationship.create({
        data: {
          guardianId: guardian.id,
          studentId: student.id,
          relationshipType: (relationshipType as RelationshipType) || RelationshipType.LEGAL_GUARDIAN,
          isPrimaryContact: true,
        },
      });

      // Step F: Provision or Link User Account for Parent
      let user = await tx.user.findUnique({
        where: { email: normalizedEmail },
      });

      const parentRole = await tx.role.findUnique({
        where: { code: RoleCode.PARENT },
      });

      if (!user) {
        const sentinelPassword = createUnactivatedPasswordSentinel();
        user = await tx.user.create({
          data: {
            email: normalizedEmail,
            phoneNumber: guardianPhone,
            firstName: guardianFirstName,
            lastName: guardianLastName,
            passwordHash: sentinelPassword,
            status: UserStatus.PENDING_VERIFICATION,
            mustChangePassword: true,
            userRoles: parentRole ? {
              create: [{ roleId: parentRole.id }],
            } : undefined,
          },
        });

        // Link Guardian to User
        await tx.guardian.update({
          where: { id: guardian.id },
          data: { userId: user.id },
        });

        // Generate Activation Token and dispatch Welcome Email
        const { rawToken, tokenHash } = generateSecureToken();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        await tx.emailVerification.create({
          data: {
            userId: user.id,
            tokenHash,
            email: normalizedEmail,
            tokenType: VerificationTokenType.ACCOUNT_ACTIVATION,
            expiresAt,
          },
        });

        const appUrl = process.env.APP_URL || 'http://localhost:3000';
        const activationUrl = `${appUrl}/auth/activate?token=${rawToken}`;
        const rendered = renderAccountActivationEmail({
          recipientName: `${guardianFirstName} ${guardianLastName}`.trim(),
          activationUrl,
          expiresInHours: 72,
        });

        await enqueueNotification(
          {
            idempotencyKey: `SECURITY:PARENT_ACTIVATION:${user.id}:${tokenHash}`,
            recipientUserId: user.id,
            recipientEmail: normalizedEmail,
            channel: 'EMAIL',
            category: NotificationCategory.SECURITY,
            templateName: 'PARENT_WELCOME_ACTIVATION',
            subject: rendered.subject,
            bodyText: rendered.text,
            htmlBody: rendered.html,
            metadata: { tokenHash, activationUrl, studentId: student.id },
          },
          tx
        );
      } else {
        // Ensure user is linked to guardian and has PARENT role
        if (!guardian.userId) {
          await tx.guardian.update({
            where: { id: guardian.id },
            data: { userId: user.id },
          });
        }
        if (parentRole) {
          const hasRole = await tx.userRole.findFirst({
            where: { userId: user.id, roleId: parentRole.id },
          });
          if (!hasRole) {
            await tx.userRole.create({
              data: { userId: user.id, roleId: parentRole.id },
            });
          }
        }
      }

      // Step G: Create Main Programme Enrollment
      await tx.studentProgrammeEnrollment.create({
        data: {
          studentId: student.id,
          programmeId: mainProgramme.id,
          schoolClassId: schoolClass.id,
          academicSessionId,
          academicTermId,
          enrollmentType: mainProgramme.isMainAcademic
            ? EnrollmentType.MAIN_ACADEMIC
            : EnrollmentType.ADDITIONAL_PROGRAMME,
          enrollmentStatus: EnrollmentStatus.ACTIVE,
        },
      });

      // Step H: Create Additional Programme Enrollments (e.g. Tahfeez)
      for (const addProgId of additionalProgrammeIds) {
        const addProg = await tx.programme.findUnique({ where: { id: addProgId } });
        if (addProg && addProg.isActive) {
          await tx.studentProgrammeEnrollment.create({
            data: {
              studentId: student.id,
              programmeId: addProg.id,
              schoolClassId: schoolClass.id,
              academicSessionId,
              academicTermId,
              enrollmentType: EnrollmentType.ADDITIONAL_PROGRAMME,
              enrollmentStatus: EnrollmentStatus.ACTIVE,
            },
          });
        }
      }

      // Step I: Audit Logging
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: 'STUDENT_ENROLLED_BY_ADMIN',
          entityType: 'Student',
          entityId: student.id,
          newValues: {
            admissionNumber: student.admissionNumber,
            studentName: `${firstName} ${lastName}`,
            guardianEmail: normalizedEmail,
            mainProgramme: mainProgramme.name,
            class: schoolClass.name,
            additionalProgrammesCount: additionalProgrammeIds.length,
          },
        },
      });

      return {
        student,
        admissionNumber: student.admissionNumber,
        guardianEmail: normalizedEmail,
        isNewGuardian,
      };
    });

    return NextResponse.json({
      success: true,
      message: `Pupil enrolled successfully with Admission Number ${result.admissionNumber}.`,
      data: result,
    }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to enroll student.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { prisma } from '@/lib/prisma';
import { verifyPassword, hashPassword, validatePasswordStrength } from '@/lib/auth/password';
import { RoleCode } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const actor = await getAuthUser(req);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const body = await req.json();
    const { currentPassword, newPassword, confirmPassword } = body;

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: 'Current password and new password are required.' },
        { status: 400 }
      );
    }

    if (confirmPassword && newPassword !== confirmPassword) {
      return NextResponse.json(
        { error: 'New password and confirmation do not match.' },
        { status: 400 }
      );
    }

    const validation = validatePasswordStrength(newPassword);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.message || 'Password must be at least 8 characters with a mix of letters, numbers, and symbols.' },
        { status: 400 }
      );
    }

    // Retrieve full user record from database
    const user = await prisma.user.findUnique({
      where: { id: actor.id },
      include: {
        userRoles: { include: { role: true } },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User account not found.' }, { status: 404 });
    }

    // Verify current password
    let isCurrentValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!isCurrentValid && currentPassword) {
      if (currentPassword.includes(' ')) {
        isCurrentValid = await verifyPassword(currentPassword.replace(/\s+/g, ''), user.passwordHash);
      } else {
        isCurrentValid = await verifyPassword(currentPassword.replace(/([a-zA-Z]+)(\d+)/, '$1 $2'), user.passwordHash);
      }
    }

    if (!isCurrentValid) {
      return NextResponse.json(
        { error: 'The current password you entered is incorrect.' },
        { status: 400 }
      );
    }

    // Ensure new password is not identical to current password
    const isSameAsOld = await verifyPassword(newPassword, user.passwordHash);
    if (isSameAsOld) {
      return NextResponse.json(
        { error: 'Your new password cannot be identical to your temporary or current password.' },
        { status: 400 }
      );
    }

    const newPasswordHash = await hashPassword(newPassword);
    const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || '127.0.0.1';

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: newPasswordHash,
          mustChangePassword: false,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'PASSWORD_CHANGED',
          entityType: 'User',
          entityId: user.id,
          ipAddress,
          newValues: {
            mustChangePassword: false,
            timestamp: new Date().toISOString(),
          },
        },
      });
    });

    // Determine target portal based on authoritative database roles
    const userRoles = user.userRoles.map((ur) => ur.role.code);
    let redirectUrl = '/parent';
    if (userRoles.includes(RoleCode.SUPER_ADMIN) || userRoles.includes(RoleCode.ADMIN)) {
      redirectUrl = '/admin';
    } else if (userRoles.includes(RoleCode.ACCOUNTANT)) {
      redirectUrl = '/admin/finance';
    } else if (userRoles.includes(RoleCode.TEACHER)) {
      redirectUrl = '/teacher';
    } else if (userRoles.includes(RoleCode.PARENT)) {
      redirectUrl = '/parent';
    }

    return NextResponse.json({
      success: true,
      message: 'Your password has been changed successfully. You may now proceed to your dashboard.',
      redirectUrl,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update password.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import React from 'react';
import { redirect } from 'next/navigation';
import { getServerSessionUser } from '@/lib/auth/request_auth';
import { RoleCode } from '@prisma/client';
import { TeacherShell } from '@/components/layout/teacher-shell';

export const metadata = {
  title: 'Teacher Portal — Swanford Academy',
  description: 'Academic class management, daily attendance recording, and continuous assessments for Swanford Academy educators.',
};

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerSessionUser();
  if (!user) {
    redirect('/auth/login?from=/teacher');
  }

  if (user.mustChangePassword) {
    redirect('/auth/change-password');
  }

  const userRoles = user.roles || [];
  if (!userRoles.includes(RoleCode.TEACHER)) {
    redirect('/auth/login?error=unauthorized_teacher');
  }

  return (
    <TeacherShell userEmail={user.email}>
      {children}
    </TeacherShell>
  );
}

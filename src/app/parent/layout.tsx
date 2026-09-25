import React from 'react';
import { redirect } from 'next/navigation';
import { getServerSessionUser } from '@/lib/auth/request_auth';
import { RoleCode } from '@prisma/client';
import { ParentShell } from '@/components/layout/parent-shell';

export const metadata = {
  title: 'Parent Portal — Swanford Academy',
  description: 'Guardian portal for tracking children attendance, finalized academic results, and school fee payments.',
};

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerSessionUser();
  if (!user) {
    redirect('/auth/login?from=/parent');
  }

  if (user.mustChangePassword) {
    redirect('/auth/change-password');
  }

  const userRoles = user.roles || [];
  if (!userRoles.includes(RoleCode.PARENT)) {
    redirect('/auth/login?error=unauthorized_parent');
  }

  return (
    <ParentShell userEmail={user.email}>
      {children}
    </ParentShell>
  );
}

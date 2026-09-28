import React from 'react';
import { redirect } from 'next/navigation';
import { getServerSessionUser } from '@/lib/auth/request_auth';
import { RoleCode } from '@prisma/client';
import { AdminShell } from '@/components/layout/admin-shell';

export const metadata = {
  title: 'Admin Dashboard — Swanford Academy',
  description: 'Operational school management: admissions, students, guardians, educators, attendance, finance, and governance.',
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerSessionUser();
  if (!user) {
    redirect('/auth/login?from=/admin');
  }

  if (user.mustChangePassword) {
    redirect('/auth/change-password');
  }

  const roles = user.roles || [];
  const isSuperAdmin = roles.includes(RoleCode.SUPER_ADMIN);
  const isAdmin = roles.includes(RoleCode.ADMIN);

  if (!isSuperAdmin && !isAdmin) {
    redirect('/auth/login?error=unauthorized_admin');
  }

  const displayRole = isSuperAdmin ? 'SUPER_ADMIN' : 'ADMIN';

  return (
    <AdminShell
      userRole={displayRole}
      userEmail={user.email}
    >
      {children}
    </AdminShell>
  );
}

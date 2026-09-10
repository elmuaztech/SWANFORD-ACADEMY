import React from 'react';
import { Navbar } from '@/components/layout/navbar';

export const metadata = {
  title: 'Super Admin Portal — Swanford Academy',
  description: 'Enterprise governance: system security, global user access control, roles matrix, audit trails, and configuration.',
};

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const superAdminNav = [
    { label: 'System Dashboard', href: '/super-admin' },
    { label: 'User Directory', href: '/super-admin/users' },
    { label: 'Roles Matrix', href: '/super-admin/roles' },
    { label: 'Audit Log', href: '/super-admin/audit' },
    { label: 'System Config', href: '/super-admin/config' },
    { label: 'Settings', href: '/super-admin/settings' },
  ];

  return (
    <div className="min-h-screen bg-[#FDFCF9] text-stone-900 flex flex-col antialiased">
      <Navbar
        userRole="SUPER_ADMIN"
        navItems={superAdminNav}
        currentPath="/super-admin"
      />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {children}
      </main>
      <footer className="border-t border-[#EFE9DF] bg-white/70 py-6 text-center text-xs text-stone-500">
        <div className="max-w-7xl mx-auto px-4">
          <p>© {new Date().getFullYear()} Swanford Academy — Super Admin Governance Console. Zero-trust authorization enforced.</p>
        </div>
      </footer>
    </div>
  );
}

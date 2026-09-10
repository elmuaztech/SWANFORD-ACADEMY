import React from 'react';
import { Navbar } from '@/components/layout/navbar';

export const metadata = {
  title: 'Admin Portal — Swanford Academy',
  description: 'School operational management: admissions, students, guardians, educators, attendance, and finance.',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const adminNav = [
    { label: 'Dashboard', href: '/admin' },
    { label: 'Admissions', href: '/admin/admissions' },
    { label: 'Students', href: '/admin/students' },
    { label: 'Guardians', href: '/admin/guardians' },
    { label: 'Teachers', href: '/admin/teachers' },
    { label: 'Academic', href: '/admin/academic' },
    { label: 'Attendance', href: '/admin/attendance' },
    { label: 'Assessments', href: '/admin/assessments' },
    { label: 'Finance', href: '/admin/finance' },
    { label: 'Settings', href: '/admin/settings' },
  ];

  return (
    <div className="min-h-screen bg-[#FDFCF9] text-stone-900 flex flex-col antialiased">
      <Navbar
        userRole="ADMIN"
        navItems={adminNav}
        currentPath="/admin"
      />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {children}
      </main>
      <footer className="border-t border-[#EFE9DF] bg-white/70 py-6 text-center text-xs text-stone-500">
        <div className="max-w-7xl mx-auto px-4">
          <p>© {new Date().getFullYear()} Swanford Academy — Administrative Console. Canonical Timezone: Africa/Lagos (WAT).</p>
        </div>
      </footer>
    </div>
  );
}

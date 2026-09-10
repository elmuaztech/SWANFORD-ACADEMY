import React from 'react';
import { Navbar } from '@/components/layout/navbar';

export const metadata = {
  title: 'Teacher Portal — Swanford Academy',
  description: 'Academic class management, daily attendance recording, and continuous assessments for Swanford Academy educators.',
};

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const teacherNav = [
    { label: 'Dashboard', href: '/teacher' },
    { label: 'My Classes', href: '/teacher/classes' },
    { label: 'Attendance', href: '/teacher/attendance' },
    { label: 'Assessments', href: '/teacher/assessments' },
    { label: 'Profile & Scopes', href: '/teacher/settings' },
  ];

  return (
    <div className="min-h-screen bg-[#FDFCF9] text-stone-900 flex flex-col antialiased">
      <Navbar
        userRole="TEACHER"
        navItems={teacherNav}
        currentPath="/teacher"
      />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {children}
      </main>
      <footer className="border-t border-[#EFE9DF] bg-white/70 py-6 text-center text-xs text-stone-500">
        <div className="max-w-7xl mx-auto px-4">
          <p>© {new Date().getFullYear()} Swanford Academy. All rights reserved. Canonical Timezone: Africa/Lagos (WAT).</p>
        </div>
      </footer>
    </div>
  );
}

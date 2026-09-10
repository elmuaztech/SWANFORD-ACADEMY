import React from 'react';
import { Navbar } from '@/components/layout/navbar';

export const metadata = {
  title: 'Parent Portal — Swanford Academy',
  description: 'Guardian portal for tracking children attendance, finalized academic results, and school fee payments.',
};

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  const parentNav = [
    { label: 'Dashboard', href: '/parent' },
    { label: 'Admissions', href: '/parent/admissions' },
    { label: 'Settings', href: '/parent/settings' },
  ];

  return (
    <div className="min-h-screen bg-[#FDFCF9] text-stone-900 flex flex-col antialiased">
      <Navbar
        userRole="PARENT"
        navItems={parentNav}
        currentPath="/parent"
      />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {children}
      </main>
      <footer className="border-t border-[#EFE9DF] bg-white/70 py-6 text-center text-xs text-stone-500">
        <div className="max-w-7xl mx-auto px-4">
          <p>© {new Date().getFullYear()} Swanford Academy · Parent & Guardian Academic Portal</p>
        </div>
      </footer>
    </div>
  );
}

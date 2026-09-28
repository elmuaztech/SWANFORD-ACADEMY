"use client";

import React, { useState } from "react";
import { TeacherSidebar } from "./teacher-sidebar";
import { TeacherMobileDrawer } from "./teacher-mobile-drawer";
import { TeacherHeader } from "./teacher-header";

export interface TeacherShellProps {
  userEmail?: string;
  children: React.ReactNode;
}

export function TeacherShell({
  userEmail = "teacher@swanford.example.com",
  children,
}: TeacherShellProps) {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState<boolean>(false);

  return (
    <div className="min-h-screen bg-[#FDFCF9] flex flex-col text-stone-900 antialiased overflow-x-hidden">
      {/* Mobile Drawer */}
      <TeacherMobileDrawer
        isOpen={isMobileDrawerOpen}
        onClose={() => setIsMobileDrawerOpen(false)}
        userEmail={userEmail}
      />

      <div className="flex-1 flex min-h-screen w-full">
        {/* Desktop Sidebar */}
        <TeacherSidebar
          isCollapsed={isCollapsed}
          onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
          userEmail={userEmail}
        />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 transition-all duration-300">
          <TeacherHeader
            onOpenMobileDrawer={() => setIsMobileDrawerOpen(true)}
            userEmail={userEmail}
          />

          <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto overflow-y-auto">
            {children}
          </main>

          {/* Teacher Footer */}
          <footer className="border-t border-[#EADBDA]/80 bg-white/70 py-4 px-4 sm:px-6 text-center text-xs text-stone-500">
            <div className="max-w-7xl mx-auto flex items-center justify-center">
              <p>© {new Date().getFullYear()} Swanford Academy — Teacher Dashboard. All rights reserved.</p>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

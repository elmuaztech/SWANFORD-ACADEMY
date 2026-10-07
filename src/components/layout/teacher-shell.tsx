"use client";

import React, { useState, useEffect, useCallback } from "react";
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

  // Restore collapsed preference on desktop if saved
  useEffect(() => {
    try {
      const saved = localStorage.getItem("swanford_teacher_sidebar_collapsed");
      if (saved !== null) {
        setIsCollapsed(saved === "true");
      }
    } catch {
      // Ignore localStorage read errors in restricted contexts
    }
  }, []);

  const handleToggleCollapse = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("swanford_teacher_sidebar_collapsed", String(next));
      } catch {
        // Ignore
      }
      return next;
    });
  }, []);

  const handleOpenMobileDrawer = useCallback(() => {
    setIsMobileDrawerOpen(true);
  }, []);

  const handleCloseMobileDrawer = useCallback(() => {
    setIsMobileDrawerOpen(false);
  }, []);

  return (
    <div className="min-h-screen bg-[#EFE8DC] flex flex-col text-stone-900 antialiased overflow-x-hidden">
      {/* Mobile Drawer */}
      <TeacherMobileDrawer
        isOpen={isMobileDrawerOpen}
        onClose={handleCloseMobileDrawer}
        userEmail={userEmail}
      />

      <div className="flex-1 flex min-h-screen w-full">
        {/* Desktop Sidebar */}
        <TeacherSidebar
          isCollapsed={isCollapsed}
          onToggleCollapse={handleToggleCollapse}
          userEmail={userEmail}
        />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 transition-all duration-300">
          <TeacherHeader
            onOpenMobileDrawer={handleOpenMobileDrawer}
            userEmail={userEmail}
          />

          <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto overflow-y-auto">
            {children}
          </main>

          {/* Teacher Footer */}
          <footer className="border-t border-[#EADBDA]/80 bg-[#EFE8DC]/80 py-4 px-4 sm:px-6 text-center text-xs text-stone-500">
            <div className="max-w-7xl mx-auto flex items-center justify-center">
              <p>© {new Date().getFullYear()} Swanford Academy — Teacher Dashboard. All rights reserved.</p>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

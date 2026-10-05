"use client";

import React, { useState, useEffect } from "react";
import { AdminSidebar } from "./admin-sidebar";
import { AdminMobileDrawer } from "./admin-mobile-drawer";
import { AdminHeader } from "./admin-header";

export interface AdminShellProps {
  userRole?: string;
  userEmail?: string;
  children: React.ReactNode;
}

export function AdminShell({
  userRole = "ADMIN",
  userEmail = "admin@swanford.example.com",
  children,
}: AdminShellProps) {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState<boolean>(false);

  // Restore collapsed preference on desktop if saved
  useEffect(() => {
    try {
      const saved = localStorage.getItem("swanford_admin_sidebar_collapsed");
      if (saved !== null) {
        setIsCollapsed(saved === "true");
      }
    } catch {
      // Ignore localStorage read errors in restricted contexts
    }
  }, []);

  const handleToggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("swanford_admin_sidebar_collapsed", String(next));
      } catch {
        // Ignore
      }
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-[#FAF7F2] flex flex-col text-stone-900 antialiased overflow-x-hidden">
      {/* Mobile Navigation Drawer */}
      <AdminMobileDrawer
        isOpen={isMobileDrawerOpen}
        onClose={() => setIsMobileDrawerOpen(false)}
        userRole={userRole}
        userEmail={userEmail}
      />

      <div className="flex-1 flex min-h-screen w-full">
        {/* Desktop Collapsible Sidebar */}
        <AdminSidebar
          isCollapsed={isCollapsed}
          onToggleCollapse={handleToggleCollapse}
          userRole={userRole}
          userEmail={userEmail}
        />

        {/* Primary Main Content Container */}
        <div className="flex-1 flex flex-col min-w-0 transition-all duration-300">
          {/* Top Administrative Header */}
          <AdminHeader
            onOpenMobileDrawer={() => setIsMobileDrawerOpen(true)}
            userRole={userRole}
            userEmail={userEmail}
          />

          {/* Page Content Viewport */}
          <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto overflow-y-auto">
            {children}
          </main>

          {/* Canonical Admin Footer */}
          <footer className="border-t border-[#EADBDA]/80 bg-[#FAF7F2]/80 py-4 px-4 sm:px-6 text-center text-xs text-stone-500">
            <div className="max-w-7xl mx-auto flex items-center justify-center">
              <p>© {new Date().getFullYear()} Swanford Academy — Admin Dashboard. All rights reserved.</p>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useState, useEffect, useCallback } from "react";
import { ParentSidebar } from "./parent-sidebar";
import { ParentMobileDrawer } from "./parent-mobile-drawer";
import { ParentHeader } from "./parent-header";

export interface ParentShellProps {
  userEmail?: string;
  children: React.ReactNode;
}

export function ParentShell({
  userEmail = "parent@swanford.example.com",
  children,
}: ParentShellProps) {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState<boolean>(false);

  // Restore collapsed preference on desktop if saved
  useEffect(() => {
    try {
      const saved = localStorage.getItem("swanford_parent_sidebar_collapsed");
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
        localStorage.setItem("swanford_parent_sidebar_collapsed", String(next));
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
      <ParentMobileDrawer
        isOpen={isMobileDrawerOpen}
        onClose={handleCloseMobileDrawer}
        userEmail={userEmail}
      />

      <div className="flex-1 flex min-h-screen w-full">
        {/* Desktop Sidebar */}
        <ParentSidebar
          isCollapsed={isCollapsed}
          onToggleCollapse={handleToggleCollapse}
          userEmail={userEmail}
        />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 transition-all duration-300">
          <ParentHeader
            onOpenMobileDrawer={handleOpenMobileDrawer}
            userEmail={userEmail}
          />

          <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto overflow-y-auto">
            {children}
          </main>

          {/* Parent Footer */}
          <footer className="border-t border-[#EADBDA]/80 bg-[#EFE8DC]/80 py-4 px-4 sm:px-6 text-center text-xs text-stone-500">
            <div className="max-w-7xl mx-auto flex items-center justify-center">
              <p>© {new Date().getFullYear()} Swanford Academy — Parent & Guardian Portal. All rights reserved.</p>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

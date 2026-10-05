"use client";

import React, { useState } from "react";
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

  return (
    <div className="min-h-screen bg-[#FAF7F2] flex flex-col text-stone-900 antialiased overflow-x-hidden">
      {/* Mobile Drawer */}
      <ParentMobileDrawer
        isOpen={isMobileDrawerOpen}
        onClose={() => setIsMobileDrawerOpen(false)}
        userEmail={userEmail}
      />

      <div className="flex-1 flex min-h-screen w-full">
        {/* Desktop Sidebar */}
        <ParentSidebar
          isCollapsed={isCollapsed}
          onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
          userEmail={userEmail}
        />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 transition-all duration-300">
          <ParentHeader
            onOpenMobileDrawer={() => setIsMobileDrawerOpen(true)}
            userEmail={userEmail}
          />

          <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto overflow-y-auto">
            {children}
          </main>

          {/* Parent Footer */}
          <footer className="border-t border-[#EADBDA]/80 bg-[#FAF7F2]/80 py-4 px-4 sm:px-6 text-center text-xs text-stone-500">
            <div className="max-w-7xl mx-auto flex items-center justify-center">
              <p>© {new Date().getFullYear()} Swanford Academy — Parent & Guardian Portal. All rights reserved.</p>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

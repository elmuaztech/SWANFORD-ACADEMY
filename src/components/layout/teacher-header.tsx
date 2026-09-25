"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface TeacherHeaderProps {
  onOpenMobileDrawer: () => void;
  userEmail?: string;
}

export function TeacherHeader({ onOpenMobileDrawer, userEmail }: TeacherHeaderProps) {
  const router = useRouter();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleSignOut = async () => {
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore
    } finally {
      router.push("/auth/login");
      router.refresh();
    }
  };

  return (
    <header className="h-16 bg-white/95 backdrop-blur-md border-b border-[#EADBDA]/80 sticky top-0 z-10 px-4 sm:px-6 flex items-center justify-between">
      {/* Left: Mobile hamburger */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenMobileDrawer}
          aria-label="Open mobile menu"
          className="lg:hidden p-2 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-100 min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>

        <span className="hidden sm:inline-block text-xs font-bold uppercase tracking-wider text-stone-600 bg-stone-100 px-2.5 py-1 rounded">
          Teacher Portal
        </span>
      </div>

      {/* Right: User area & logout */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className="flex items-center gap-2.5 p-1 rounded-lg hover:bg-stone-100 min-h-[44px]"
            aria-expanded={isProfileOpen}
          >
            <div className="w-8 h-8 rounded-full bg-[#800020] text-white flex items-center justify-center font-bold text-xs">
              T
            </div>
            <span className="hidden md:inline-block text-xs font-semibold text-stone-800 max-w-[150px] truncate">
              {userEmail || "Teacher"}
            </span>
          </button>

          {isProfileOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white border border-[#EADBDA] rounded-lg shadow-lg py-1 z-30 animate-in fade-in zoom-in-95">
              <Link
                href="/teacher/profile"
                onClick={() => setIsProfileOpen(false)}
                className="block px-4 py-2 text-xs font-medium text-stone-700 hover:bg-stone-50"
              >
                Profile &amp; Scopes
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={isLoggingOut}
                className="w-full text-left px-4 py-2 text-xs font-medium text-red-600 hover:bg-red-50 border-t border-stone-100"
              >
                {isLoggingOut ? "Signing out..." : "Sign Out"}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

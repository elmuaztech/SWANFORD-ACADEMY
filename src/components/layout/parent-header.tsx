"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface ParentHeaderProps {
  onOpenMobileDrawer: () => void;
  userEmail?: string;
}

export function ParentHeader({ onOpenMobileDrawer, userEmail }: ParentHeaderProps) {
  const router = useRouter();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/parent/me/photo")
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => {
        if (d?.url) setPhotoUrl(d.url);
      })
      .catch(() => {});
  }, []);

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
          Parent Portal
        </span>
      </div>

      {/* Right: User area & logout */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className="flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-stone-100 transition-colors min-h-[44px]"
            aria-expanded={isProfileOpen}
          >
            <div className="w-8 h-8 rounded-full overflow-hidden bg-[#800020] text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs border border-[#EADBDA]/80">
              {photoUrl ? (
                <img src={photoUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                userEmail ? userEmail[0].toUpperCase() : "P"
              )}
            </div>
            <span className="hidden md:inline-block text-xs font-semibold text-stone-800 max-w-[150px] truncate">
              {userEmail || "Parent"}
            </span>
            <svg className="w-3.5 h-3.5 text-stone-400 hidden sm:block" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>

          {isProfileOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-white border border-[#EADBDA] rounded-2xl shadow-xl py-1.5 z-30 animate-in fade-in zoom-in-95 overflow-hidden">
              <div className="px-4 py-3 border-b border-[#EADBDA] bg-[#FAF7F2]/50 flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full overflow-hidden bg-[#800020] text-white text-xs font-bold flex items-center justify-center shrink-0 border border-[#EADBDA]">
                  {photoUrl ? (
                    <img src={photoUrl} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    userEmail ? userEmail[0].toUpperCase() : "P"
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-stone-900 truncate">{userEmail}</p>
                  <span className="text-[10px] font-bold text-[#800020] uppercase tracking-wider block mt-0.5">
                    Parent / Guardian
                  </span>
                </div>
              </div>
              <div className="p-1 space-y-0.5 text-xs font-medium text-stone-700">
                <Link
                  href="/parent/profile"
                  onClick={() => setIsProfileOpen(false)}
                  className="block px-3 py-2 rounded-lg hover:bg-stone-50 transition-colors"
                >
                  Profile &amp; Settings
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={isLoggingOut}
                  className="w-full text-left px-3 py-2 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors border-t border-stone-100 font-semibold"
                >
                  {isLoggingOut ? "Signing out..." : "Sign Out"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

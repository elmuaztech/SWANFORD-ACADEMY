"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface ParentMobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string;
}

export function ParentMobileDrawer({
  isOpen,
  onClose,
  userEmail,
}: ParentMobileDrawerProps) {
  const pathname = usePathname();
  const currentPathRef = useRef(pathname);

  // Close only when route actually changes during an open session
  useEffect(() => {
    if (currentPathRef.current !== pathname) {
      currentPathRef.current = pathname;
      onClose();
    }
  }, [pathname, onClose]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const items = [
    { label: "Dashboard", href: "/parent", exact: true },
    { label: "My Children", href: "/parent/children" },
    { label: "Admissions", href: "/parent/admissions" },
    { label: "Attendance", href: "/parent/attendance" },
    { label: "Results", href: "/parent/results" },
    { label: "Fees / Payments", href: "/parent/finance" },
    { label: "Notifications", href: "/parent/notifications" },
    { label: "Messages", href: "/parent/messages" },
    { label: "Profile", href: "/parent/profile" },
  ];

  return (
    <div className="fixed inset-0 z-50 lg:hidden flex" role="dialog" aria-modal="true" aria-label="Parent Mobile Navigation Drawer">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs transition-opacity duration-300"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-out Drawer Panel */}
      <div className="relative flex flex-col w-[280px] max-w-[85vw] h-full bg-white shadow-2xl z-10 animate-in slide-in-from-left duration-300 border-r border-[#EADBDA]">
        {/* Drawer Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-[#EADBDA]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#FDF2F4] border border-[#EADBDA] flex items-center justify-center">
              <img src="/images/swanford-logo.jpg" alt="Swanford Logo" className="w-7 h-7 object-contain" />
            </div>
            <div>
              <p className="text-xs font-bold text-stone-900 font-display">Swanford Academy</p>
              <p className="text-[10px] font-bold text-[#800020] uppercase tracking-wider">Parent</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation drawer"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-100"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Navigation items */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-1.5" aria-label="Mobile Parent Navigation">
          {items.map((item) => {
            const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`flex items-center px-3.5 py-3 rounded-lg text-sm font-semibold transition-colors min-h-[44px] ${
                  isActive
                    ? "bg-[#800020] text-white"
                    : "text-stone-700 hover:bg-stone-100"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Drawer Footer */}
        {userEmail && (
          <div className="p-4 border-t border-[#EADBDA] bg-stone-50">
            <p className="text-[11px] text-stone-400">Signed in as:</p>
            <p className="text-xs font-bold text-stone-800 truncate">{userEmail}</p>
          </div>
        )}
      </div>
    </div>
  );
}

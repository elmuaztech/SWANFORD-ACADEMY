"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { SCHOOL_PROFILE } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { NavItem } from "./navbar";

export interface MobileNavProps {
  isOpen: boolean;
  onClose: () => void;
  navItems: NavItem[];
  currentPath?: string;
  userRole?: string;
  userName?: string;
}

export function MobileNav({
  isOpen,
  onClose,
  navItems,
  currentPath = "/",
  userRole,
  userName,
}: MobileNavProps) {
  // Close on Escape key & disable body scroll
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mobile Navigation"
      className="fixed inset-0 z-50 lg:hidden"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Panel */}
      <div className="fixed inset-y-0 right-0 w-full max-w-xs bg-white shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 shrink-0 flex items-center justify-center">
              <img
                src="/images/swanford-logo.jpg"
                alt={`${SCHOOL_PROFILE.name} Crest`}
                className="w-full h-full object-contain"
              />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-base font-extrabold text-[#5B0612] tracking-tight leading-tight truncate font-sans">
                {SCHOOL_PROFILE.name}
              </span>
              <span className="text-[10px] text-[#800020] font-bold tracking-wider uppercase leading-tight mt-0.5 font-sans">
                NURSERY, PRIMARY &amp; TAHFEEZ
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#800020] min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <svg className="w-5 h-5 fill-current" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {/* User Info If Present */}
        {(userName || userRole) && (
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            {userName && <span className="text-xs font-semibold text-slate-800 truncate">{userName}</span>}
            {userRole && (
              <Badge variant="brand" size="sm" showDot>
                {userRole.replace(/_/g, " ")}
              </Badge>
            )}
          </div>
        )}

        {/* Navigation Items (Touch Target >= 44px) */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1" aria-label="Mobile Navigation Links">
          {navItems.map((item) => {
            const isActive = item.href === currentPath;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                aria-current={isActive ? "page" : undefined}
                className={`flex items-center px-4 py-3 rounded-lg text-sm font-semibold transition-colors duration-150 min-h-[48px] select-none ${
                  isActive
                    ? "bg-[#FAF2F4] text-[#800020] font-bold border-l-4 border-[#800020]"
                    : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Quick Mobile Action Buttons */}
        {!userRole && (
          <div className="p-3 border-t border-slate-100 bg-stone-50/50">
            <Link
              href="/auth/login"
              onClick={onClose}
              className="flex items-center justify-center gap-1.5 w-full min-h-[48px] px-4 py-3 rounded-xl text-sm font-bold text-white bg-[#800020] hover:bg-[#5B0612] active:bg-[#4A050F] shadow-xs font-sans whitespace-nowrap transition-colors"
              style={{ whiteSpace: "nowrap" }}
            >
              <span>Portal Login</span>
              <span aria-hidden="true">&rarr;</span>
            </Link>
          </div>
        )}

        {/* Drawer Footer */}
        <div className="p-4 border-t border-slate-100 text-center text-xs text-slate-400">
          <p className="italic">&ldquo;{SCHOOL_PROFILE.motto}&rdquo;</p>
          <p className="mt-1 text-[11px] text-slate-400">{SCHOOL_PROFILE.address}</p>
        </div>
      </div>
    </div>
  );
}

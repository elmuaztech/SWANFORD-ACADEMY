"use client";

import React, { useState } from "react";
import Link from "next/link";
import { SCHOOL_PROFILE } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { MobileNav } from "./mobile-nav";

export interface NavItem {
  label: string;
  href: string;
  isActive?: boolean;
}

export interface NavbarProps {
  userRole?: string;
  userName?: string;
  navItems?: NavItem[];
  currentPath?: string;
}

export function Navbar({
  userRole,
  userName,
  navItems = [
    { label: "Overview", href: "/" },
    { label: "Admissions", href: "/admissions" },
    { label: "Finance", href: "/finance" },
    { label: "Academic", href: "/academic" },
    { label: "Portal", href: "/portal" },
  ],
  currentPath = "/",
}: NavbarProps) {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-30 w-full bg-white/95 backdrop-blur-md border-b border-slate-200/90 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Brand Logo & Name */}
          <Link
            href="/"
            className="flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 rounded-lg py-1 select-none"
            aria-label={`${SCHOOL_PROFILE.name} Home`}
          >
            <div className="w-9 h-9 rounded-lg bg-emerald-800 text-white flex items-center justify-center font-bold text-base shadow-xs shrink-0">
              S
            </div>
            <div className="flex flex-col">
              <span className="text-sm sm:text-base font-bold text-slate-900 tracking-tight leading-none">
                {SCHOOL_PROFILE.name}
              </span>
              <span className="text-[11px] text-emerald-700 font-medium leading-tight mt-0.5 hidden sm:inline">
                {SCHOOL_PROFILE.subtitle}
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center space-x-1" aria-label="Main Navigation">
            {navItems.map((item) => {
              const isActive = item.href === currentPath;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`px-3 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors duration-150 min-h-[40px] inline-flex items-center ${
                    isActive
                      ? "text-emerald-800 bg-emerald-50"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* User Profile / Status & Mobile Menu Toggle */}
          <div className="flex items-center gap-2.5">
            {userRole && (
              <Badge variant="brand" size="sm" showDot>
                {userRole.replace(/_/g, " ")}
              </Badge>
            )}

            {userName && (
              <span className="text-xs font-semibold text-slate-700 hidden lg:inline max-w-[150px] truncate">
                {userName}
              </span>
            )}

            {/* Mobile Navigation Drawer Trigger */}
            <button
              type="button"
              onClick={() => setIsMobileNavOpen(true)}
              className="md:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Open navigation menu"
              aria-expanded={isMobileNavOpen}
            >
              <svg className="w-6 h-6 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      <MobileNav
        isOpen={isMobileNavOpen}
        onClose={() => setIsMobileNavOpen(false)}
        navItems={navItems}
        currentPath={currentPath}
        userRole={userRole}
        userName={userName}
      />
    </>
  );
}

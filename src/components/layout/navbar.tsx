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

export const DEFAULT_PUBLIC_NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/" },
  { label: "About", href: "/about" },
  { label: "Programmes", href: "/programmes" },
  { label: "Admissions", href: "/admissions" },
  { label: "Gallery", href: "/gallery" },
  { label: "Fees", href: "/fees" },
  { label: "Contact", href: "/contact" },
];

export function Navbar({
  userRole,
  userName,
  navItems = DEFAULT_PUBLIC_NAV_ITEMS,
  currentPath = "/",
}: NavbarProps) {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-30 w-full bg-white/95 backdrop-blur-md border-b border-slate-200/90 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-6 xl:px-8 h-[72px] sm:h-20 flex items-center justify-between gap-2 sm:gap-3 xl:gap-4 w-full">
          {/* Brand Logo & Name */}
          <Link
            href="/"
            className="flex items-center gap-2 sm:gap-3 xl:gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#800020] rounded-xl py-1 select-none shrink-0"
            aria-label={`${SCHOOL_PROFILE.name} Home`}
          >
            <div className="w-11 h-11 sm:w-14 sm:h-14 lg:w-12 lg:h-12 xl:w-16 xl:h-16 shrink-0 flex items-center justify-center">
              <img
                src="/images/swanford-logo.jpg"
                alt={`${SCHOOL_PROFILE.name} Crest`}
                className="w-full h-full object-contain drop-shadow-xs"
              />
            </div>
            <div className="flex flex-col justify-center min-w-0">
              <span className="text-sm sm:text-base lg:text-base xl:text-xl font-extrabold text-[#5B0612] tracking-tight leading-tight whitespace-nowrap font-sans">
                {SCHOOL_PROFILE.name}
              </span>
              <span className="text-[8px] min-[360px]:text-[8.5px] min-[390px]:text-[9.5px] sm:text-[10px] xl:text-xs text-[#800020] font-bold tracking-tight min-[390px]:tracking-wider xl:tracking-widest uppercase leading-tight mt-0.5 whitespace-nowrap font-sans">
                NURSERY, PRIMARY &amp; TAHFEEZ SCHOOL
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center space-x-0.5 xl:space-x-1" aria-label="Main Navigation">
            {navItems.map((item) => {
              const isActive = item.href === currentPath;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`px-2 xl:px-3 py-1.5 xl:py-2 text-xs xl:text-sm font-semibold rounded-lg transition-colors duration-150 min-h-[36px] xl:min-h-[40px] inline-flex items-center whitespace-nowrap ${
                    isActive
                      ? "text-[#800020] bg-[#FDF2F4] font-bold"
                      : "text-stone-600 hover:text-[#5B0612] hover:bg-stone-100"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* User Profile / Status & Mobile Menu Toggle */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {!userRole && (
              <div className="hidden sm:flex items-center shrink-0">
                <Link
                  href="/auth/login"
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 xl:px-5 xl:py-2.5 text-xs xl:text-sm font-bold text-white bg-[#800020] hover:bg-[#5B0612] active:bg-[#4A050F] rounded-xl shadow-xs transition-colors duration-150 shrink-0 font-sans whitespace-nowrap"
                >
                  <span>Portal Login</span>
                  <span aria-hidden="true">&rarr;</span>
                </Link>
              </div>
            )}

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
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#800020] min-w-[40px] min-h-[40px] sm:min-w-[44px] sm:min-h-[44px] flex items-center justify-center shrink-0"
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

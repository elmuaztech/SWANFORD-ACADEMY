"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { RoleCode } from "@prisma/client";

export interface AdminMobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  userRole?: string;
  userEmail?: string;
}

export function AdminMobileDrawer({
  isOpen,
  onClose,
  userRole = "ADMIN",
  userEmail,
}: AdminMobileDrawerProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const isSuperAdmin = userRole === "SUPER_ADMIN" || userRole === RoleCode.SUPER_ADMIN;

  // Handle ESC key to close drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  interface DrawerNavItem {
    label: string;
    href: string;
    exact?: boolean;
    superAdminOnly?: boolean;
  }

  interface DrawerSection {
    title: string;
    superAdminOnly?: boolean;
    items: DrawerNavItem[];
  }

  const sections: DrawerSection[] = [
    {
      title: "CORE OPERATIONS",
      items: [
        { label: "Dashboard", href: "/admin", exact: true },
        { label: "Admissions", href: "/admin/admissions" },
        { label: "Academic Sessions", href: "/admin/academic" },
      ],
    },
    {
      title: "SCHOOL COMMUNITY",
      items: [
        { label: "Students", href: "/admin/students" },
        { label: "Parents/Guardians", href: "/admin/guardians" },
        { label: "Teachers", href: "/admin/teachers" },
      ],
    },
    {
      title: "ACADEMIC",
      items: [
        { label: "Programmes", href: "/admin/programmes" },
        { label: "Classes", href: "/admin/classes" },
        { label: "Subjects", href: "/admin/subjects" },
        { label: "Report Cards", href: "/admin/reports" },
      ],
    },
    {
      title: "DAILY OPERATIONS",
      items: [
        { label: "Attendance", href: "/admin/attendance" },
        { label: "Assessments", href: "/admin/assessments" },
        { label: "Messages", href: "/admin/messages" },
      ],
    },
    {
      title: "FINANCE",
      superAdminOnly: true,
      items: [
        { label: "Fees / Invoices", href: "/admin/finance", exact: true },
        { label: "Payments", href: "/admin/finance?tab=payments" },
        { label: "Outstanding Fees", href: "/admin/finance?tab=outstanding" },
        { label: "Expenses", href: "/admin/finance?tab=expenses" },
      ],
    },
    {
      title: "ADMINISTRATION",
      items: [
        { label: "User Accounts", href: "/admin/users", superAdminOnly: true },
        { label: "Gallery", href: "/admin/gallery" },
        { label: "Notifications", href: "/admin/notifications" },
        { label: "Settings", href: "/admin/settings", superAdminOnly: true },
        { label: "Audit Logs", href: "/admin/audit", superAdminOnly: true },
      ],
    },
  ];

  return (
    <div className="fixed inset-0 z-50 lg:hidden flex" role="dialog" aria-modal="true" aria-label="Mobile Navigation Drawer">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs transition-opacity duration-300"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-out Drawer Panel */}
      <div className="relative flex flex-col w-[300px] max-w-[85vw] h-full bg-white shadow-2xl z-10 animate-in slide-in-from-left duration-300 border-r border-[#EADBDA]">
        {/* Drawer Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-[#EADBDA]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#FDF2F4] border border-[#EADBDA] flex items-center justify-center">
              <img src="/images/swanford-logo.jpg" alt="Swanford Logo" className="w-7 h-7 object-contain" />
            </div>
            <div>
              <p className="text-xs font-bold text-stone-900 font-display">Swanford Academy</p>
              <p className="text-[10px] font-bold text-[#800020] uppercase tracking-wider">Admin Dashboard</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation drawer"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#800020]"
          >
            <svg className="w-5 h-5 fill-none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Drawer Navigation List */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-5" aria-label="Mobile Admin Navigation">
          {sections.map((section) => {
            if (section.superAdminOnly && !isSuperAdmin) return null;

            let items = section.items;
            if (!isSuperAdmin) {
              items = items.filter((i) => !i.superAdminOnly);
            }

            if (items.length === 0) return null;

            return (
              <div key={section.title} className="space-y-1">
                <h4 className="px-3 text-[10px] font-bold text-stone-400 uppercase tracking-wider font-display">
                  {section.title}
                </h4>
                <div className="space-y-0.5">
                  {items.map((item) => {
                    const currentQueryTab = searchParams?.get("tab");
                    const isItemQuery = item.href.includes("?tab=");
                    let isActive = false;

                    if (isItemQuery) {
                      const itemTab = item.href.split("?tab=")[1];
                      isActive = pathname === "/admin/finance" && currentQueryTab === itemTab;
                    } else if (item.href === "/admin/finance") {
                      isActive = pathname === "/admin/finance" && (!currentQueryTab || currentQueryTab === "invoices");
                    } else if (item.exact) {
                      isActive = pathname === item.href;
                    } else {
                      isActive = pathname === item.href || (pathname?.startsWith(item.href) && item.href !== "/admin");
                    }

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onClose}
                        className={`flex items-center px-3 py-2.5 rounded-xl text-xs font-semibold min-h-[44px] transition-colors ${
                          isActive
                            ? "bg-[#800020] text-white font-bold"
                            : "text-stone-700 hover:text-stone-900 hover:bg-stone-100"
                        }`}
                        aria-current={isActive ? "page" : undefined}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Drawer Footer / User Badge */}
        <div className="p-4 border-t border-[#EADBDA] bg-[#FDFCF9]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#800020] text-white text-xs font-bold flex items-center justify-center shrink-0">
              {userEmail ? userEmail[0].toUpperCase() : "A"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-stone-900 truncate">
                {userEmail || "Administrator"}
              </p>
              <p className="text-[10px] font-bold text-[#800020] uppercase tracking-wider">
                {userRole.replace(/_/g, " ")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

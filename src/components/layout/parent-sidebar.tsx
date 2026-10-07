"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface ParentSidebarProps {
  userEmail?: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

interface NavItem {
  label: string;
  href: string;
  icon: (props: { className?: string }) => React.JSX.Element;
  exact?: boolean;
}

function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg className={`w-5 h-5 shrink-0 ${className || ""}`} fill="none" viewBox="0 0 24 24" strokeWidth="1.75" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
    </svg>
  );
}

function ChildrenIcon({ className }: { className?: string }) {
  return (
    <svg className={`w-5 h-5 shrink-0 ${className || ""}`} fill="none" viewBox="0 0 24 24" strokeWidth="1.75" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
    </svg>
  );
}

function AdmissionsIcon({ className }: { className?: string }) {
  return (
    <svg className={`w-5 h-5 shrink-0 ${className || ""}`} fill="none" viewBox="0 0 24 24" strokeWidth="1.75" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  );
}

function AttendanceIcon({ className }: { className?: string }) {
  return (
    <svg className={`w-5 h-5 shrink-0 ${className || ""}`} fill="none" viewBox="0 0 24 24" strokeWidth="1.75" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5m-9-6h.008v.008H12v-.008ZM12 15h.008v.008H12V15Zm0 2.25h.008v.008H12v-.008ZM9.75 15h.008v.008H9.75V15Zm0 2.25h.008v.008H9.75v-.008ZM7.5 15h.008v.008H7.5V15Zm0 2.25h.008v.008H7.5v-.008Zm6.75-4.5h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V15Zm0 2.25h.008v.008h-.008v-.008Zm2.25-4.5h.008v.008H16.5v-.008Zm0 2.25h.008v.008H16.5V15Z" />
    </svg>
  );
}

function ResultsIcon({ className }: { className?: string }) {
  return (
    <svg className={`w-5 h-5 shrink-0 ${className || ""}`} fill="none" viewBox="0 0 24 24" strokeWidth="1.75" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  );
}

function FinanceIcon({ className }: { className?: string }) {
  return (
    <svg className={`w-5 h-5 shrink-0 ${className || ""}`} fill="none" viewBox="0 0 24 24" strokeWidth="1.75" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6H2.25m0 0H3m-1.5 0h1.5m0 0v1.5m0-1.5h.75a.75.75 0 0 1 .75.75v.75m0 0H3m0 0h1.5m0 0v1.5m0-1.5h.75a.75.75 0 0 1 .75.75v.75m-6.75-9a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V4.5M3.75 4.5h16.5m-16.5 0v14.25m16.5-14.25v14.25" />
    </svg>
  );
}

function NotificationsIcon({ className }: { className?: string }) {
  return (
    <svg className={`w-5 h-5 shrink-0 ${className || ""}`} fill="none" viewBox="0 0 24 24" strokeWidth="1.75" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
    </svg>
  );
}

function ProfileIcon({ className }: { className?: string }) {
  return (
    <svg className={`w-5 h-5 shrink-0 ${className || ""}`} fill="none" viewBox="0 0 24 24" strokeWidth="1.75" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
    </svg>
  );
}

function MessagesIcon({ className }: { className?: string }) {
  return (
    <svg className={`w-5 h-5 shrink-0 ${className || ""}`} fill="none" viewBox="0 0 24 24" strokeWidth="1.75" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
    </svg>
  );
}

export function ParentSidebar({
  userEmail,
  isCollapsed,
  onToggleCollapse,
}: ParentSidebarProps) {
  const pathname = usePathname();

  // Parent sidebar items:
  // Dashboard, My Children, Admissions, Attendance, Results, Fees / Payments, Notifications, Messages, Profile
  const items: NavItem[] = [
    { label: "Dashboard", href: "/parent", icon: DashboardIcon, exact: true },
    { label: "My Children", href: "/parent/children", icon: ChildrenIcon },
    { label: "Admissions", href: "/parent/admissions", icon: AdmissionsIcon },
    { label: "Attendance", href: "/parent/attendance", icon: AttendanceIcon },
    { label: "Results", href: "/parent/results", icon: ResultsIcon },
    { label: "Fees / Payments", href: "/parent/finance", icon: FinanceIcon },
    { label: "Notifications", href: "/parent/notifications", icon: NotificationsIcon },
    { label: "Messages", href: "/parent/messages", icon: MessagesIcon },
    { label: "Profile", href: "/parent/profile", icon: ProfileIcon },
  ];

  return (
    <aside
      className={`hidden lg:flex flex-col bg-white border-r border-[#EADBDA]/80 select-none transition-all duration-300 ease-in-out z-20 shrink-0 ${
        isCollapsed ? "w-[72px]" : "w-[240px]"
      }`}
      aria-label="Parent Navigation Sidebar"
    >
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-3.5 border-b border-[#EADBDA]/80">
        <Link
          href="/parent"
          className={`flex items-center gap-2.5 overflow-hidden transition-all duration-300 ${
            isCollapsed ? "justify-center w-full" : ""
          }`}
          title="Swanford Academy Parent Portal"
        >
          <div className="w-10 h-10 shrink-0 flex items-center justify-center rounded-lg bg-[#FDF2F4] border border-[#EADBDA]">
            <img
              src="/images/swanford-logo.jpg"
              alt="Swanford Crest"
              className="w-8 h-8 object-contain"
            />
          </div>
          {!isCollapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-bold text-stone-900 tracking-tight leading-none truncate font-display">
                Swanford
              </span>
              <span className="text-[11px] text-[#800020] font-bold tracking-wider uppercase leading-tight mt-1 truncate">
                Parent
              </span>
            </div>
          )}
        </Link>

        {!isCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="Collapse sidebar navigation"
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#800020]"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
        )}
      </div>

      {/* If collapsed, show small expand button right below logo */}
      {isCollapsed && (
        <div className="py-2 flex justify-center border-b border-[#EADBDA]/60">
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="Expand sidebar navigation"
            title="Expand Sidebar"
            className="p-2 rounded-lg text-stone-500 hover:text-[#800020] hover:bg-[#FDF2F4] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#800020]"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
      )}

      {/* Nav List */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5" aria-label="Parent Nav">
        {items.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              title={isCollapsed ? item.label : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-[#800020] text-white shadow-xs font-semibold"
                  : "text-stone-600 hover:text-stone-900 hover:bg-stone-100/80"
              } ${isCollapsed ? "justify-center px-0" : ""}`}
            >
              <item.icon className={`w-5 h-5 shrink-0 ${isActive ? "text-white" : "text-stone-500"}`} />
              {!isCollapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer Profile badge */}
      {!isCollapsed && userEmail && (
        <div className="p-3 border-t border-[#EADBDA]/80 bg-stone-50/50">
          <p className="text-[11px] text-stone-400 font-medium">Signed in as:</p>
          <p className="text-xs font-semibold text-stone-800 truncate">{userEmail}</p>
        </div>
      )}
    </aside>
  );
}

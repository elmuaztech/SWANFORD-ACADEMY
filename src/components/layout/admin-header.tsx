"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { RoleCode } from "@prisma/client";

export interface AdminHeaderProps {
  onOpenMobileDrawer: () => void;
  userRole?: string;
  userEmail?: string;
}

interface NotificationItem {
  id: string;
  category: string;
  subject: string;
  bodyText: string;
  status: string;
  createdAt: string;
  isRead: boolean;
  readAt: string | null;
}

const ROUTE_TITLES: Record<string, { title: string; section: string }> = {
  "/admin": { title: "Dashboard", section: "Core Operations" },
  "/admin/admissions": { title: "Admissions", section: "Core Operations" },
  "/admin/academic": { title: "Academic Sessions", section: "Core Operations" },
  "/admin/students": { title: "Students", section: "School Community" },
  "/admin/guardians": { title: "Parents/Guardians", section: "School Community" },
  "/admin/teachers": { title: "Teachers", section: "School Community" },
  "/admin/programmes": { title: "Programmes", section: "Academic" },
  "/admin/classes": { title: "Classes", section: "Academic" },
  "/admin/subjects": { title: "Subjects", section: "Academic" },
  "/admin/attendance": { title: "Attendance", section: "Daily Operations" },
  "/admin/assessments": { title: "Assessments", section: "Daily Operations" },
  "/admin/finance": { title: "Finance", section: "Finance" },
  "/admin/gallery": { title: "Gallery", section: "Administration" },
  "/admin/notifications": { title: "Notifications", section: "Administration" },
  "/admin/settings": { title: "Settings", section: "Administration" },
  "/admin/audit": { title: "Audit Logs", section: "Administration" },
  "/admin/users": { title: "User Accounts", section: "Administration" },
  "/admin/roles": { title: "Role Permissions", section: "Administration" },
  "/admin/config": { title: "System Config", section: "Administration" },
};

export function AdminHeader({
  onOpenMobileDrawer,
  userRole = "ADMIN",
  userEmail = "admin@swanford.example.com",
}: AdminHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();

  // Notifications State
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isLoadingNotifs, setIsLoadingNotifs] = useState(false);
  const notifDropdownRef = useRef<HTMLDivElement>(null);

  // Profile Menu State
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const profileDropdownRef = useRef<HTMLDivElement>(null);

  // Derive route metadata
  const currentRouteMeta = ROUTE_TITLES[pathname] || {
    title: pathname.split("/").filter(Boolean).pop()?.replace(/-/g, " ").toUpperCase() || "Admin Dashboard",
    section: "Operations",
  };

  // Fetch notifications from live database API
  const fetchNotifications = async () => {
    try {
      setIsLoadingNotifs(true);
      const res = await fetch("/api/admin/me/notifications", {
        headers: { "Cache-Control": "no-cache" },
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch {
      // Degrade gracefully without throwing toast errors
    } finally {
      setIsLoadingNotifs(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  // Close dropdowns on outside click or Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsNotifOpen(false);
        setIsProfileOpen(false);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (
        notifDropdownRef.current &&
        !notifDropdownRef.current.contains(e.target as Node)
      ) {
        setIsNotifOpen(false);
      }
      if (
        profileDropdownRef.current &&
        !profileDropdownRef.current.contains(e.target as Node)
      ) {
        setIsProfileOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Mark single notification as read (scoped to this actor)
  const handleMarkAsRead = async (id: string, currentlyRead: boolean) => {
    if (currentlyRead) return;

    // Optimistic UI update
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    try {
      await fetch("/api/admin/me/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId: id }),
      });
    } catch {
      fetchNotifications();
    }
  };

  // Mark all notifications as read for this actor
  const handleMarkAllAsRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);

    try {
      await fetch("/api/admin/me/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true }),
      });
    } catch {
      fetchNotifications();
    }
  };

  // Handle Logout
  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/login";
    } catch {
      window.location.href = "/login";
    }
  };

  return (
    <header className="sticky top-0 z-10 w-full bg-white/95 backdrop-blur-md border-b border-[#EADBDA]/80 select-none shadow-2xs">
      <div className="flex items-center justify-between h-16 px-4 sm:px-6">
        {/* Left Side: Mobile Menu Button & Breadcrumb Navigation */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileDrawer}
            aria-label="Open navigation drawer"
            className="lg:hidden min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#800020]"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>

          {/* Breadcrumb & Title */}
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-stone-400 truncate font-display">
              <span>Admin</span>
              <span>/</span>
              <span className="text-[#800020] font-bold">{currentRouteMeta.section}</span>
            </div>
            <h1 className="text-sm sm:text-base font-bold text-[#5B0612] truncate leading-tight font-display tracking-tight">
              {currentRouteMeta.title}
            </h1>
          </div>
        </div>

        {/* Right Side: Notifications & Profile Menu */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Live Notification Dropdown */}
          <div className="relative" ref={notifDropdownRef}>
            <button
              type="button"
              onClick={() => setIsNotifOpen((prev) => !prev)}
              aria-label={`Notifications (${unreadCount} unread)`}
              aria-expanded={isNotifOpen}
              className="relative min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#800020]"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.75" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
                />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute top-2 right-2 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-[#800020] rounded-full border-2 border-white shadow-xs">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {/* Notification Dropdown Panel */}
            {isNotifOpen && (
              <div className="fixed inset-x-4 top-16 sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-96 max-w-sm sm:max-w-none mx-auto sm:mx-0 bg-white rounded-2xl shadow-2xl border border-[#EADBDA] overflow-hidden z-50 animate-in fade-in-50 zoom-in-95 duration-150">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#EADBDA] bg-[#FDFCF9]">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold text-[#5B0612] font-display">Notifications</h3>
                    {unreadCount > 0 && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#FDF2F4] text-[#800020] border border-[#EADBDA]">
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllAsRead}
                      className="text-[11px] font-semibold text-[#800020] hover:text-[#5B0612] hover:underline"
                    >
                      Mark all as read
                    </button>
                  )}
                </div>

                {/* Notifications List */}
                <div className="max-h-80 overflow-y-auto divide-y divide-[#EADBDA]/60">
                  {isLoadingNotifs ? (
                    <div className="p-6 text-center text-xs text-stone-400">
                      Loading notifications...
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="p-8 text-center">
                      <div className="w-10 h-10 mx-auto rounded-full bg-stone-100 flex items-center justify-center text-stone-400 mb-2">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                        </svg>
                      </div>
                      <p className="text-xs font-semibold text-stone-700">No new notifications</p>
                      <p className="text-[11px] text-stone-400 mt-0.5">You have no new notifications.</p>
                    </div>
                  ) : (
                    notifications.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => handleMarkAsRead(item.id, item.isRead)}
                        className={`p-3.5 transition-colors cursor-pointer text-left ${
                          item.isRead ? "bg-white hover:bg-stone-50/80" : "bg-[#FDF2F4]/40 hover:bg-[#FDF2F4]/80"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                item.isRead ? "bg-transparent" : "bg-[#800020]"
                              }`}
                            />
                            <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">
                              {item.category}
                            </span>
                          </div>
                          <span className="text-[10px] text-stone-400 shrink-0">
                            {new Date(item.createdAt).toLocaleDateString("en-NG", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <p className={`text-xs mt-1 ${item.isRead ? "text-stone-700" : "text-stone-900 font-bold"}`}>
                          {item.subject}
                        </p>
                        <p className="text-[11px] text-stone-500 line-clamp-2 mt-0.5 leading-snug">
                          {item.bodyText}
                        </p>
                      </div>
                    ))
                  )}
                </div>

                <div className="p-2 border-t border-[#EADBDA] bg-[#FDFCF9] text-center">
                  <Link
                    href="/admin/notifications"
                    onClick={() => setIsNotifOpen(false)}
                    className="text-xs font-semibold text-[#800020] hover:text-[#5B0612] inline-block py-1 font-display"
                  >
                    View Email History &rarr;
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* User Profile Menu */}
          <div className="relative" ref={profileDropdownRef}>
            <button
              type="button"
              onClick={() => setIsProfileOpen((prev) => !prev)}
              aria-label="User account menu"
              aria-expanded={isProfileOpen}
              className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-stone-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#800020] min-h-[44px]"
            >
              <div className="w-8 h-8 rounded-full bg-[#800020] text-white text-xs font-bold flex items-center justify-center shrink-0 shadow-2xs">
                {userEmail ? userEmail[0].toUpperCase() : "A"}
              </div>
              <div className="hidden sm:flex flex-col text-left">
                <span className="text-xs font-semibold text-stone-900 max-w-[140px] truncate leading-tight">
                  {userEmail}
                </span>
                <span className="text-[10px] font-bold text-[#800020] uppercase tracking-wider leading-tight">
                  {userRole.replace(/_/g, " ")}
                </span>
              </div>
              <svg className="w-3.5 h-3.5 text-stone-400 hidden sm:block" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>

            {/* Profile Dropdown Panel */}
            {isProfileOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-[#EADBDA] overflow-hidden z-50 animate-in fade-in-50 zoom-in-95 duration-150">
                <div className="p-4 border-b border-[#EADBDA] bg-[#FDFCF9]">
                  <p className="text-xs font-semibold text-stone-500">Signed in as</p>
                  <p className="text-xs font-bold text-stone-900 truncate mt-0.5">{userEmail}</p>
                  <div className="mt-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-[#FDF2F4] text-[#800020] border border-[#EADBDA] uppercase">
                    {userRole.replace(/_/g, " ")}
                  </div>
                </div>

                <div className="p-1.5 space-y-0.5 text-xs font-medium text-stone-700">
                  {userRole === "SUPER_ADMIN" && (
                    <>
                      <Link
                        href="/admin/users"
                        onClick={() => setIsProfileOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-stone-100 hover:text-stone-900 transition-colors"
                      >
                        <svg className="w-4 h-4 text-stone-400" fill="none" viewBox="0 0 24 24" strokeWidth="1.75" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
                        </svg>
                        <span>User Accounts</span>
                      </Link>

                      <Link
                        href="/admin/settings"
                        onClick={() => setIsProfileOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-stone-100 hover:text-stone-900 transition-colors"
                      >
                        <svg className="w-4 h-4 text-stone-400" fill="none" viewBox="0 0 24 24" strokeWidth="1.75" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
                        </svg>
                        <span>Account Settings</span>
                      </Link>

                      <Link
                        href="/admin/audit"
                        onClick={() => setIsProfileOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-stone-100 hover:text-stone-900 transition-colors"
                      >
                        <svg className="w-4 h-4 text-stone-400" fill="none" viewBox="0 0 24 24" strokeWidth="1.75" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                        </svg>
                        <span>Security Audit Trail</span>
                      </Link>
                      <Link
                        href="/admin/config"
                        onClick={() => setIsProfileOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-stone-100 hover:text-stone-900 transition-colors"
                      >
                        <svg className="w-4 h-4 text-stone-400" fill="none" viewBox="0 0 24 24" strokeWidth="1.75" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.6 6.6 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                        </svg>
                        <span>System Configuration</span>
                      </Link>
                    </>
                  )}
                </div>

                <div className="p-1.5 border-t border-[#EADBDA] bg-stone-50/50">
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={isLoggingOut}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-700 hover:bg-rose-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 disabled:opacity-50"
                  >
                    <svg className="w-4 h-4 text-rose-600" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
                    </svg>
                    <span>{isLoggingOut ? "Signing out..." : "Sign Out"}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

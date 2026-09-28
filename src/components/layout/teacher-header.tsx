"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface TeacherHeaderProps {
  onOpenMobileDrawer: () => void;
  userEmail?: string;
}

interface MessageItem {
  id: string;
  subject: string;
  body: string;
  senderName?: string;
  createdAt: string;
  isRead: boolean;
}

export function TeacherHeader({ onOpenMobileDrawer, userEmail }: TeacherHeaderProps) {
  const router = useRouter();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isBellOpen, setIsBellOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [recentMessages, setRecentMessages] = useState<MessageItem[]>([]);

  const bellRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 1. Fetch photo
    fetch("/api/teacher/me/photo")
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => {
        if (d?.url) setPhotoUrl(d.url);
      })
      .catch(() => {});

    // 2. Fetch unread messages & announcements
    fetch("/api/messages?limit=5")
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => {
        if (d?.messages) {
          setRecentMessages(d.messages);
        }
        if (typeof d?.unreadCount === "number") {
          setUnreadCount(d.unreadCount);
        }
      })
      .catch(() => {});
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setIsBellOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setIsProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
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
          Teacher Portal
        </span>
      </div>

      {/* Right: Announcement Bell & User area */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Announcement / Message Bell */}
        <div className="relative" ref={bellRef}>
          <button
            type="button"
            onClick={() => setIsBellOpen(!isBellOpen)}
            aria-label="Announcements & Messages"
            aria-expanded={isBellOpen}
            className="p-2 rounded-xl text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#800020] min-w-[44px] min-h-[44px] flex items-center justify-center relative"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.75" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
              />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] bg-[#800020] text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 shadow-xs border-2 border-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {/* Messages / Announcement Dropdown Panel */}
          {isBellOpen && (
            <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-xl border border-[#EADBDA] overflow-hidden z-40 animate-in fade-in-50 zoom-in-95 duration-150">
              <div className="p-3.5 border-b border-[#EADBDA] bg-[#FAF7F2] flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-stone-900">Announcements &amp; Messages</h3>
                  <p className="text-[11px] text-stone-500">
                    {unreadCount > 0 ? `${unreadCount} unread message${unreadCount === 1 ? "" : "s"}` : "All caught up"}
                  </p>
                </div>
                <Link
                  href="/teacher/messages"
                  onClick={() => setIsBellOpen(false)}
                  className="text-[11px] font-bold text-[#800020] hover:underline"
                >
                  Inbox
                </Link>
              </div>

              <div className="max-h-72 overflow-y-auto divide-y divide-stone-100">
                {recentMessages.length === 0 ? (
                  <div className="p-6 text-center text-xs text-stone-400">
                    No announcements or messages yet
                  </div>
                ) : (
                  recentMessages.map((msg) => (
                    <Link
                      key={msg.id}
                      href="/teacher/messages"
                      onClick={() => setIsBellOpen(false)}
                      className={`block p-3 hover:bg-stone-50 transition-colors ${
                        !msg.isRead ? "bg-[#FAF7F2]/50 font-medium" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs font-semibold text-stone-900 mb-0.5">
                        <span className="truncate max-w-[180px]">{msg.subject}</span>
                        <span className="text-[10px] text-stone-400 font-normal">
                          {new Date(msg.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </span>
                      </div>
                      <p className="text-[11px] text-stone-500 line-clamp-2 leading-relaxed">
                        {msg.body}
                      </p>
                    </Link>
                  ))
                )}
              </div>

              <div className="p-2.5 border-t border-[#EADBDA] bg-[#FAF7F2]/40 text-center">
                <Link
                  href="/teacher/messages"
                  onClick={() => setIsBellOpen(false)}
                  className="text-xs font-bold text-[#800020] hover:text-[#5B0612] inline-block py-0.5"
                >
                  View All Messages &rarr;
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Profile Menu */}
        <div className="relative" ref={profileRef}>
          <button
            type="button"
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-stone-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#800020] min-h-[44px]"
            aria-expanded={isProfileOpen}
          >
            <div className="w-8 h-8 rounded-full overflow-hidden bg-[#800020] text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs border border-[#EADBDA]/80">
              {photoUrl ? (
                <img src={photoUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                userEmail ? userEmail[0].toUpperCase() : "T"
              )}
            </div>
            <span className="hidden md:inline-block text-xs font-semibold text-stone-800 max-w-[140px] truncate">
              {userEmail || "Teacher"}
            </span>
            <svg className="w-3.5 h-3.5 text-stone-400 hidden sm:block" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>

          {isProfileOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-white border border-[#EADBDA] rounded-2xl shadow-xl py-1.5 z-40 animate-in fade-in-50 zoom-in-95 duration-150 overflow-hidden">
              <div className="px-4 py-3 border-b border-[#EADBDA] bg-[#FAF7F2]/50 flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full overflow-hidden bg-[#800020] text-white text-xs font-bold flex items-center justify-center shrink-0 border border-[#EADBDA]">
                  {photoUrl ? (
                    <img src={photoUrl} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    userEmail ? userEmail[0].toUpperCase() : "T"
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-stone-900 truncate">{userEmail}</p>
                  <span className="text-[10px] font-bold text-[#800020] uppercase tracking-wider block mt-0.5">
                    Faculty Teacher
                  </span>
                </div>
              </div>
              <div className="p-1 space-y-0.5 text-xs font-medium text-stone-700">
                <Link
                  href="/teacher/profile"
                  onClick={() => setIsProfileOpen(false)}
                  className="block px-3 py-2 rounded-lg hover:bg-stone-50 transition-colors"
                >
                  My Profile &amp; Photo
                </Link>
                <Link
                  href="/teacher/classes"
                  onClick={() => setIsProfileOpen(false)}
                  className="block px-3 py-2 rounded-lg hover:bg-stone-50 transition-colors"
                >
                  Assigned Classes
                </Link>
                <Link
                  href="/teacher/messages"
                  onClick={() => setIsProfileOpen(false)}
                  className="block px-3 py-2 rounded-lg hover:bg-stone-50 transition-colors"
                >
                  Messages &amp; Announcements
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

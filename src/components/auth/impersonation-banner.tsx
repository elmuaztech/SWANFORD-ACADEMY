"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface ImpersonationState {
  isImpersonating: boolean;
  originalAdminEmail?: string;
  targetEmail?: string;
  targetName?: string;
  targetRole?: string;
  targetPortal?: string;
}

export function ImpersonationBanner() {
  const router = useRouter();
  const [impersonation, setImpersonation] = useState<ImpersonationState | null>(null);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    // 1. Fast read from clientside cookie
    const getCookie = (name: string): string | null => {
      if (typeof document === "undefined") return null;
      const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
      return match ? decodeURIComponent(match[2]) : null;
    };

    const cookieVal = getCookie("swanford_impersonation");
    if (cookieVal) {
      try {
        const parsed = JSON.parse(cookieVal);
        if (parsed.isImpersonating) {
          setImpersonation(parsed);
        }
      } catch {
        // Fallback to API check
      }
    }

    // 2. Validate authoritative state from backend
    fetch("/api/super-admin/impersonate/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.isImpersonating) {
          setImpersonation({
            isImpersonating: true,
            originalAdminEmail: data.originalAdminEmail,
            targetEmail: data.targetUser.email,
            targetName: data.targetUser.name,
            targetRole: data.targetUser.role,
            targetPortal: data.targetUser.portal,
          });
        } else {
          setImpersonation(null);
        }
      })
      .catch(() => {});
  }, []);

  const handleExit = async () => {
    try {
      setIsExiting(true);
      const res = await fetch("/api/super-admin/impersonate/exit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => ({}));

      // Clear local state
      setImpersonation(null);

      // Force full reload to restore original Super Admin session state across App Router
      window.location.href = data.redirectUrl || "/admin/users";
    } catch (err) {
      console.error("Failed to exit impersonation:", err);
      setIsExiting(false);
    }
  };

  if (!impersonation || !impersonation.isImpersonating) {
    return null;
  }

  return (
    <div
      role="banner"
      aria-label="Active Impersonation Notice"
      className="sticky top-0 z-[9999] bg-gradient-to-r from-amber-600 via-amber-700 to-amber-800 text-white px-3 sm:px-6 py-2 shadow-md border-b border-amber-900/40 select-none animate-in fade-in-50 duration-200"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 text-xs sm:text-sm">
        {/* Left Side: Identity Info */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center shrink-0 text-sm">
            🎭
          </div>
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="font-extrabold uppercase tracking-wider text-[10px] bg-black/25 px-2 py-0.5 rounded text-amber-100">
              Impersonation Mode
            </span>
            <span className="font-semibold text-white truncate">
              {impersonation.targetName || impersonation.targetEmail}
            </span>
            <span className="bg-white/20 px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wide">
              {impersonation.targetRole?.replace(/_/g, " ") || "USER"}
            </span>
            <span className="text-amber-100/80 text-[11px] hidden md:inline truncate">
              ({impersonation.targetEmail})
            </span>
            {impersonation.originalAdminEmail && (
              <span className="text-amber-200/90 text-[10px] hidden lg:inline border-l border-amber-500/60 pl-2">
                Acting as Super Admin: {impersonation.originalAdminEmail}
              </span>
            )}
          </div>
        </div>

        {/* Right Side: Exit Button */}
        <div className="shrink-0 flex items-center gap-2">
          <button
            type="button"
            onClick={handleExit}
            disabled={isExiting}
            className="cursor-pointer bg-white text-amber-900 hover:bg-amber-50 active:bg-amber-100 font-bold px-3.5 py-1.5 rounded-lg shadow-sm text-xs transition-all duration-150 flex items-center gap-1.5 hover:scale-105 active:scale-95 disabled:opacity-60 disabled:pointer-events-none"
          >
            {isExiting ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5 text-amber-900" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>Restoring Session...</span>
              </>
            ) : (
              <>
                <span>Exit Impersonation</span>
                <span className="text-amber-700 font-black" aria-hidden="true">✕</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

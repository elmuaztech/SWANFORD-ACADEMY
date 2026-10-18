'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

interface ImpersonationState {
  active: boolean;
  targetUserId?: string;
  targetName?: string;
  targetEmail?: string;
  targetRole?: string;
  adminEmail?: string;
}

export function ImpersonationBanner() {
  const [state, setState] = useState<ImpersonationState | null>(null);
  const [isExiting, setIsExiting] = useState(false);
  const pathname = usePathname();

  const checkImpersonation = () => {
    // 1. Try reading cookie directly for instant UI presentation
    try {
      const match = document.cookie.match(/swanford_impersonation=([^;]+)/);
      if (match) {
        const decoded = JSON.parse(decodeURIComponent(match[1]));
        if (decoded && decoded.active) {
          setState(decoded);
          return;
        }
      }
    } catch {
      // Fallback to server check
    }

    // 2. Query endpoint
    fetch('/api/admin/impersonate')
      .then((res) => res.json())
      .then((data) => {
        if (data.active) {
          setState(data);
        } else {
          setState(null);
        }
      })
      .catch(() => {
        setState(null);
      });
  };

  useEffect(() => {
    checkImpersonation();
  }, [pathname]);

  if (!state || !state.active) {
    return null;
  }

  const handleExit = async () => {
    setIsExiting(true);
    try {
      const res = await fetch('/api/admin/impersonate/exit', {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      const destination = data.redirectUrl || '/admin/users';
      window.location.assign(destination);
    } catch {
      setIsExiting(false);
      alert('Failed to exit impersonation. Please reload or check connection.');
    }
  };

  return (
    <aside
      className="sticky top-0 z-50 w-full bg-[#78350F] text-amber-50 border-b-2 border-amber-400 shadow-md font-sans select-none"
      aria-label="Active Impersonation Notice"
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2 sm:py-2.5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-4">
        {/* Left: Indicator & Identity */}
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex h-3 w-3 relative shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-300" />
          </span>

          <div className="min-w-0 text-xs sm:text-sm">
            <span className="font-extrabold uppercase tracking-wide text-amber-200 block sm:inline sm:mr-2 text-[11px] sm:text-xs">
              Impersonation Active:
            </span>
            <span className="font-bold text-white truncate inline-block max-w-[220px] sm:max-w-[320px] align-bottom">
              {state.targetName || state.targetEmail}
            </span>
            {state.targetRole && (
              <span className="ml-1.5 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold bg-amber-400/20 text-amber-200 border border-amber-400/30">
                {state.targetRole}
              </span>
            )}
            {state.targetEmail && state.targetName && (
              <span className="hidden md:inline ml-2 text-amber-200/80 text-xs font-mono">
                ({state.targetEmail})
              </span>
            )}
          </div>
        </div>

        {/* Right: Exit Action Button */}
        <div className="shrink-0 flex items-center justify-end">
          <button
            type="button"
            onClick={handleExit}
            disabled={isExiting}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs sm:text-sm font-extrabold bg-amber-400 hover:bg-amber-300 text-stone-950 shadow-sm active:scale-95 transition-all min-h-[44px] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExiting ? (
              <>
                <svg className="animate-spin -ml-1 mr-1.5 h-4 w-4 text-stone-950" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Restoring Administrator Session...
              </>
            ) : (
              <>
                <span>Exit Impersonation & Return to Admin</span>
                <span aria-hidden="true">&rarr;</span>
              </>
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}

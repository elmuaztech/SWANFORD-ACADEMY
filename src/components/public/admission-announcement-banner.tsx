'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

interface AdmissionOptions {
  isOpen: boolean;
  activeSessionName: string;
  announcement: string;
}

export function AdmissionAnnouncementBanner({ initialData }: { initialData?: AdmissionOptions }) {
  const [data, setData] = useState<AdmissionOptions | null>(initialData || null);
  const [loading, setLoading] = useState(!initialData);

  useEffect(() => {
    let isSubscribed = true;
    fetch('/api/public/admission-options')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load admission options');
        return res.json();
      })
      .then((json) => {
        if (isSubscribed) {
          setData(json);
          setLoading(false);
        }
      })
      .catch(() => {
        if (isSubscribed) setLoading(false);
      });

    return () => {
      isSubscribed = false;
    };
  }, []);

  if (loading || !data) {
    return null;
  }

  const { isOpen, activeSessionName, announcement } = data;
  const sessionText = activeSessionName || 'the Academic Session';

  const primaryMessage = isOpen
    ? (announcement || `Admissions for ${sessionText} are now open.`)
    : `Admissions for ${sessionText} are currently closed.`;

  const secondaryMessage = isOpen
    ? 'Early Years, Primary School & Standalone Tahfeez Programmes.'
    : 'School tours and prospective parent enquiries remain welcome.';

  const tertiaryMessage = isOpen
    ? 'Limited enrolment quotas per class.'
    : 'Visit our campus in Dutse, Jigawa State.';

  return (
    <aside
      className="relative w-full max-w-full overflow-hidden bg-gradient-to-r from-[#42040D] via-[#5B0612] to-[#42040D] border-b border-[#D4AF37]/35 text-white shadow-2xs marquee-container select-none z-20 font-sans"
      aria-label="Admissions Announcement"
    >
      <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 flex items-center justify-between gap-1.5 sm:gap-3 min-h-[40px] sm:min-h-[44px] w-full max-w-full overflow-hidden">
        {/* Left Indicator Pill (Yellow Card with Maroon Text) */}
        <div className="shrink-0 flex items-center gap-1 sm:gap-2 py-1 z-10 bg-[#5B0612]/95 pr-1 sm:pr-2">
          {isOpen ? (
            <span className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[9.5px] sm:text-xs font-extrabold tracking-wider uppercase bg-[#F5D061] text-[#3B030A] shadow-xs border border-[#E5C158]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#5B0612] animate-ping shrink-0" />
              <span className="whitespace-nowrap">
                <span className="hidden sm:inline">Admissions Open</span>
                <span className="sm:hidden">Open</span>
              </span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[9.5px] sm:text-xs font-extrabold tracking-wider uppercase bg-[#F5D061] text-[#3B030A] shadow-xs border border-[#E5C158]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#5B0612] animate-pulse shrink-0" />
              <span className="whitespace-nowrap">Notice</span>
            </span>
          )}
        </div>

        {/* Center Marquee Track - Maximized width on mobile */}
        <div className="flex-1 min-w-0 overflow-hidden relative py-1 flex items-center" style={{ contain: "paint" }}>
          {/* Subtle gradient fades on left and right edges (desktop only to preserve mobile screen real estate) */}
          <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-4 sm:w-6 bg-gradient-to-r from-[#5B0612] to-transparent z-10 hidden sm:block" />
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-4 sm:w-6 bg-gradient-to-l from-[#5B0612] to-transparent z-10 hidden sm:block" />

          {/* Marquee Content with duplicate segments for continuous loop, pauses on hover/focus */}
          <div className="animate-marquee motion-reduce:animate-none flex items-center gap-8 sm:gap-10 whitespace-nowrap text-[11px] sm:text-sm font-medium tracking-wide">
            {/* Segment 1 */}
            <div className="flex items-center gap-4 sm:gap-6">
              <span className="text-[#FAF7F2] font-semibold">
                {primaryMessage}
              </span>
              <span className="text-[#F5D061] text-xs">&bull;</span>
              <span className="text-stone-200">
                {secondaryMessage}
              </span>
              <span className="text-[#F5D061] text-xs">&bull;</span>
              <span className="text-[#F5D061] font-medium italic">
                {tertiaryMessage}
              </span>
            </div>

            {/* Segment 2 (Duplicate for seamless loop) */}
            <div className="flex items-center gap-4 sm:gap-6" aria-hidden="true">
              <span className="text-[#F5D061] text-xs">&bull;</span>
              <span className="text-[#FAF7F2] font-semibold">
                {primaryMessage}
              </span>
              <span className="text-[#F5D061] text-xs">&bull;</span>
              <span className="text-stone-200">
                {secondaryMessage}
              </span>
              <span className="text-[#F5D061] text-xs">&bull;</span>
              <span className="text-[#F5D061] font-medium italic">
                {tertiaryMessage}
              </span>
            </div>
          </div>
        </div>

        {/* Right Action Button (Yellow text with compact mobile footprint) */}
        <div className="shrink-0 py-1 z-10 bg-[#5B0612]/95 pl-1 sm:pl-2">
          {isOpen ? (
            <Link
              href="/admissions"
              className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-1 sm:py-1.5 rounded-lg text-[10.5px] sm:text-xs font-bold bg-[#F5D061] hover:bg-[#E5C158] text-[#3B030A] shadow-xs hover:shadow transition-all min-h-[32px] sm:min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <span className="hidden sm:inline">Apply Online</span>
              <span className="sm:hidden">Apply</span>
              <span aria-hidden="true">&rarr;</span>
            </Link>
          ) : (
            <Link
              href="/contact"
              className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-lg text-[10.5px] sm:text-xs font-bold bg-[#F5D061] hover:bg-[#E5C158] text-[#3B030A] border border-[#E5C158] shadow-xs hover:shadow transition-all min-h-[32px] sm:min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white shrink-0"
            >
              <span className="hidden sm:inline">Contact Admissions</span>
              <span className="sm:hidden">Contact</span>
              <span aria-hidden="true">&rarr;</span>
            </Link>
          )}
        </div>
      </div>
    </aside>
  );
}

import React from 'react';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { SCHOOL_PROFILE } from '@/lib/constants';

export function PublicFooter() {
  return (
    <footer
      style={{
        background: 'linear-gradient(to bottom, #3B030A, #4D0610, #250105)',
        color: '#ffffff',
      }}
      className="relative bg-gradient-to-b from-[#3B030A] via-[#4D0610] to-[#250105] text-white border-t border-[#6B1420] mt-auto overflow-hidden"
    >
      {/* Deep maroon ambient gradient overlay matching hero card */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#2F0208]/90 via-[#45050E]/85 to-[#1F0104]/95 pointer-events-none" />

      {/* Subtle golden micro-dot grid pattern identical to hero card and user specification */}
      <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#F5D061_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          {/* Brand & Motto */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 sm:w-16 sm:h-16 shrink-0 flex items-center justify-center bg-white rounded-xl p-1 shadow-xs border border-white/30">
                <img
                  src="/images/swanford-logo.jpg"
                  alt={`${SCHOOL_PROFILE.name} Crest`}
                  className="w-full h-full object-contain"
                />
              </div>
              <div>
                <span className="text-base font-bold text-white block leading-tight font-display">
                  {SCHOOL_PROFILE.name}
                </span>
                <span className="text-xs text-white/90 block font-display">
                  {SCHOOL_PROFILE.subtitle}
                </span>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-white italic leading-relaxed">
              &ldquo;{SCHOOL_PROFILE.motto}&rdquo;
            </p>
            <div className="pt-2 text-xs text-white space-y-1">
              <p><span className="text-white font-semibold">Curriculum:</span> <span className="text-white">{SCHOOL_PROFILE.curriculum}</span></p>
              <p><span className="text-white font-semibold">Language:</span> <span className="text-white">{SCHOOL_PROFILE.language}</span></p>
            </div>
          </div>

          {/* Navigation Links */}
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 border-b border-white/20 pb-1.5">
              Explore
            </h3>
            <ul className="space-y-2.5 text-xs sm:text-sm text-white">
              <li>
                <Link href="/" className="text-white hover:text-amber-300 transition-colors">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/about" className="text-white hover:text-amber-300 transition-colors">
                  About the Academy
                </Link>
              </li>
              <li>
                <Link href="/programmes" className="text-white hover:text-amber-300 transition-colors">
                  Academic Programmes
                </Link>
              </li>
              <li>
                <Link href="/admissions" className="text-white hover:text-amber-300 transition-colors">
                  Admissions
                </Link>
              </li>
              <li>
                <Link href="/gallery" className="text-white hover:text-amber-300 transition-colors">
                  School Gallery
                </Link>
              </li>
              <li>
                <Link href="/fees" className="text-white hover:text-amber-300 transition-colors">
                  Fee Schedule
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-white hover:text-amber-300 transition-colors">
                  Contact Us
                </Link>
              </li>
            </ul>
          </div>

          {/* Admission & Portals */}
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 border-b border-white/20 pb-1.5">
              Admissions & Portals
            </h3>
            <ul className="space-y-2.5 text-xs sm:text-sm text-white">
              <li>
                <Link href="/admissions" className="text-white hover:text-amber-300 transition-colors font-bold underline decoration-amber-400">
                  Apply for Admission &rarr;
                </Link>
              </li>
              <li>
                <Link href="/admissions/status" className="text-white hover:text-amber-300 transition-colors">
                  Track Application Status
                </Link>
              </li>
              <li>
                <Link href="/parent" className="text-white hover:text-amber-300 transition-colors">
                  Parent Portal
                </Link>
              </li>
              <li>
                <Link href="/teacher" className="text-white hover:text-amber-300 transition-colors">
                  Teacher Portal
                </Link>
              </li>
              <li>
                <Link href="/admin" className="text-white hover:text-amber-300 transition-colors">
                  Admin Portal
                </Link>
              </li>
            </ul>
          </div>

          {/* School Location & Official Bank Details */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 border-b border-white/20 pb-1.5">
              School Information
            </h3>
            <div className="text-xs sm:text-sm text-white space-y-1.5 leading-relaxed">
              <p className="font-bold text-white">{SCHOOL_PROFILE.name}</p>
              <p className="text-white">{SCHOOL_PROFILE.address}</p>
              <p className="pt-1 text-white font-medium">{SCHOOL_PROFILE.contactPerson}</p>
            </div>
            <div className="pt-3 border-t border-white/20 text-xs text-white space-y-1">
              <p className="font-bold text-white">Online Fee Payments:</p>
              <p className="text-xs text-white flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-300 shrink-0" /> Secure Online Payment
              </p>
              <p className="text-[11px] text-white/90">Debit Cards &bull; Bank Transfer &bull; Instant Receipt</p>
            </div>
          </div>
        </div>

        {/* Bottom Bar with high contrast and explicit branding */}
        <div className="pt-8 mt-8 border-t border-white/20 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-white">
          <p className="text-white">
            &copy; {new Date().getFullYear()} {SCHOOL_PROFILE.name}. All rights reserved.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-6 text-center sm:text-right text-xs">
            <span className="text-white">
              Developed by: <strong className="text-white font-bold">Elmuaz Technologies LTD</strong>
            </span>
            <span className="text-white">
              Email:{" "}
              <a href="mailto:info@elmuaztech.com.ng" className="text-white hover:text-amber-300 underline font-semibold">
                info@elmuaztech.com.ng
              </a>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

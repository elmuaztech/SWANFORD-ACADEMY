import React from 'react';
import Link from 'next/link';
import { SCHOOL_PROFILE } from '@/lib/constants';

export function PublicFooter() {
  return (
    <footer className="bg-[#1C1A1A] text-[#FDFBF7] border-t border-[#383330] mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          {/* Brand & Motto */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 sm:w-16 sm:h-16 shrink-0 flex items-center justify-center bg-white rounded-xl p-1 shadow-xs border border-white/20">
                <img
                  src="/images/swanford-logo.jpg"
                  alt={`${SCHOOL_PROFILE.name} Crest`}
                  className="w-full h-full object-contain"
                />
              </div>
              <div>
                <span className="text-base font-bold text-[#FDFBF7] block leading-tight font-display">
                  {SCHOOL_PROFILE.name}
                </span>
                <span className="text-xs text-[#C2B8B2] block font-display">
                  {SCHOOL_PROFILE.subtitle}
                </span>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-[#A89F99] italic leading-relaxed">
              &ldquo;{SCHOOL_PROFILE.motto}&rdquo;
            </p>
            <div className="pt-2 text-xs text-[#C2B8B2] space-y-1">
              <p><span className="text-[#FDFBF7] font-medium">Curriculum:</span> {SCHOOL_PROFILE.curriculum}</p>
              <p><span className="text-[#FDFBF7] font-medium">Language:</span> {SCHOOL_PROFILE.language}</p>
            </div>
          </div>

          {/* Navigation Links */}
          <div>
            <h3 className="text-sm font-semibold text-[#FDFBF7] uppercase tracking-wider mb-4">
              Explore
            </h3>
            <ul className="space-y-2.5 text-xs sm:text-sm text-[#C2B8B2]">
              <li>
                <Link href="/" className="hover:text-[#FDFBF7] transition-colors">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/about" className="hover:text-[#FDFBF7] transition-colors">
                  About the Academy
                </Link>
              </li>
              <li>
                <Link href="/programmes" className="hover:text-[#FDFBF7] transition-colors">
                  Academic Programmes
                </Link>
              </li>
              <li>
                <Link href="/admissions" className="hover:text-[#FDFBF7] transition-colors">
                  Admissions
                </Link>
              </li>
              <li>
                <Link href="/gallery" className="hover:text-[#FDFBF7] transition-colors">
                  School Gallery
                </Link>
              </li>
              <li>
                <Link href="/fees" className="hover:text-[#FDFBF7] transition-colors">
                  Fee Schedule
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-[#FDFBF7] transition-colors">
                  Contact Us
                </Link>
              </li>
            </ul>
          </div>

          {/* Admission & Portals */}
          <div>
            <h3 className="text-sm font-semibold text-[#FDFBF7] uppercase tracking-wider mb-4">
              Admissions & Portals
            </h3>
            <ul className="space-y-2.5 text-xs sm:text-sm text-[#C2B8B2]">
              <li>
                <Link href="/admissions" className="hover:text-[#FDFBF7] transition-colors font-semibold text-[#FDFBF7]">
                  Apply for Admission &rarr;
                </Link>
              </li>
              <li>
                <Link href="/admissions/status" className="hover:text-[#FDFBF7] transition-colors">
                  Track Application Status
                </Link>
              </li>
              <li>
                <Link href="/parent" className="hover:text-[#FDFBF7] transition-colors">
                  Parent Portal
                </Link>
              </li>
              <li>
                <Link href="/teacher" className="hover:text-white transition-colors">
                  Teacher Portal
                </Link>
              </li>
              <li>
                <Link href="/admin" className="hover:text-white transition-colors">
                  Admin Portal
                </Link>
              </li>
            </ul>
          </div>

          {/* School Location & Official Bank Details */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
              School Information
            </h3>
            <div className="text-xs sm:text-sm text-stone-300 space-y-1.5 leading-relaxed">
              <p className="font-semibold text-white">{SCHOOL_PROFILE.name}</p>
              <p>{SCHOOL_PROFILE.address}</p>
              <p className="pt-1 text-stone-300">{SCHOOL_PROFILE.contactPerson}</p>
            </div>
            <div className="pt-3 border-t border-stone-800 text-xs text-stone-300 space-y-1">
              <p className="font-semibold text-white">Online Fee Payments:</p>
              <p className="text-xs text-stone-300 flex items-center gap-1.5">
                <span className="text-emerald-400">🔒</span> Secure Online Payment
              </p>
              <p className="text-[11px] text-stone-400">Debit Cards &bull; Bank Transfer &bull; Instant Receipt</p>
            </div>
          </div>
        </div>

        {/* Bottom Bar with high contrast and explicit branding */}
        <div className="pt-8 mt-8 border-t border-stone-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-stone-300">
          <p className="text-stone-300">
            &copy; {new Date().getFullYear()} {SCHOOL_PROFILE.name}. All rights reserved.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-6 text-center sm:text-right text-xs">
            <span className="text-white">
              Powered by: <strong className="text-white font-bold">Elmuaz Technologies LTD</strong>
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

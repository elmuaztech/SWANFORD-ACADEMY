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

            {/* Official Social Media Channels */}
            <div className="pt-3 border-t border-white/15 space-y-2">
              <span className="text-xs font-bold text-amber-300 block uppercase tracking-wider">
                Connect With Us
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Facebook */}
                <a
                  href="https://www.facebook.com/share/1DyyfxxKHU/"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Follow Swanford Academy on Facebook"
                  className="w-9 h-9 min-w-[36px] min-h-[36px] sm:w-10 sm:h-10 sm:min-w-[40px] sm:min-h-[40px] rounded-full bg-white/15 hover:bg-[#1877F2] text-white flex items-center justify-center transition-all duration-200 border border-white/20 hover:border-[#1877F2] shadow-xs hover:scale-105"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                </a>

                {/* Instagram */}
                <a
                  href="https://www.instagram.com/swanford_school_dutse?exln=MXkxazBrODd5bmhudQ=="
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Follow Swanford Academy on Instagram"
                  className="w-9 h-9 min-w-[36px] min-h-[36px] sm:w-10 sm:h-10 sm:min-w-[40px] sm:min-h-[40px] rounded-full bg-white/15 hover:bg-gradient-to-tr hover:from-[#F58529] hover:via-[#DD2A7B] hover:to-[#8134AF] text-white flex items-center justify-center transition-all duration-200 border border-white/20 hover:border-pink-500 shadow-xs hover:scale-105"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                  </svg>
                </a>

                {/* TikTok */}
                <a
                  href="https://www.tiktok.com/@swanfordacademy?_r=1&_t=ZS-9AdgrKxcsnV"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Follow Swanford Academy on TikTok"
                  className="w-9 h-9 min-w-[36px] min-h-[36px] sm:w-10 sm:h-10 sm:min-w-[40px] sm:min-h-[40px] rounded-full bg-white/15 hover:bg-black text-white flex items-center justify-center transition-all duration-200 border border-white/20 hover:border-cyan-400 shadow-xs hover:scale-105"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
                  </svg>
                </a>

                {/* Twitter / X */}
                <a
                  href="https://x.com/swanford99"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Follow Swanford Academy on X"
                  className="w-9 h-9 min-w-[36px] min-h-[36px] sm:w-10 sm:h-10 sm:min-w-[40px] sm:min-h-[40px] rounded-full bg-white/15 hover:bg-black text-white flex items-center justify-center transition-all duration-200 border border-white/20 hover:border-white shadow-xs hover:scale-105"
                >
                  <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </a>

                {/* YouTube */}
                <a
                  href="https://youtube.com/@swanfordschooldutse5523?si=TPxi5sP0GrF80A1_"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Swanford Academy on YouTube"
                  className="w-9 h-9 min-w-[36px] min-h-[36px] sm:w-10 sm:h-10 sm:min-w-[40px] sm:min-h-[40px] rounded-full bg-white/15 hover:bg-[#FF0000] text-white flex items-center justify-center transition-all duration-200 border border-white/20 hover:border-[#FF0000] shadow-xs hover:scale-105"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                  </svg>
                </a>
              </div>
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

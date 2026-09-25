'use client';

import React from 'react';
import Link from 'next/link';

export default function DownloadPage() {
  return (
    <div className="min-h-screen bg-[#FDFBF7] flex flex-col items-center justify-center p-6 text-stone-900 font-sans">
      <div className="max-w-md w-full bg-white rounded-3xl border border-[#EADBDA] shadow-xl p-8 text-center space-y-6">
        
        {/* School Crest */}
        <div className="w-20 h-20 mx-auto">
          <img
            src="/images/swanford-logo.jpg"
            alt="Swanford Academy Crest"
            className="w-full h-full object-contain"
          />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-extrabold text-[#5B0612] tracking-tight">
            Swanford Academy
          </h1>
          <p className="text-sm font-semibold text-stone-600">
            Complete Project Archive (.ZIP)
          </p>
          <p className="text-xs text-stone-500 leading-relaxed">
            Includes full Next.js application source code, Prisma migrations, master specifications, and test suites.
          </p>
        </div>

        <div className="p-4 bg-[#FAF7F2] border border-[#E8DFC8] rounded-2xl text-left text-xs text-stone-600 space-y-1.5">
          <div className="flex justify-between">
            <span className="font-semibold text-stone-700">Filename:</span>
            <span className="font-mono text-stone-900 font-bold">SWANFORD_ACADEMY.zip</span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold text-stone-700">File Size:</span>
            <span className="font-mono text-[#800020] font-bold">5.57 MB</span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold text-stone-700">Format:</span>
            <span>Standard Compressed ZIP</span>
          </div>
        </div>

        {/* Direct Download Button */}
        <div>
          <a
            href="/api/download"
            download="SWANFORD_ACADEMY.zip"
            className="w-full min-h-[52px] inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl font-bold text-base bg-[#800020] hover:bg-[#5B0612] text-white shadow-lg hover:shadow-xl transition-all cursor-pointer"
          >
            <span>⬇️</span>
            <span>Download Project ZIP (5.57 MB)</span>
          </a>
        </div>

        <div className="pt-2 border-t border-[#EADBDA] flex items-center justify-center gap-4 text-xs text-stone-500">
          <Link href="/" className="hover:text-[#800020] underline font-medium">
            Home Page
          </Link>
          <span>&bull;</span>
          <Link href="/auth/login" className="hover:text-[#800020] underline font-medium">
            Portal Login
          </Link>
        </div>

      </div>
    </div>
  );
}

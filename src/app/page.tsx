import React from 'react';
import Link from 'next/link';
import { SCHOOL_PROFILE } from '@/lib/constants';
import { Navbar, PublicFooter, Button } from '@/components';
import { AdmissionAnnouncementBanner } from '@/components/public/admission-announcement-banner';

import { prisma } from '@/lib/prisma';
import { AdmissionCycleStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `${SCHOOL_PROFILE.name} — ${SCHOOL_PROFILE.subtitle}`,
  description: `${SCHOOL_PROFILE.name} in Dutse, Jigawa State. Offering Early Years, Nigerian Primary Curriculum, and Standalone Tahfeez. Motto: “${SCHOOL_PROFILE.motto}”.`,
};

export default async function HomePage() {
  const activeSession = await prisma.academicSession.findFirst({
    where: { isCurrent: true },
    select: { id: true, name: true },
  });

  const openCycle = activeSession
    ? await prisma.admissionCycle.findFirst({
        where: {
          academicSessionId: activeSession.id,
          status: AdmissionCycleStatus.OPEN,
        },
        select: { id: true },
      })
    : null;

  const activeSessionName = activeSession?.name || '';
  const isOpen = Boolean(activeSession && openCycle);
  const initialBannerData = {
    isOpen,
    activeSessionName: activeSessionName || 'Upcoming Session',
    announcement: !activeSessionName
      ? 'Admissions are currently closed.'
      : isOpen
        ? `Admissions for ${activeSessionName} are now open.`
        : `Admissions for ${activeSessionName} are currently closed.`,
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FFFFFF] text-[#1C1A1A] font-sans w-full max-w-full overflow-x-hidden">
      {/* Universal Top Navigation */}
      <Navbar currentPath="/" />

      {/* Dynamic Admission Announcement Banner from PostgreSQL */}
      <AdmissionAnnouncementBanner initialData={initialBannerData} />

      <main className="flex-1 w-full max-w-full overflow-x-hidden">
        {/* ========================================================= */}
        {/* 1. HERO SECTION (Refined Institutional Styling) */}
        {/* ========================================================= */}
        <section className="relative bg-[#FDFBF7] border-b border-[#EADBDA] overflow-hidden py-6 sm:py-10 lg:py-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            
            {/* Main Rounded Hero Card */}
            <div className="relative rounded-[28px] sm:rounded-[36px] overflow-hidden bg-gradient-to-b from-[#3B030A] via-[#4D0610] to-[#250105] border border-[#6B1420] text-white shadow-2xl px-4 py-6 sm:p-12 lg:p-16 text-center max-w-5xl mx-auto">
              
              {/* Subtle authentic student backdrop image with deep dark overlay */}
              <div 
                className="absolute inset-0 bg-cover bg-center opacity-15 mix-blend-luminosity scale-105 pointer-events-none"
                style={{ backgroundImage: "url('/images/hero-students.jpg')" }}
              />
              <div className="absolute inset-0 bg-gradient-to-b from-[#2F0208]/92 via-[#45050E]/85 to-[#1F0104]/95 pointer-events-none" />
              <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#F5D061_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />

              {/* Foreground Centered Content */}
              <div className="relative z-10 space-y-4 sm:space-y-5">
                
                {/* Complete Sacred Basmalah in Classical Arabic Calligraphy */}
                <div className="flex items-center justify-center mx-auto" dir="rtl" lang="ar">
                  <p 
                    className="font-arabic text-2xl min-[360px]:text-[26px] min-[390px]:text-3xl sm:text-4xl md:text-[40px] text-[#F5D061] font-normal leading-normal sm:leading-relaxed tracking-normal drop-shadow-[0_2px_8px_rgba(0,0,0,0.65)] select-none antialiased py-0.5"
                    title="بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ"
                    aria-label="بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ"
                  >
                    بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
                  </p>
                </div>

                {/* Single Centered "WELCOME TO" Pill: Cream Background with Maroon Text */}
                <div className="inline-flex items-center justify-center px-5 sm:px-6 py-1.5 sm:py-2 rounded-full bg-[#F5EBDC] border border-[#DFCBB5] text-[#5B0612] text-xs sm:text-sm font-extrabold tracking-widest font-heading shadow-sm mx-auto animate-welcome-pulse">
                  <span>WELCOME TO</span>
                </div>

                {/* Institutional School Heading in Pure White (#FFFFFF) */}
                <div className="space-y-2 sm:space-y-2.5">
                  <h1 
                    className="text-[20px] min-[360px]:text-[22px] min-[390px]:text-[26px] sm:text-4xl md:text-5xl lg:text-[60px] font-extrabold tracking-tight text-white !text-white text-[#FFFFFF] !text-[#FFFFFF] hero-school-title font-heading leading-tight max-w-4xl mx-auto drop-shadow-sm whitespace-nowrap"
                    style={{ color: '#FFFFFF' }}
                  >
                    SWANFORD ACADEMY
                  </h1>
                  <p className="text-[10px] min-[360px]:text-[11.5px] min-[390px]:text-xs sm:text-base md:text-lg text-[#F5D061] font-bold tracking-wider uppercase font-heading leading-relaxed max-w-xl mx-auto">
                    Nursery, Primary &amp; Tahfeez School &mdash; Dutse
                  </p>

                  {/* Official School Motto (Playfair Display Italic Serif) */}
                  <p className="text-base sm:text-xl md:text-2xl text-[#FDFCF9] font-normal italic font-motto pt-1 drop-shadow-xs">
                    &ldquo;Illuminating the Path to Success&rdquo;
                  </p>
                </div>

                {/* Centered Descriptive Paragraph with crisp high contrast */}
                <p className="text-sm sm:text-base text-stone-100 leading-relaxed max-w-2xl mx-auto font-normal px-2 pt-1 font-sans">
                  Dedicated to developing educated, disciplined, and responsible young leaders equipped with sound knowledge, moral character, and lifelong skills through the blended Nigerian curriculum and standalone Tahfeez in Dutse, Jigawa State.
                </p>

                {/* Three Main Action Buttons: Consistent height (h-12), straight line text, reasonable font size, stack on mobile */}
                <div className="pt-3 sm:pt-4 max-w-2xl mx-auto w-full">
                  {!isOpen && (
                    <div className="mb-3 inline-block px-4 py-1.5 rounded-xl bg-black/40 border border-white/20 text-stone-200 text-xs sm:text-sm font-medium">
                      Admissions for {activeSessionName} are currently closed.
                    </div>
                  )}
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full">
                    <Link href="/admissions" className="w-full sm:w-auto">
                      <button className="w-full sm:w-auto min-h-[48px] h-12 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-sans font-bold text-sm whitespace-nowrap bg-[#F59E0B] hover:bg-[#D97706] text-stone-950 shadow-md hover:shadow-lg transition-all cursor-pointer">
                        <span>{isOpen ? "Enroll Your Child" : "Admissions Guide"}</span>
                        <span aria-hidden="true">&rarr;</span>
                      </button>
                    </Link>

                    <Link href="/programmes" className="w-full sm:w-auto">
                      <button className="w-full sm:w-auto min-h-[48px] h-12 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-sans font-bold text-sm whitespace-nowrap bg-white/10 hover:bg-white/20 text-white border border-white/30 shadow-md hover:shadow-lg transition-all cursor-pointer">
                        <span>Explore Programmes</span>
                        <span aria-hidden="true">&rarr;</span>
                      </button>
                    </Link>

                    <Link href="/auth/login" className="w-full sm:w-auto">
                      <button className="w-full sm:w-auto min-h-[48px] h-12 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-sans font-bold text-sm whitespace-nowrap bg-white hover:bg-[#FDFBF7] text-[#800020] border border-white shadow-md hover:shadow-lg transition-all cursor-pointer">
                        <span>Portal Login</span>
                        <span aria-hidden="true">&rarr;</span>
                      </button>
                    </Link>
                  </div>
                </div>

              </div>

            </div>

            {/* Featured Authentic Pupils & Teachers Image */}
            <div className="mt-10 sm:mt-14 relative max-w-4xl mx-auto" data-reveal="fade-up">
              {/* Floating Accent Tag */}
              <div className="absolute -top-4 -right-2 sm:-top-5 sm:right-6 z-10 bg-white/95 backdrop-blur-sm px-4 py-2 rounded-2xl border border-[#EADBDA] shadow-md transform rotate-2">
                <span className="text-xs font-bold text-[#800020] font-sans flex items-center gap-1.5">
                  Today A Brighter Tomorrow
                </span>
              </div>

              {/* Curved Authentic School Photo Frame */}
              <div className="curved-image overflow-hidden aspect-[16/10] sm:aspect-[16/9] bg-stone-100 shadow-2xl">
                <img
                  src="/images/hero-students-authentic.jpg"
                  alt="Swanford Academy pupils and teachers in school uniform outside the school campus"
                  className="w-full h-full object-cover object-center transform hover:scale-105 transition-transform duration-700"
                />
              </div>

              {/* Decorative soft backdrop glow */}
              <div className="absolute -inset-4 bg-gradient-to-tr from-[#800020]/15 to-amber-500/10 rounded-3xl -z-10 blur-2xl pointer-events-none" />
            </div>

            {/* 3 Centered Value Badges */}
            <div className="mt-8 pt-6 grid grid-cols-3 gap-3 border-t border-[#EADBDA]/80 max-w-xl mx-auto" data-reveal="fade-up" data-delay="100">
              <div className="flex flex-col sm:flex-row items-center justify-center gap-2 text-center sm:text-left">
                <div className="w-8 h-8 rounded-lg bg-[#FDF2F4] text-[#800020] flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
                <span className="text-[11px] sm:text-xs font-semibold text-stone-800 font-display leading-tight">Quality Education</span>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-2 text-center sm:text-left">
                <div className="w-8 h-8 rounded-lg bg-[#FDF2F4] text-[#800020] flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <span className="text-[11px] sm:text-xs font-semibold text-stone-800 font-display leading-tight">Caring Environment</span>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-2 text-center sm:text-left">
                <div className="w-8 h-8 rounded-lg bg-[#FDF2F4] text-[#800020] flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <span className="text-[11px] sm:text-xs font-semibold text-stone-800 font-display leading-tight">Islamic Values</span>
              </div>
            </div>

          </div>
        </section>

        {/* ========================================================= */}
        {/* 2. WHY CHOOSE SWANFORD (Matches Reference Layout) */}
        {/* ========================================================= */}
        <section className="py-16 sm:py-20 bg-white border-b border-[#EADBDA] overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
              
              {/* Left Column Description */}
              <div className="lg:col-span-5 space-y-5" data-reveal="fade-left">
                <div className="inline-block px-3 py-1 bg-[#F5F0EB] text-[#5B0612] rounded-lg text-xs font-bold uppercase tracking-wider font-display">
                  Why Choose Swanford
                </div>
                <h2 className="text-2xl sm:text-4xl font-extrabold text-[#5B0612] tracking-tight leading-snug font-display">
                  A Strong Foundation for a Brighter Future
                </h2>
                <p className="text-sm sm:text-base text-[#524B46] leading-relaxed">
                  We are committed to raising well-rounded children through academic excellence, moral values, and a supportive learning environment tailored for every child.
                </p>
                <div className="pt-2">
                  <Link href="/about">
                    <Button variant="primary" size="md" className="bg-[#800020] hover:bg-[#5B0612] text-white rounded-xl font-display">
                      Learn More About Us &rarr;
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Right Column 4 Feature Cards Grid */}
              <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* 1. Experienced Teachers */}
                <div className="card-curved bg-[#FDFBF7] p-6 space-y-3" data-reveal="fade-up" data-delay="50">
                  <div className="w-11 h-11 rounded-xl bg-[#FDF2F4] text-[#800020] flex items-center justify-center">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  </div>
                  <h3 className="text-base font-bold text-[#5B0612] font-display">Experienced Teachers</h3>
                  <p className="text-xs sm:text-sm text-[#524B46] leading-relaxed">
                    Qualified and passionate educators dedicated to individualized student support and creative teaching methods.
                  </p>
                </div>

                {/* 2. Conducive Learning Environment */}
                <div className="card-curved bg-[#FDFBF7] p-6 space-y-3" data-reveal="fade-up" data-delay="150">
                  <div className="w-11 h-11 rounded-xl bg-[#FDF2F4] text-[#800020] flex items-center justify-center">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <h3 className="text-base font-bold text-[#5B0612] font-display">Conducive Learning Environment</h3>
                  <p className="text-xs sm:text-sm text-[#524B46] leading-relaxed">
                    Spacious, well-ventilated classrooms with child-friendly furniture designed for active discovery and focus.
                  </p>
                </div>

                {/* 3. Moral & Islamic Values */}
                <div className="card-curved bg-[#FDFBF7] p-6 space-y-3" data-reveal="fade-up" data-delay="250">
                  <div className="w-11 h-11 rounded-xl bg-[#FDF2F4] text-[#800020] flex items-center justify-center">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  </div>
                  <h3 className="text-base font-bold text-[#5B0612] font-display">Moral &amp; Islamic Values</h3>
                  <p className="text-xs sm:text-sm text-[#524B46] leading-relaxed">
                    Character formation centered around integrity, empathy, respectful conduct, and spiritual grounding.
                  </p>
                </div>

                {/* 4. Holistic Development */}
                <div className="card-curved bg-[#FDFBF7] p-6 space-y-3" data-reveal="fade-up" data-delay="350">
                  <div className="w-11 h-11 rounded-xl bg-[#FDF2F4] text-[#800020] flex items-center justify-center">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                  </div>
                  <h3 className="text-base font-bold text-[#5B0612] font-display">Holistic Development</h3>
                  <p className="text-xs sm:text-sm text-[#524B46] leading-relaxed">
                    Nurturing cognitive, physical, creative, and emotional capabilities for lifelong personal success.
                  </p>
                </div>

              </div>

            </div>
          </div>
        </section>

        {/* ========================================================= */}
        {/* 3. OUR PROGRAMMES (Curved Cards with Real Photos) */}
        {/* ========================================================= */}
        <section id="our-programmes" className="py-16 sm:py-24 bg-[#FDFBF7] border-b border-[#EADBDA] overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            
            <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16 space-y-3" data-reveal="fade-up">
              <div className="inline-block px-3 py-1 bg-[#EADBDA] text-[#5B0612] rounded-lg text-xs font-bold uppercase tracking-wider font-display">
                Our Programmes
              </div>
              <h2 className="text-2xl sm:text-4xl font-extrabold text-[#5B0612] tracking-tight font-display">
                Structured Educational Programmes
              </h2>
              <p className="text-sm sm:text-base text-[#524B46]">
                We offer a comprehensive curriculum designed for each stage of your child&apos;s learning journey.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              
              {/* Card 1: Early Years (Real Classroom Image) */}
              <div className="card-curved bg-white overflow-hidden shadow-xs hover:border-[#800020] flex flex-col justify-between group" data-reveal="fade-up" data-delay="50">
                <div>
                  <div className="h-52 w-full overflow-hidden bg-stone-100 relative border-b border-[#EADBDA]">
                    <img
                      src="/images/classroom.jpg"
                      alt="Early Years pupils learning in Swanford Academy classroom"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-xs px-2.5 py-1 rounded-md text-[11px] font-bold text-[#800020] font-display">
                      Early Years
                    </div>
                  </div>
                  <div className="p-6 space-y-3">
                    <h3 className="text-xl font-bold text-[#5B0612] font-display">Early Years</h3>
                    <p className="text-xs font-semibold text-[#800020] uppercase tracking-wider font-display">
                      Creche &bull; Pre-School &bull; Nursery 1 &amp; 2
                    </p>
                    <p className="text-sm text-[#524B46] leading-relaxed">
                      A stimulating, nurturing foundation cultivating language acquisition, motor skills, interactive play, and respectful social manners.
                    </p>
                  </div>
                </div>
                <div className="p-6 pt-0">
                  <Link href="/programmes#early-years">
                    <Button variant="outline" size="sm" className="w-full text-xs font-bold rounded-xl border-[#EADBDA] hover:border-[#800020] hover:text-[#800020] font-display">
                      Learn More &rarr;
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Card 2: Primary School (Real Students Parade/Drill Image) */}
              <div className="card-curved bg-white overflow-hidden shadow-xs hover:border-[#800020] flex flex-col justify-between group" data-reveal="fade-up" data-delay="150">
                <div>
                  <div className="h-52 w-full overflow-hidden bg-stone-100 relative border-b border-[#EADBDA]">
                    <img
                      src="/images/students-parade.jpg"
                      alt="Swanford Academy primary students during school activities"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-xs px-2.5 py-1 rounded-md text-[11px] font-bold text-[#800020] font-display">
                      Primary School
                    </div>
                  </div>
                  <div className="p-6 space-y-3">
                    <h3 className="text-xl font-bold text-[#5B0612] font-display">Primary School</h3>
                    <p className="text-xs font-semibold text-[#800020] uppercase tracking-wider font-display">
                      Primary 1 to Primary 6
                    </p>
                    <p className="text-sm text-[#524B46] leading-relaxed">
                      Blended Nigerian standard curriculum delivering excellence in Mathematics, English, Sciences, ICT, and continuous assessments.
                    </p>
                  </div>
                </div>
                <div className="p-6 pt-0">
                  <Link href="/programmes#primary">
                    <Button variant="outline" size="sm" className="w-full text-xs font-bold rounded-xl border-[#EADBDA] hover:border-[#800020] hover:text-[#800020] font-display">
                      Learn More &rarr;
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Card 3: Tahfeez Programme (Tahfeez Student Image) */}
              <div className="card-curved bg-white overflow-hidden shadow-xs hover:border-[#800020] flex flex-col justify-between group" data-reveal="fade-up" data-delay="250">
                <div>
                  <div className="h-52 w-full bg-gradient-to-br from-[#3B030A] via-[#5B0612] to-[#45050E] relative border-b border-[#EADBDA] flex flex-col items-center justify-center p-6 text-center text-white overflow-hidden group-hover:from-[#45050E] group-hover:to-[#5B0612] transition-colors">
                    <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#F5D061_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
                    <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-white mb-2.5 shadow-inner">
                      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                    </div>
                    <span className="text-xs font-bold text-[#F3D884] uppercase tracking-widest font-display">
                      Standalone Programme
                    </span>
                    <span className="text-base sm:text-lg font-extrabold text-white font-display mt-0.5">
                      Qur&apos;an &amp; Tajweed Studies
                    </span>
                    <div className="absolute top-3 left-3 bg-[#800020] border border-white/20 text-white px-2.5 py-0.5 rounded-md text-[10px] font-bold font-display">
                      Tahfeez Standalone
                    </div>
                  </div>
                  <div className="p-6 space-y-3">
                    <h3 className="text-xl font-bold text-[#5B0612] font-display">Tahfeez Programme</h3>
                    <p className="text-xs font-semibold text-[#800020] uppercase tracking-wider font-display">
                      Qur&apos;an Memorisation with Academics
                    </p>
                    <p className="text-sm text-[#524B46] leading-relaxed">
                      Dedicated Quranic memorization, proper Tajweed articulation, and noble Islamic etiquette. Can be taken standalone or alongside primary schooling.
                    </p>
                  </div>
                </div>
                <div className="p-6 pt-0">
                  <Link href="/programmes#tahfeez">
                    <Button variant="primary" size="sm" className="w-full text-xs font-bold rounded-xl bg-[#800020] hover:bg-[#5B0612] text-white font-display">
                      Learn More &rarr;
                    </Button>
                  </Link>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* ========================================================= */}
        {/* 4. MAROON CALLOUT BANNER: "BE PART OF THEIR JOURNEY" */}
        {/* ========================================================= */}
        <section className="py-16 sm:py-20 bg-[#5B0612] text-white relative overflow-hidden">
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#FFFFFF_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              
              {/* 3 Values on Left */}
              <div className="lg:col-span-6 grid grid-cols-3 gap-4 text-center" data-reveal="fade-left">
                <div className="space-y-2.5">
                  <div className="w-12 h-12 mx-auto rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  </div>
                  <span className="text-xs sm:text-sm font-semibold block leading-tight font-display text-white/90">
                    Knowledge Today
                  </span>
                </div>

                <div className="space-y-2.5">
                  <div className="w-12 h-12 mx-auto rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <span className="text-xs sm:text-sm font-semibold block leading-tight font-display text-white/90">
                    Good Character Tomorrow
                  </span>
                </div>

                <div className="space-y-2.5">
                  <div className="w-12 h-12 mx-auto rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                    </svg>
                  </div>
                  <span className="text-xs sm:text-sm font-semibold block leading-tight font-display text-white/90">
                    A Brighter Society
                  </span>
                </div>
              </div>

              {/* Call to Action on Right */}
              <div className="lg:col-span-6 lg:border-l lg:border-white/20 lg:pl-10 space-y-4" data-reveal="fade-right">
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight font-display">
                  Be Part of Their Journey
                </h2>
                <p className="text-sm text-white/80 leading-relaxed max-w-md">
                  Give your child the opportunity to learn, grow, and thrive in a supportive, disciplined, and values-driven environment.
                </p>
                <div className="pt-1">
                  {isOpen ? (
                    <Link href="/admissions">
                      <Button variant="outline" size="lg" className="bg-white text-[#5B0612] hover:bg-stone-100 hover:text-[#5B0612] border-white font-bold rounded-xl shadow-md font-sans">
                        Apply for Admission &rarr;
                      </Button>
                    </Link>
                  ) : (
                    <Link href="/contact">
                      <Button variant="outline" size="lg" className="bg-white text-[#5B0612] hover:bg-stone-100 hover:text-[#5B0612] border-white font-bold rounded-xl shadow-md font-sans">
                        Contact Admissions Office &rarr;
                      </Button>
                    </Link>
                  )}
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* ========================================================= */}
        {/* 5. OUR CAMPUS: SAFE & INSPIRING (Real School Building Gate) */}
        {/* ========================================================= */}
        <section className="py-16 sm:py-24 bg-white border-b border-[#EADBDA] overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
              
              {/* Left Column: Campus Information */}
              <div className="lg:col-span-6 space-y-6" data-reveal="fade-left">
                <div className="inline-block px-3 py-1 bg-[#F5F0EB] text-[#5B0612] rounded-lg text-xs font-bold uppercase tracking-wider font-display">
                  Our Campus
                </div>

                <h2 className="text-2xl sm:text-4xl font-extrabold text-[#5B0612] tracking-tight font-display leading-snug">
                  A Safe and Inspiring Environment
                </h2>

                <p className="text-sm sm:text-base text-[#524B46] leading-relaxed">
                  Swanford Academy is located at PLOT 212, DR NUHU MUHAMMADU SANUSI WAY, DUTSE, JIGAWA STATE. We welcome you to visit our school and experience our warm and conducive learning environment.
                </p>

                {/* Key Facility Highlights */}
                <div className="space-y-3 text-xs sm:text-sm text-[#524B46]">
                  <div className="flex items-center gap-3">
                    <span className="w-5 h-5 rounded-full bg-[#FDF2F4] text-[#800020] flex items-center justify-center shrink-0 text-xs font-bold">✓</span>
                    <span>Secure, peaceful gated perimeter with dedicated security supervision</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-5 h-5 rounded-full bg-[#FDF2F4] text-[#800020] flex items-center justify-center shrink-0 text-xs font-bold">✓</span>
                    <span>Dedicated Early Years wing tailored for infant and toddler development</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-5 h-5 rounded-full bg-[#FDF2F4] text-[#800020] flex items-center justify-center shrink-0 text-xs font-bold">✓</span>
                    <span>Dedicated Tahfeez library &amp; recitation classrooms with Tajweed instruction</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-5 h-5 rounded-full bg-[#FDF2F4] text-[#800020] flex items-center justify-center shrink-0 text-xs font-bold">✓</span>
                    <span>Open for scheduled prospective parent visits and academic counselling</span>
                  </div>
                </div>

                <div className="pt-2 flex flex-col sm:flex-row gap-3.5">
                  <Link href="/contact">
                    <Button variant="primary" size="md" className="bg-[#800020] hover:bg-[#5B0612] text-white rounded-xl font-display">
                      Get Directions &amp; Contact &rarr;
                    </Button>
                  </Link>
                  <Link href="/admissions">
                    <Button variant="outline" size="md" className="rounded-xl border-[#EADBDA] text-stone-800 hover:border-[#800020] hover:text-[#800020] font-display">
                      Admissions Information
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Right Column: Real School Entrance Image & Official Timing Card */}
              <div className="lg:col-span-6 space-y-6">
                <div className="relative mx-auto max-w-lg lg:max-w-none" data-reveal="fade-right">
                  
                  {/* Floating Location Badge */}
                  <div className="absolute -bottom-4 left-2 sm:-bottom-5 sm:left-4 z-10 bg-white/95 backdrop-blur-sm px-3.5 py-2 rounded-2xl border border-[#EADBDA] shadow-md max-w-[280px] sm:max-w-none">
                    <p className="text-xs font-bold text-[#800020] font-display flex items-center gap-1.5">
                      <span>📍</span> Plot 212, Dr Nuhu Muhammadu Sanusi Way
                    </p>
                    <p className="text-[11px] text-[#524B46] font-medium">
                      Dutse, Jigawa State &bull; Main Campus
                    </p>
                  </div>

                  {/* Real School Gate Photo */}
                  <div className="curved-image overflow-hidden aspect-[4/3] bg-stone-100 group shadow-md">
                    <img
                      src="/images/school-gate.jpg"
                      alt="Swanford Academy campus entrance gate and school tower in Dutse"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                    />
                  </div>

                  {/* Subtle Accent Backdrop Glow */}
                  <div className="absolute -inset-4 bg-gradient-to-tr from-[#800020]/10 to-amber-500/5 rounded-3xl -z-10 blur-xl pointer-events-none" />
                </div>

                {/* Official School Timing / Schedule Box */}
                <div className="bg-[#FAF7F2] border border-[#EADBDA] rounded-2xl p-4 sm:p-5 shadow-xs text-left" data-reveal="fade-up" data-delay="100">
                  <div className="flex items-center justify-between gap-2 mb-3.5 pb-2.5 border-b border-[#EADBDA]">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#800020]" />
                      <h3 className="text-xs sm:text-sm font-bold text-[#5B0612] uppercase tracking-wider font-display">
                        Official School Schedule &amp; Timings
                      </h3>
                    </div>
                    <span className="text-[10px] sm:text-[11px] font-bold text-[#800020] bg-[#FAF2F4] px-2 py-0.5 rounded-md border border-[#EADBDA]">
                      Active Schedule
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Conventional Section */}
                    <div className="bg-white rounded-xl p-3.5 border border-[#EADBDA]/80 shadow-2xs">
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-stone-100">
                        <span className="font-bold text-xs text-[#5B0612] font-display">Conventional Section</span>
                        <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          Academic
                        </span>
                      </div>
                      <div className="space-y-1.5 text-xs text-[#524B46]">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-medium text-stone-600">Monday &ndash; Thursday:</span>
                          <span className="font-bold text-stone-900 whitespace-nowrap">7:30am &ndash; 2:00pm</span>
                        </div>
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-medium text-stone-600">Friday:</span>
                          <span className="font-bold text-stone-900 whitespace-nowrap">7:30am &ndash; 12:00pm</span>
                        </div>
                      </div>
                    </div>

                    {/* Tahfeez Section */}
                    <div className="bg-white rounded-xl p-3.5 border border-[#EADBDA]/80 shadow-2xs">
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-stone-100">
                        <span className="font-bold text-xs text-[#5B0612] font-display">Tahfeez Section</span>
                        <span className="text-[10px] font-bold text-[#800020] bg-[#FAF2F4] px-2 py-0.5 rounded-full border border-[#EADBDA]">
                          Quranic
                        </span>
                      </div>
                      <div className="space-y-1.5 text-xs text-[#524B46]">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-medium text-stone-600">Weekends:</span>
                          <span className="font-bold text-stone-900 whitespace-nowrap">8:30am &ndash; 12:00pm</span>
                        </div>
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-medium text-stone-600">Monday &ndash; Wednesday:</span>
                          <span className="font-bold text-stone-900 whitespace-nowrap">2:30pm &ndash; 5:30pm</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* ========================================================= */}
        {/* 6. SCHOOL GALLERY PREVIEW */}
        {/* ========================================================= */}
        <section className="py-16 sm:py-20 bg-[#FAF7F2] border-b border-[#EADBDA] overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8" data-reveal="fade-up">
              <div className="space-y-2">
                <div className="inline-block px-3 py-1 bg-[#EADBDA] text-[#5B0612] rounded-full text-xs font-bold uppercase tracking-wider font-display">
                  Campus Life
                </div>
                <h2 className="text-2xl sm:text-4xl font-extrabold text-[#5B0612] tracking-tight font-display">
                  Moments at Swanford Academy
                </h2>
                <p className="text-sm text-stone-600 max-w-xl leading-relaxed">
                  Discover daily student interactions, academic discovery, Tahfeez recitation sessions, and enriching school events.
                </p>
              </div>
              <div>
                <Link href="/gallery">
                  <Button variant="outline" size="md" className="border-[#EADBDA] hover:border-[#800020] text-[#800020] font-bold rounded-xl font-display">
                    View School Gallery &rarr;
                  </Button>
                </Link>
              </div>
            </div>

            <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#EADBDA] text-center space-y-4" data-reveal="fade-up" data-delay="100">
              <p className="text-sm text-stone-600 max-w-lg mx-auto">
                Explore authentic photographs of our learning spaces, campus events, and student milestones in our curated school gallery.
              </p>
              <Link href="/gallery" className="inline-block">
                <Button variant="primary" size="md" className="bg-[#800020] hover:bg-[#5B0612] text-white rounded-xl font-display">
                  Explore Full Gallery &rarr;
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* ========================================================= */}
        {/* 7. TRANSPARENT FINANCIAL POLICY */}
        {/* ========================================================= */}
        <section className="py-16 sm:py-20 bg-white border-b border-[#EADBDA] overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="bg-[#FAF7F2] p-8 sm:p-12 rounded-3xl border border-[#EADBDA] shadow-xs" data-reveal="fade-up">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                <div className="lg:col-span-8 space-y-3">
                  <div className="inline-block px-3 py-1 bg-[#EADBDA] text-[#5B0612] rounded-lg text-xs font-bold uppercase tracking-wider font-display">
                    Tuition &amp; Fees
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-[#5B0612] tracking-tight font-display">
                    Transparent Invoicing &amp; Payment Process
                  </h2>
                  <p className="text-sm sm:text-base text-[#524B46] leading-relaxed">
                    Official programme fees and tuition schedules are provided directly in your official admission invoice after application review. Enjoy transparent billing with instant automated receipts and multiple payment options.
                  </p>
                </div>

                <div className="lg:col-span-4 flex flex-col sm:flex-row lg:flex-col gap-3">
                  <Link href="/fees" className="w-full">
                    <Button variant="primary" size="md" className="w-full py-3 bg-[#800020] hover:bg-[#5B0612] text-white rounded-xl font-display">
                      Learn About Fee Policy &rarr;
                    </Button>
                  </Link>
                  {isOpen ? (
                    <Link href="/admissions" className="w-full">
                      <Button variant="outline" size="md" className="w-full py-3 rounded-xl border-[#EADBDA] text-stone-800 hover:border-[#800020] hover:text-[#800020] font-sans">
                        Apply Online
                      </Button>
                    </Link>
                  ) : (
                    <Link href="/contact" className="w-full">
                      <Button variant="outline" size="md" className="w-full py-3 rounded-xl border-[#EADBDA] text-stone-800 hover:border-[#800020] hover:text-[#800020] font-sans">
                        Contact Admissions Office
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Public Footer */}
      <PublicFooter />

      {/* Floating Animated Authentic WhatsApp Action Button */}
      <a
        href="https://wa.me/2348036950352?text=Hello%20Swanford%20Academy%20Admissions%2C%20I%20would%20like%20to%20make%20an%20inquiry."
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 flex items-center justify-center w-13 h-13 sm:w-14 sm:h-14 bg-[#25D366] hover:bg-[#20ba5a] text-white rounded-full shadow-2xl hover:scale-110 active:scale-95 transition-all duration-300 animate-whatsapp-float group cursor-pointer"
        aria-label="Chat with Swanford Academy Admissions on WhatsApp"
      >
        <svg className="w-7 h-7 sm:w-8 sm:h-8 fill-current" viewBox="0 0 24 24">
          <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2ZM12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19.01L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 14.99 3.8 13.47 3.8 11.91C3.81 7.37 7.5 3.67 12.05 3.67ZM8.53 7.33C8.37 7.33 8.1 7.39 7.87 7.64C7.65 7.89 7.02 8.48 7.02 9.68C7.02 10.88 7.89 12.04 8.01 12.2C8.13 12.37 9.73 14.83 12.18 15.89C12.77 16.14 13.22 16.29 13.58 16.41C14.17 16.59 14.71 16.57 15.14 16.5C15.62 16.43 16.61 15.9 16.82 15.32C17.02 14.73 17.02 14.23 16.96 14.13C16.9 14.03 16.74 13.97 16.49 13.85C16.24 13.72 15.04 13.13 14.81 13.05C14.59 12.96 14.42 12.92 14.26 13.17C14.09 13.41 13.62 13.97 13.47 14.13C13.33 14.3 13.18 14.32 12.93 14.2C12.69 14.07 11.89 13.81 10.95 12.97C10.22 12.31 9.72 11.51 9.6 11.26C9.48 11.01 9.59 10.88 9.71 10.76C9.82 10.65 9.96 10.47 10.08 10.32C10.21 10.18 10.25 10.07 10.33 9.91C10.41 9.74 10.37 9.6 10.31 9.47C10.25 9.35 9.76 8.14 9.55 7.64C9.35 7.15 9.15 7.22 8.99 7.21C8.85 7.2 8.68 7.2 8.53 7.33Z"/>
        </svg>
        <span className="absolute right-16 px-3 py-1.5 bg-stone-900 text-white text-xs font-medium rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg">
          Chat with Admissions
        </span>
      </a>
    </div>
  );
}

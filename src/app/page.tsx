import React from 'react';
import Link from 'next/link';
import { SCHOOL_PROFILE } from '@/lib/constants';
import { Navbar, PublicFooter, Button, Card, CardContent } from '@/components';

export const metadata = {
  title: `${SCHOOL_PROFILE.name} — ${SCHOOL_PROFILE.subtitle}`,
  description: `${SCHOOL_PROFILE.name} in Dutse, Jigawa State. Offering Early Years, Nigerian Primary Curriculum, and Standalone Tahfeez. Motto: “${SCHOOL_PROFILE.motto}”.`,
};

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#FFFFFF] text-[#1C1A1A]">
      {/* Universal Top Navigation */}
      <Navbar currentPath="/" />

      <main className="flex-1">
        {/* ========================================================= */}
        {/* 1. HERO SECTION */}
        {/* ========================================================= */}
        <section className="relative bg-[#FDFBF7] border-b border-[#EADBDA] overflow-hidden py-16 sm:py-24 lg:py-32">
          {/* Subtle Decorative Pattern */}
          <div className="absolute inset-0 opacity-[0.03] bg-[radial-gradient(#5B0612_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#EADBDA]/60 border border-[#EADBDA] text-[#5B0612] text-xs sm:text-sm font-semibold mb-6">
              <span className="w-2 h-2 rounded-full bg-[#5B0612]" />
              {SCHOOL_PROFILE.subtitle}
            </div>

            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-[#1C1A1A] max-w-4xl mx-auto leading-tight">
              {SCHOOL_PROFILE.name}
            </h1>

            <p className="mt-4 text-lg sm:text-2xl text-[#5B0612] font-serif italic max-w-2xl mx-auto">
              &ldquo;{SCHOOL_PROFILE.motto}&rdquo;
            </p>

            <p className="mt-6 text-sm sm:text-base text-[#524B46] max-w-2xl mx-auto leading-relaxed">
              Providing sound foundation through blended Nigerian curriculum and authentic Islamic character development in Dutse, Jigawa State.
            </p>

            <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/admissions" className="w-full sm:w-auto">
                <Button variant="primary" size="lg" className="w-full sm:w-auto text-base px-8 py-3.5 shadow-sm">
                  Apply for Admission &rarr;
                </Button>
              </Link>
              <Link href="/programmes" className="w-full sm:w-auto">
                <Button variant="outline" size="lg" className="w-full sm:w-auto text-base px-8 py-3.5 bg-white">
                  Explore Programmes
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* ========================================================= */}
        {/* 2. SCHOOL INTRODUCTION & PROPRIETOR MESSAGE */}
        {/* ========================================================= */}
        <section className="py-16 sm:py-20 bg-white border-b border-[#EADBDA]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
              <div className="lg:col-span-7 space-y-6">
                <div className="inline-block px-3 py-1 bg-[#F5F0EB] text-[#5B0612] rounded text-xs font-bold uppercase tracking-wider">
                  About Our School
                </div>
                <h2 className="text-2xl sm:text-4xl font-bold text-[#1C1A1A] tracking-tight leading-snug">
                  Nurturing Knowledge, Character &amp; Faith in Every Child
                </h2>
                <p className="text-sm sm:text-base text-[#524B46] leading-relaxed">
                  Located along Dr Nuhu Muhammadu Sanusi Way in Dutse, Swanford Academy provides dedicated learning environments tailored for early learners and primary students, enriched with our dedicated Tahfeez programme.
                </p>
                <p className="text-sm sm:text-base text-[#524B46] leading-relaxed">
                  We integrate the standard Nigerian curriculum with structured values of discipline, integrity, and Quranic memorization, preparing young minds for lifelong success.
                </p>
                <div className="pt-2">
                  <Link href="/about">
                    <Button variant="outline" size="md" className="border-[#5B0612] text-[#5B0612] hover:bg-[#FDF2F4]">
                      Read About Our Vision &amp; Philosophy &rarr;
                    </Button>
                  </Link>
                </div>
              </div>

              <div className="lg:col-span-5">
                <div className="bg-[#FDFBF7] p-8 rounded-2xl border border-[#EADBDA] shadow-xs space-y-4">
                  <div className="flex items-center gap-3 border-b border-[#EADBDA] pb-4">
                    <div className="w-12 h-12 rounded-full bg-[#5B0612] text-white flex items-center justify-center font-bold text-xl shrink-0">
                      M
                    </div>
                    <div>
                      <h3 className="font-bold text-[#1C1A1A] text-base">{SCHOOL_PROFILE.contactPerson}</h3>
                      <p className="text-xs text-[#524B46]">Proprietor, Swanford Academy</p>
                    </div>
                  </div>
                  <blockquote className="text-sm text-[#524B46] italic leading-relaxed pt-2">
                    &ldquo;Our commitment is to illuminate the path to success for every child by providing an environment steeped in moral discipline, sound education, and noble character.&rdquo;
                  </blockquote>
                  <div className="pt-2 text-xs text-[#8C827A]">
                    Dutse, Jigawa State
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================= */}
        {/* 3. PROGRAMMES OVERVIEW */}
        {/* ========================================================= */}
        <section className="py-16 sm:py-24 bg-[#FDFBF7] border-b border-[#EADBDA]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16 space-y-3">
              <div className="inline-block px-3 py-1 bg-[#EADBDA] text-[#5B0612] rounded text-xs font-bold uppercase tracking-wider">
                Academic Offerings
              </div>
              <h2 className="text-2xl sm:text-4xl font-bold text-[#1C1A1A] tracking-tight">
                Structured Educational Programmes
              </h2>
              <p className="text-sm sm:text-base text-[#524B46]">
                Comprehensive learning stages designed for holistic academic progression and spiritual enrichment.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Early Years */}
              <Card className="bg-white border-[#EADBDA] shadow-xs hover:border-[#5B0612] transition-colors flex flex-col justify-between">
                <CardContent className="p-6 sm:p-8 space-y-4">
                  <div className="w-10 h-10 rounded-lg bg-[#5B0612]/10 text-[#5B0612] flex items-center justify-center font-bold">
                    01
                  </div>
                  <h3 className="text-xl font-bold text-[#1C1A1A]">Early Years</h3>
                  <p className="text-xs font-semibold text-[#5B0612] uppercase tracking-wider">
                    Creche &bull; Pre-Scholars &bull; Pre-Nursery &bull; Nursery 1 &amp; 2
                  </p>
                  <p className="text-sm text-[#524B46] leading-relaxed">
                    A nurturing, foundational environment focused on early cognitive discovery, fine motor skills, language acquisition, and social manners.
                  </p>
                </CardContent>
                <div className="p-6 pt-0">
                  <Link href="/programmes#early-years">
                    <Button variant="outline" size="sm" className="w-full text-xs font-semibold">
                      Learn More &rarr;
                    </Button>
                  </Link>
                </div>
              </Card>

              {/* Primary Education */}
              <Card className="bg-white border-[#EADBDA] shadow-xs hover:border-[#5B0612] transition-colors flex flex-col justify-between">
                <CardContent className="p-6 sm:p-8 space-y-4">
                  <div className="w-10 h-10 rounded-lg bg-[#5B0612]/10 text-[#5B0612] flex items-center justify-center font-bold">
                    02
                  </div>
                  <h3 className="text-xl font-bold text-[#1C1A1A]">Primary School</h3>
                  <p className="text-xs font-semibold text-[#5B0612] uppercase tracking-wider">
                    Primary 1 to Primary 6
                  </p>
                  <p className="text-sm text-[#524B46] leading-relaxed">
                    Rigorous Nigerian curriculum delivery across Mathematics, English, Basic Science, Social Studies, ICT, and Creative Arts with continuous assessment.
                  </p>
                </CardContent>
                <div className="p-6 pt-0">
                  <Link href="/programmes#primary">
                    <Button variant="outline" size="sm" className="w-full text-xs font-semibold">
                      Learn More &rarr;
                    </Button>
                  </Link>
                </div>
              </Card>

              {/* Tahfeez Standalone */}
              <Card className="bg-white border-[#5B0612] shadow-sm flex flex-col justify-between relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-[#5B0612] text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider">
                  Standalone Programme
                </div>
                <CardContent className="p-6 sm:p-8 space-y-4">
                  <div className="w-10 h-10 rounded-lg bg-[#5B0612] text-white flex items-center justify-center font-bold">
                    03
                  </div>
                  <h3 className="text-xl font-bold text-[#1C1A1A]">Tahfeez Programme</h3>
                  <p className="text-xs font-semibold text-[#5B0612] uppercase tracking-wider">
                    Quran Memorization &amp; Tajweed
                  </p>
                  <p className="text-sm text-[#524B46] leading-relaxed">
                    Dedicated Quranic memorization, proper Tajweed articulation, and Islamic etiquette. Can be taken standalone or alongside primary schooling.
                  </p>
                </CardContent>
                <div className="p-6 pt-0">
                  <Link href="/programmes#tahfeez">
                    <Button variant="primary" size="sm" className="w-full text-xs font-semibold">
                      Learn More &rarr;
                    </Button>
                  </Link>
                </div>
              </Card>
            </div>

            <div className="mt-12 text-center">
              <Link href="/admissions">
                <Button variant="primary" size="lg" className="px-8 shadow-sm">
                  Apply for Admission in Open Cycle &rarr;
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* ========================================================= */}
        {/* 4. CORE VALUES SECTION */}
        {/* ========================================================= */}
        <section className="py-16 sm:py-24 bg-white border-b border-[#EADBDA]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16 space-y-3">
              <div className="inline-block px-3 py-1 bg-[#F5F0EB] text-[#5B0612] rounded text-xs font-bold uppercase tracking-wider">
                Our Foundation
              </div>
              <h2 className="text-2xl sm:text-4xl font-bold text-[#1C1A1A] tracking-tight">
                Our Core Values
              </h2>
              <p className="text-sm sm:text-base text-[#524B46]">
                The eight foundational pillars that guide instruction, discipline, and community at Swanford Academy.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
              {SCHOOL_PROFILE.coreValues.map((val, idx) => (
                <div
                  key={val}
                  className="p-5 sm:p-6 rounded-xl bg-[#FDFBF7] border border-[#EADBDA] text-center space-y-2 hover:border-[#5B0612] transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-[#EADBDA] text-[#5B0612] text-xs font-bold flex items-center justify-center mx-auto">
                    {idx + 1}
                  </div>
                  <h3 className="font-bold text-sm sm:text-base text-[#1C1A1A]">{val}</h3>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ========================================================= */}
        {/* 5. TRANSPARENT ADMISSION & FEE SUMMARY */}
        {/* ========================================================= */}
        <section className="py-16 sm:py-20 bg-[#FDFBF7] border-b border-[#EADBDA]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="bg-white p-8 sm:p-12 rounded-2xl border border-[#EADBDA] shadow-xs">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                <div className="lg:col-span-8 space-y-4">
                  <div className="inline-block px-3 py-1 bg-[#EADBDA] text-[#5B0612] rounded text-xs font-bold uppercase tracking-wider">
                    Transparent Fees
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-bold text-[#1C1A1A] tracking-tight">
                    Clear, Itemized Financial Structure
                  </h2>
                  <p className="text-sm sm:text-base text-[#524B46] leading-relaxed">
                    We maintain full transparency with parents. Admission processing fees, first term entrance packages (including tuition, uniform, stationery, and medicals), and subsequent term fees are authoritatively defined without hidden surcharges.
                  </p>
                  <div className="flex flex-wrap gap-4 pt-2 text-xs text-[#524B46]">
                    <div className="p-3 bg-[#FDFBF7] rounded-lg border border-[#EADBDA]">
                      <span className="text-[#8C827A] block">Application Form:</span>
                      <span className="font-bold text-[#5B0612] text-base">&#8358;5,000</span>
                    </div>
                    <div className="p-3 bg-[#FDFBF7] rounded-lg border border-[#EADBDA]">
                      <span className="text-[#8C827A] block">Official Bank:</span>
                      <span className="font-bold text-[#1C1A1A] text-sm">Jaiz Bank — 0012031162</span>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-4 flex flex-col gap-3">
                  <Link href="/fees" className="w-full">
                    <Button variant="primary" size="md" className="w-full py-3">
                      View Full Fee Breakdown &rarr;
                    </Button>
                  </Link>
                  <Link href="/admissions" className="w-full">
                    <Button variant="outline" size="md" className="w-full py-3">
                      Start Application
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================= */}
        {/* 6. LOCATION & CONTACT OVERVIEW */}
        {/* ========================================================= */}
        <section className="py-16 sm:py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div className="space-y-4">
                <div className="inline-block px-3 py-1 bg-[#F5F0EB] text-[#5B0612] rounded text-xs font-bold uppercase tracking-wider">
                  Visit Swanford
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-[#1C1A1A] tracking-tight">
                  Our Campus in Dutse
                </h2>
                <div className="space-y-2 text-sm text-[#524B46] leading-relaxed">
                  <p className="font-semibold text-[#1C1A1A]">{SCHOOL_PROFILE.name}</p>
                  <p>{SCHOOL_PROFILE.address}</p>
                  <p className="pt-2"><span className="font-medium text-[#1C1A1A]">Administrative Contact:</span> {SCHOOL_PROFILE.contactPerson}</p>
                </div>
                <div className="pt-4">
                  <Link href="/contact">
                    <Button variant="outline" size="md" className="border-[#5B0612] text-[#5B0612] hover:bg-[#FDF2F4]">
                      Contact Information &amp; Office Hours &rarr;
                    </Button>
                  </Link>
                </div>
              </div>

              <div className="bg-[#FDFBF7] p-8 rounded-2xl border border-[#EADBDA] space-y-4">
                <h3 className="font-bold text-[#1C1A1A] text-lg">Admissions Office Hours</h3>
                <div className="text-sm text-[#524B46] space-y-2">
                  <div className="flex justify-between border-b border-[#EADBDA] pb-2">
                    <span>Monday &ndash; Thursday</span>
                    <span className="font-medium text-[#1C1A1A]">8:00 AM &ndash; 3:30 PM</span>
                  </div>
                  <div className="flex justify-between border-b border-[#EADBDA] pb-2">
                    <span>Friday</span>
                    <span className="font-medium text-[#1C1A1A]">8:00 AM &ndash; 12:30 PM</span>
                  </div>
                  <div className="flex justify-between pt-1">
                    <span>Weekends &amp; Public Holidays</span>
                    <span className="font-medium text-[#8C827A]">Closed</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Public Footer */}
      <PublicFooter />
    </div>
  );
}

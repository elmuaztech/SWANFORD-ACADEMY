import React from 'react';
import Link from 'next/link';
import { SCHOOL_PROFILE } from '@/lib/constants';
import { Navbar, PublicFooter, Button, Card, CardContent } from '@/components';

export const metadata = {
  title: `Academic Programmes — ${SCHOOL_PROFILE.name}`,
  description: `Explore educational programmes at ${SCHOOL_PROFILE.name}: Early Years (Creche to Nursery 2), Primary (1 to 6), and Standalone Tahfeez.`,
};

export default function ProgrammesPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#FFFFFF] text-[#1C1A1A]">
      <Navbar currentPath="/programmes" />

      <main className="flex-1">
        {/* Page Banner */}
        <section className="bg-[#FDFBF7] border-b border-[#EADBDA] py-12 sm:py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-3">
            <div className="inline-block px-3 py-1 bg-[#EADBDA] text-[#5B0612] rounded text-xs font-bold uppercase tracking-wider">
              Educational Offerings
            </div>
            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-[#1C1A1A]">
              Academic &amp; Tahfeez Programmes
            </h1>
            <p className="text-sm sm:text-base text-[#524B46] max-w-2xl mx-auto">
              Structured developmental learning from early childhood through primary education, integrated with dedicated Quranic memorization.
            </p>
          </div>
        </section>

        {/* Section 1: Early Years */}
        <section id="early-years" className="py-16 sm:py-20 bg-white border-b border-[#EADBDA]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              <div className="lg:col-span-5 space-y-4">
                <div className="inline-block px-3 py-1 bg-[#F5F0EB] text-[#5B0612] rounded text-xs font-bold uppercase tracking-wider">
                  Stage 01
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-[#1C1A1A]">
                  Early Years Foundation
                </h2>
                <p className="text-sm text-[#524B46] leading-relaxed">
                  Our Early Years section offers a secure, stimulating environment where foundational cognitive, linguistic, and motor skills are cultivated with care.
                </p>
                <div className="p-4 bg-[#FDFBF7] rounded-xl border border-[#EADBDA] text-xs text-[#524B46] space-y-1">
                  <p className="font-semibold text-[#1C1A1A]">Placement Guidance:</p>
                  <p>Contact the school admissions office for appropriate level placement.</p>
                </div>
                <div className="pt-2">
                  <Link href="/admissions">
                    <Button variant="primary" size="md">
                      Apply for Early Years &rarr;
                    </Button>
                  </Link>
                </div>
              </div>

              <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card className="bg-[#FDFBF7] border-[#EADBDA] shadow-xs">
                  <CardContent className="p-6 space-y-2">
                    <h3 className="font-bold text-base text-[#1C1A1A]">Creche</h3>
                    <p className="text-xs text-[#524B46] leading-relaxed">
                      Safe, caring, and stimulating infant care focusing on early sensory discovery and physical comfort.
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-[#FDFBF7] border-[#EADBDA] shadow-xs">
                  <CardContent className="p-6 space-y-2">
                    <h3 className="font-bold text-base text-[#1C1A1A]">Pre-Scholars</h3>
                    <p className="text-xs text-[#524B46] leading-relaxed">
                      Introduction to structured routines, social interaction, active play, and communicative expression.
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-[#FDFBF7] border-[#EADBDA] shadow-xs">
                  <CardContent className="p-6 space-y-2">
                    <h3 className="font-bold text-base text-[#1C1A1A]">Pre-Nursery</h3>
                    <p className="text-xs text-[#524B46] leading-relaxed">
                      Pre-literacy and pre-numeracy skills, fine motor coordination, and curiosity-driven activities.
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-[#FDFBF7] border-[#EADBDA] shadow-xs">
                  <CardContent className="p-6 space-y-2">
                    <h3 className="font-bold text-base text-[#1C1A1A]">Nursery 1 &amp; Nursery 2</h3>
                    <p className="text-xs text-[#524B46] leading-relaxed">
                      Phonics foundation, early writing, foundational arithmetic, and social readiness for primary school.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: Primary School */}
        <section id="primary" className="py-16 sm:py-20 bg-[#FDFBF7] border-b border-[#EADBDA]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              <div className="lg:col-span-5 space-y-4">
                <div className="inline-block px-3 py-1 bg-[#EADBDA] text-[#5B0612] rounded text-xs font-bold uppercase tracking-wider">
                  Stage 02
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-[#1C1A1A]">
                  Primary Education (1 &ndash; 6)
                </h2>
                <p className="text-sm text-[#524B46] leading-relaxed">
                  Swanford Academy Primary school follows the Nigerian national basic education curriculum, providing rigorous instruction in mathematics, languages, sciences, and digital literacy.
                </p>
                <div className="p-4 bg-white rounded-xl border border-[#EADBDA] text-xs text-[#524B46] space-y-1">
                  <p className="font-semibold text-[#1C1A1A]">Core Subjects:</p>
                  <p>Mathematics, English Studies, Basic Science &amp; Technology, Social Studies, Civic Education, ICT, Creative Arts, and Islamic Religious Studies.</p>
                </div>
                <div className="pt-2">
                  <Link href="/admissions">
                    <Button variant="primary" size="md">
                      Apply for Primary School &rarr;
                    </Button>
                  </Link>
                </div>
              </div>

              <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white p-6 rounded-xl border border-[#EADBDA] shadow-xs space-y-2">
                  <span className="text-xs font-bold text-[#5B0612]">Grades 1 &ndash; 3</span>
                  <h3 className="font-bold text-base text-[#1C1A1A]">Lower Primary</h3>
                  <p className="text-xs text-[#524B46] leading-relaxed">
                    Consolidation of reading fluency, mathematical reasoning, active scientific inquiry, and civic responsibility.
                  </p>
                </div>

                <div className="bg-white p-6 rounded-xl border border-[#EADBDA] shadow-xs space-y-2">
                  <span className="text-xs font-bold text-[#5B0612]">Grades 4 &ndash; 6</span>
                  <h3 className="font-bold text-base text-[#1C1A1A]">Upper Primary</h3>
                  <p className="text-xs text-[#524B46] leading-relaxed">
                    Advanced problem solving, critical thinking, research projects, essay writing, and preparation for secondary education.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: Tahfeez Programme (Standalone) */}
        <section id="tahfeez" className="py-16 sm:py-20 bg-white border-b border-[#EADBDA]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto bg-[#FDFBF7] p-8 sm:p-12 rounded-2xl border-2 border-[#5B0612] space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#EADBDA] pb-6">
                <div>
                  <div className="inline-block px-3 py-1 bg-[#5B0612] text-white rounded text-xs font-bold uppercase tracking-wider mb-2">
                    Standalone Programme
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-bold text-[#1C1A1A]">
                    Tahfeez Quranic Memorization Programme
                  </h2>
                </div>
                <div className="text-left sm:text-right">
                  <span className="text-xs text-[#8C827A] block">Programme Code:</span>
                  <span className="font-mono font-bold text-[#5B0612] text-sm">TAHFEEZ</span>
                </div>
              </div>

              <div className="space-y-4 text-sm text-[#524B46] leading-relaxed">
                <p>
                  Tahfeez at Swanford Academy is an independent, specialized programme focused on systematic Quranic memorization (Hifz), precise Tajweed phonetics, and authentic Islamic character cultivation.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="bg-white p-4 rounded-xl border border-[#EADBDA] space-y-1">
                    <h4 className="font-bold text-[#1C1A1A] text-sm">Flexible Enrollment</h4>
                    <p className="text-xs text-[#524B46]">
                      May be taken as a standalone programme or combined alongside conventional primary enrollment.
                    </p>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-[#EADBDA] space-y-1">
                    <h4 className="font-bold text-[#1C1A1A] text-sm">Daily Supervision</h4>
                    <p className="text-xs text-[#524B46]">
                      Experienced instructors monitor recitation accuracy, daily revision, and progressive Juz completion.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-4 flex flex-col sm:flex-row items-center gap-4">
                <Link href="/admissions" className="w-full sm:w-auto">
                  <Button variant="primary" size="md" className="w-full sm:w-auto">
                    Apply for Tahfeez Programme &rarr;
                  </Button>
                </Link>
                <Link href="/fees" className="w-full sm:w-auto">
                  <Button variant="outline" size="md" className="w-full sm:w-auto">
                    View Tahfeez Fees
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="py-16 bg-[#FDFBF7] text-center">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
            <h2 className="text-2xl sm:text-3xl font-bold text-[#1C1A1A]">Ready to Apply?</h2>
            <p className="text-sm text-[#524B46] max-w-xl mx-auto">
              Admissions are currently open for the active academic cycle. Complete the online admission form in minutes.
            </p>
            <div className="pt-2">
              <Link href="/admissions">
                <Button variant="primary" size="lg" className="px-8 shadow-sm">
                  Start Admission Application &rarr;
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}

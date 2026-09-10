import React from 'react';
import Link from 'next/link';
import { SCHOOL_PROFILE } from '@/lib/constants';
import { Navbar, PublicFooter, Button, Card, CardContent } from '@/components';

export const metadata = {
  title: `About Us — ${SCHOOL_PROFILE.name}`,
  description: `Learn about ${SCHOOL_PROFILE.name}, our vision, mission, core values, and curriculum in Dutse, Jigawa State. Motto: “${SCHOOL_PROFILE.motto}”.`,
};

export default function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#FFFFFF] text-[#1C1A1A]">
      <Navbar currentPath="/about" />

      <main className="flex-1">
        {/* Header Banner */}
        <section className="bg-[#FDFBF7] border-b border-[#EADBDA] py-12 sm:py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-3">
            <div className="inline-block px-3 py-1 bg-[#EADBDA] text-[#5B0612] rounded text-xs font-bold uppercase tracking-wider">
              About Swanford Academy
            </div>
            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-[#1C1A1A]">
              Our Vision, Values &amp; Philosophy
            </h1>
            <p className="text-[#5B0612] font-serif italic text-lg sm:text-xl max-w-2xl mx-auto">
              &ldquo;{SCHOOL_PROFILE.motto}&rdquo;
            </p>
          </div>
        </section>

        {/* Vision & Mission */}
        <section className="py-16 sm:py-20 bg-white border-b border-[#EADBDA]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
              {/* Vision */}
              <Card className="bg-[#FDFBF7] border-[#EADBDA] shadow-xs">
                <CardContent className="p-8 space-y-4">
                  <div className="w-10 h-10 rounded-lg bg-[#5B0612] text-white flex items-center justify-center font-bold">
                    V
                  </div>
                  <h2 className="text-2xl font-bold text-[#1C1A1A]">Our Vision</h2>
                  <p className="text-sm sm:text-base text-[#524B46] leading-relaxed">
                    {SCHOOL_PROFILE.vision}
                  </p>
                </CardContent>
              </Card>

              {/* Mission */}
              <Card className="bg-[#FDFBF7] border-[#EADBDA] shadow-xs">
                <CardContent className="p-8 space-y-4">
                  <div className="w-10 h-10 rounded-lg bg-[#5B0612] text-white flex items-center justify-center font-bold">
                    M
                  </div>
                  <h2 className="text-2xl font-bold text-[#1C1A1A]">Our Mission</h2>
                  <p className="text-sm sm:text-base text-[#524B46] leading-relaxed">
                    {SCHOOL_PROFILE.mission}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Core Values */}
        <section className="py-16 sm:py-20 bg-[#FDFBF7] border-b border-[#EADBDA]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-12 space-y-3">
              <h2 className="text-2xl sm:text-4xl font-bold text-[#1C1A1A] tracking-tight">
                Our Core Values
              </h2>
              <p className="text-sm sm:text-base text-[#524B46]">
                These eight enduring values form the cornerstone of our school culture, classroom conduct, and student mentorship.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {SCHOOL_PROFILE.coreValues.map((value, i) => (
                <div
                  key={value}
                  className="bg-white p-6 rounded-xl border border-[#EADBDA] shadow-xs space-y-2 hover:border-[#5B0612] transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-[#EADBDA] text-[#5B0612] text-xs font-bold flex items-center justify-center">
                    0{i + 1}
                  </div>
                  <h3 className="font-bold text-base text-[#1C1A1A]">{value}</h3>
                  <p className="text-xs text-[#524B46] leading-relaxed">
                    Instilled in daily school assemblies, curricular activities, and personal mentorship.
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Curriculum & Academic Approach */}
        <section className="py-16 sm:py-20 bg-white border-b border-[#EADBDA]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto space-y-6">
              <div className="inline-block px-3 py-1 bg-[#F5F0EB] text-[#5B0612] rounded text-xs font-bold uppercase tracking-wider">
                Academic Standard
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-[#1C1A1A] tracking-tight">
                Nigerian Curriculum &amp; Tahfeez Integration
              </h2>
              <p className="text-sm sm:text-base text-[#524B46] leading-relaxed">
                Swanford Academy delivers the approved standard Nigerian basic education curriculum. Instruction is conducted in English across all standard academic subjects while fostering moral uprightness and Quranic memorization.
              </p>
              <div className="p-6 bg-[#FDFBF7] rounded-xl border border-[#EADBDA] space-y-3">
                <h3 className="font-bold text-base text-[#1C1A1A]">Key Features:</h3>
                <ul className="space-y-2 text-sm text-[#524B46]">
                  <li className="flex items-start gap-2">
                    <span className="text-[#5B0612] font-bold">&bull;</span>
                    <span>Early Childhood Education with sound literacy and numeracy foundations.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#5B0612] font-bold">&bull;</span>
                    <span>Structured Primary education with continuous assessment across all term periods.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#5B0612] font-bold">&bull;</span>
                    <span>Dedicated Tahfeez programme emphasizing accurate Tajweed and Quran memorization.</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Administration & Leadership */}
        <section className="py-16 sm:py-20 bg-[#FDFBF7]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto text-center space-y-6">
              <h2 className="text-2xl sm:text-3xl font-bold text-[#1C1A1A]">
                School Administration
              </h2>
              <div className="p-8 bg-white rounded-2xl border border-[#EADBDA] shadow-xs space-y-3">
                <h3 className="text-lg font-bold text-[#1C1A1A]">{SCHOOL_PROFILE.contactPerson}</h3>
                <p className="text-sm text-[#524B46]">{SCHOOL_PROFILE.address}</p>
                <p className="text-xs text-[#8C827A] pt-2">
                  Dutse, Jigawa State &bull; Academic Year: 2026/2027
                </p>
              </div>

              <div className="pt-4 flex justify-center gap-4">
                <Link href="/admissions">
                  <Button variant="primary" size="md">
                    Apply for Admission &rarr;
                  </Button>
                </Link>
                <Link href="/contact">
                  <Button variant="outline" size="md">
                    Contact Admissions Office
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}

'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Button, LoadingState, ErrorState, Badge } from '@/components';
import { toUserFacingError } from '@/lib/ui/error_messages';

interface LetterData {
  applicationId: string;
  applicationNumber: string;
  applicantFullName: string;
  applicantGender: string;
  applicantDob: string;
  guardianFullName: string;
  guardianEmail: string;
  guardianPhone: string;
  guardianRelationship: string;
  academicSessionName: string;
  admissionCycleName: string;
  programmes: Array<{ name: string; code: string; className: string }>;
  status: string;
  dateIssued: string;
  profilePhotoDataUri: string | null;
  school: {
    name: string;
    motto: string;
    address: string;
    phonePrimary: string;
    phoneSecondary: string;
    email: string;
    website: string;
  };
}

export default function AdmissionLetterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const resolvedParams = use(params);
  const applicationId = resolvedParams.id;

  const [data, setData] = useState<LetterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/admissions/letter/${applicationId}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || 'Failed to retrieve admission letter.');
        }
        return json;
      })
      .then((json: LetterData) => {
        setData(json);
        setLoading(false);
      })
      .catch((err: unknown) => {
        const translated = toUserFacingError(err);
        setError(translated.message || translated.title);
        setLoading(false);
      });
  }, [applicationId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center p-4">
        <LoadingState message="Generating official admission letter..." />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <ErrorState
            title="Admission Letter Unavailable"
            message={error || 'The requested admission letter could not be found or has not yet been approved.'}
            actionLabel="Admissions Status"
            onAction={() => router.push('/admissions/status')}
          />
        </div>
      </div>
    );
  }

  const formattedDate = new Date(data.dateIssued).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const formattedDob = new Date(data.applicantDob).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="min-h-screen bg-[#F4F1EA] py-6 px-3 sm:px-6 print:p-0 print:bg-white text-stone-900 font-sans">
      {/* Print Specific CSS Rules */}
      <style jsx global>{`
        @page {
          size: A4 portrait;
          margin: 8mm 12mm;
        }
        @media print {
          html, body {
            background: #ffffff !important;
            color: #1c1917 !important;
            margin: 0 !important;
            padding: 0 !important;
            font-size: 11px !important;
            line-height: 1.35 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print {
            display: none !important;
          }
          .a4-page-container {
            max-width: 100% !important;
            width: 100% !important;
            min-height: auto !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            padding: 0 !important;
            margin: 0 auto !important;
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
          .letter-content {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>

      {/* Screen-Only Control Toolbar */}
      <div className="no-print max-w-4xl mx-auto mb-6 flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-stone-200 shadow-xs">
        <div className="flex items-center gap-3">
          <Link
            href="/admissions/status"
            className="text-xs font-semibold text-stone-600 hover:text-stone-900 flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
            <span>Back to Status Portal</span>
          </Link>
          <span className="text-stone-300">|</span>
          <Badge variant="success" size="sm">
            Offer of Admission
          </Badge>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
          <Button
            variant="primary"
            size="md"
            onClick={() => window.print()}
            className="bg-[#5B0612] hover:bg-[#43040D] text-white font-bold flex items-center justify-center gap-2 w-full sm:w-auto shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6.72 13.829c-.24-1.076-.672-2.03-1.272-2.829H4.5A2.25 2.25 0 0 0 2.25 13.25v4.5A2.25 2.25 0 0 0 4.5 20h15a2.25 2.25 0 0 0 2.25-2.25v-4.5a2.25 2.25 0 0 0-2.25-2.25h-.948c-.6 0-1.127.424-1.272 1.02a7.485 7.485 0 0 1-1.31 2.809M16.5 7.5V4.5a2.25 2.25 0 0 0-2.25-2.25h-4.5A2.25 2.25 0 0 0 7.5 4.5v3m9 0h-9m9 0v3.75a2.25 2.25 0 0 1-2.25 2.25h-4.5A2.25 2.25 0 0 1 7.5 11.25V7.5"
              />
            </svg>
            <span>Print Letter / Save as PDF (A4)</span>
          </Button>
        </div>
      </div>

      {/* The Printable A4 Admission Letter Container */}
      <main className="a4-page-container letter-content max-w-[210mm] mx-auto bg-white rounded-xl shadow-lg border border-stone-200/80 p-6 sm:p-8 print:shadow-none print:border-none print:p-0">
        
        {/* Institutional Letterhead */}
        <header className="border-b-2 border-[#5B0612] pb-4 mb-4">
          <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-4 text-center sm:text-left">
            <div className="flex flex-col sm:flex-row items-center gap-3.5">
              <div className="relative w-16 h-16 sm:w-18 sm:h-18 shrink-0 rounded-lg overflow-hidden border border-[#D4AF37] bg-white p-1">
                <Image
                  src="/images/swanford-logo.jpg"
                  alt="Swanford Academy Crest"
                  width={72}
                  height={72}
                  className="object-contain w-full h-full"
                  priority
                />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-[#5B0612] tracking-tight uppercase font-serif">
                  SWANFORD ACADEMY
                </h1>
                <p className="text-xs font-bold text-[#800020] tracking-wide mt-0.5">
                  NURSERY &bull; PRIMARY &bull; TAHFEEZ SCHOOL
                </p>
                <p className="text-[11px] text-stone-600 italic">
                  &ldquo;{data.school.motto}&rdquo;
                </p>
                <p className="text-[10px] text-stone-500 mt-1">
                  {data.school.address} &bull; Tel: {data.school.phonePrimary} &bull; Email: swanford99@gmail.com
                </p>
              </div>
            </div>

            {/* Admissions Office Meta */}
            <div className="flex flex-col items-center sm:items-end text-center sm:text-right shrink-0">
              <span className="text-xs uppercase font-extrabold text-[#5B0612] tracking-wider">
                Admissions Office
              </span>
              <div className="text-[11px] text-stone-600 mt-1">
                <span className="text-stone-500">Admission Reference:</span>{' '}
                <span className="font-mono font-bold text-[#5B0612]">{data.applicationNumber}</span>
              </div>
              <div className="text-[10px] text-stone-500 mt-0.5">
                <span>Date: {formattedDate}</span>
              </div>
            </div>
          </div>
          <div className="h-0.5 w-full bg-[#D4AF37] mt-3" />
        </header>

        {/* Heading: OFFER OF ADMISSION & Academic Session */}
        <div className="text-center my-4 py-2 border-y border-stone-200/80 bg-[#FAF7F2]/60">
          <h2 className="text-base sm:text-lg font-black text-[#5B0612] uppercase tracking-wider font-serif">
            OFFER OF ADMISSION
          </h2>
          <p className="text-xs sm:text-sm font-bold text-stone-800 mt-0.5">
            Academic Session: {data.academicSessionName}
          </p>
        </div>

        {/* Letter Body */}
        <div className="space-y-3 text-xs sm:text-[13px] text-stone-800 leading-relaxed font-normal">
          <p>
            Dear Mr/Mrs {data.guardianFullName},
          </p>
          <p>
            We are pleased to inform you that your child, <strong>{data.applicantFullName}</strong>, has been offered admission into Swanford Academy for the <strong>{data.academicSessionName}</strong> academic session.
          </p>
          <p>
            We welcome you to our school community and look forward to working together to provide your child with quality education, sound upbringing, good character, and the skills needed for future success.
          </p>
          <p>
            Please complete the admission requirements outlined below to finalise your child&apos;s registration.
          </p>
        </div>

        {/* Pupil & Admission Information Card */}
        <div className="my-4 bg-[#FAF7F2] border border-[#EADBDA] rounded-xl p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-4">
            <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-stone-500 block tracking-wide">Pupil Full Name</span>
                <span className="font-bold text-stone-900 text-sm text-[#5B0612]">{data.applicantFullName}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-stone-500 block tracking-wide">Parent / Guardian</span>
                <span className="font-semibold text-stone-900 text-sm">{data.guardianFullName}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-stone-500 block tracking-wide">Admission Reference</span>
                <span className="font-mono font-bold text-[#5B0612] text-sm">{data.applicationNumber}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-stone-500 block tracking-wide">Class Admitted</span>
                <span className="font-bold text-stone-900 text-sm">
                  {data.programmes.map((p) => p.className).filter(Boolean).join(', ') || 'Class Assigned'}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-stone-500 block tracking-wide">Academic Session</span>
                <span className="font-semibold text-stone-900 text-sm">{data.academicSessionName}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-stone-500 block tracking-wide">Date Issued</span>
                <span className="font-medium text-stone-800 text-sm">{formattedDate}</span>
              </div>
            </div>

            {/* Candidate Photo if available */}
            {data.profilePhotoDataUri && (
              <div className="shrink-0 text-center">
                <img
                  src={data.profilePhotoDataUri}
                  alt={data.applicantFullName}
                  className="w-20 h-20 sm:w-22 sm:h-22 rounded-lg object-cover border-2 border-[#D4AF37] shadow-xs"
                />
              </div>
            )}
          </div>
        </div>

        {/* Signatory Section & Subtle Watermark Stamp */}
        <div className="mt-6 pt-3 flex flex-row items-end justify-between gap-4">
          <div className="space-y-1 text-left">
            <p className="text-xs sm:text-sm text-stone-700 font-medium">Yours faithfully,</p>
            <div className="pt-6 pb-1">
              <p className="text-sm sm:text-base font-extrabold text-[#5B0612] font-serif">
                Muhammad Kanti
              </p>
              <p className="text-xs font-bold text-stone-900">Director</p>
              <p className="text-[11px] text-stone-600">Swanford Academy</p>
            </div>
          </div>

          {/* Subtle Watermark-style Stamp */}
          <div className="opacity-25 select-none pointer-events-none">
            <div className="w-22 h-22 sm:w-24 sm:h-24 rounded-full border-2 border-[#5B0612] p-2 flex flex-col items-center justify-center text-center">
              <span className="text-[7px] font-extrabold uppercase tracking-widest text-[#5B0612]">Swanford</span>
              <span className="text-[6.5px] font-bold text-[#5B0612] tracking-wider my-0.5">Admissions Office</span>
              <span className="text-[7.5px] font-extrabold text-[#5B0612]">DUTSE</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-6 pt-2.5 border-t border-stone-200 text-[9px] sm:text-[10px] text-stone-500 flex flex-col sm:flex-row items-center justify-between gap-1 text-center sm:text-left">
          <span>Computer-Generated Admission Letter &bull; Swanford Academy</span>
          <span>{data.school.address} &bull; swanford99@gmail.com</span>
        </footer>
      </main>
    </div>
  );
}

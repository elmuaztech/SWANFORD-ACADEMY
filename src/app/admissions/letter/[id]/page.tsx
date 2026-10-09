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
            Official Admission Letter
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
      <main className="a4-page-container letter-content max-w-[210mm] mx-auto bg-white rounded-xl shadow-lg border border-stone-200/80 p-4 sm:p-7 print:shadow-none print:border-none print:p-0">
        
        {/* Institutional Letterhead */}
        <header className="border-b-2 border-[#5B0612] pb-3 mb-3">
          <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-3 text-center sm:text-left">
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="relative w-14 h-14 sm:w-16 sm:h-16 shrink-0 rounded-lg overflow-hidden border border-[#D4AF37] bg-white p-1">
                <Image
                  src="/images/swanford-logo.jpg"
                  alt="Swanford Academy Crest"
                  width={64}
                  height={64}
                  className="object-contain w-full h-full"
                  priority
                />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-extrabold text-[#5B0612] tracking-tight uppercase font-serif">
                  SWANFORD ACADEMY
                </h1>
                <p className="text-[11px] sm:text-xs font-semibold text-[#800020] tracking-wide">
                  NURSERY &bull; PRIMARY &bull; TAHFEEZ SCHOOL
                </p>
                <p className="text-[10px] text-stone-600 italic">
                  &ldquo;{data.school.motto}&rdquo;
                </p>
                <p className="text-[9px] text-stone-500 mt-0.5">
                  {data.school.address} &bull; {data.school.phonePrimary} &bull; {data.school.email}
                </p>
              </div>
            </div>

            {/* Document Verification Crest Badge */}
            <div className="flex flex-col items-center sm:items-end text-center sm:text-right shrink-0">
              <span className="text-[9px] uppercase font-bold text-stone-500 tracking-wider">Office of Admissions</span>
              <span className="text-[9px] text-stone-400">Registry Reference</span>
              <span className="font-mono text-xs font-bold text-[#5B0612] mt-0.5">{data.applicationNumber}</span>
              <span className="text-[9px] text-emerald-800 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 mt-0.5">
                Verified Admission
              </span>
            </div>
          </div>
          <div className="h-0.5 w-full bg-[#D4AF37] mt-2.5" />
        </header>

        {/* Reference & Date Header Line */}
        <div className="flex flex-col sm:flex-row justify-between items-center text-[11px] text-stone-600 mb-3 pb-1.5 border-b border-stone-100 gap-1 text-center sm:text-left">
          <div>
            <span className="font-semibold text-stone-500">Ref:</span>{' '}
            <span className="font-mono font-bold text-stone-900">SA/ADM/{data.applicationNumber}</span>
          </div>
          <div>
            <span className="font-semibold text-stone-500">Date Issued:</span>{' '}
            <span className="font-bold text-stone-900">{formattedDate}</span>
          </div>
        </div>

        {/* Child Dossier & Photo Panel */}
        <div className="bg-[#FAF7F2] border border-[#EADBDA] rounded-lg p-3 mb-3 flex flex-col-reverse sm:flex-row items-center sm:items-start justify-between gap-3">
          <div className="flex-1 w-full space-y-1 text-[11px]">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
              <div>
                <span className="text-stone-500 text-[10px] block">Candidate Full Name:</span>
                <span className="font-bold text-stone-900 text-xs sm:text-sm">{data.applicantFullName}</span>
              </div>
              <div>
                <span className="text-stone-500 text-[10px] block">Application Reference:</span>
                <span className="font-mono font-bold text-[#5B0612] text-xs">{data.applicationNumber}</span>
              </div>
              <div>
                <span className="text-stone-500 text-[10px] block">Date of Birth &amp; Gender:</span>
                <span className="font-medium text-stone-900">{formattedDob} ({data.applicantGender})</span>
              </div>
              <div>
                <span className="text-stone-500 text-[10px] block">Academic Session:</span>
                <span className="font-semibold text-stone-900">{data.academicSessionName}</span>
              </div>
              <div>
                <span className="text-stone-500 text-[10px] block">Parent / Guardian:</span>
                <span className="font-medium text-stone-900">{data.guardianFullName} ({data.guardianRelationship})</span>
              </div>
              <div>
                <span className="text-stone-500 text-[10px] block">Contact Phone &amp; Email:</span>
                <span className="font-medium text-stone-900 truncate block">{data.guardianPhone} &bull; {data.guardianEmail}</span>
              </div>
            </div>
          </div>

          {/* Child Profile Photo */}
          <div className="shrink-0 text-center">
            {data.profilePhotoDataUri ? (
              <img
                src={data.profilePhotoDataUri}
                alt={data.applicantFullName}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-md object-cover border-2 border-[#D4AF37] shadow-xs"
              />
            ) : (
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-md bg-[#FAF2F4] border-2 border-dashed border-[#D4AF37] flex flex-col items-center justify-center text-[#5B0612]">
                <span className="text-xl font-black">{data.applicantFullName.charAt(0)}</span>
                <span className="text-[8px] uppercase font-bold text-[#800020] mt-0.5">Candidate</span>
              </div>
            )}
            <span className="text-[8px] font-semibold text-stone-400 uppercase tracking-wider block mt-0.5">
              Photo
            </span>
          </div>
        </div>

        {/* Letter Title */}
        <div className="text-center my-2 pb-1.5 border-b border-stone-200">
          <h2 className="text-xs sm:text-sm font-extrabold text-[#5B0612] uppercase tracking-wide">
            OFFICIAL OFFER OF PROVISIONAL ADMISSION
          </h2>
          <p className="text-[10px] text-stone-500">
            Admissions Committee Review &bull; {data.academicSessionName}
          </p>
        </div>

        {/* Formal Letter Body */}
        <div className="space-y-2 text-[11px] sm:text-xs text-stone-800 leading-relaxed">
          <p>
            <strong>Dear {data.guardianFullName},</strong>
          </p>
          <p>
            On behalf of the Governing Board and Academic Faculty of{' '}
            <strong>Swanford Academy</strong>, we are pleased to offer your child / ward,{' '}
            <strong className="text-[#5B0612]">{data.applicantFullName}</strong>, provisional
            admission for the <strong>{data.academicSessionName}</strong>.
          </p>

          {/* Placement Table with overflow wrapper */}
          <div className="my-1.5 border border-stone-200 rounded-md overflow-x-auto">
            <table className="w-full text-left text-[11px] border-collapse min-w-[320px]">
              <thead>
                <tr className="bg-[#FAF7F2] border-b border-stone-200 text-[#5B0612]">
                  <th className="py-1 px-2.5 font-bold">Approved Programme</th>
                  <th className="py-1 px-2.5 font-bold">Class Placement</th>
                  <th className="py-1 px-2.5 font-bold text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {data.programmes.map((prog, idx) => (
                  <tr key={idx}>
                    <td className="py-1.5 px-2.5 font-bold text-stone-900">{prog.name}</td>
                    <td className="py-1.5 px-2.5 text-stone-700">{prog.className}</td>
                    <td className="py-1.5 px-2.5 text-right">
                      <span className="inline-block px-1.5 py-0.5 text-[9px] font-bold text-emerald-800 bg-emerald-50 rounded border border-emerald-200">
                        OFFERED &bull; ACCEPTED
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Terms & Requirements */}
          <div className="space-y-1 pt-0.5 text-[10px] sm:text-[11px] text-stone-700">
            <p className="font-bold text-stone-900">Essential Conditions for Matriculation:</p>
            <ol className="list-decimal list-inside space-y-0.5 pl-1">
              <li>
                <strong>Acceptance:</strong> Confirm acceptance via admissions portal or Registry within 14 calendar days.
              </li>
              <li>
                <strong>Documentation:</strong> Submit birth certificate, immunization record, and 2 passport photos to the Registry.
              </li>
              <li>
                <strong>Fees &amp; Resumption:</strong> School fee schedules and resumption guidelines are accessible in the Parent Portal.
              </li>
            </ol>
          </div>

          <p className="pt-0.5">
            We congratulate you and warmly welcome your family to the Swanford Academy community of academic excellence and moral integrity.
          </p>
        </div>

        {/* Institutional Sign-off & Signatures */}
        <div className="mt-4 pt-3 border-t border-stone-200">
          <div className="grid grid-cols-1 sm:grid-cols-3 items-center gap-3 text-center sm:text-left">
            <div className="space-y-0.5">
              <div className="font-serif italic text-sm text-[#5B0612] font-bold tracking-wide">
                Hajiya Amina Bello
              </div>
              <div className="h-0.5 w-28 bg-stone-300 mx-auto sm:mx-0" />
              <p className="text-[10px] font-bold text-stone-900">Registrar &amp; Admissions Officer</p>
              <p className="text-[9px] text-stone-500">Swanford Academy Registry</p>
            </div>

            {/* Official Seal / Crest Stamp */}
            <div className="flex justify-center order-first sm:order-none">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full border-2 border-[#D4AF37] border-double bg-[#FAF7F2] p-1 flex flex-col items-center justify-center text-center shadow-xs">
                <span className="text-[7px] font-bold uppercase tracking-wider text-[#5B0612]">Official Seal</span>
                <span className="text-[9px] font-extrabold text-[#D4AF37]">★ 2026 ★</span>
                <span className="text-[6px] text-stone-500 font-semibold uppercase">Verified</span>
              </div>
            </div>

            <div className="space-y-0.5 text-center sm:text-right">
              <div className="font-serif italic text-sm text-[#5B0612] font-bold tracking-wide">
                Dr. Al-Mansur Ibrahim
              </div>
              <div className="h-0.5 w-28 bg-stone-300 mx-auto sm:ml-auto sm:mr-0" />
              <p className="text-[10px] font-bold text-stone-900">Head of School / Director</p>
              <p className="text-[9px] text-stone-500">Swanford Academy</p>
            </div>
          </div>

          {/* Verification Bar Footer */}
          <footer className="mt-3 pt-1.5 border-t border-stone-100 flex flex-col sm:flex-row items-center justify-between text-[8px] sm:text-[9px] text-stone-400 gap-1 text-center sm:text-left">
            <span>Official Computer-Generated Admission Letter &bull; Swanford Academy Dutse</span>
            <span>Verify online at: swanfordacademy.ng/admissions/status &bull; APP: {data.applicationNumber}</span>
          </footer>
        </div>
      </main>
    </div>
  );
}

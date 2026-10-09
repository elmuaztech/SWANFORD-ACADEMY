'use client';

import React from 'react';
import { Button } from '@/components';

export interface ApplicationFormData {
  // Application Meta
  applicationNumber?: string;
  submissionDate?: string;
  admissionCycleName?: string;
  paymentStatus?: string;

  // Student Particulars
  studentFullName: string;
  studentAddress?: string;
  className?: string;
  gender: string;
  dateOfBirth: string;
  placeOfBirth?: string;
  stateOfOrigin?: string;
  lga?: string;
  nationality?: string;
  specialAttention?: string;
  additionalInformation?: string;
  passportPhotoUrl?: string | null;

  // Guardian Particulars
  guardianFullName: string;
  guardianRelationship: string;
  guardianOccupation?: string;
  guardianAddress?: string;
  guardianPhone: string;
  guardianEmail?: string;

  // Office Use
  dateReceived?: string;
  classAdmitted?: string;
  admissionNumber?: string;
  headmasterSign?: string;
}

interface PrintedApplicationFormProps {
  data: ApplicationFormData;
  onPrint?: () => void;
  showActions?: boolean;
}

export function PrintedApplicationForm({
  data,
  onPrint,
  showActions = true,
}: PrintedApplicationFormProps) {
  const handlePrint = () => {
    if (onPrint) {
      onPrint();
    } else {
      window.print();
    }
  };

  const formattedDob = (() => {
    if (!data.dateOfBirth) return '';
    try {
      const d = new Date(data.dateOfBirth);
      if (isNaN(d.getTime())) return data.dateOfBirth;
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    } catch {
      return data.dateOfBirth;
    }
  })();

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4">
      {/* Action Toolbar (Hidden during print) */}
      {showActions && (
        <div className="no-print flex flex-wrap items-center justify-between gap-3 p-4 bg-white border border-[#EADBDA] rounded-xl shadow-xs">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-bold tracking-wider text-[#800020] bg-[#FDF2F4] px-2.5 py-1 rounded-md border border-[#EADBDA]">
              Official Form Preview
            </span>
            {data.applicationNumber && (
              <span className="text-xs font-mono font-bold text-stone-700">
                Ref: {data.applicationNumber}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handlePrint}
              className="bg-[#800020] hover:bg-[#5B0612] text-white flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H7a2 2 0 00-2 2v4h10z" />
              </svg>
              Print / Save PDF
            </Button>
          </div>
        </div>
      )}

      {/* Official Physical Form Container */}
      <div className="print-area bg-white text-stone-900 border-2 border-stone-800 rounded-lg p-5 sm:p-8 shadow-sm font-sans relative overflow-hidden">
        {/* TOP BRANDING & HEADER */}
        <div className="relative mb-3">
          <div className="flex items-start justify-between gap-4">
            {/* Crest Logo */}
            <div className="w-20 h-20 sm:w-24 sm:h-24 shrink-0 flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/swanford-logo.jpg"
                alt="Swanford Academy Crest"
                className="w-full h-full object-contain"
              />
            </div>

            {/* School Name & Subtitle */}
            <div className="flex-1 text-center pt-1">
              <h1 className="text-3xl sm:text-4xl font-extrabold text-[#6B0B1A] tracking-wider uppercase font-serif drop-shadow-xs">
                SWANFORD
              </h1>
              <p className="text-xs sm:text-sm font-bold text-[#6B0B1A] tracking-widest uppercase mt-0.5">
                NURSERY AND PRIMARY SCHOOL
              </p>
            </div>

            {/* Passport Photo Box (Top Right) */}
            <div className="w-24 h-28 sm:w-28 sm:h-32 shrink-0 border-2 border-dashed border-stone-500 rounded bg-stone-50 flex items-center justify-center overflow-hidden relative shadow-inner">
              {data.passportPhotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={data.passportPhotoUrl}
                  alt="Student Passport"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-center p-2">
                  <span className="text-xs font-serif font-bold text-stone-400 rotate-[-45deg] block select-none">
                    Passport
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* School Brand Ribbon Banner */}
          <div className="mt-2 bg-[#5B0612] border border-[#D4AF37] text-white rounded-md px-3 py-1.5 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] sm:text-xs font-medium shadow-xs">
            <div className="flex items-center gap-1.5 text-center sm:text-left">
              <svg className="w-4 h-4 shrink-0 text-amber-300" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
              </svg>
              <span>Block E5, 60 Housing Units, Ibrahim Aliyu Bye-Pass, Adjacent To Federal University Dutse, Jigawa State.</span>
            </div>
            <div className="flex items-center gap-2 shrink-0 text-amber-200 font-semibold font-mono">
              <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
              </svg>
              <span>09068897489 / 08060413439</span>
            </div>
          </div>

          {/* Centered APPLICATION FORM Pill */}
          <div className="flex justify-center mt-3 mb-1">
            <div className="border-y-2 border-x-4 border-[#6B0B1A] px-6 py-1 rounded-sm bg-white shadow-xs">
              <h2 className="text-base sm:text-lg font-extrabold tracking-widest text-[#6B0B1A] uppercase">
                APPLICATION FORM
              </h2>
            </div>
          </div>
        </div>

        {/* SECTION 1: STUDENT'S DETAILS */}
        <div className="mt-4 space-y-2">
          {/* Section Ribbon Header */}
          <div className="bg-[#6B0B1A] text-white px-3 py-1 rounded-t-sm flex items-center justify-between">
            <h3 className="text-xs sm:text-sm font-extrabold tracking-wide uppercase">
              STUDENT&apos;S DETAILS
            </h3>
            {data.applicationNumber && (
              <span className="text-[10px] font-mono text-rose-200">
                App No: {data.applicationNumber}
              </span>
            )}
          </div>

          {/* Form Box Grid */}
          <div className="border border-stone-800 p-2 sm:p-3 space-y-2 text-xs sm:text-[13px] bg-white">
            {/* Full Name */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
              <span className="font-bold text-stone-800 whitespace-nowrap min-w-[90px]">
                Full Name:
              </span>
              <div className="flex-1 border border-stone-800 px-3 py-1 font-semibold uppercase bg-stone-50/50 min-h-[28px] flex items-center">
                {data.studentFullName || '—'}
              </div>
            </div>

            {/* Address */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
              <span className="font-bold text-stone-800 whitespace-nowrap min-w-[90px]">
                Address:
              </span>
              <div className="flex-1 border border-stone-800 px-3 py-1 font-semibold uppercase bg-stone-50/50 min-h-[28px] flex items-center">
                {data.studentAddress || '—'}
              </div>
            </div>

            {/* Class, Gender, DOB */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <div className="sm:col-span-4 flex items-center gap-1.5">
                <span className="font-bold text-stone-800 whitespace-nowrap">Class:</span>
                <div className="flex-1 border border-stone-800 px-2 py-1 font-semibold uppercase bg-stone-50/50 min-h-[28px] flex items-center">
                  {data.className || '—'}
                </div>
              </div>

              <div className="sm:col-span-4 flex items-center gap-1.5">
                <span className="font-bold text-stone-800 whitespace-nowrap">Gender:</span>
                <div className="flex-1 border border-stone-800 px-2 py-1 font-semibold uppercase bg-stone-50/50 min-h-[28px] flex items-center">
                  {data.gender || '—'}
                </div>
              </div>

              <div className="sm:col-span-4 flex items-center gap-1.5">
                <span className="font-bold text-stone-800 whitespace-nowrap">Date of Birth:</span>
                <div className="flex-1 border border-stone-800 px-2 py-1 font-semibold font-mono bg-stone-50/50 min-h-[28px] flex items-center">
                  {formattedDob || '—'}
                </div>
              </div>
            </div>

            {/* Place of Birth & State of Origin */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-stone-800 whitespace-nowrap">Place of Birth:</span>
                <div className="flex-1 border border-stone-800 px-2 py-1 font-semibold uppercase bg-stone-50/50 min-h-[28px] flex items-center">
                  {data.placeOfBirth || '—'}
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="font-bold text-stone-800 whitespace-nowrap">State of Origin:</span>
                <div className="flex-1 border border-stone-800 px-2 py-1 font-semibold uppercase bg-stone-50/50 min-h-[28px] flex items-center">
                  {data.stateOfOrigin || '—'}
                </div>
              </div>
            </div>

            {/* LGA & Nationality */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-stone-800 whitespace-nowrap">Local Govt.:</span>
                <div className="flex-1 border border-stone-800 px-2 py-1 font-semibold uppercase bg-stone-50/50 min-h-[28px] flex items-center">
                  {data.lga || '—'}
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="font-bold text-stone-800 whitespace-nowrap text-[11px] sm:text-xs">
                  Nationality (foreigners only):
                </span>
                <div className="flex-1 border border-stone-800 px-2 py-1 font-semibold uppercase bg-stone-50/50 min-h-[28px] flex items-center">
                  {data.nationality || '—'}
                </div>
              </div>
            </div>

            {/* Special Attention */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
              <div className="flex items-center gap-1 min-w-[190px]">
                <span className="font-bold text-stone-800">Special Attention (e.g: Illness):</span>
              </div>
              <div className="flex-1 border border-stone-800 px-3 py-1 font-semibold uppercase bg-stone-50/50 min-h-[28px] flex items-center">
                {data.specialAttention || 'NONE'}
              </div>
              <span className="text-[10px] text-stone-500 italic shrink-0">Optional</span>
            </div>

            {/* Additional Information */}
            <div className="space-y-1">
              <span className="font-bold text-stone-800 block">Additional Information:</span>
              <div className="border border-stone-800 p-2 font-medium bg-stone-50/50 min-h-[50px] text-xs">
                {data.additionalInformation || '—'}
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 2: GUARDIAN'S DETAILS */}
        <div className="mt-4 space-y-2">
          {/* Section Ribbon Header */}
          <div className="bg-[#6B0B1A] text-white px-3 py-1 rounded-t-sm flex items-center justify-between">
            <h3 className="text-xs sm:text-sm font-extrabold tracking-wide uppercase">
              GUARDIAN&apos;S DETAILS
            </h3>
          </div>

          {/* Form Box Grid */}
          <div className="border border-stone-800 p-2 sm:p-3 space-y-2 text-xs sm:text-[13px] bg-white">
            {/* Full Name */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
              <span className="font-bold text-stone-800 whitespace-nowrap min-w-[90px]">
                Full Name:
              </span>
              <div className="flex-1 border border-stone-800 px-3 py-1 font-semibold uppercase bg-stone-50/50 min-h-[28px] flex items-center">
                {data.guardianFullName || '—'}
              </div>
            </div>

            {/* Relationship */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
              <span className="font-bold text-stone-800 whitespace-nowrap min-w-[90px]">
                Relationship:
              </span>
              <div className="flex-1 border border-stone-800 px-3 py-1 font-semibold uppercase bg-stone-50/50 min-h-[28px] flex items-center">
                {data.guardianRelationship || '—'}
              </div>
            </div>

            {/* Occupation */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
              <span className="font-bold text-stone-800 whitespace-nowrap min-w-[90px]">
                Occupation:
              </span>
              <div className="flex-1 border border-stone-800 px-3 py-1 font-semibold uppercase bg-stone-50/50 min-h-[28px] flex items-center">
                {data.guardianOccupation || '—'}
              </div>
            </div>

            {/* Address */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
              <span className="font-bold text-stone-800 whitespace-nowrap min-w-[90px]">
                Address:
              </span>
              <div className="flex-1 border border-stone-800 px-3 py-1 font-semibold uppercase bg-stone-50/50 min-h-[28px] flex items-center">
                {data.guardianAddress || data.studentAddress || '—'}
              </div>
            </div>

            {/* Phone No & Signature */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-1">
              <div className="sm:col-span-7 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-stone-800 whitespace-nowrap min-w-[70px]">
                    Phone No:
                  </span>
                  <div className="flex-1 border border-stone-800 px-3 py-1 font-semibold font-mono bg-stone-50/50 min-h-[28px] flex items-center">
                    {data.guardianPhone || '—'}
                  </div>
                </div>
                {data.guardianEmail && (
                  <div className="flex items-center gap-2 text-[11px] text-stone-600">
                    <span className="font-semibold text-stone-700 whitespace-nowrap min-w-[70px]">
                      Email:
                    </span>
                    <span className="font-mono">{data.guardianEmail}</span>
                  </div>
                )}
              </div>

              <div className="sm:col-span-5 flex flex-col justify-end items-center sm:items-end pt-2 sm:pt-0">
                <div className="w-full sm:w-48 border-b-2 border-stone-800 h-8 flex items-end justify-center">
                  <span className="text-[11px] font-serif italic text-stone-500">
                    {data.guardianFullName ? `Signed: ${data.guardianFullName}` : ''}
                  </span>
                </div>
                <span className="text-[11px] font-bold text-stone-800 mt-1 uppercase tracking-wide">
                  Guardian&apos;s Signature
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 3: FOR OFFICE USE ONLY */}
        <div className="mt-4 space-y-2">
          {/* Section Ribbon Header */}
          <div className="bg-[#6B0B1A] text-white px-3 py-1 rounded-t-sm flex items-center justify-between">
            <h3 className="text-xs sm:text-sm font-extrabold tracking-wide uppercase">
              FOR OFFICE USE ONLY
            </h3>
          </div>

          {/* Underlined lines matching paper form */}
          <div className="border border-stone-800 p-3 sm:p-4 space-y-3 text-xs sm:text-sm bg-white">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <span className="font-bold text-stone-800 whitespace-nowrap">Date Received:</span>
                <div className="flex-1 border-b border-stone-700 min-h-[20px] font-mono text-stone-700 px-1">
                  {data.dateReceived || ''}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-bold text-stone-800 whitespace-nowrap">Class Admitted:</span>
                <div className="flex-1 border-b border-stone-700 min-h-[20px] font-semibold text-stone-700 px-1 uppercase">
                  {data.classAdmitted || ''}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <span className="font-bold text-stone-800 whitespace-nowrap">Admission No:</span>
                <div className="flex-1 border-b border-stone-700 min-h-[20px] font-mono font-bold text-stone-900 px-1">
                  {data.admissionNumber || ''}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-bold text-stone-800 whitespace-nowrap">Headmaster&apos;s Sign:</span>
                <div className="flex-1 border-b border-stone-700 min-h-[20px] font-serif italic text-stone-700 px-1">
                  {data.headmasterSign || ''}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* FOOTER VERIFICATION BAR */}
        <div className="mt-4 pt-2 border-t border-stone-300 flex items-center justify-between text-[10px] text-stone-500 font-mono">
          <span>Swanford Academy Admissions &bull; Official Registration Document</span>
          <span>{data.applicationNumber ? `Doc Ref: ${data.applicationNumber}` : 'System Generated'}</span>
        </div>
      </div>

      {/* PRINT CSS STYLES */}
      <style jsx global>{`
        @media print {
          body {
            background-color: #ffffff !important;
            color: #000000 !important;
          }
          .no-print,
          nav,
          footer,
          header,
          .navbar,
          .public-footer {
            display: none !important;
          }
          .print-area {
            border: 2px solid #000000 !important;
            box-shadow: none !important;
            margin: 0 !important;
            padding: 10mm !important;
            width: 100% !important;
            max-width: 100% !important;
          }
        }
      `}</style>
    </div>
  );
}

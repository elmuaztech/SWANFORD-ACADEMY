'use client';

import React, { useState } from 'react';
import { Badge } from '@/components';

export interface FeeCategory {
  id: string;
  name: string;
  badge: string;
  admissionFee: {
    boys?: string;
    girls?: string;
    general?: string;
  };
  covers: string;
  secondTerm?: string;
  thirdTerm?: string;
  monthlyFee?: string;
  formFee?: string;
  notes?: string;
}

export const SWANFORD_FEE_SCHEDULE: FeeCategory[] = [
  {
    id: 'nursery',
    name: 'Nursery Classes',
    badge: 'Pre-School / Early Years',
    admissionFee: {
      boys: '₦102,000',
      girls: '₦107,500',
    },
    covers:
      'Tuition fee for initial term, Books and Stationeries, a cardigan, 2 polo shirts, medical fee, exam fee, 1 set of uniform and a uniform hijab for girls.',
    secondTerm: '₦49,000 (exam fee charges included)',
    thirdTerm: '₦49,000 (exam fee charges included)',
    formFee: '₦5,000',
  },
  {
    id: 'primary',
    name: 'Primary Classes',
    badge: 'Basic 1 — 6 (Primary Education)',
    admissionFee: {
      boys: '₦112,000',
      girls: '₦117,500',
    },
    covers:
      'Tuition fee for initial term, Books and Stationeries, a cardigan, 2 polo shirts, medical fee, exam fee, 1 set of uniform and a uniform hijab for girls.',
    secondTerm: '₦49,000 (exam fee charges included)',
    thirdTerm: '₦49,000 (exam fee charges included)',
    formFee: '₦5,000',
  },
  {
    id: 'tahfeez',
    name: 'Tahfeez Programme',
    badge: 'Quranic Memorisation & Islamic Character',
    admissionFee: {
      general: '₦18,000',
    },
    covers: 'Initial tuition fee, 1 set of uniform and books.',
    secondTerm: '₦8,000',
    thirdTerm: '₦8,000',
    formFee: '₦5,000',
  },
  {
    id: 'creche',
    name: 'Swanford Creche',
    badge: 'Daycare & Toddlers',
    admissionFee: {
      general: '₦10,000 / month',
    },
    covers: 'Dedicated early child care, safe stimulation environment & daycare supervision.',
    monthlyFee: '₦10,000 per month',
    formFee: '₦5,000',
    notes: 'Crèche fee is ₦10,000 billed on a monthly basis. Application form is ₦5,000.',
  },
  {
    id: 'islamiyya',
    name: 'Al-Irshaad Islamiyya',
    badge: 'Afternoon & Weekend Islamiyya',
    admissionFee: {
      general: '₦23,000 Total Package',
    },
    covers: 'Admission form, Tuition fee, Books, Uniform, and Exam fee.',
    formFee: 'Included in package',
    notes: 'Complete package fee covers Form + Tuition + Books + Uniform + Exam fee.',
  },
];

interface SwanfordFeeScheduleProps {
  selectedCategory?: string;
  collapsible?: boolean;
  defaultExpanded?: boolean;
}

export function SwanfordFeeSchedule({
  selectedCategory,
  collapsible = true,
  defaultExpanded = true,
}: SwanfordFeeScheduleProps) {
  const [activeTab, setActiveTab] = useState<string>(selectedCategory || 'all');
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);

  // Sync if selectedCategory prop changes
  React.useEffect(() => {
    if (selectedCategory) {
      const lower = selectedCategory.toLowerCase();
      if (lower.includes('creche')) setActiveTab('creche');
      else if (lower.includes('nursery')) setActiveTab('nursery');
      else if (lower.includes('primary')) setActiveTab('primary');
      else if (lower.includes('tahfeez')) setActiveTab('tahfeez');
      else if (lower.includes('islamiyya') || lower.includes('irshaad')) setActiveTab('islamiyya');
    }
  }, [selectedCategory]);

  const displayedList =
    activeTab === 'all'
      ? SWANFORD_FEE_SCHEDULE
      : SWANFORD_FEE_SCHEDULE.filter((c) => c.id === activeTab);

  return (
    <div className="bg-white border border-[#EADBDA] rounded-xl shadow-xs overflow-hidden">
      {/* Header Bar */}
      <div
        className={`px-4 sm:px-5 py-3.5 bg-gradient-to-r from-[#5B0612] to-[#800020] text-white flex items-center justify-between ${
          collapsible ? 'cursor-pointer select-none' : ''
        }`}
        onClick={() => collapsible && setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2.5">
          <svg className="w-5 h-5 text-amber-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <div>
            <h3 className="text-xs sm:text-sm font-extrabold uppercase tracking-wide text-white">
              Official Swanford Academy Fee Structure
            </h3>
            <p className="text-[11px] text-amber-100 font-normal">
              Plot 212, Dr Nuhu Muhammadu Sanusi Way, Dutse • Main Campus
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden sm:inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white/15 text-white border border-white/20">
            Form Fee: ₦5,000
          </span>
          {collapsible && (
            <button
              type="button"
              className="p-1 text-rose-100 hover:text-white"
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="p-4 sm:p-5 space-y-4">
          {/* Quick Filter Buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-lg font-bold whitespace-nowrap transition-all ${
                activeTab === 'all'
                  ? 'bg-[#6B0B1A] text-white shadow-xs'
                  : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
              }`}
            >
              All Programmes
            </button>
            {SWANFORD_FEE_SCHEDULE.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveTab(cat.id)}
                className={`px-3 py-1.5 rounded-lg font-bold whitespace-nowrap transition-all ${
                  activeTab === cat.id
                    ? 'bg-[#6B0B1A] text-white shadow-xs'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Fee Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {displayedList.map((item) => (
              <div
                key={item.id}
                className="border border-[#EADBDA] rounded-xl p-3.5 sm:p-4 bg-[#FAF7F2]/60 hover:bg-[#FAF7F2] transition-colors space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-extrabold text-[#5B0612] text-sm sm:text-base">
                      {item.name}
                    </h4>
                    <span className="text-[11px] text-stone-500 font-medium">
                      {item.badge}
                    </span>
                  </div>
                  <Badge variant="neutral" size="sm" className="font-mono text-[10px]">
                    Form: {item.formFee || '₦5,000'}
                  </Badge>
                </div>

                {/* Admission / First Term Breakdown */}
                <div className="bg-white rounded-lg p-3 border border-stone-200/80 space-y-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500 block">
                    Admission / First Term Fee
                  </span>
                  {item.admissionFee.boys && item.admissionFee.girls ? (
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2 rounded bg-[#FDF2F4] border border-[#EADBDA]">
                        <span className="text-stone-600 block text-[11px]">Boys</span>
                        <strong className="text-[#6B0B1A] font-extrabold text-sm sm:text-base">
                          {item.admissionFee.boys}
                        </strong>
                      </div>
                      <div className="p-2 rounded bg-[#FDF2F4] border border-[#EADBDA]">
                        <span className="text-stone-600 block text-[11px]">Girls</span>
                        <strong className="text-[#6B0B1A] font-extrabold text-sm sm:text-base">
                          {item.admissionFee.girls}
                        </strong>
                      </div>
                    </div>
                  ) : (
                    <div className="p-2 rounded bg-[#FDF2F4] border border-[#EADBDA] text-xs">
                      <span className="text-stone-600 block text-[11px]">Official Fee</span>
                      <strong className="text-[#6B0B1A] font-extrabold text-sm sm:text-base">
                        {item.admissionFee.general}
                      </strong>
                    </div>
                  )}

                  <p className="text-[11px] text-stone-600 leading-relaxed pt-1">
                    <strong className="text-stone-800 font-semibold">Covers: </strong>
                    {item.covers}
                  </p>
                </div>

                {/* Subsequent Term Fees */}
                {(item.secondTerm || item.thirdTerm || item.monthlyFee) && (
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    {item.secondTerm && (
                      <div className="border border-stone-200 rounded p-2 bg-white">
                        <span className="text-stone-500 block">Second Term</span>
                        <span className="font-bold text-stone-800">{item.secondTerm}</span>
                      </div>
                    )}
                    {item.thirdTerm && (
                      <div className="border border-stone-200 rounded p-2 bg-white">
                        <span className="text-stone-500 block">Third Term</span>
                        <span className="font-bold text-stone-800">{item.thirdTerm}</span>
                      </div>
                    )}
                    {item.monthlyFee && (
                      <div className="col-span-2 border border-stone-200 rounded p-2 bg-white">
                        <span className="text-stone-500 block">Monthly Rate</span>
                        <span className="font-bold text-[#6B0B1A]">{item.monthlyFee}</span>
                      </div>
                    )}
                  </div>
                )}

                {item.notes && (
                  <div className="flex items-start gap-1.5 text-[11px] text-stone-500 italic bg-white/70 p-2 rounded border border-stone-200/50">
                    <svg className="w-3.5 h-3.5 text-stone-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{item.notes}</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="pt-2 border-t border-stone-200 text-center text-xs text-stone-500">
            Official Swanford Academy Admission Form is <strong>₦5,000</strong>. All payments are strictly processed via official school channels.
          </div>
        </div>
      )}
    </div>
  );
}

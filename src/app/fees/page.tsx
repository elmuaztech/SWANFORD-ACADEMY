'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Navbar, PublicFooter, Button, Card, CardContent, LoadingState, ErrorState, Badge } from '@/components';
import { formatNaira } from '@/lib/money';

interface FeeItem {
  name: string;
  amountKobo: string;
}

interface FeeStructureResponse {
  id: string;
  name: string;
  programmeName: string;
  programmeCode: string;
  termName: string;
  termCode: string;
  applicableGender: string;
  isAdmissionFee: boolean;
  totalAmountKobo: string;
  items: FeeItem[];
}

interface PublicFeesData {
  session: { id: string; name: string } | null;
  formFeeKobo: string;
  bankDetails: {
    bankName: string;
    accountNumber: string;
    accountName: string;
  };
  feeStructures: FeeStructureResponse[];
}

export default function FeesPage() {
  const [data, setData] = useState<PublicFeesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadFees() {
      try {
        setLoading(true);
        const res = await fetch('/api/public/fees');
        if (!res.ok) {
          throw new Error('Unable to retrieve active fee schedule.');
        }
        const json = await res.json();
        setData(json);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error loading fee schedule.';
        setError(msg);
      } finally {
        setLoading(false);
      }
    }
    loadFees();
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-[#FFFFFF] text-[#1C1A1A]">
      <Navbar currentPath="/fees" />

      <main className="flex-1">
        {/* Page Banner */}
        <section className="bg-[#FDFBF7] border-b border-[#EADBDA] py-12 sm:py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-3">
            <div className="inline-block px-3 py-1 bg-[#EADBDA] text-[#5B0612] rounded text-xs font-bold uppercase tracking-wider">
              Financial Information
            </div>
            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-[#1C1A1A]">
              Tuition &amp; Fee Schedule
            </h1>
            <p className="text-sm sm:text-base text-[#524B46] max-w-2xl mx-auto">
              Authoritative, transparent schedule for the active academic session. Itemized breakdown of entrance packages, tuition, and standard term fees.
            </p>
          </div>
        </section>

        {/* Content Section */}
        <section className="py-12 sm:py-16 bg-white border-b border-[#EADBDA]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            {loading && (
              <div className="py-16 max-w-lg mx-auto">
                <LoadingState
                  title="Retrieving Official Fee Schedule"
                  description="Connecting to the database for active session pricing..."
                />
              </div>
            )}

            {error && (
              <div className="py-12 max-w-xl mx-auto text-center">
                <ErrorState
                  title="Fee Schedule Notice"
                  message={error}
                />
              </div>
            )}

            {data && (
              <div className="space-y-12">
                {/* 1. Application Form Fee Notice */}
                <div className="bg-[#FDFBF7] p-6 sm:p-8 rounded-2xl border-2 border-[#5B0612] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                  <div className="space-y-2">
                    <div className="inline-flex items-center gap-2">
                      <Badge variant="brand" size="sm">
                        Admissions
                      </Badge>
                      <span className="text-xs text-[#524B46]">Non-refundable processing fee</span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-bold text-[#1C1A1A]">
                      Application Form Fee
                    </h2>
                    <p className="text-xs sm:text-sm text-[#524B46] max-w-xl">
                      Payable online via secure Paystack gateway during application or via verified bank transfer.
                    </p>
                  </div>

                  <div className="text-left sm:text-right shrink-0">
                    <span className="text-xs text-[#8C827A] block uppercase tracking-wider font-semibold">
                      Configured Fee
                    </span>
                    <span className="text-2xl sm:text-4xl font-bold text-[#5B0612] font-mono">
                      {formatNaira(BigInt(data.formFeeKobo))}
                    </span>
                  </div>
                </div>

                {/* 2. Structured Fee Cards */}
                <div>
                  <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#EADBDA] pb-4">
                    <h2 className="text-xl sm:text-2xl font-bold text-[#1C1A1A]">
                      Academic Programme Fee Structures
                    </h2>
                    {data.session && (
                      <span className="text-xs text-[#524B46] bg-[#F5F0EB] px-3 py-1 rounded-full font-medium">
                        Session: {data.session.name}
                      </span>
                    )}
                  </div>

                  {data.feeStructures.length === 0 ? (
                    <div className="text-center py-12 text-[#8C827A] bg-[#FDFBF7] rounded-xl border border-[#EADBDA]">
                      <p className="text-sm">No active fee schedules currently published for this session.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {data.feeStructures.map((fs) => (
                        <Card
                          key={fs.id}
                          className="bg-white border-[#EADBDA] shadow-xs flex flex-col justify-between hover:border-[#5B0612] transition-colors"
                        >
                          <CardContent className="p-6 space-y-4">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span className="text-[11px] font-bold uppercase tracking-wider text-[#5B0612] block">
                                  {fs.programmeName}
                                </span>
                                <h3 className="font-bold text-base text-[#1C1A1A] mt-0.5">
                                  {fs.name}
                                </h3>
                              </div>
                              {fs.isAdmissionFee && (
                                <Badge variant="brand" size="sm">
                                  Entrance
                                </Badge>
                              )}
                            </div>

                            <div className="pt-2 pb-1 border-y border-[#EADBDA] flex items-baseline justify-between">
                              <span className="text-xs text-[#524B46] font-medium">Total Term Fee:</span>
                              <span className="text-lg font-bold text-[#5B0612] font-mono">
                                {formatNaira(BigInt(fs.totalAmountKobo))}
                              </span>
                            </div>

                            {/* Itemized charges */}
                            {fs.items.length > 0 && (
                              <div className="space-y-1.5 pt-1">
                                <span className="text-[11px] uppercase tracking-wider text-[#8C827A] font-bold block">
                                  Itemized Breakdown:
                                </span>
                                <ul className="space-y-1 text-xs text-[#524B46]">
                                  {fs.items.map((item, idx) => (
                                    <li key={idx} className="flex justify-between">
                                      <span className="truncate max-w-[180px]">{item.name}</span>
                                      <span className="font-mono text-[#1C1A1A] font-medium">
                                        {formatNaira(BigInt(item.amountKobo))}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>

                {/* 3. Official Bank Transfer & Payment Channels */}
                <div className="bg-[#FDFBF7] p-8 rounded-2xl border border-[#EADBDA] space-y-6">
                  <div className="space-y-2">
                    <h2 className="text-xl font-bold text-[#1C1A1A]">Payment Methods &amp; Banking Details</h2>
                    <p className="text-xs sm:text-sm text-[#524B46] leading-relaxed">
                      Parents and guardians may pay fees via online Paystack card/transfer or through direct bank deposit into the official school account.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {/* Bank Transfer */}
                    <div className="bg-white p-6 rounded-xl border border-[#EADBDA] space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-[#EADBDA] text-[#5B0612] text-xs font-bold flex items-center justify-center">
                          1
                        </div>
                        <h3 className="font-bold text-sm text-[#1C1A1A]">Direct Bank Transfer</h3>
                      </div>
                      <div className="space-y-1.5 text-xs text-[#524B46] bg-[#FDFBF7] p-3.5 rounded-lg border border-[#EADBDA]">
                        <p><span className="text-[#8C827A]">Bank Name:</span> <strong className="text-[#1C1A1A]">{data.bankDetails.bankName}</strong></p>
                        <p><span className="text-[#8C827A]">Account Number:</span> <strong className="text-[#5B0612] font-mono text-sm">{data.bankDetails.accountNumber}</strong></p>
                        <p><span className="text-[#8C827A]">Account Name:</span> <strong className="text-[#1C1A1A]">{data.bankDetails.accountName}</strong></p>
                      </div>
                      <p className="text-[11px] text-[#8C827A] italic">
                        * Note: Bank transfers require manual administrative reconciliation and receipt issuance at the school bursary.
                      </p>
                    </div>

                    {/* Online Paystack */}
                    <div className="bg-white p-6 rounded-xl border border-[#EADBDA] space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-[#EADBDA] text-[#5B0612] text-xs font-bold flex items-center justify-center">
                          2
                        </div>
                        <h3 className="font-bold text-sm text-[#1C1A1A]">Online Card / USSD Payment</h3>
                      </div>
                      <p className="text-xs text-[#524B46] leading-relaxed">
                        Pay application fees and tuition invoices instantly via the integrated Paystack gateway with immediate digital receipt generation.
                      </p>
                      <div className="pt-2">
                        <Link href="/admissions">
                          <Button variant="primary" size="sm" className="w-full">
                            Pay Application Fee Online &rarr;
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}

'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Navbar, PublicFooter, Button, Card, CardContent, LoadingState, ErrorState, Badge } from '@/components';
import { formatNaira } from '@/lib/money';

interface PublicFeesData {
  session: { id: string; name: string } | null;
  formFeeKobo: string;
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
          throw new Error('Unable to retrieve active session information.');
        }
        const json = await res.json();
        setData({
          session: json.session || null,
          formFeeKobo: json.formFeeKobo || '500000',
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error loading admission fee information.';
        setError(msg);
      } finally {
        setLoading(false);
      }
    }
    loadFees();
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-[#FFFFFF] text-[#1C1A1A] w-full max-w-full overflow-x-hidden">
      <Navbar currentPath="/fees" />

      <main className="flex-1 w-full max-w-full overflow-x-hidden">
        {/* Page Banner */}
        <section className="bg-[#FAF7F2] border-b border-[#EADBDA] py-12 sm:py-16 overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-3" data-reveal="fade-in">
            <div className="inline-block px-3 py-1 bg-[#EADBDA] text-[#5B0612] rounded-full text-xs font-bold uppercase tracking-wider">
              Financial Information &amp; Policy
            </div>
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-[#5B0612]">
              Tuition &amp; Fee Policy
            </h1>
            <p className="text-sm sm:text-base text-stone-600 max-w-2xl mx-auto leading-relaxed">
              Swanford Academy maintains an authoritative, confidential, and transparent fee schedule for all educational programmes in Dutse, Jigawa State.
            </p>
          </div>
        </section>

        {/* Content Section */}
        <section className="py-12 sm:py-16 bg-white border-b border-[#EADBDA] overflow-hidden">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            {loading && (
              <div className="py-16 max-w-lg mx-auto">
                <LoadingState
                  title="Retrieving Official Fee Information"
                  description="Loading admission fee guidelines for the active academic session..."
                />
              </div>
            )}

            {error && (
              <div className="py-12 max-w-xl mx-auto text-center">
                <ErrorState
                  title="Notice"
                  message={error}
                />
              </div>
            )}

            {data && (
              <div className="space-y-10">
                {/* 1. Official Policy Banner */}
                <div className="rounded-3xl border-2 border-[#5B0612]/20 bg-gradient-to-br from-[#FAF7F2] via-white to-[#FDF8F0] p-6 sm:p-10 shadow-sm space-y-6" data-reveal="fade-up">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#EADBDA] pb-6">
                    <div className="space-y-1">
                      <span className="text-xs uppercase tracking-wider font-bold text-[#800020] block">
                        Institutional Fee Policy
                      </span>
                      <h2 className="text-xl sm:text-2xl font-bold text-[#5B0612]">
                        Official Admission Invoices
                      </h2>
                    </div>
                    {data.session && (
                      <Badge variant="brand" size="md">
                        Session: {data.session.name}
                      </Badge>
                    )}
                  </div>

                  <p className="text-base sm:text-lg text-stone-800 leading-relaxed font-medium">
                    Programme fees are provided in your official admission invoice after your application has been reviewed and the applicable invoice has been generated.
                  </p>

                  <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
                    To maintain financial integrity and ensure personalized fee allocations based on your child&apos;s specific entry grade, academic requirements, and boarding or day preferences, comprehensive fee schedules are delivered confidentially to registered applicants.
                  </p>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
                    <Link href="/admissions">
                      <Button variant="primary" size="lg" className="w-full sm:w-auto bg-[#800020] hover:bg-[#5B0612] text-white shadow-md">
                        Apply Online &rarr;
                      </Button>
                    </Link>
                    <Link href="/admissions/status">
                      <Button variant="outline" size="lg" className="w-full sm:w-auto border-[#EADBDA] hover:border-[#800020] text-stone-700 hover:text-[#800020]">
                        Track Application &amp; View Invoices
                      </Button>
                    </Link>
                  </div>
                </div>

                {/* 2. Step-by-Step Admissions & Invoicing Process */}
                <div className="space-y-6" data-reveal="fade-up">
                  <div className="border-b border-[#EADBDA] pb-3">
                    <h2 className="text-lg sm:text-xl font-bold text-[#5B0612]">
                      How the Invoicing &amp; Payment Process Works
                    </h2>
                    <p className="text-xs sm:text-sm text-stone-500 mt-0.5">
                      A simple, dignified 4-step workflow from application to enrollment.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {/* Step 1 */}
                    <Card className="bg-[#FAF7F2] border-[#EADBDA]" data-reveal="fade-up" data-delay="50">
                      <CardContent className="p-6 space-y-3">
                        <div className="w-8 h-8 rounded-full bg-[#800020] text-white text-xs font-bold flex items-center justify-center">
                          01
                        </div>
                        <h3 className="font-bold text-base text-[#5B0612]">
                          1. Submit Online Application
                        </h3>
                        <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
                          Complete the online application form with guardian contact details, applicant biography, passport photograph, and educational programme selection.
                        </p>
                      </CardContent>
                    </Card>

                    {/* Step 2 */}
                    <Card className="bg-[#FAF7F2] border-[#EADBDA]" data-reveal="fade-up" data-delay="120">
                      <CardContent className="p-6 space-y-3">
                        <div className="w-8 h-8 rounded-full bg-[#800020] text-white text-xs font-bold flex items-center justify-center">
                          02
                        </div>
                        <h3 className="font-bold text-base text-[#5B0612]">
                          2. Review &amp; Invoice Generation
                        </h3>
                        <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
                          The admissions committee evaluates application credentials and automatically computes the designated entrance fee structure and tuition invoice.
                        </p>
                      </CardContent>
                    </Card>

                    {/* Step 3 */}
                    <Card className="bg-[#FAF7F2] border-[#EADBDA]" data-reveal="fade-up" data-delay="190">
                      <CardContent className="p-6 space-y-3">
                        <div className="w-8 h-8 rounded-full bg-[#800020] text-white text-xs font-bold flex items-center justify-center">
                          03
                        </div>
                        <h3 className="font-bold text-base text-[#5B0612]">
                          3. Confidential Invoice Delivery
                        </h3>
                        <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
                          The official invoice containing full itemized breakdown (tuition, stationery, uniform, medical) is delivered securely to the parent&apos;s registered email.
                        </p>
                      </CardContent>
                    </Card>

                    {/* Step 4 */}
                    <Card className="bg-[#FAF7F2] border-[#EADBDA]">
                      <CardContent className="p-6 space-y-3">
                        <div className="w-8 h-8 rounded-full bg-[#800020] text-white text-xs font-bold flex items-center justify-center">
                          04
                        </div>
                        <h3 className="font-bold text-base text-[#5B0612]">
                          4. Secure Checkout &amp; Instant Receipt
                        </h3>
                        <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
                          Settle your invoice securely online via debit card, USSD, or designated school bank transfer. An official verifiable PDF receipt is generated instantly.
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                </div>

                {/* 3. Application Form Processing Fee */}
                <div className="bg-[#FAF7F2] p-6 sm:p-8 rounded-2xl border border-[#EADBDA] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                  <div className="space-y-1.5 max-w-xl">
                    <span className="text-xs uppercase tracking-wider font-bold text-[#800020]">
                      Standard Application Fee
                    </span>
                    <h3 className="text-lg sm:text-xl font-bold text-[#5B0612]">
                      Application &amp; Entrance Assessment Fee
                    </h3>
                    <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
                      A single non-refundable administrative processing fee payable during admission registration to cover application verification, placement evaluation, and academic assessment.
                    </p>
                  </div>

                  <div className="text-left sm:text-right shrink-0">
                    <span className="text-xs text-stone-500 block uppercase tracking-wider font-semibold">
                      Processing Fee
                    </span>
                    <span className="text-2xl sm:text-3xl font-extrabold text-[#5B0612] font-mono">
                      {formatNaira(BigInt(data.formFeeKobo))}
                    </span>
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

'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Navbar,
  PublicFooter,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  LoadingState,
  ErrorState,
  Badge,
} from '@/components';
import { formatNaira } from '@/lib/money';

interface FeeItemPublic {
  name: string;
  amountKobo: string;
}

interface FeeStructurePublic {
  id: string;
  name: string;
  programmeName: string;
  programmeCode: string;
  termName: string;
  termCode: string;
  applicableGender: string;
  isAdmissionFee: boolean;
  totalAmountKobo: string;
  items: FeeItemPublic[];
}

interface BankDetailsPublic {
  bankName: string;
  accountNumber: string;
  accountName: string;
}

interface PublicFeesData {
  session: { id: string; name: string } | null;
  formFeeKobo: string;
  bankDetails?: BankDetailsPublic;
  feeStructures: FeeStructurePublic[];
}

export default function FeesPage() {
  const [data, setData] = useState<PublicFeesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProgramme, setSelectedProgramme] = useState<string>('ALL');

  useEffect(() => {
    async function loadFees() {
      try {
        setLoading(true);
        const res = await fetch('/api/public/fees');
        if (!res.ok) {
          throw new Error('Unable to retrieve official fee information.');
        }
        const json = await res.json();
        setData({
          session: json.session || null,
          formFeeKobo: json.formFeeKobo || '500000',
          bankDetails: json.bankDetails || undefined,
          feeStructures: json.feeStructures || [],
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

  const feeStructures = data?.feeStructures || [];
  const uniqueProgrammes = Array.from(
    new Set(feeStructures.map((fs) => fs.programmeName))
  );

  const displayedStructures =
    selectedProgramme === 'ALL'
      ? feeStructures
      : feeStructures.filter((fs) => fs.programmeName === selectedProgramme);

  const formFeeKobo = data?.formFeeKobo || '500000';
  const bank = data?.bankDetails || {
    bankName: '',
    accountNumber: '',
    accountName: '',
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FFFFFF] text-[#1C1A1A] w-full max-w-full overflow-x-hidden">
      <Navbar currentPath="/fees" />

      <main className="flex-1 w-full max-w-full overflow-x-hidden">
        {/* Page Banner */}
        <section className="bg-[#FAF7F2] border-b border-[#EADBDA] py-12 sm:py-16 overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-3">
            <div className="inline-block px-3 py-1 bg-[#EADBDA] text-[#5B0612] rounded-full text-xs font-bold uppercase tracking-wider">
              Financial Transparency &amp; Policy
            </div>
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-[#5B0612]">
              Tuition &amp; Fee Schedule
            </h1>
            <p className="text-sm sm:text-base text-stone-600 max-w-2xl mx-auto leading-relaxed">
              Swanford Academy maintains an authoritative, transparent, and structured fee schedule for all educational programmes in Dutse, Jigawa State.
            </p>
          </div>
        </section>

        {/* Content Section */}
        <section className="py-10 sm:py-16 bg-white border-b border-[#EADBDA] overflow-hidden">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            {loading && (
              <div className="py-16 max-w-lg mx-auto">
                <LoadingState
                  title="Retrieving Official Fee Information"
                  description="Loading admission fee guidelines and approved programme schedules..."
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
              <div className="space-y-12">
                {/* 1. Official Application Fee Callout (Top Transparency) */}
                <div className="rounded-3xl border-2 border-[#5B0612]/20 bg-gradient-to-br from-[#FAF7F2] via-white to-[#FDF8F0] p-6 sm:p-10 shadow-sm space-y-6">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#EADBDA] pb-6">
                    <div className="space-y-1">
                      <span className="text-xs uppercase tracking-wider font-bold text-[#800020] block">
                        Institutional Fee Policy
                      </span>
                      <h2 className="text-xl sm:text-2xl font-bold text-[#5B0612]">
                        Approved Academic Fees &amp; Application Process
                      </h2>
                    </div>
                    {data.session && (
                      <Badge variant="brand" size="md">
                        Session: {data.session.name}
                      </Badge>
                    )}
                  </div>

                  {/* Highlighted Application Form Fee Card */}
                  <div className="bg-white p-5 sm:p-6 rounded-2xl border border-[#EADBDA] shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    <div className="space-y-2 max-w-xl">
                      <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#FAF2F4] text-[#800020] border border-[#EADBDA]">
                        <span>Stage 1 of Admission</span>
                        <span>&bull;</span>
                        <span>One-Time Fee</span>
                      </div>
                      <h3 className="text-lg sm:text-xl font-bold text-[#5B0612]">
                        Official Application &amp; Entrance Assessment Fee
                      </h3>
                      <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
                        A single non-refundable administrative processing fee payable before accessing the admission form. Covers application verification, credential review, and candidate placement assessment.
                      </p>
                    </div>

                    <div className="flex flex-col items-start md:items-end justify-center shrink-0 w-full md:w-auto pt-2 md:pt-0 border-t md:border-t-0 border-stone-200">
                      <span className="text-xs text-stone-500 uppercase tracking-wider font-bold">
                        Official Form Fee
                      </span>
                      <span className="text-2xl sm:text-4xl font-extrabold text-[#5B0612] font-mono mt-0.5">
                        {formatNaira(BigInt(formFeeKobo))}
                      </span>
                      <span className="text-[11px] text-emerald-700 font-semibold mt-1">
                        &check; Zero Hidden Charges
                      </span>
                    </div>
                  </div>

                  <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
                    Swanford Academy combines Islamic education with a rigorous Western curriculum. Programme fees are provided in your official admission invoice after your application has been reviewed and the applicable invoice has been generated. School fees are determined per academic programme and session.
                  </p>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
                    <Link href="/admissions" className="w-full sm:w-auto">
                      <Button variant="primary" size="lg" className="w-full sm:w-auto bg-[#800020] hover:bg-[#5B0612] text-white shadow-md font-bold">
                        Apply Online ({formatNaira(BigInt(formFeeKobo))}) &rarr;
                      </Button>
                    </Link>
                    <Link href="/admissions" className="w-full sm:w-auto">
                      <Button variant="outline" size="lg" className="w-full sm:w-auto border-[#EADBDA] hover:border-[#800020] text-stone-700 hover:text-[#800020] font-semibold">
                        Already Paid? Verify Reference
                      </Button>
                    </Link>
                    <Link href="/admissions/status" className="w-full sm:w-auto">
                      <Button variant="ghost" size="lg" className="w-full sm:w-auto text-stone-600 hover:text-[#800020]">
                        Check Status &amp; Invoices
                      </Button>
                    </Link>
                  </div>
                </div>

                {/* 2. Three Transparent Payment Stages */}
                <div className="space-y-6">
                  <div className="border-b border-[#EADBDA] pb-3">
                    <h2 className="text-xl sm:text-2xl font-extrabold text-[#5B0612]">
                      Applicable Payment Stages &amp; Fee Structure
                    </h2>
                    <p className="text-xs sm:text-sm text-stone-500 mt-1">
                      Clear separation of application fee, one-time entrance charges, and recurring tuition levies.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Stage 1 */}
                    <Card className="border border-[#EADBDA] bg-white flex flex-col justify-between shadow-xs">
                      <CardHeader className="bg-[#FAF7F2] border-b border-[#EADBDA] pb-3">
                        <div className="flex items-center justify-between">
                          <span className="w-7 h-7 rounded-full bg-[#800020] text-white text-xs font-bold flex items-center justify-center">
                            1
                          </span>
                          <Badge variant="brand" size="sm">
                            One-Time Only
                          </Badge>
                        </div>
                        <CardTitle className="text-base font-bold text-[#5B0612] mt-2">
                          Application &amp; Form Fee
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-5 flex-1 flex flex-col justify-between space-y-4 text-xs sm:text-sm text-stone-600">
                        <div className="space-y-2">
                          <p>
                            Payable when beginning an online admission application. Unlocks the comprehensive registration form and reserves placement evaluation.
                          </p>
                          <ul className="list-disc pl-4 space-y-1 text-stone-700">
                            <li>Application registration &amp; profile setup</li>
                            <li>Entrance placement assessment</li>
                            <li>Admissions committee review</li>
                          </ul>
                        </div>
                        <div className="pt-3 border-t border-stone-100 flex items-center justify-between font-semibold">
                          <span className="text-stone-500">Payable Amount:</span>
                          <span className="text-[#5B0612] font-mono text-base font-extrabold">
                            {formatNaira(BigInt(formFeeKobo))}
                          </span>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Stage 2 */}
                    <Card className="border border-[#EADBDA] bg-white flex flex-col justify-between shadow-xs">
                      <CardHeader className="bg-[#FAF7F2] border-b border-[#EADBDA] pb-3">
                        <div className="flex items-center justify-between">
                          <span className="w-7 h-7 rounded-full bg-[#800020] text-white text-xs font-bold flex items-center justify-center">
                            2
                          </span>
                          <Badge variant="neutral" size="sm">
                            New Enrollment
                          </Badge>
                        </div>
                        <CardTitle className="text-base font-bold text-[#5B0612] mt-2">
                          Admission &amp; 1st Term Package
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-5 flex-1 flex flex-col justify-between space-y-4 text-xs sm:text-sm text-stone-600">
                        <div className="space-y-2">
                          <p>
                            Generated upon successful admission offer. Combines one-time entrance materials and First Term tuition.
                          </p>
                          <ul className="list-disc pl-4 space-y-1 text-stone-700">
                            <li>Official school uniform, cardigan &amp; polos</li>
                            <li>Books, stationery &amp; academic workbooks</li>
                            <li>Medical assessment &amp; examination levies</li>
                            <li>Core First Term academic tuition</li>
                          </ul>
                        </div>
                        <div className="pt-3 border-t border-stone-100 flex items-center justify-between font-semibold">
                          <span className="text-stone-500">Schedule:</span>
                          <span className="text-[#5B0612] text-xs font-bold">
                            Per Approved Offer Invoice
                          </span>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Stage 3 */}
                    <Card className="border border-[#EADBDA] bg-white flex flex-col justify-between shadow-xs">
                      <CardHeader className="bg-[#FAF7F2] border-b border-[#EADBDA] pb-3">
                        <div className="flex items-center justify-between">
                          <span className="w-7 h-7 rounded-full bg-[#800020] text-white text-xs font-bold flex items-center justify-center">
                            3
                          </span>
                          <Badge variant="neutral" size="sm">
                            Termly Recurring
                          </Badge>
                        </div>
                        <CardTitle className="text-base font-bold text-[#5B0612] mt-2">
                          Continuing Term Tuition
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-5 flex-1 flex flex-col justify-between space-y-4 text-xs sm:text-sm text-stone-600">
                        <div className="space-y-2">
                          <p>
                            Billed at the commencement of 2nd and 3rd academic terms for ongoing registered pupils.
                          </p>
                          <ul className="list-disc pl-4 space-y-1 text-stone-700">
                            <li>Termly instructional curriculum &amp; Tahfeez</li>
                            <li>Continuous assessments &amp; examinations</li>
                            <li>Institutional learning resources</li>
                          </ul>
                        </div>
                        <div className="pt-3 border-t border-stone-100 flex items-center justify-between font-semibold">
                          <span className="text-stone-500">Schedule:</span>
                          <span className="text-[#5B0612] text-xs font-bold">
                            Billed Per Academic Term
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>

                {/* 3. Verified Payment Methods (Paystack & Bank Transfer) */}
                <div className="space-y-6">
                  <div className="border-b border-[#EADBDA] pb-3">
                    <h2 className="text-xl sm:text-2xl font-extrabold text-[#5B0612]">
                      Official Supported Payment Methods
                    </h2>
                    <p className="text-xs sm:text-sm text-stone-500 mt-1">
                      Payments to Swanford Academy are securely processed via trusted gateway or direct institutional bank transfer.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Method 1: Paystack Gateway */}
                    <Card className="border border-[#EADBDA] bg-white shadow-xs">
                      <CardHeader className="bg-[#FAF2F4] border-b border-[#EADBDA] pb-3.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
                            <CardTitle className="text-base font-bold text-[#5B0612]">
                              Online Payment (Instant Gateway)
                            </CardTitle>
                          </div>
                          <Badge variant="success" size="sm">
                            Instant Verification
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="p-5 space-y-3 text-xs sm:text-sm text-stone-600 leading-relaxed">
                        <p>
                          Powered by <strong>Paystack</strong> with bank-grade 256-bit encryption. Your payment is verified in real-time, instantly unlocking your application form without delays.
                        </p>
                        <div className="bg-stone-50 p-3.5 rounded-xl border border-stone-200 space-y-2">
                          <div className="font-semibold text-stone-800 text-xs">Supported Channels:</div>
                          <div className="flex flex-wrap gap-2 text-xs">
                            <span className="px-2.5 py-1 bg-white border border-stone-200 rounded-md font-medium text-stone-700">
                              Debit Card (Mastercard, Visa, Verve)
                            </span>
                            <span className="px-2.5 py-1 bg-white border border-stone-200 rounded-md font-medium text-stone-700">
                              Direct Bank Transfer
                            </span>
                            <span className="px-2.5 py-1 bg-white border border-stone-200 rounded-md font-medium text-stone-700">
                              USSD (*737#, *894#, etc.)
                            </span>
                          </div>
                        </div>
                        <p className="text-[11px] text-stone-500 italic">
                          &check; Swanford Academy never stores your payment card credentials.
                        </p>
                      </CardContent>
                    </Card>

                    {/* Method 2: Direct Bank Transfer */}
                    <Card className="border border-[#EADBDA] bg-white shadow-xs">
                      <CardHeader className="bg-[#FAF7F2] border-b border-[#EADBDA] pb-3.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-[#800020]"></span>
                            <CardTitle className="text-base font-bold text-[#5B0612]">
                              Direct School Bank Transfer
                            </CardTitle>
                          </div>
                          <Badge variant="brand" size="sm">
                            Official Account
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="p-5 space-y-3 text-xs sm:text-sm text-stone-600 leading-relaxed">
                        <p>
                          Parents who prefer traditional banking or mobile app transfers can pay directly into the official school account:
                        </p>
                        <div className="bg-[#FAF7F2] p-4 rounded-xl border border-[#EADBDA] space-y-2 text-xs">
                          <div className="flex justify-between items-center py-1 border-b border-stone-200">
                            <span className="text-stone-500 font-medium">Bank Name:</span>
                            <span className="font-bold text-stone-900">{bank.bankName}</span>
                          </div>
                          <div className="flex justify-between items-center py-1 border-b border-stone-200">
                            <span className="text-stone-500 font-medium">Account Number:</span>
                            <span className="font-mono font-extrabold text-base text-[#5B0612] tracking-wider">
                              {bank.accountNumber}
                            </span>
                          </div>
                          <div className="flex justify-between items-center py-1">
                            <span className="text-stone-500 font-medium">Account Name:</span>
                            <span className="font-bold text-stone-900">{bank.accountName}</span>
                          </div>
                        </div>
                        <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 text-[11px] text-amber-900 leading-tight">
                          <strong>Important:</strong> Enter the applicant pupil&apos;s full name as your payment narration. After payment, enter your transaction reference on the application page to unlock your form.
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>

                {/* 4. Dynamic Approved Fee Structures */}
                {feeStructures.length > 0 && (
                  <div className="space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#EADBDA] pb-4">
                      <div>
                        <h2 className="text-xl sm:text-2xl font-extrabold text-[#5B0612]">
                          Approved Programme Schedules
                        </h2>
                        <p className="text-xs sm:text-sm text-stone-500 mt-1">
                          Current fee structures officially configured for the active academic session.
                        </p>
                      </div>

                      {uniqueProgrammes.length > 1 && (
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedProgramme('ALL')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors min-h-[36px] ${
                              selectedProgramme === 'ALL'
                                ? 'bg-[#800020] text-white'
                                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                            }`}
                          >
                            All Programmes
                          </button>
                          {uniqueProgrammes.map((prog) => (
                            <button
                              key={prog}
                              type="button"
                              onClick={() => setSelectedProgramme(prog)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors min-h-[36px] ${
                                selectedProgramme === prog
                                  ? 'bg-[#800020] text-white'
                                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                              }`}
                            >
                              {prog}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {displayedStructures.map((fs) => (
                        <Card key={fs.id} className="border border-[#EADBDA] shadow-xs flex flex-col justify-between">
                          <CardHeader className="border-b border-stone-100 pb-3">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <CardTitle className="text-base sm:text-lg font-bold text-stone-900">
                                  {fs.name}
                                </CardTitle>
                                <p className="text-xs text-stone-500 mt-0.5">
                                  Programme: <strong>{fs.programmeName}</strong> &bull; {fs.termName}
                                  {fs.applicableGender && fs.applicableGender !== 'ALL' && (
                                    <span> &bull; ({fs.applicableGender})</span>
                                  )}
                                </p>
                              </div>
                              <Badge variant="brand" size="sm">
                                {fs.programmeCode}
                              </Badge>
                            </div>
                          </CardHeader>

                          <CardContent className="p-0 flex-1 flex flex-col justify-between">
                            <div className="divide-y divide-stone-100 text-xs sm:text-sm">
                              {fs.items.map((item, idx) => (
                                <div key={idx} className="px-4 py-2.5 flex items-center justify-between">
                                  <span className="text-stone-700">{item.name}</span>
                                  <span className="font-semibold text-stone-900 font-mono">
                                    {formatNaira(BigInt(item.amountKobo))}
                                  </span>
                                </div>
                              ))}
                            </div>

                            <div className="px-4 py-3 bg-[#FAF7F2] border-t border-[#EADBDA] flex items-center justify-between mt-4">
                              <div>
                                <span className="text-xs font-bold text-stone-700 uppercase tracking-wider block">
                                  Total Term Fee
                                </span>
                                <span className="text-[11px] text-stone-500">
                                  {fs.isAdmissionFee ? 'Entry Package' : 'Continuing Term'}
                                </span>
                              </div>
                              <span className="text-lg sm:text-xl font-extrabold text-[#5B0612] font-mono">
                                {formatNaira(BigInt(fs.totalAmountKobo))}
                              </span>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* 5. How Invoicing & Payment Works */}
                <div className="space-y-6">
                  <div className="border-b border-[#EADBDA] pb-3">
                    <h2 className="text-xl sm:text-2xl font-extrabold text-[#5B0612]">
                      How the Invoicing &amp; Admission Workflow Works
                    </h2>
                    <p className="text-xs sm:text-sm text-stone-500 mt-0.5">
                      A simple, dignified 4-step workflow from application form to enrollment.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {/* Step 1 */}
                    <Card className="bg-[#FAF7F2] border-[#EADBDA]">
                      <CardContent className="p-6 space-y-3">
                        <div className="w-8 h-8 rounded-full bg-[#800020] text-white text-xs font-bold flex items-center justify-center">
                          01
                        </div>
                        <h3 className="font-bold text-base text-[#5B0612]">
                          1. Pay Form Fee &amp; Submit Application
                        </h3>
                        <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
                          Pay the official ₦5,000 non-refundable application fee online or via bank transfer, complete pupil biography, upload passport photograph, and select curriculum programme.
                        </p>
                      </CardContent>
                    </Card>

                    {/* Step 2 */}
                    <Card className="bg-[#FAF7F2] border-[#EADBDA]">
                      <CardContent className="p-6 space-y-3">
                        <div className="w-8 h-8 rounded-full bg-[#800020] text-white text-xs font-bold flex items-center justify-center">
                          02
                        </div>
                        <h3 className="font-bold text-base text-[#5B0612]">
                          2. Evaluation &amp; Placement Assessment
                        </h3>
                        <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
                          The admissions board evaluates academic credentials, conducts placement evaluation, and determines class readiness according to the institutional standard.
                        </p>
                      </CardContent>
                    </Card>

                    {/* Step 3 */}
                    <Card className="bg-[#FAF7F2] border-[#EADBDA]">
                      <CardContent className="p-6 space-y-3">
                        <div className="w-8 h-8 rounded-full bg-[#800020] text-white text-xs font-bold flex items-center justify-center">
                          03
                        </div>
                        <h3 className="font-bold text-base text-[#5B0612]">
                          3. Official Admission Letter &amp; Invoice
                        </h3>
                        <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
                          Upon acceptance, an official signed Admission Letter and itemized First Term tuition invoice are generated and delivered securely to the parent&apos;s registered email.
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
                          Settle your invoice securely online via card, USSD, or direct bank transfer. An official verifiable PDF receipt is generated instantly with student admission number.
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                </div>

                {/* 6. Already Paid Guide & Frequently Asked Questions */}
                <div className="bg-[#FAF7F2] p-6 sm:p-8 rounded-2xl border border-[#EADBDA] space-y-5">
                  <div className="space-y-1">
                    <span className="text-xs uppercase tracking-wider font-bold text-[#800020]">
                      Applicant Guidance
                    </span>
                    <h3 className="text-lg sm:text-xl font-bold text-[#5B0612]">
                      Frequently Asked Questions Regarding Fees
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs sm:text-sm text-stone-700">
                    <div className="p-4 bg-white rounded-xl border border-stone-200 space-y-1.5">
                      <h4 className="font-bold text-stone-900 text-sm">
                        I already made payment. How do I access my form?
                      </h4>
                      <p className="text-stone-600 leading-relaxed">
                        Go to the <Link href="/admissions" className="text-[#800020] font-semibold underline">Admissions Application Page</Link>, locate the <strong>Already Paid?</strong> panel on the right, enter your Paystack reference or receipt number, and click <strong>Verify &amp; Unlock Application Form</strong>.
                      </p>
                    </div>

                    <div className="p-4 bg-white rounded-xl border border-stone-200 space-y-1.5">
                      <h4 className="font-bold text-stone-900 text-sm">
                        Are fees non-refundable?
                      </h4>
                      <p className="text-stone-600 leading-relaxed">
                        Application processing fees are non-refundable administrative charges. Termly tuition fees follow the school&apos;s institutional policy outlined in your official admission acceptance agreement.
                      </p>
                    </div>

                    <div className="p-4 bg-white rounded-xl border border-stone-200 space-y-1.5">
                      <h4 className="font-bold text-stone-900 text-sm">
                        What does the First Term Package include?
                      </h4>
                      <p className="text-stone-600 leading-relaxed">
                        The First Term Package includes mandatory items for newly enrolled pupils: official school uniform, cardigan, polo sportswear, academic workbooks, exercise books, medical assessment, and term tuition.
                      </p>
                    </div>

                    <div className="p-4 bg-white rounded-xl border border-stone-200 space-y-1.5">
                      <h4 className="font-bold text-stone-900 text-sm">
                        Can I pay in instalments?
                      </h4>
                      <p className="text-stone-600 leading-relaxed">
                        Tuition invoices can be paid according to authorized school payment arrangements. Parents may contact the school accounts office for any structured payment plan requests.
                      </p>
                    </div>
                  </div>

                  {/* Ready to Apply Action Callout */}
                  <div className="pt-4 border-t border-[#EADBDA] flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div>
                      <p className="font-bold text-[#5B0612] text-sm sm:text-base">
                        Ready to begin an admission application?
                      </p>
                      <p className="text-xs text-stone-500">
                        Official online applications are currently active for the {data.session?.name || 'current'} session.
                      </p>
                    </div>
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                      <Link href="/admissions" className="w-full sm:w-auto">
                        <Button variant="primary" size="md" className="w-full sm:w-auto bg-[#800020] hover:bg-[#5B0612] text-white font-bold shadow-xs">
                          Start Application Now &rarr;
                        </Button>
                      </Link>
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

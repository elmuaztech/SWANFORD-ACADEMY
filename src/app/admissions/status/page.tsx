'use client';

import React, { useState } from 'react';
import {
  Navbar,
  PublicFooter,
  Card,
  CardContent,
  Button,
  Input,
  FormGroup,
  Alert,
  Badge,
} from '@/components';
import { SCHOOL_PROFILE } from '@/lib/constants';
import { formatNaira } from '@/lib/money';

interface StatusResult {
  applicationNumber: string;
  applicantName: string;
  admissionCycleName: string;
  status: string;
  statusLabel: string;
  paymentStatus: string;
  paymentStatusLabel: string;
  submittedAt: string;
  programmes: Array<{ name: string; code: string }>;
  receipt?: {
    receiptNumber: string | null;
    amountPaidKobo: string;
    reference: string | null;
  } | null;
}

export default function AdmissionStatusPage() {
  const [applicationNumber, setApplicationNumber] = useState('');
  const [contactVerification, setContactVerification] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StatusResult | null>(null);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!applicationNumber.trim() || !contactVerification.trim()) {
      setError('Please enter both your Application Number and registered Guardian Email/Phone.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/admissions/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationNumber: applicationNumber.trim(),
          contactVerification: contactVerification.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'No matching admission application found.');
      }

      setResult(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to check application status.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FFFFFF] text-[#1C1A1A]">
      <Navbar currentPath="/admissions" />

      <main className="flex-1 py-10 sm:py-16">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Top Title */}
          <div className="text-center mb-8 space-y-2">
            <div className="inline-block px-3 py-1 bg-[#EADBDA] text-[#5B0612] rounded text-xs font-bold uppercase tracking-wider">
              Verification Desk
            </div>
            <h1 className="text-2xl sm:text-4xl font-bold text-[#1C1A1A] tracking-tight">
              Track Admission Status
            </h1>
            <p className="text-xs sm:text-sm text-[#524B46] max-w-md mx-auto">
              Enter your Application Number and registered Guardian contact information to view your application progress.
            </p>
          </div>

          {/* Lookup Form */}
          <Card className="bg-[#FDFBF7] border-[#EADBDA] shadow-xs mb-8">
            <CardContent className="p-6 sm:p-8 space-y-5">
              {error && (
                <Alert variant="error" title="Inquiry Notice">
                  {error}
                </Alert>
              )}

              <form onSubmit={handleLookup} className="space-y-4">
                <FormGroup label="Application Number" required>
                  <Input
                    placeholder="e.g. APP-2026-0001"
                    value={applicationNumber}
                    onChange={(e) => setApplicationNumber(e.target.value)}
                    className="font-mono"
                    required
                  />
                </FormGroup>

                <FormGroup label="Registered Guardian Email or Phone" required>
                  <Input
                    placeholder="e.g. guardian@example.com or 0803 123 4567"
                    value={contactVerification}
                    onChange={(e) => setContactVerification(e.target.value)}
                    required
                  />
                </FormGroup>

                <Button
                  variant="primary"
                  size="md"
                  type="submit"
                  disabled={loading}
                  className="w-full py-3"
                >
                  {loading ? 'Checking Application...' : 'Check Status &rarr;'}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* STATUS RESULT CARD */}
          {result && (
            <Card className="bg-white border-[#5B0612] shadow-sm animate-in fade-in">
              <CardContent className="p-6 sm:p-8 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#EADBDA] pb-4">
                  <div>
                    <span className="text-xs text-[#8C827A] block uppercase font-bold">
                      Application Reference
                    </span>
                    <span className="text-xl font-mono font-bold text-[#5B0612]">
                      {result.applicationNumber}
                    </span>
                  </div>
                  <div>
                    <Badge variant="brand" size="md">
                      {result.statusLabel}
                    </Badge>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs sm:text-sm text-[#524B46]">
                  <div>
                    <span className="text-[#8C827A] block">Applicant First Name:</span>
                    <strong className="text-[#1C1A1A] text-base">{result.applicantName}</strong>
                  </div>
                  <div>
                    <span className="text-[#8C827A] block">Admission Cycle:</span>
                    <strong className="text-[#1C1A1A]">{result.admissionCycleName}</strong>
                  </div>
                  <div>
                    <span className="text-[#8C827A] block">Application Fee:</span>
                    <span
                      className={`inline-block font-semibold px-2 py-0.5 rounded text-xs mt-0.5 ${
                        result.paymentStatus === 'CONFIRMED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {result.paymentStatusLabel}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#8C827A] block">Submission Date:</span>
                    <strong className="text-[#1C1A1A]">
                      {new Date(result.submittedAt).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </strong>
                  </div>
                </div>

                {/* Applied Programmes */}
                <div className="border-t border-[#EADBDA] pt-4">
                  <span className="text-xs text-[#8C827A] font-bold block mb-2">
                    Applied Academic Programmes:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {result.programmes.map((p, idx) => (
                      <Badge key={idx} variant="brand" size="sm">
                        {p.name}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Receipt If Confirmed */}
                {result.receipt && (
                  <div className="p-4 bg-[#FDFBF7] rounded-xl border border-emerald-300 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                        &#10003; Official Payment Receipt
                      </span>
                      {result.receipt.receiptNumber && (
                        <span className="text-xs font-mono font-bold text-[#5B0612]">
                          {result.receipt.receiptNumber}
                        </span>
                      )}
                    </div>
                    <div className="flex justify-between text-xs text-[#524B46]">
                      <span>Amount Confirmed:</span>
                      <strong className="font-mono text-[#1C1A1A]">
                        {formatNaira(BigInt(result.receipt.amountPaidKobo))}
                      </strong>
                    </div>
                    {result.receipt.reference && (
                      <div className="flex justify-between text-[11px] text-[#8C827A]">
                        <span>Gateway Reference:</span>
                        <span className="font-mono">{result.receipt.reference}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Next Steps Guidance */}
                <div className="pt-2 text-xs text-[#524B46] bg-[#F5F0EB] p-4 rounded-xl border border-[#EADBDA] space-y-1">
                  <p className="font-semibold text-[#1C1A1A]">Next Step for Applicant:</p>
                  {result.status === 'DRAFT' || result.paymentStatus === 'PENDING' ? (
                    <p>
                      Please complete the ₦5,000 application fee payment online or present your transfer receipt at the school admissions desk.
                    </p>
                  ) : result.status === 'SUBMITTED' || result.status === 'UNDER_REVIEW' ? (
                    <p>
                      Your application is being evaluated by the Academic Admissions Board. Decision notices will be sent to your registered email.
                    </p>
                  ) : result.status === 'APPROVED' || result.status === 'PARTIALLY_APPROVED' ? (
                    <p>
                      Congratulations! Your application has been approved. Please contact the bursary to complete matriculation and uniform collection.
                    </p>
                  ) : (
                    <p>
                      For inquiries, visit our admissions desk at {SCHOOL_PROFILE.address}.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}

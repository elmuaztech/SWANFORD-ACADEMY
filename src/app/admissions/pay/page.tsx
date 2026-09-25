"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Navbar,
  PageHeader,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Badge,
  Button,
  Alert,
  LoadingState,
  ErrorState,
} from "@/components";
import { SCHOOL_PROFILE } from "@/lib/constants";
import { formatNaira } from "@/lib/money";

interface ApplicationDetails {
  id: string;
  applicationNumber: string;
  applicantName: string;
  guardianName: string;
  guardianEmail: string;
  totalAmountKobo: string;
  paymentStatus: string;
}

function AdmissionPaymentContent() {
  const searchParams = useSearchParams();
  const applicationId = searchParams.get("applicationId");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appDetails, setAppDetails] = useState<ApplicationDetails | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);

  useEffect(() => {
    async function loadSession() {
      if (!applicationId) {
        setError("Missing application ID in request.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        // Request an authorized payment session
        const res = await fetch("/api/payments/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetType: "APPLICATION_FEE",
            targetId: applicationId,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Unable to initiate payment session.");
        }

        setSessionToken(data.token);
        setAppDetails({
          id: applicationId,
          applicationNumber: "APP-" + applicationId.slice(0, 8).toUpperCase(),
          applicantName: "Prospective Student",
          guardianName: "Guardian / Parent",
          guardianEmail: data.payerEmail,
          totalAmountKobo: data.expectedAmountKobo,
          paymentStatus: "PENDING",
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Payment session could not be established.";
        setError(msg);
      } finally {
        setLoading(false);
      }
    }

    loadSession();
  }, [applicationId]);

  async function handleProceedToPay() {
    if (!sessionToken) return;

    try {
      setSubmitting(true);
      setError(null);

      const res = await fetch("/api/payments/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionToken,
          targetType: "APPLICATION_FEE",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Unable to reach the payment service. Please try again.");
      }

      // Redirect browser to checkout
      if (data.authorizationUrl) {
        window.location.href = data.authorizationUrl;
      } else {
        throw new Error("Missing payment authorization link.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unable to initiate payment.";
      setError(msg);
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="py-16 max-w-xl mx-auto px-4">
        <LoadingState
          title="Securing Payment Session"
          description="Connecting to the Swanford admissions checkout..."
        />
      </div>
    );
  }

  if (error || !appDetails) {
    return (
      <div className="py-16 max-w-xl mx-auto px-4 text-center">
        <ErrorState
          title="Checkout Unavailable"
          message={error || "We could not verify your application details."}
        />
        <div className="mt-4">
          <Link href="/admissions">
            <Button variant="primary" size="md">
              Return to Admissions Portal
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const amountKobo = BigInt(appDetails.totalAmountKobo || "500000");

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <PageHeader
        title="Admission Application Fee"
        subtitle="Official online payment portal for Swanford Academy."
        badge={
          <Badge variant="brand" size="md">
            Secure 256-bit Encrypted
          </Badge>
        }
      />

      {error && (
        <div className="mb-6">
          <Alert variant="error" title="Payment Error">
            {error}
          </Alert>
        </div>
      )}

      <Card className="overflow-hidden shadow-sm">
        <CardHeader className="bg-slate-50/80 border-b border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-lg text-slate-900">Checkout Summary</CardTitle>
              <CardDescription>
                Reference: <span className="font-mono text-slate-800">{appDetails.applicationNumber}</span>
              </CardDescription>
            </div>
            <Badge variant="warning" size="md">
              Payment Required
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 pt-6">
          {/* Breakdown Table */}
          <div className="rounded-lg border border-slate-200 divide-y divide-slate-200 bg-white">
            <div className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-900">Application Form & Processing Fee</p>
                <p className="text-xs text-slate-700">Official non-refundable application fee</p>
              </div>
              <span className="text-sm font-semibold text-slate-900">{formatNaira(amountKobo)}</span>
            </div>
            <div className="p-4 bg-slate-50/60 flex items-center justify-between">
              <span className="text-base font-semibold text-slate-900">Total Payable Amount</span>
              <span className="text-lg font-bold text-emerald-700">{formatNaira(amountKobo)}</span>
            </div>
          </div>

          {/* Applicant & Guardian Details */}
          <div className="bg-slate-50 rounded-lg p-4 space-y-2 border border-slate-200 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-700">Payer Email:</span>
              <span className="font-medium text-slate-900 break-all">{appDetails.guardianEmail}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-700">Institution:</span>
              <span className="font-medium text-slate-900">{SCHOOL_PROFILE.name}</span>
            </div>
          </div>

          <Alert variant="info" title="Safe Payment Information">
            Your payment is processed with bank-grade encryption using debit card, bank transfer, or USSD. Swanford Academy never stores your payment card credentials.
          </Alert>
        </CardContent>

        <CardFooter className="bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row gap-3 justify-end">
          <Link href="/admissions" className="w-full sm:w-auto">
            <Button variant="outline" size="md" className="w-full sm:w-auto" disabled={submitting}>
              Cancel
            </Button>
          </Link>
          <Button
            variant="primary"
            size="md"
            className="w-full sm:w-auto"
            onClick={handleProceedToPay}
            disabled={submitting}
          >
            {submitting ? "Connecting to Secure Checkout..." : `Proceed to Pay ${formatNaira(amountKobo)}`}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function AdmissionPaymentPage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <Navbar currentPath="/admissions" />
      <main className="flex-1 w-full py-6">
        <Suspense
          fallback={
            <div className="py-16 max-w-xl mx-auto px-4">
              <LoadingState title="Loading Checkout" description="Please wait..." />
            </div>
          }
        >
          <AdmissionPaymentContent />
        </Suspense>
      </main>
    </div>
  );
}

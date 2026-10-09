"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Button,
  Card,
  CardContent,
  CardFooter,
  LoadingState,
  ErrorState,
} from "@/components";
import { formatNaira } from "@/lib/money";

interface VerifyResult {
  success: boolean;
  status: string;
  reference: string;
  amountKobo?: string;
  receiptNumber?: string | null;
  message: string;
}

function PaymentCallbackContent() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function verify() {
      const reference = searchParams.get("reference") || searchParams.get("trxref");
      if (!reference) {
        setError("Missing payment reference in callback URL.");
        setLoading(false);
        return;
      }

      try {
        const res = await fetch("/api/payments/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reference }),
        });

        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to verify transaction.");
        } else {
          setResult(data);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Network error verifying payment.");
      } finally {
        setLoading(false);
      }
    }

    verify();
  }, [searchParams]);

  if (loading) {
    return (
      <div className="py-16 max-w-lg mx-auto px-4">
        <LoadingState
          title="Verifying Transaction"
          description="Confirming your payment and updating your admission record..."
        />
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="py-16 max-w-lg mx-auto px-4 text-center">
        <ErrorState
          title="Verification Notice"
          message={error || "Payment verification could not be completed at this time."}
        />
        <div className="mt-4 flex justify-center">
          <Link href="/admissions">
            <Button variant="primary" size="md">
              Return to Admissions
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Handle Success State
  if (result.success || result.status === "SUCCESS") {
    const kobo = BigInt(result.amountKobo || "0");
    return (
      <div className="py-12 max-w-xl mx-auto px-4">
        <Card className="shadow-sm overflow-hidden">
          <CardContent className="pt-8">
            <div className="text-center">
              <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-[#5B0612] mb-2">Payment Confirmed Successfully!</h2>
              <p className="text-sm text-slate-600 mb-6">
                Your admission fee payment has been officially credited and confirmed.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-left text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-700">Reference:</span>
                <span className="font-mono font-medium text-slate-900 break-all">{result.reference}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-700">Amount Paid:</span>
                <span className="font-bold text-emerald-700">{formatNaira(kobo)}</span>
              </div>
              {result.receiptNumber && (
                <div className="flex justify-between">
                  <span className="text-slate-700">Official Receipt:</span>
                  <span className="font-mono font-bold text-slate-900">{result.receiptNumber}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-700">Application Status:</span>
                <span className="font-semibold text-[#5B0612]">Under Review</span>
              </div>
            </div>
          </CardContent>
          <CardFooter className="bg-slate-50 border-t border-slate-200 flex justify-center py-4">
            <Link href="/admissions">
              <Button variant="primary" size="md">
                Go to Admissions Portal
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Handle Pending / Processing States
  if (["PENDING", "ONGOING", "PROCESSING", "QUEUED"].includes(result.status)) {
    return (
      <div className="py-16 max-w-lg mx-auto px-4">
        <Card className="p-6 text-center">
          <h2 className="text-xl font-bold text-amber-700 mb-2">Payment Processing</h2>
          <p className="text-sm text-slate-600 mb-4">
            Your transaction is currently being processed. Your application will automatically update to confirmed
            as soon as payment settlement finishes.
          </p>
          <p className="text-xs font-mono text-slate-500 mb-6">Ref: {result.reference}</p>
          <Link href="/admissions">
            <Button variant="primary" size="md">
              Return to Admissions
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  // Handle Failed or Abandoned
  return (
    <div className="py-16 max-w-lg mx-auto px-4 text-center">
      <ErrorState
        title="Payment Incomplete"
        message={`The transaction ended with status '${result.status}'. You have not been charged or the transaction was cancelled.`}
      />
      <div className="mt-4 flex justify-center">
        <Link href="/admissions">
          <Button variant="outline" size="md">
            Return to Admissions Portal
          </Button>
        </Link>
      </div>
    </div>
  );
}

export default function PaystackCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="py-16 max-w-lg mx-auto px-4">
          <LoadingState title="Loading payment details..." />
        </div>
      }
    >
      <PaymentCallbackContent />
    </Suspense>
  );
}

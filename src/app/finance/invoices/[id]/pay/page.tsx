"use client";

import React, { useEffect, useState, use } from "react";
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

interface InvoiceData {
  id: string;
  invoiceNumber: string;
  totalAmountKobo: string;
  amountPaidKobo: string;
  outstandingBalanceKobo: string;
  status: string;
}

export default function InvoicePaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const invoiceId = resolvedParams.id;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);

  useEffect(() => {
    async function loadSession() {
      try {
        setLoading(true);
        const res = await fetch("/api/payments/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetType: "INVOICE",
            targetId: invoiceId,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Unable to initiate invoice payment session.");
        }

        setSessionToken(data.token);
        setInvoice({
          id: invoiceId,
          invoiceNumber: "INV-" + invoiceId.slice(0, 8).toUpperCase(),
          totalAmountKobo: data.expectedAmountKobo,
          amountPaidKobo: "0",
          outstandingBalanceKobo: data.expectedAmountKobo,
          status: "ISSUED",
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Payment session could not be established.";
        setError(msg);
      } finally {
        setLoading(false);
      }
    }

    loadSession();
  }, [invoiceId]);

  async function handlePayInvoice() {
    if (!sessionToken) return;

    try {
      setSubmitting(true);
      setError(null);

      const res = await fetch("/api/payments/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionToken,
          targetType: "INVOICE",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Unable to connect to online payment service.");
      }

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
      <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
        <Navbar currentPath="/finance" />
        <main className="flex-1 w-full py-16 max-w-xl mx-auto px-4">
          <LoadingState
            title="Securing Invoice Session"
            description="Connecting to Swanford accounts portal..."
          />
        </main>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
        <Navbar currentPath="/finance" />
        <main className="flex-1 w-full py-16 max-w-xl mx-auto px-4 text-center">
          <ErrorState
            title="Invoice Checkout Unavailable"
            message={error || "Could not retrieve invoice balance."}
          />
          <div className="mt-4 flex justify-center">
            <Link href="/finance">
              <Button variant="primary" size="md">
                Return to Finance
              </Button>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const balanceKobo = BigInt(invoice.outstandingBalanceKobo || "0");

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <Navbar currentPath="/finance" />
      <main className="flex-1 max-w-2xl mx-auto px-4 sm:px-6 py-8 w-full">
        <PageHeader
          title="School Fee Payment"
          subtitle={`Tuition & Term Invoicing for ${SCHOOL_PROFILE.name}`}
          badge={
            <Badge variant="brand" size="md">
              Bank-Grade Encrypted Payment
            </Badge>
          }
        />

        <Card className="overflow-hidden shadow-sm">
          <CardHeader className="bg-slate-50/80 border-b border-slate-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <CardTitle className="text-lg text-slate-900">Invoice Checkout</CardTitle>
                <CardDescription>
                  Invoice: <span className="font-mono text-slate-800">{invoice.invoiceNumber}</span>
                </CardDescription>
              </div>
              <Badge variant="warning" size="md">
                Outstanding
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-6 pt-6">
            <div className="rounded-lg border border-slate-200 divide-y divide-slate-200 bg-white">
              <div className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">Outstanding Balance</p>
                  <p className="text-xs text-slate-700">Official academic invoice billing</p>
                </div>
                <span className="text-base font-bold text-emerald-700">{formatNaira(balanceKobo)}</span>
              </div>
            </div>

            <Alert variant="info" title="Official School Account Settlement">
              Payments made through this checkout automatically update your child&apos;s student balance, issue an official digital receipt, and clear school fees.
            </Alert>
          </CardContent>

          <CardFooter className="bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row gap-3 justify-end">
            <Link href="/finance" className="w-full sm:w-auto">
              <Button variant="outline" size="md" className="w-full sm:w-auto" disabled={submitting}>
                Cancel
              </Button>
            </Link>
            <Button
              variant="primary"
              size="md"
              className="w-full sm:w-auto"
              onClick={handlePayInvoice}
              disabled={submitting}
            >
              {submitting ? "Connecting to Secure Checkout..." : `Pay ${formatNaira(balanceKobo)} Online`}
            </Button>
          </CardFooter>
        </Card>
      </main>
    </div>
  );
}

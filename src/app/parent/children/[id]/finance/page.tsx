"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

interface InvoiceLineItem {
  id: string;
  description: string;
  amount: number;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  title: string;
  termName?: string;
  sessionName?: string;
  totalAmount: number;
  amountPaid: number;
  balance: number;
  status: "DRAFT" | "PENDING" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CANCELLED";
  dueDate: string;
  lineItems: InvoiceLineItem[];
  payments: Array<{
    id: string;
    amount: number;
    paymentMethod: string;
    reference: string;
    paidAt: string;
  }>;
  receipts: Array<{
    id: string;
    receiptNumber: string;
    amount: number;
    issuedAt: string;
  }>;
}

interface FinanceData {
  child: {
    id: string;
    name: string;
    admissionNumber: string;
  };
  invoices: Invoice[];
  totals: {
    totalBilled: number;
    totalPaid: number;
    totalOutstanding: number;
  };
}

export default function ChildFinancePage() {
  const params = useParams();
  const router = useRouter();
  const childId = params?.id as string;

  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null);

  useEffect(() => {
    if (!childId) return;

    async function loadFinance() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/parent/children/${childId}/finance`);
        if (res.status === 401) {
          router.push("/auth/login?from=/parent");
          return;
        }
        if (res.status === 403) {
          setError("You are not authorized to view financial records for this child, or invoice access has not been granted.");
          setLoading(false);
          return;
        }
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || "Failed to load financial records");
        }
        const body = await res.json();
        setData(body);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load financial records");
      } finally {
        setLoading(false);
      }
    }

    loadFinance();
  }, [childId, router]);

  const handlePayOnline = async (invoiceId: string) => {
    try {
      setPayingInvoiceId(invoiceId);
      const res = await fetch("/api/payments/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType: "INVOICE",
          targetId: invoiceId,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Unable to initiate payment session. Please try again or contact the school.");
        return;
      }

      const body = await res.json();
      if (body.authorizationUrl) {
        window.location.assign(body.authorizationUrl);
      } else {
        alert("Payment initialization response did not contain an authorization URL.");
      }
    } catch {
      alert("Payment initiation failed. Please check your network connection.");
    } finally {
      setPayingInvoiceId(null);
    }
  };

  const getStatusBadge = (status: Invoice["status"]) => {
    switch (status) {
      case "PAID":
        return <Badge variant="success">Paid</Badge>;
      case "PARTIALLY_PAID":
        return <Badge variant="warning">Partially Paid</Badge>;
      case "OVERDUE":
        return <Badge variant="danger">Overdue</Badge>;
      case "PENDING":
        return <Badge variant="info">Pending</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-stone-200 animate-pulse rounded" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-24 bg-stone-200 animate-pulse rounded-lg" />
          <div className="h-24 bg-stone-200 animate-pulse rounded-lg" />
          <div className="h-24 bg-stone-200 animate-pulse rounded-lg" />
        </div>
        <div className="h-64 bg-stone-200 animate-pulse rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Link href={`/parent/children/${childId}`} className="inline-flex items-center text-sm text-[#800020] hover:underline font-medium">
          ← Back to Child Profile
        </Link>
        <Alert variant="error" title="Access Restricted">
          {error}
        </Alert>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Link href={`/parent/children/${childId}`} className="inline-flex items-center text-sm text-[#800020] hover:underline font-medium mb-2">
            ← Back to Child Profile
          </Link>
          <h1 className="text-2xl font-bold text-[#5B0612] tracking-tight">Finance & Fees</h1>
          <p className="text-sm text-stone-600">
            Billing history and invoices for <span className="font-semibold text-stone-900">{data.child.name}</span> ({data.child.admissionNumber})
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-white border-stone-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wider text-stone-500 font-semibold">Total Invoiced</CardDescription>
            <CardTitle className="text-2xl font-bold text-stone-900">
              ₦{data.totals.totalBilled.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-white border-stone-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wider text-emerald-700 font-semibold">Total Paid</CardDescription>
            <CardTitle className="text-2xl font-bold text-emerald-700">
              ₦{data.totals.totalPaid.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className={`border shadow-sm ${data.totals.totalOutstanding > 0 ? "bg-amber-50/50 border-amber-200" : "bg-white border-stone-200"}`}>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wider text-stone-500 font-semibold">Outstanding Balance</CardDescription>
            <CardTitle className={`text-2xl font-bold ${data.totals.totalOutstanding > 0 ? "text-amber-800" : "text-stone-900"}`}>
              ₦{data.totals.totalOutstanding.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Invoices List */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-[#5B0612]">Invoices & Statements</h2>

        {data.invoices.length === 0 ? (
          <Card className="bg-white border-stone-200">
            <CardContent className="p-8 text-center">
              <p className="text-base font-semibold text-stone-800">No Invoices Issued</p>
              <p className="text-sm text-stone-500 mt-1">There are currently no active or historical invoices on file for this student.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {data.invoices.map((inv) => (
              <Card key={inv.id} className="bg-white border-stone-200 shadow-sm overflow-hidden">
                <div className="p-4 sm:p-6 border-b border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-stone-50/40">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-stone-800">{inv.invoiceNumber}</span>
                      {getStatusBadge(inv.status)}
                    </div>
                    <p className="text-base font-bold text-stone-900 mt-1">{inv.title}</p>
                    <p className="text-xs text-stone-500 mt-0.5">
                      Due: {new Date(inv.dueDate).toLocaleDateString("en-NG", { dateStyle: "medium" })}
                      {inv.termName && ` • ${inv.termName}`}
                      {inv.sessionName && ` • ${inv.sessionName}`}
                    </p>
                  </div>
                  <div className="flex flex-col sm:items-end gap-1">
                    <p className="text-sm text-stone-500">Balance Due</p>
                    <p className={`text-xl font-bold ${inv.balance > 0 ? "text-[#800020]" : "text-stone-900"}`}>
                      ₦{inv.balance.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                    </p>
                    {inv.balance > 0 && inv.status !== "CANCELLED" && (
                      <Button
                        size="sm"
                        className="bg-[#800020] hover:bg-[#600018] text-white mt-1 h-9 px-4 min-h-[44px] min-w-[44px] touch-manipulation flex items-center gap-1.5"
                        onClick={() => handlePayOnline(inv.id)}
                        disabled={payingInvoiceId === inv.id}
                      >
                        {payingInvoiceId === inv.id ? "Connecting..." : "Proceed to Online Payment"}
                      </Button>
                    )}
                  </div>
                </div>

                <CardContent className="p-4 sm:p-6 space-y-4">
                  {/* Line Items breakdown */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-2">Itemized Breakdown</p>
                    <div className="divide-y divide-stone-100 border border-stone-100 rounded-md overflow-hidden">
                      {inv.lineItems.map((item) => (
                        <div key={item.id} className="p-2.5 flex justify-between items-center text-sm bg-white">
                          <span className="text-stone-700">{item.description}</span>
                          <span className="font-mono text-stone-900 font-medium">₦{item.amount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}</span>
                        </div>
                      ))}
                      <div className="p-2.5 flex justify-between items-center text-sm bg-stone-50 font-bold">
                        <span className="text-stone-800">Total Invoiced Amount</span>
                        <span className="font-mono text-stone-900">₦{inv.totalAmount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </div>

                  {/* Payment & Receipt History */}
                  {(inv.payments.length > 0 || inv.receipts.length > 0) && (
                    <div className="pt-2 border-t border-stone-100">
                      <p className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-2">Receipts & Payment History</p>
                      <div className="space-y-2">
                        {inv.receipts.map((rcpt) => (
                          <div key={rcpt.id} className="flex items-center justify-between p-2.5 rounded border border-emerald-200 bg-emerald-50/40 text-xs sm:text-sm">
                            <div className="flex items-center gap-2">
                              <div>
                                <span className="font-semibold text-emerald-900">Official Receipt: {rcpt.receiptNumber}</span>
                                <p className="text-emerald-700 text-xs">{new Date(rcpt.issuedAt).toLocaleDateString("en-NG", { dateStyle: "medium" })}</p>
                              </div>
                            </div>
                            <span className="font-mono font-bold text-emerald-800">
                              ₦{rcpt.amount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        ))}
                        {inv.payments.map((pmt) => (
                          <div key={pmt.id} className="flex items-center justify-between p-2 rounded border border-stone-200 bg-stone-50 text-xs">
                            <div className="flex items-center gap-2">
                              <span className="text-stone-700 font-mono">{pmt.reference} ({pmt.paymentMethod})</span>
                            </div>
                            <span className="font-mono text-stone-800">₦{pmt.amount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

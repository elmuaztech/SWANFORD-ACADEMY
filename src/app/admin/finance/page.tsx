"use client";

import React, { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { Modal } from "@/components/ui/modal";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { formatNaira } from "@/lib/money";

interface InvoiceItem {
  id: string;
  invoiceNumber: string;
  totalAmountKobo: string;
  amountPaidKobo: string;
  outstandingBalanceKobo: string;
  status: string;
  dueDate: string;
  student: { firstName: string; lastName: string; admissionNumber: string | null };
  guardian: { firstName: string; lastName: string; phonePrimary: string };
  programme: { name: string };
  academicTerm: { name: string };
}

interface PaymentItem {
  id: string;
  paymentReference: string;
  amountKobo: string;
  paymentMethod: string;
  status: string;
  paidAt: string;
  receipt: { id: string; receiptNumber: string; amountKobo: string; issuedAt: string } | null;
  student: { firstName: string; lastName: string; admissionNumber: string | null };
  payerGuardian: { firstName: string; lastName: string } | null;
  invoice: { invoiceNumber: string } | null;
}

interface FinanceSummary {
  totalInvoicedKobo: string;
  totalCollectedKobo: string;
  totalOutstandingKobo: string;
  activeSession: { name: string } | null;
  activeTerm: { name: string } | null;
}

export default function AdminFinancePage() {
  const [activeTab, setActiveTab] = useState<"invoices" | "payments">("invoices");
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Receipt Modal
  const [selectedReceipt, setSelectedReceipt] = useState<PaymentItem | null>(null);

  const fetchFinanceData = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetch("/api/admin/finance/summary"),
      fetch("/api/admin/finance/invoices"),
      fetch("/api/admin/finance/payments"),
    ])
      .then(async ([sRes, iRes, pRes]) => {
        if (!sRes.ok || !iRes.ok || !pRes.ok) {
          throw new Error("Failed to load school financial records.");
        }
        return Promise.all([sRes.json(), iRes.json(), pRes.json()]);
      })
      .then(([sJson, iJson, pJson]) => {
        setSummary(sJson);
        setInvoices(iJson);
        setPayments(pJson);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Financial ledger unavailable.");
        setLoading(false);
      });
  };

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/finance/summary"),
      fetch("/api/admin/finance/invoices"),
      fetch("/api/admin/finance/payments"),
    ])
      .then(async ([sRes, iRes, pRes]) => {
        if (!sRes.ok || !iRes.ok || !pRes.ok) {
          throw new Error("Failed to load school financial records.");
        }
        return Promise.all([sRes.json(), iRes.json(), pRes.json()]);
      })
      .then(([sJson, iJson, pJson]) => {
        setSummary(sJson);
        setInvoices(iJson);
        setPayments(pJson);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Financial ledger unavailable.");
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="py-12">
        <LoadingState message="Reconciling financial ledger..." />
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="py-8">
        <ErrorState
          title="Finance Hub Unavailable"
          message={error || "Could not retrieve financial ledger."}
          actionLabel="Retry"
          onAction={fetchFinanceData}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight">
            Financial Ledger & Payments
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Authoritative billing records, verified bank credits, and official serial receipts.
          </p>
        </div>
        <Button variant="outline" size="md" onClick={fetchFinanceData}>
          Refresh Ledger
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-stone-600">
          <CardHeader className="pb-2">
            <span className="text-xs font-bold text-stone-500 uppercase">Total Invoiced (Term)</span>
            <CardTitle className="text-xl sm:text-2xl font-extrabold text-stone-900 mt-1">
              {formatNaira(BigInt(summary.totalInvoicedKobo))}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-stone-500">
              {summary.activeTerm?.name || "Current Term"} ({summary.activeSession?.name || "Session"})
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-600">
          <CardHeader className="pb-2">
            <span className="text-xs font-bold text-emerald-800 uppercase">Total Collected</span>
            <CardTitle className="text-xl sm:text-2xl font-extrabold text-emerald-900 mt-1">
              {formatNaira(BigInt(summary.totalCollectedKobo))}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-stone-500">Confirmed receipts via Jaiz Bank & Paystack</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardHeader className="pb-2">
            <span className="text-xs font-bold text-amber-800 uppercase">Outstanding Balance</span>
            <CardTitle className="text-xl sm:text-2xl font-extrabold text-amber-900 mt-1">
              {formatNaira(BigInt(summary.totalOutstandingKobo))}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-stone-500">Unpaid school fees across enrolled students</p>
          </CardContent>
        </Card>
      </div>

      {/* Navigation Tabs */}
      <Tabs
        tabs={[
          { id: "invoices", label: `Invoices (${invoices.length})` },
          { id: "payments", label: `Payments & Receipts (${payments.length})` },
        ]}
        activeTab={activeTab}
        onChange={(tabId) => setActiveTab(tabId as "invoices" | "payments")}
      />

      {/* Invoices Table */}
      {activeTab === "invoices" && (
        <Card className="overflow-hidden">
          {invoices.length === 0 ? (
            <p className="p-8 text-center text-sm text-stone-500">No invoices issued for this term yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Guardian</TableHead>
                    <TableHead>Programme</TableHead>
                    <TableHead>Total Fee</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead>Balance</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-xs font-bold text-stone-900">
                        {inv.invoiceNumber}
                      </TableCell>
                      <TableCell className="font-bold text-stone-900">
                        {inv.student.firstName} {inv.student.lastName}
                      </TableCell>
                      <TableCell className="text-xs text-stone-600">
                        {inv.guardian.firstName} {inv.guardian.lastName}
                      </TableCell>
                      <TableCell className="text-xs text-stone-600">
                        {inv.programme.name}
                      </TableCell>
                      <TableCell className="text-xs font-bold text-stone-900">
                        {formatNaira(BigInt(inv.totalAmountKobo))}
                      </TableCell>
                      <TableCell className="text-xs font-bold text-emerald-800">
                        {formatNaira(BigInt(inv.amountPaidKobo))}
                      </TableCell>
                      <TableCell className="text-xs font-bold text-amber-800">
                        {formatNaira(BigInt(inv.outstandingBalanceKobo))}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            inv.status === "PAID"
                              ? "success"
                              : inv.status === "PARTIALLY_PAID"
                              ? "warning"
                              : "neutral"
                          }
                          size="sm"
                        >
                          {inv.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      )}

      {/* Payments Table */}
      {activeTab === "payments" && (
        <Card className="overflow-hidden">
          {payments.length === 0 ? (
            <p className="p-8 text-center text-sm text-stone-500">No payment transactions recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payment Ref</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Payer</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Receipt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs font-bold text-stone-900">
                        {p.paymentReference}
                      </TableCell>
                      <TableCell className="font-bold text-stone-900">
                        {p.student.firstName} {p.student.lastName}
                      </TableCell>
                      <TableCell className="text-xs text-stone-600">
                        {p.payerGuardian ? `${p.payerGuardian.firstName} ${p.payerGuardian.lastName}` : "Direct"}
                      </TableCell>
                      <TableCell className="text-xs font-bold text-emerald-800">
                        {formatNaira(BigInt(p.amountKobo))}
                      </TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="neutral" size="sm">
                          {p.paymentMethod}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-stone-500">
                        {new Date(p.paidAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant={p.status === "CONFIRMED" ? "success" : "warning"} size="sm">
                          {p.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {p.receipt ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedReceipt(p)}
                            className="font-mono text-xs font-bold text-[#5B0612] hover:bg-[#FDF2F4]"
                          >
                            {p.receipt.receiptNumber}
                          </Button>
                        ) : (
                          <span className="text-stone-400 text-xs">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      )}

      {/* Official Receipt Modal */}
      {selectedReceipt && selectedReceipt.receipt && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedReceipt(null)}
          title="Official School Receipt"
        >
          <div className="space-y-4 pt-2">
            <div className="p-4 bg-stone-50 rounded-xl border border-stone-200 text-center space-y-1">
              <span className="text-[11px] font-bold text-[#5B0612] uppercase tracking-wider">Swanford Academy</span>
              <p className="text-lg font-extrabold text-stone-900">{selectedReceipt.receipt.receiptNumber}</p>
              <p className="text-xs text-stone-500">
                Issued on {new Date(selectedReceipt.receipt.issuedAt).toLocaleDateString()}
              </p>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1.5 border-b border-stone-100">
                <span className="text-stone-500">Student</span>
                <span className="font-bold text-stone-900">
                  {selectedReceipt.student.firstName} {selectedReceipt.student.lastName} ({selectedReceipt.student.admissionNumber || "—"})
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-stone-100">
                <span className="text-stone-500">Payment Reference</span>
                <span className="font-mono font-semibold text-stone-900">{selectedReceipt.paymentReference}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-stone-100">
                <span className="text-stone-500">Payment Channel</span>
                <span className="font-semibold text-stone-900">{selectedReceipt.paymentMethod}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-stone-100">
                <span className="text-stone-500">Amount Paid</span>
                <span className="text-sm font-extrabold text-emerald-800">
                  {formatNaira(BigInt(selectedReceipt.receipt.amountKobo))}
                </span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => setSelectedReceipt(null)}>
                Close Receipt
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

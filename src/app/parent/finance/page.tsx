"use client";

import React, { useEffect, useState } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Button,
  LoadingState,
  EmptyState,
  ErrorState,
  PageHeader,
  Table,
  TableHead,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
  TableWrapper,
  TableMobileCard,
  Tabs,
} from "@/components";
import { formatNaira } from "@/lib/money";

interface InvoiceItem {
  id: string;
  description: string;
  totalAmountKobo: string;
}

interface PaymentRecord {
  id: string;
  paymentReference: string;
  amountKobo: string;
  paymentMethod: string;
  paidAt: string;
  receiptNumber: string | null;
  receiptIssuedAt: string | null;
}

interface ParentInvoice {
  id: string;
  invoiceNumber: string;
  studentId: string;
  studentName: string;
  admissionNumber: string | null;
  sessionName: string;
  termName: string;
  programmeName: string;
  status: string;
  totalAmountKobo: string;
  amountPaidKobo: string;
  outstandingBalanceKobo: string;
  dueDate: string;
  createdAt: string;
  items: InvoiceItem[];
  payments: PaymentRecord[];
}

export default function ParentFinancePage() {
  const [invoices, setInvoices] = useState<ParentInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"invoices" | "payments">("invoices");
  const [selectedInvoice, setSelectedInvoice] = useState<ParentInvoice | null>(null);

  const fetchFinance = () => {
    setLoading(true);
    setError(null);
    fetch("/api/parent/finance")
      .then((res) => {
        if (!res.ok) throw new Error("Could not retrieve fee records.");
        return res.json();
      })
      .then((data) => {
        setInvoices(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load fee records.");
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchFinance();
  }, []);

  if (loading) {
    return (
      <div className="py-12">
        <LoadingState message="Loading fees and payment history..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8">
        <ErrorState
          title="Finance Unavailable"
          message={error}
          actionLabel="Retry"
          onAction={fetchFinance}
        />
      </div>
    );
  }

  // Aggregate totals across all linked children
  let totalBilled = BigInt(0);
  let totalPaid = BigInt(0);
  let totalOutstanding = BigInt(0);

  const allPayments: (PaymentRecord & { studentName: string; invoiceNumber: string })[] = [];

  for (const inv of invoices) {
    totalBilled += BigInt(inv.totalAmountKobo || 0);
    totalPaid += BigInt(inv.amountPaidKobo || 0);
    totalOutstanding += BigInt(inv.outstandingBalanceKobo || 0);

    for (const p of inv.payments || []) {
      allPayments.push({
        ...p,
        studentName: inv.studentName,
        invoiceNumber: inv.invoiceNumber,
      });
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fees & Payments"
        description="Official fee schedules, payment receipts, and balance statements for your enrolled children."
        breadcrumbs={[
          { label: "Dashboard", href: "/parent" },
          { label: "Fees & Payments" },
        ]}
        actions={
          <Button variant="outline" size="sm" onClick={fetchFinance}>
            Refresh
          </Button>
        }
      />

      {/* Financial KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border border-[#EADBDA]/80 border-l-4 border-l-[#800020] bg-white shadow-xs">
          <CardHeader className="pb-2">
            <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Total Billed Fees</span>
            <CardTitle className="text-xl sm:text-2xl font-extrabold text-[#5B0612] mt-1 break-words">
              {formatNaira(totalBilled)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-stone-500">Total fees across your linked children</p>
          </CardContent>
        </Card>

        <Card className="border border-emerald-200 border-l-4 border-l-emerald-600 bg-white shadow-xs">
          <CardHeader className="pb-2">
            <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Total Paid</span>
            <CardTitle className="text-xl sm:text-2xl font-extrabold text-emerald-900 mt-1 break-words">
              {formatNaira(totalPaid)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-stone-500">Confirmed receipts and verified payments</p>
          </CardContent>
        </Card>

        <Card
          className={`border ${
            totalOutstanding > BigInt(0)
              ? "border-amber-200 border-l-4 border-l-amber-500"
              : "border-emerald-200 border-l-4 border-l-emerald-500"
          } bg-white shadow-xs`}
        >
          <CardHeader className="pb-2">
            <span
              className={`text-xs font-bold uppercase tracking-wider ${
                totalOutstanding > BigInt(0) ? "text-amber-800" : "text-emerald-800"
              }`}
            >
              Outstanding Balance
            </span>
            <CardTitle
              className={`text-xl sm:text-2xl font-extrabold mt-1 break-words ${
                totalOutstanding > BigInt(0) ? "text-amber-900" : "text-emerald-900"
              }`}
            >
              {formatNaira(totalOutstanding)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-stone-500">
              {totalOutstanding > BigInt(0)
                ? "Remaining amount required for school fees"
                : "All fees are fully cleared. Thank you!"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs
        tabs={[
          { id: "invoices", label: `Fee Invoices (${invoices.length})` },
          { id: "payments", label: `Payment Receipts (${allPayments.length})` },
        ]}
        activeTab={activeTab}
        onChange={(t) => setActiveTab(t as "invoices" | "payments")}
      />

      {/* Invoices Tab */}
      {activeTab === "invoices" && (
        invoices.length === 0 ? (
          <EmptyState
            title="No records yet."
            description="No fee invoices have been issued for your child yet. Once fees are scheduled for the active term, they will be listed here."
            actionLabel="Refresh"
            onAction={fetchFinance}
          />
        ) : (
          <div>
            {/* Desktop Table */}
            <div className="hidden md:block">
              <TableWrapper className="border border-[#EADBDA]/80">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell className="w-14 text-center font-semibold text-stone-700">S/N</TableHeaderCell>
                      <TableHeaderCell className="w-36 text-left font-semibold text-stone-700">Invoice Number</TableHeaderCell>
                      <TableHeaderCell className="min-w-[160px] text-left font-semibold text-stone-700">Student</TableHeaderCell>
                      <TableHeaderCell className="w-32 text-left font-semibold text-stone-700">Term / Session</TableHeaderCell>
                      <TableHeaderCell className="w-32 text-left font-semibold text-stone-700">Total Fee</TableHeaderCell>
                      <TableHeaderCell className="w-32 text-left font-semibold text-stone-700">Paid</TableHeaderCell>
                      <TableHeaderCell className="w-32 text-left font-semibold text-stone-700">Balance</TableHeaderCell>
                      <TableHeaderCell className="w-28 text-right font-semibold text-stone-700">Status</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {invoices.map((inv, index) => (
                      <TableRow key={inv.id}>
                        <TableCell className="w-14 text-center text-xs font-semibold text-stone-500">
                          {index + 1}
                        </TableCell>
                        <TableCell className="w-36 font-mono text-xs font-bold text-stone-900">
                          {inv.invoiceNumber}
                        </TableCell>
                        <TableCell className="min-w-[160px] font-bold text-stone-900">
                          <div>{inv.studentName}</div>
                          {inv.admissionNumber && (
                            <div className="text-[11px] text-stone-500 font-mono">{inv.admissionNumber}</div>
                          )}
                        </TableCell>
                        <TableCell className="w-32 text-xs text-stone-600">
                          {inv.termName} ({inv.sessionName})
                        </TableCell>
                        <TableCell className="w-32 text-xs font-bold text-stone-900">
                          {formatNaira(BigInt(inv.totalAmountKobo))}
                        </TableCell>
                        <TableCell className="w-32 text-xs font-bold text-emerald-800">
                          {formatNaira(BigInt(inv.amountPaidKobo))}
                        </TableCell>
                        <TableCell className="w-32 text-xs font-bold text-amber-800">
                          {formatNaira(BigInt(inv.outstandingBalanceKobo))}
                        </TableCell>
                        <TableCell className="w-28 text-right">
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
                            {inv.status === "PAID"
                              ? "Fully Paid"
                              : inv.status === "PARTIALLY_PAID"
                              ? "Partial"
                              : "No Payment"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableWrapper>
            </div>

            {/* Mobile Cards */}
            <div className="block md:hidden space-y-3">
              {invoices.map((inv, index) => (
                <TableMobileCard
                  key={inv.id}
                  title={
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-stone-100 text-stone-700 text-xs font-bold shrink-0">
                        {index + 1}
                      </span>
                      <span className="font-mono text-xs font-bold text-stone-900">
                        {inv.invoiceNumber}
                      </span>
                    </div>
                  }
                  subtitle={
                    <div className="text-sm font-bold text-stone-900 mt-1">
                      {inv.studentName}
                    </div>
                  }
                  badge={
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
                      {inv.status === "PAID"
                        ? "Fully Paid"
                        : inv.status === "PARTIALLY_PAID"
                        ? "Partial"
                        : "No Payment"}
                    </Badge>
                  }
                  fields={[
                    { label: "Term & Session", value: `${inv.termName} (${inv.sessionName})` },
                    { label: "Total Fee", value: formatNaira(BigInt(inv.totalAmountKobo)) },
                    { label: "Amount Paid", value: formatNaira(BigInt(inv.amountPaidKobo)) },
                    { label: "Balance", value: formatNaira(BigInt(inv.outstandingBalanceKobo)) },
                  ]}
                />
              ))}
            </div>
          </div>
        )
      )}

      {/* Payments Tab */}
      {activeTab === "payments" && (
        allPayments.length === 0 ? (
          <EmptyState
            title="No records yet."
            description="No verified payment receipts have been recorded yet."
            actionLabel="Refresh"
            onAction={fetchFinance}
          />
        ) : (
          <div>
            {/* Desktop Table */}
            <div className="hidden md:block">
              <TableWrapper className="border border-[#EADBDA]/80">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell className="w-14 text-center font-semibold text-stone-700">S/N</TableHeaderCell>
                      <TableHeaderCell className="w-40 text-left font-semibold text-stone-700">Reference</TableHeaderCell>
                      <TableHeaderCell className="min-w-[160px] text-left font-semibold text-stone-700">Student</TableHeaderCell>
                      <TableHeaderCell className="w-32 text-left font-semibold text-stone-700">Amount</TableHeaderCell>
                      <TableHeaderCell className="w-32 text-left font-semibold text-stone-700">Method</TableHeaderCell>
                      <TableHeaderCell className="w-32 text-left font-semibold text-stone-700">Receipt #</TableHeaderCell>
                      <TableHeaderCell className="w-28 text-right font-semibold text-stone-700">Date</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {allPayments.map((p, index) => (
                      <TableRow key={p.id}>
                        <TableCell className="w-14 text-center text-xs font-semibold text-stone-500">
                          {index + 1}
                        </TableCell>
                        <TableCell className="w-40 font-mono text-xs font-bold text-stone-900">
                          {p.paymentReference}
                        </TableCell>
                        <TableCell className="min-w-[160px] font-bold text-stone-900">
                          {p.studentName}
                        </TableCell>
                        <TableCell className="w-32 text-xs font-bold text-emerald-800">
                          {formatNaira(BigInt(p.amountKobo))}
                        </TableCell>
                        <TableCell className="w-32 text-xs text-stone-600">
                          {p.paymentMethod.replace("_", " ")}
                        </TableCell>
                        <TableCell className="w-32 font-mono text-xs font-semibold text-[#800020]">
                          {p.receiptNumber || "N/A"}
                        </TableCell>
                        <TableCell className="w-28 text-right text-xs text-stone-500">
                          {p.paidAt}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableWrapper>
            </div>

            {/* Mobile Cards */}
            <div className="block md:hidden space-y-3">
              {allPayments.map((p, index) => (
                <TableMobileCard
                  key={p.id}
                  title={
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-stone-100 text-stone-700 text-xs font-bold shrink-0">
                        {index + 1}
                      </span>
                      <span className="font-mono text-xs font-bold text-stone-900">
                        {p.paymentReference}
                      </span>
                    </div>
                  }
                  subtitle={
                    <div className="text-sm font-bold text-stone-900 mt-1">
                      {p.studentName}
                    </div>
                  }
                  badge={
                    <Badge variant="success" size="sm">
                      Confirmed
                    </Badge>
                  }
                  fields={[
                    { label: "Amount Paid", value: formatNaira(BigInt(p.amountKobo)) },
                    { label: "Payment Method", value: p.paymentMethod.replace("_", " ") },
                    { label: "Receipt Number", value: p.receiptNumber || "Pending" },
                    { label: "Date Paid", value: p.paidAt },
                  ]}
                />
              ))}
            </div>
          </div>
        )
      )}
    </div>
  );
}

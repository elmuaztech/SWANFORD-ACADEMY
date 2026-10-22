"use client";

import React, { useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
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
  Modal,
  Alert,
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
  className?: string;
  sessionName: string;
  termName: string;
  programmeName: string;
  billingMonth?: number;
  billingPeriodName?: string | null;
  isSpecialRate?: boolean;
  isScholarship?: boolean;
  minimumDepositKobo?: string | null;
  minimumDepositNaira?: number | null;
  status: string;
  totalAmountKobo: string;
  amountPaidKobo: string;
  outstandingBalanceKobo: string;
  dueDate: string;
  createdAt: string;
  items: InvoiceItem[];
  payments: PaymentRecord[];
}

interface LinkedChild {
  studentId: string;
  studentName: string;
  admissionNumber: string | null;
  gender: string;
  className: string;
  programmeName: string;
  sessionName: string;
  receivesInvoices: boolean;
}

function safeBigInt(val: unknown): bigint {
  if (val === null || val === undefined || val === "") return BigInt(0);
  try {
    const s = String(val).split(".")[0].trim();
    return BigInt(s || 0);
  } catch {
    return BigInt(0);
  }
}

export default function ParentFinancePage() {
  const searchParams = useSearchParams();
  const [children, setChildren] = useState<LinkedChild[]>([]);
  const [invoices, setInvoices] = useState<ParentInvoice[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"invoices" | "payments">("invoices");

  // Payment checkout state
  const [paymentInvoice, setPaymentInvoice] = useState<ParentInvoice | null>(null);
  const [paymentMode, setPaymentMode] = useState<"full" | "deposit">("full");
  const [customPaymentAmount, setCustomPaymentAmount] = useState<string>("");
  const [isInitiatingPayment, setIsInitiatingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const openPaymentModal = (inv: ParentInvoice) => {
    setPaymentInvoice(inv);
    setPaymentMode("full");
    setCustomPaymentAmount("");
    setPaymentError(null);
  };

  // Verification toast state
  const [verificationNotice, setVerificationNotice] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  // Receipt viewing state
  const [viewingReceipt, setViewingReceipt] = useState<{
    payment: PaymentRecord;
    invoice: ParentInvoice;
  } | null>(null);

  const fetchFinance = () => {
    setLoading(true);
    setError(null);
    fetch("/api/parent/finance")
      .then((res) => {
        if (!res.ok) throw new Error("Could not retrieve fee records.");
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data)) {
          setInvoices(data);
          // Auto-derive unique children from invoices if array returned
          const childMap = new Map<string, LinkedChild>();
          data.forEach((inv) => {
            if (!childMap.has(inv.studentId)) {
              childMap.set(inv.studentId, {
                studentId: inv.studentId,
                studentName: inv.studentName,
                admissionNumber: inv.admissionNumber,
                gender: "UNKNOWN",
                className: inv.className || "Assigned Class",
                programmeName: inv.programmeName,
                sessionName: inv.sessionName,
                receivesInvoices: true,
              });
            }
          });
          setChildren(Array.from(childMap.values()));
        } else if (data && typeof data === "object") {
          setChildren(data.children || []);
          setInvoices(data.invoices || []);
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load fee records.");
        setLoading(false);
      });
  };

  // Check URL for Paystack callback reference and auto-verify
  useEffect(() => {
    const reference = searchParams?.get("reference") || searchParams?.get("trxref");
    if (reference) {
      setVerificationNotice({
        type: "info",
        message: `Verifying payment transaction (${reference})...`,
      });

      fetch("/api/payments/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success || data.status === "SUCCESS") {
            setVerificationNotice({
              type: "success",
              message: `Payment confirmed! Official Receipt #${data.receiptNumber || "Generated"} issued successfully.`,
            });
            fetchFinance();
          } else {
            setVerificationNotice({
              type: "error",
              message: data.message || "Payment verification could not be confirmed. Please contact the school bursary.",
            });
          }
        })
        .catch(() => {
          setVerificationNotice({
            type: "error",
            message: "Network error during verification. Your payment status will update shortly.",
          });
        })
        .finally(() => {
          // Clear query params from browser address bar
          if (typeof window !== "undefined") {
            const url = new URL(window.location.href);
            url.searchParams.delete("reference");
            url.searchParams.delete("trxref");
            window.history.replaceState({}, "", url.pathname);
          }
        });
    }
  }, [searchParams]);

  useEffect(() => {
    fetchFinance();
  }, []);

  // Filter invoices and payments by child
  const displayedInvoices =
    selectedChildId === "all"
      ? invoices
      : invoices.filter((inv) => inv.studentId === selectedChildId);

  const selectedChild =
    selectedChildId === "all"
      ? null
      : children.find((c) => c.studentId === selectedChildId) || null;

  // Aggregate totals
  let totalBilled = BigInt(0);
  let totalPaid = BigInt(0);
  let totalOutstanding = BigInt(0);

  const displayedPayments: (PaymentRecord & { invoice: ParentInvoice })[] = [];

  for (const inv of displayedInvoices) {
    totalBilled += safeBigInt(inv.totalAmountKobo);
    totalPaid += safeBigInt(inv.amountPaidKobo);
    totalOutstanding += safeBigInt(inv.outstandingBalanceKobo);

    for (const p of inv.payments || []) {
      displayedPayments.push({
        ...p,
        invoice: inv,
      });
    }
  }

  // Handle Paystack payment initialization
  const handleProceedToPayment = async () => {
    if (!paymentInvoice) return;
    setIsInitiatingPayment(true);
    setPaymentError(null);

    try {
      const outstanding = safeBigInt(paymentInvoice.outstandingBalanceKobo);
      let amountKoboToSend: string | undefined = undefined;

      if (paymentMode === "deposit") {
        const parsedNaira = Number(customPaymentAmount);
        if (isNaN(parsedNaira) || parsedNaira <= 0) {
          throw new Error("Please enter a valid deposit amount.");
        }
        const koboVal = BigInt(Math.round(parsedNaira * 100));
        if (koboVal > outstanding) {
          throw new Error(`Deposit amount cannot exceed the outstanding balance of ${formatNaira(outstanding)}.`);
        }
        if (
          paymentInvoice.minimumDepositKobo &&
          safeBigInt(paymentInvoice.amountPaidKobo) === BigInt(0) &&
          koboVal < safeBigInt(paymentInvoice.minimumDepositKobo)
        ) {
          throw new Error(`A minimum deposit of ${formatNaira(safeBigInt(paymentInvoice.minimumDepositKobo))} is required for the initial payment.`);
        }
        amountKoboToSend = koboVal.toString();
      }

      // 1. Create secure server-side payment session
      const sessionRes = await fetch("/api/payments/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType: "INVOICE",
          targetId: paymentInvoice.id,
          amountKobo: amountKoboToSend,
        }),
      });

      const sessionData = await sessionRes.json();
      if (!sessionRes.ok) {
        throw new Error(sessionData.error || "Unable to create payment session.");
      }

      // 2. Initialize Paystack transaction with callback to parent finance
      const initRes = await fetch("/api/payments/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionToken: sessionData.token,
          targetType: "INVOICE",
          callbackUrl: "/parent/finance",
        }),
      });

      const initData = await initRes.json();
      if (!initRes.ok) {
        throw new Error(initData.error || "Payment gateway could not be initialized.");
      }

      if (initData.authorizationUrl) {
        // Redirect to trusted Paystack gateway checkout
        window.location.href = initData.authorizationUrl;
      } else {
        throw new Error("No payment checkout URL returned by gateway.");
      }
    } catch (err: unknown) {
      setPaymentError(
        err instanceof Error ? err.message : "Payment processing error. Please try again."
      );
      setIsInitiatingPayment(false);
    }
  };

  if (loading) {
    return (
      <div className="py-12">
        <LoadingState message="Loading fees and payment records..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8">
        <ErrorState
          title="Finance Records Unavailable"
          message={error}
          actionLabel="Retry"
          onAction={fetchFinance}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="School Fees & Payments"
        description="Official fee schedules, itemized charges, and confirmed payment receipts for your children."
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

      {/* Verification Notice Banner */}
      {verificationNotice && (
        <Alert
          variant={
            verificationNotice.type === "success"
              ? "success"
              : verificationNotice.type === "error"
              ? "danger"
              : "info"
          }
          title={
            verificationNotice.type === "success"
              ? "Payment Successful"
              : verificationNotice.type === "error"
              ? "Payment Verification Status"
              : "Processing Verification"
          }
        >
          <div className="flex items-center justify-between">
            <span>{verificationNotice.message}</span>
            <button
              onClick={() => setVerificationNotice(null)}
              className="text-xs font-bold underline ml-3"
            >
              Dismiss
            </button>
          </div>
        </Alert>
      )}

      {/* Child Selector (Section 6 Requirement) */}
      {children.length > 0 && (
        <div className="space-y-2">
          <label className="text-xs font-bold text-stone-500 uppercase tracking-wider">
            Select Child / Ward:
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedChildId("all")}
              className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all min-h-[44px] flex items-center gap-2 border ${
                selectedChildId === "all"
                  ? "bg-[#800020] text-white border-[#800020] shadow-sm"
                  : "bg-white text-stone-700 border-stone-200 hover:border-[#800020]/40 hover:bg-stone-50"
              }`}
            >
              <span>All Children</span>
              <span
                className={`text-[11px] px-1.5 py-0.5 rounded-full font-bold ${
                  selectedChildId === "all"
                    ? "bg-white/20 text-white"
                    : "bg-stone-100 text-stone-600"
                }`}
              >
                {invoices.length}
              </span>
            </button>

            {children.map((child) => {
              const isSelected = selectedChildId === child.studentId;
              const childInvoices = invoices.filter((i) => i.studentId === child.studentId);
              const childBal = childInvoices.reduce(
                (sum, i) => sum + safeBigInt(i.outstandingBalanceKobo),
                BigInt(0)
              );

              return (
                <button
                  key={child.studentId}
                  type="button"
                  onClick={() => setSelectedChildId(child.studentId)}
                  className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all min-h-[44px] flex items-center gap-2 border ${
                    isSelected
                      ? "bg-[#800020] text-white border-[#800020] shadow-sm"
                      : "bg-white text-stone-700 border-stone-200 hover:border-[#800020]/40 hover:bg-stone-50"
                  }`}
                >
                  <span>{child.studentName}</span>
                  {childBal > BigInt(0) && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                        isSelected
                          ? "bg-amber-400 text-stone-900"
                          : "bg-amber-100 text-amber-900"
                      }`}
                    >
                      Due
                    </span>
                  )}
                  {childInvoices.length === 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        isSelected
                          ? "bg-white/20 text-white"
                          : "bg-stone-100 text-stone-500"
                      }`}
                    >
                      No Fee
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Selected Child Info Badge */}
      {selectedChild && (
        <Card className="bg-gradient-to-r from-stone-50 via-white to-stone-50 border border-[#EADBDA]/80">
          <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-base sm:text-lg font-bold text-stone-900">
                  {selectedChild.studentName}
                </span>
                {selectedChild.admissionNumber && (
                  <Badge variant="neutral" size="sm">
                    {selectedChild.admissionNumber}
                  </Badge>
                )}
              </div>
              <div className="text-xs text-stone-600 flex flex-wrap gap-x-4 gap-y-1">
                <span>
                  <strong>Class:</strong> {selectedChild.className}
                </span>
                <span>
                  <strong>Programme:</strong> {selectedChild.programmeName}
                </span>
                <span>
                  <strong>Session:</strong> {selectedChild.sessionName}
                </span>
              </div>
            </div>

            {totalOutstanding > BigInt(0) && displayedInvoices[0] && (
              <Button
                variant="primary"
                size="md"
                className="bg-[#800020] hover:bg-[#5B0612] text-white shrink-0 min-h-[44px] shadow-sm"
                onClick={() => setPaymentInvoice(displayedInvoices[0])}
              >
                Pay School Fees &rarr;
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Financial KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border border-[#EADBDA]/80 border-l-4 border-l-[#800020] bg-white shadow-xs">
          <CardHeader className="pb-2">
            <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">
              Total Fee
            </span>
            <CardTitle className="text-xl sm:text-2xl font-extrabold text-[#5B0612] mt-1 break-words">
              {formatNaira(totalBilled)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-stone-500">
              {selectedChild
                ? `Total fees charged for ${selectedChild.studentName}`
                : "Total fee amount across all linked children"}
            </p>
          </CardContent>
        </Card>

        <Card className="border border-emerald-200 border-l-4 border-l-emerald-600 bg-white shadow-xs">
          <CardHeader className="pb-2">
            <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
              Amount Paid
            </span>
            <CardTitle className="text-xl sm:text-2xl font-extrabold text-emerald-900 mt-1 break-words">
              {formatNaira(totalPaid)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-stone-500">
              Verified payments and confirmed school receipts
            </p>
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
              Balance Remaining
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
                ? "Outstanding balance due for academic session"
                : "All school fees are fully settled. Thank you!"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Multi-Child School Fees Overview */}
      {selectedChildId === "all" && children.length > 1 && (
        <Card className="border border-stone-200 bg-gradient-to-r from-stone-50 via-white to-amber-50/20 shadow-xs">
          <CardHeader className="pb-3 border-b border-stone-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base font-bold text-stone-900">
                  Enrolled Children &amp; Fee Status
                </CardTitle>
                <p className="text-xs text-stone-500">
                  Review balances and manage school fees individually for each child.
                </p>
              </div>
              <Badge variant="brand" size="sm" className="bg-[#800020]/10 text-[#800020] border-[#800020]/20 font-bold">
                {children.length} Enrolled Children
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {children.map((child) => {
                const childInvs = invoices.filter((inv) => inv.studentId === child.studentId);
                const childBal = childInvs.reduce(
                  (acc, inv) => acc + safeBigInt(inv.outstandingBalanceKobo),
                  BigInt(0)
                );
                const activeInv = childInvs.find((inv) => safeBigInt(inv.outstandingBalanceKobo) > BigInt(0)) || childInvs[0];

                return (
                  <div
                    key={child.studentId}
                    className={`p-3.5 rounded-xl border flex flex-col justify-between transition-all ${
                      childBal > BigInt(0)
                        ? "border-amber-200/80 bg-white hover:border-[#800020]/40 shadow-2xs"
                        : "border-emerald-200/80 bg-emerald-50/30"
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-1">
                        <span className="font-bold text-sm text-stone-900">{child.studentName}</span>
                        {activeInv?.isScholarship && (
                          <Badge variant="success" size="sm" className="shrink-0 bg-emerald-100 text-emerald-900 border-emerald-200">
                            Scholarship
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-stone-500 mt-0.5">
                        {child.className} • {child.programmeName}
                      </div>
                      <div className="mt-2.5">
                        <span className="text-[11px] text-stone-500 font-semibold uppercase tracking-wider block">
                          {childBal > BigInt(0) ? "Balance Due" : "Status"}
                        </span>
                        <span
                          className={`text-base font-extrabold font-mono ${
                            childBal > BigInt(0) ? "text-[#800020]" : "text-emerald-700"
                          }`}
                        >
                          {childBal > BigInt(0) ? formatNaira(childBal) : "Fully Paid ✓"}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-stone-100 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedChildId(child.studentId)}
                        className="text-xs font-semibold text-stone-600 hover:text-stone-900 hover:underline"
                      >
                        View Statement &rarr;
                      </button>
                      {childBal > BigInt(0) && activeInv && (
                        <Button
                          variant="primary"
                          size="sm"
                          className="bg-[#800020] hover:bg-[#5B0612] text-white min-h-[38px] text-xs font-bold"
                          onClick={() => openPaymentModal(activeInv)}
                        >
                          Pay School Fees
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs
        tabs={[
          { id: "invoices", label: `Fee Invoices (${displayedInvoices.length})` },
          { id: "payments", label: `Payment Receipts (${displayedPayments.length})` },
        ]}
        activeTab={activeTab}
        onChange={(t) => setActiveTab(t as "invoices" | "payments")}
      />

      {/* Invoices Tab */}
      {activeTab === "invoices" && (
        displayedInvoices.length === 0 ? (
          <EmptyState
            title={selectedChild ? "Fee not configured" : "No records yet."}
            description={
              selectedChild
                ? `No fee schedule or invoice has been generated for ${selectedChild.studentName} for the active session. When fees are scheduled, an itemized breakdown will appear here.`
                : "No fee invoices have been issued for your children yet. Once fees are scheduled for the active term, they will be listed here."
            }
            actionLabel="Refresh"
            onAction={fetchFinance}
          />
        ) : (
          <div className="space-y-6">
            {/* If a single child is selected and has an invoice, show Itemized Breakdown Card first (Section 6 Requirement) */}
            {selectedChild && displayedInvoices[0] && displayedInvoices[0].items.length > 0 && (
              <Card className="border border-[#EADBDA]/80 shadow-xs">
                <CardHeader className="border-b border-stone-100 pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <CardTitle className="text-base font-bold text-stone-900">
                        Itemized Fee Breakdown
                      </CardTitle>
                      <p className="text-xs text-stone-500">
                        Applicable school fees and mandatory learning charges for {displayedInvoices[0].termName} ({displayedInvoices[0].sessionName}).
                      </p>
                    </div>
                    <Badge
                      variant={
                        displayedInvoices[0].status === "PAID"
                          ? "success"
                          : displayedInvoices[0].status === "PARTIALLY_PAID"
                          ? "warning"
                          : "neutral"
                      }
                      size="sm"
                    >
                      {displayedInvoices[0].status === "PAID"
                        ? "Paid"
                        : displayedInvoices[0].status === "PARTIALLY_PAID"
                        ? "Partial"
                        : "Awaiting confirmation"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-stone-100 text-sm">
                    {displayedInvoices[0].items.map((item, idx) => (
                      <div
                        key={item.id || idx}
                        className="px-4 py-3 flex items-center justify-between hover:bg-stone-50/50"
                      >
                        <span className="font-medium text-stone-800">{item.description}</span>
                        <span className="font-bold text-stone-900 font-mono">
                          {formatNaira(safeBigInt(item.totalAmountKobo))}
                        </span>
                      </div>
                    ))}
                    <div className="px-4 py-3.5 bg-stone-50/70 flex items-center justify-between font-bold text-stone-900 border-t border-stone-200">
                      <span>Total Applicable School Fee</span>
                      <span className="text-base font-extrabold text-[#5B0612] font-mono">
                        {formatNaira(safeBigInt(displayedInvoices[0].totalAmountKobo))}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Desktop Invoices Table */}
            <div className="hidden md:block">
              <TableWrapper className="border border-[#EADBDA]/80">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell className="w-12 text-center font-semibold text-stone-700">
                        S/N
                      </TableHeaderCell>
                      <TableHeaderCell className="w-36 text-left font-semibold text-stone-700">
                        Invoice #
                      </TableHeaderCell>
                      {selectedChildId === "all" && (
                        <TableHeaderCell className="min-w-[160px] text-left font-semibold text-stone-700">
                          Student
                        </TableHeaderCell>
                      )}
                      <TableHeaderCell className="w-32 text-left font-semibold text-stone-700">
                        Term / Session
                      </TableHeaderCell>
                      <TableHeaderCell className="w-28 text-left font-semibold text-stone-700">
                        Total Fee
                      </TableHeaderCell>
                      <TableHeaderCell className="w-28 text-left font-semibold text-stone-700">
                        Paid
                      </TableHeaderCell>
                      <TableHeaderCell className="w-28 text-left font-semibold text-stone-700">
                        Balance
                      </TableHeaderCell>
                      <TableHeaderCell className="w-24 text-center font-semibold text-stone-700">
                        Status
                      </TableHeaderCell>
                      <TableHeaderCell className="w-28 text-right font-semibold text-stone-700">
                        Action
                      </TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {displayedInvoices.map((inv, index) => {
                      const bal = safeBigInt(inv.outstandingBalanceKobo);
                      return (
                        <TableRow key={inv.id}>
                          <TableCell className="w-12 text-center text-xs font-semibold text-stone-500">
                            {index + 1}
                          </TableCell>
                          <TableCell className="w-36 font-mono text-xs font-bold text-stone-900">
                            {inv.invoiceNumber}
                          </TableCell>
                          {selectedChildId === "all" && (
                            <TableCell className="min-w-[160px] font-bold text-stone-900">
                              <div>{inv.studentName}</div>
                              {inv.admissionNumber && (
                                <div className="text-[11px] text-stone-500 font-mono">
                                  {inv.admissionNumber}
                                </div>
                              )}
                            </TableCell>
                          )}
                          <TableCell className="w-32 text-xs text-stone-600">
                            <div className="font-semibold text-stone-800">{inv.billingPeriodName || inv.termName}</div>
                            <div className="text-[10px] text-stone-400">({inv.sessionName})</div>
                            {inv.isScholarship && (
                              <Badge variant="success" size="sm" className="mt-1 bg-emerald-100 text-emerald-900 border-emerald-200 font-bold">
                                Scholarship
                              </Badge>
                            )}
                            {inv.isSpecialRate && !inv.isScholarship && (
                              <Badge variant="brand" size="sm" className="mt-1 bg-amber-100 text-amber-900 border-amber-200">
                                Continuing Student Rate
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="w-28 text-xs font-bold text-stone-900">
                            {formatNaira(safeBigInt(inv.totalAmountKobo))}
                          </TableCell>
                          <TableCell className="w-28 text-xs font-bold text-emerald-800">
                            {formatNaira(safeBigInt(inv.amountPaidKobo))}
                          </TableCell>
                          <TableCell className="w-28 text-xs font-bold text-amber-800">
                            {formatNaira(bal)}
                          </TableCell>
                          <TableCell className="w-24 text-center">
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
                                ? "Paid"
                                : inv.status === "PARTIALLY_PAID"
                                ? "Partial"
                                : "Awaiting"}
                            </Badge>
                          </TableCell>
                          <TableCell className="w-28 text-right">
                            {bal > BigInt(0) ? (
                              <Button
                                variant="primary"
                                size="sm"
                                className="bg-[#800020] hover:bg-[#5B0612] text-white"
                                onClick={() => openPaymentModal(inv)}
                              >
                                Pay Now
                              </Button>
                            ) : (
                              <Badge variant="success" size="sm">
                                Cleared
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableWrapper>
            </div>

            {/* Mobile Cards */}
            <div className="block md:hidden space-y-3">
              {displayedInvoices.map((inv, index) => {
                const bal = safeBigInt(inv.outstandingBalanceKobo);
                return (
                  <TableMobileCard
                    key={inv.id}
                    title={
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-stone-100 text-stone-700 text-xs font-bold shrink-0">
                          {index + 1}
                        </span>
                        <span className="text-sm font-bold text-stone-900 truncate">
                          {inv.studentName}
                        </span>
                      </div>
                    }
                    subtitle={
                      <span className="font-mono text-xs font-semibold text-[#800020] pl-8 block">
                        {inv.invoiceNumber}
                      </span>
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
                          ? "Paid"
                          : inv.status === "PARTIALLY_PAID"
                          ? "Partial"
                          : "Awaiting"}
                      </Badge>
                    }
                    fields={[
                      {
                        label: "Period & Session",
                        value: `${inv.billingPeriodName || inv.termName} (${inv.sessionName})${
                          inv.isScholarship
                            ? " • Scholarship (Tuition Waived)"
                            : inv.isSpecialRate
                            ? " • Continuing Student Rate"
                            : ""
                        }`,
                      },
                      {
                        label: "Total Fee",
                        value: formatNaira(safeBigInt(inv.totalAmountKobo)),
                      },
                      {
                        label: "Amount Paid",
                        value: formatNaira(safeBigInt(inv.amountPaidKobo)),
                      },
                      { label: "Balance", value: formatNaira(bal) },
                    ]}
                    actions={
                      bal > BigInt(0) ? (
                        <Button
                          variant="primary"
                          size="sm"
                          className="w-full bg-[#800020] hover:bg-[#5B0612] text-white min-h-[44px]"
                          onClick={() => openPaymentModal(inv)}
                        >
                          Pay School Fees ({formatNaira(bal)})
                        </Button>
                      ) : undefined
                    }
                  />
                );
              })}
            </div>
          </div>
        )
      )}

      {/* Payments Tab */}
      {activeTab === "payments" && (
        displayedPayments.length === 0 ? (
          <EmptyState
            title="No records yet."
            description="No verified payment receipts have been recorded yet."
            actionLabel="Refresh"
            onAction={fetchFinance}
          />
        ) : (
          <div>
            {/* Desktop Payments Table */}
            <div className="hidden md:block">
              <TableWrapper className="border border-[#EADBDA]/80">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell className="w-12 text-center font-semibold text-stone-700">
                        S/N
                      </TableHeaderCell>
                      <TableHeaderCell className="w-36 text-left font-semibold text-stone-700">
                        Reference
                      </TableHeaderCell>
                      {selectedChildId === "all" && (
                        <TableHeaderCell className="min-w-[160px] text-left font-semibold text-stone-700">
                          Student
                        </TableHeaderCell>
                      )}
                      <TableHeaderCell className="w-28 text-left font-semibold text-stone-700">
                        Amount
                      </TableHeaderCell>
                      <TableHeaderCell className="w-28 text-left font-semibold text-stone-700">
                        Method
                      </TableHeaderCell>
                      <TableHeaderCell className="w-32 text-left font-semibold text-stone-700">
                        Receipt #
                      </TableHeaderCell>
                      <TableHeaderCell className="w-24 text-left font-semibold text-stone-700">
                        Date
                      </TableHeaderCell>
                      <TableHeaderCell className="w-28 text-right font-semibold text-stone-700">
                        Receipt
                      </TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {displayedPayments.map((p, index) => (
                      <TableRow key={p.id}>
                        <TableCell className="w-12 text-center text-xs font-semibold text-stone-500">
                          {index + 1}
                        </TableCell>
                        <TableCell className="w-36 font-mono text-xs font-bold text-stone-900 truncate">
                          {p.paymentReference}
                        </TableCell>
                        {selectedChildId === "all" && (
                          <TableCell className="min-w-[160px] font-bold text-stone-900">
                            {p.invoice.studentName}
                          </TableCell>
                        )}
                        <TableCell className="w-28 text-xs font-bold text-emerald-800">
                          {formatNaira(safeBigInt(p.amountKobo))}
                        </TableCell>
                        <TableCell className="w-28 text-xs text-stone-600">
                          {p.paymentMethod.replace("_", " ")}
                        </TableCell>
                        <TableCell className="w-32 font-mono text-xs font-semibold text-[#800020]">
                          {p.receiptNumber || "Pending"}
                        </TableCell>
                        <TableCell className="w-24 text-xs text-stone-500">{p.paidAt}</TableCell>
                        <TableCell className="w-28 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setViewingReceipt({ payment: p, invoice: p.invoice })
                            }
                          >
                            View Receipt
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableWrapper>
            </div>

            {/* Mobile Payments Cards */}
            <div className="block md:hidden space-y-3">
              {displayedPayments.map((p, index) => (
                <TableMobileCard
                  key={p.id}
                  title={
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-stone-100 text-stone-700 text-xs font-bold shrink-0">
                        {index + 1}
                      </span>
                      <span className="text-sm font-bold text-stone-900 truncate">
                        {p.invoice.studentName}
                      </span>
                    </div>
                  }
                  subtitle={
                    <span className="font-mono text-xs font-semibold text-[#800020] pl-8 block truncate">
                      {p.paymentReference}
                    </span>
                  }
                  badge={
                    <Badge variant="success" size="sm">
                      Confirmed
                    </Badge>
                  }
                  fields={[
                    {
                      label: "Amount Paid",
                      value: formatNaira(safeBigInt(p.amountKobo)),
                    },
                    {
                      label: "Method",
                      value: p.paymentMethod.replace("_", " "),
                    },
                    {
                      label: "Receipt Number",
                      value: p.receiptNumber || "Pending",
                    },
                    { label: "Date Paid", value: p.paidAt },
                  ]}
                  actions={
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full min-h-[44px]"
                      onClick={() => setViewingReceipt({ payment: p, invoice: p.invoice })}
                    >
                      View Official Receipt
                    </Button>
                  }
                />
              ))}
            </div>
          </div>
        )
      )}

      {/* Paystack Payment Checkout Modal (Section 8 Requirement) */}
      {paymentInvoice && (
        <Modal
          isOpen={true}
          onClose={() => {
            if (!isInitiatingPayment) {
              setPaymentInvoice(null);
              setPaymentError(null);
            }
          }}
          title="Pay School Fees"
          description={`Secure online payment for ${paymentInvoice.studentName}`}
          size="md"
          footer={
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 w-full">
              <Button
                variant="outline"
                size="md"
                disabled={isInitiatingPayment}
                onClick={() => {
                  setPaymentInvoice(null);
                  setPaymentError(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="md"
                className="bg-[#800020] hover:bg-[#5B0612] text-white min-h-[44px]"
                isLoading={isInitiatingPayment}
                disabled={isInitiatingPayment}
                onClick={handleProceedToPayment}
              >
                Proceed to Paystack &rarr;
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            {paymentError && (
              <Alert variant="danger" title="Payment Initiation Error">
                {paymentError}
              </Alert>
            )}

            <div className="bg-stone-50 p-4 rounded-xl space-y-2 border border-stone-200">
              <div className="flex justify-between text-xs text-stone-600">
                <span>Student:</span>
                <span className="font-bold text-stone-900">{paymentInvoice.studentName}</span>
              </div>
              <div className="flex justify-between text-xs text-stone-600">
                <span>Invoice Number:</span>
                <span className="font-mono font-bold text-stone-900">
                  {paymentInvoice.invoiceNumber}
                </span>
              </div>
              <div className="flex justify-between text-xs text-stone-600">
                <span>Term / Session:</span>
                <span className="font-semibold text-stone-800">
                  {paymentInvoice.termName} ({paymentInvoice.sessionName})
                </span>
              </div>
              {paymentInvoice.isScholarship && (
                <div className="flex justify-between text-xs text-stone-600">
                  <span>Billing Category:</span>
                  <Badge variant="success" size="sm" className="bg-emerald-100 text-emerald-900 border-emerald-200 font-bold">
                    Scholarship (Tuition 100% Waived)
                  </Badge>
                </div>
              )}
              <div className="border-t border-stone-200 pt-2 flex justify-between items-center">
                <span className="text-sm font-bold text-stone-900">Total Outstanding:</span>
                <span className="text-lg font-extrabold text-[#5B0612] font-mono">
                  {formatNaira(safeBigInt(paymentInvoice.outstandingBalanceKobo))}
                </span>
              </div>
            </div>

            {/* Payment Mode Selector */}
            <div className="space-y-3 pt-1">
              <label className="text-xs font-bold text-stone-700 block">Choose Payment Option:</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMode("full")}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    paymentMode === "full"
                      ? "border-[#800020] bg-rose-50/50 ring-2 ring-[#800020]/20"
                      : "border-stone-200 hover:border-stone-300 bg-white"
                  }`}
                >
                  <div className="text-xs font-bold text-stone-900">Pay Full Balance</div>
                  <div className="text-sm font-extrabold text-[#800020] mt-0.5 font-mono">
                    {formatNaira(safeBigInt(paymentInvoice.outstandingBalanceKobo))}
                  </div>
                  <div className="text-[11px] text-stone-500 mt-0.5">Settle entire fee bill</div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPaymentMode("deposit");
                    if (!customPaymentAmount && paymentInvoice.minimumDepositNaira) {
                      setCustomPaymentAmount(String(paymentInvoice.minimumDepositNaira));
                    }
                  }}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    paymentMode === "deposit"
                      ? "border-[#800020] bg-rose-50/50 ring-2 ring-[#800020]/20"
                      : "border-stone-200 hover:border-stone-300 bg-white"
                  }`}
                >
                  <div className="text-xs font-bold text-stone-900">
                    {paymentInvoice.minimumDepositKobo ? "Pay Deposit / Installment" : "Pay Custom Deposit"}
                  </div>
                  <div className="text-sm font-extrabold text-stone-700 mt-0.5">
                    {paymentInvoice.minimumDepositKobo
                      ? `Min. ${formatNaira(safeBigInt(paymentInvoice.minimumDepositKobo))}`
                      : "Flexible"}
                  </div>
                  <div className="text-[11px] text-stone-500 mt-0.5">Pay in installments</div>
                </button>
              </div>

              {paymentMode === "deposit" && (
                <div className="mt-2 p-3.5 bg-amber-50/80 border border-amber-200/90 rounded-xl space-y-2">
                  <label className="text-xs font-bold text-amber-950 block">
                    Enter Deposit Amount (₦):
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-stone-500">
                      ₦
                    </span>
                    <input
                      type="number"
                      min="1"
                      step="any"
                      value={customPaymentAmount}
                      onChange={(e) => setCustomPaymentAmount(e.target.value)}
                      placeholder={paymentInvoice.minimumDepositNaira ? String(paymentInvoice.minimumDepositNaira) : "e.g. 20000"}
                      className="w-full pl-8 pr-3 py-2 text-sm font-bold text-stone-900 bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#800020] focus:border-transparent min-h-[44px]"
                    />
                  </div>
                  {paymentInvoice.minimumDepositKobo && safeBigInt(paymentInvoice.amountPaidKobo) === BigInt(0) && (
                    <p className="text-[11px] font-semibold text-amber-900">
                      * A minimum initial deposit of {formatNaira(safeBigInt(paymentInvoice.minimumDepositKobo))} is required for this invoice.
                    </p>
                  )}
                  {customPaymentAmount && Number(customPaymentAmount) > 0 && (
                    <p className="text-[11px] text-stone-600">
                      Remaining balance after payment: {formatNaira(
                        safeBigInt(paymentInvoice.outstandingBalanceKobo) - safeBigInt(Math.round(Number(customPaymentAmount || 0) * 100)) > BigInt(0)
                          ? safeBigInt(paymentInvoice.outstandingBalanceKobo) - safeBigInt(Math.round(Number(customPaymentAmount || 0) * 100))
                          : BigInt(0)
                      )}.
                    </p>
                  )}
                </div>
              )}
            </div>

            <p className="text-xs text-stone-500 leading-relaxed">
              Payments are processed securely via the authorized Paystack gateway. Supported
              payment channels include debit card, USSD, and bank transfer. An official Swanford
              Academy receipt will be issued immediately upon verification.
            </p>
          </div>
        </Modal>
      )}

      {/* Official Receipt Modal (Section 6 & 8 Requirement) */}
      {viewingReceipt && (
        <Modal
          isOpen={true}
          onClose={() => setViewingReceipt(null)}
          title="Official Payment Receipt"
          size="lg"
          footer={
            <div className="flex justify-between items-center w-full">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (typeof window !== "undefined") {
                    window.print();
                  }
                }}
              >
                Print / Save PDF
              </Button>
              <Button variant="primary" size="sm" onClick={() => setViewingReceipt(null)}>
                Close
              </Button>
            </div>
          }
        >
          <div className="space-y-5 p-2">
            {/* Swanford Letterhead */}
            <div className="text-center pb-4 border-b border-stone-200 space-y-1">
              <div className="w-12 h-12 mx-auto rounded-lg bg-[#FDF2F4] border border-[#EADBDA] flex items-center justify-center">
                <img
                  src="/images/swanford-logo.jpg"
                  alt="Swanford Crest"
                  className="w-10 h-10 object-contain"
                />
              </div>
              <h3 className="text-lg font-extrabold text-[#5B0612] font-display">
                SWANFORD ACADEMY
              </h3>
              <p className="text-[11px] text-stone-500">
                Dutse, Jigawa State, Nigeria &bull; Official Bursary Receipt
              </p>
              <div className="inline-block mt-2 px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-full text-xs font-bold">
                PAYMENT CONFIRMED
              </div>
            </div>

            {/* Receipt Metadata Grid */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 bg-stone-50 rounded-lg">
                <span className="text-stone-400 block">Receipt Number</span>
                <span className="font-bold font-mono text-stone-900">
                  {viewingReceipt.payment.receiptNumber || "N/A"}
                </span>
              </div>
              <div className="p-2.5 bg-stone-50 rounded-lg">
                <span className="text-stone-400 block">Date Paid</span>
                <span className="font-bold text-stone-900">{viewingReceipt.payment.paidAt}</span>
              </div>
              <div className="p-2.5 bg-stone-50 rounded-lg">
                <span className="text-stone-400 block">Student Name</span>
                <span className="font-bold text-stone-900">
                  {viewingReceipt.invoice.studentName}
                </span>
              </div>
              <div className="p-2.5 bg-stone-50 rounded-lg">
                <span className="text-stone-400 block">Invoice Number</span>
                <span className="font-bold font-mono text-stone-900">
                  {viewingReceipt.invoice.invoiceNumber}
                </span>
              </div>
              <div className="p-2.5 bg-stone-50 rounded-lg">
                <span className="text-stone-400 block">Gateway Reference</span>
                <span className="font-mono text-[11px] text-stone-800 break-all">
                  {viewingReceipt.payment.paymentReference}
                </span>
              </div>
              <div className="p-2.5 bg-stone-50 rounded-lg">
                <span className="text-stone-400 block">Payment Method</span>
                <span className="font-bold text-stone-900">
                  {viewingReceipt.payment.paymentMethod.replace("_", " ")}
                </span>
              </div>
            </div>

            {/* Amount Box */}
            <div className="p-4 bg-emerald-50/80 rounded-xl border border-emerald-200 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider block">
                  Amount Received
                </span>
                <span className="text-xs text-emerald-700">Official Credit Confirmation</span>
              </div>
              <span className="text-2xl font-black text-emerald-900 font-mono">
                {formatNaira(safeBigInt(viewingReceipt.payment.amountKobo))}
              </span>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

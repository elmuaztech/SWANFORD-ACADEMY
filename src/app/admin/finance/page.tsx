"use client";

import React, { useEffect, useState } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Button,
  Tabs,
  Modal,
  LoadingState,
  ErrorState,
  EmptyState,
  PageHeader,
  Table,
  TableHead,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
  TableWrapper,
  TableMobileCard,
  Input,
  Textarea,
  Select,
  FormGroup,
  Alert,
} from "@/components";
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
  type?: 'TUITION' | 'APPLICATION_FEE';
}

interface ExpenseItem {
  id: string;
  expenseNumber: string;
  title: string;
  description: string;
  amountKobo: string;
  paymentMethod: string;
  payeeName: string;
  receiptVoucherUrl: string | null;
  expenseDate: string;
  status: "RECORDED" | "VOIDED";
  category: { id: string; name: string; code: string };
  academicSession: { id: string; name: string };
  academicTerm: { id: string; name: string } | null;
}

interface ExpenseCategory {
  id: string;
  code: string;
  name: string;
  description: string | null;
}

interface FinanceSummary {
  totalInvoicedKobo: string;
  totalCollectedKobo: string;
  totalOutstandingKobo: string;
  totalExpensesKobo?: string;
  expenseCount?: number;
  activeSession: { name: string } | null;
  activeTerm: { name: string } | null;
}

interface OutstandingItem {
  invoiceId: string;
  invoiceNumber: string;
  studentId: string;
  studentName: string;
  admissionNumber: string | null;
  guardianId: string;
  guardianName: string;
  guardianEmail: string | null;
  guardianPhone: string | null;
  className: string;
  termName: string;
  sessionName: string;
  totalAmountKobo: string;
  amountPaidKobo: string;
  outstandingBalanceKobo: string;
  totalAmountFormatted: string;
  amountPaidFormatted: string;
  outstandingBalanceFormatted: string;
  category: "NO_PAYMENT" | "PARTIAL_PAYMENT" | "FULLY_PAID";
}

interface OutstandingOverview {
  sessionName: string;
  termName: string;
  sessionId: string | null;
  termId: string | null;
  counts: {
    noPayment: number;
    partialPayment: number;
    fullyPaid: number;
    totalStudents: number;
  };
  totals: {
    totalBilledKobo: string;
    totalPaidKobo: string;
    totalOutstandingKobo: string;
    totalBilledFormatted: string;
    totalPaidFormatted: string;
    totalOutstandingFormatted: string;
  };
  records: OutstandingItem[];
}

interface ScheduledReminderItem {
  id: string;
  scheduledFor: string;
  targetType: "ALL_OUTSTANDING" | "NO_PAYMENT_ONLY" | "PARTIAL_PAYMENT_ONLY";
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "CANCELLED" | "FAILED";
  totalTargeted: number;
  totalSent: number;
  sentAt: string | null;
  cancelledAt: string | null;
  failureReason: string | null;
  createdAt: string;
  academicSession: { id: string; name: string } | null;
  academicTerm: { id: string; name: string } | null;
}

export default function AdminFinancePage() {
  const [activeTab, setActiveTab] = useState<"invoices" | "outstanding" | "payments" | "expenses">("invoices");
  const [outstandingData, setOutstandingData] = useState<OutstandingOverview | null>(null);
  const [scheduledReminders, setScheduledReminders] = useState<ScheduledReminderItem[]>([]);
  const [outstandingFilter, setOutstandingFilter] = useState<"ALL" | "NO_PAYMENT" | "PARTIAL_PAYMENT" | "FULLY_PAID">("ALL");

  // Reminders Modals
  const [isImmediateReminderOpen, setIsImmediateReminderOpen] = useState(false);
  const [isScheduleReminderOpen, setIsScheduleReminderOpen] = useState(false);
  const [reminderTargetType, setReminderTargetType] = useState<"ALL_OUTSTANDING" | "NO_PAYMENT_ONLY" | "PARTIAL_PAYMENT_ONLY">("ALL_OUTSTANDING");
  const [scheduleDateTime, setScheduleDateTime] = useState("");
  const [minScheduleDateTime, setMinScheduleDateTime] = useState("");
  const [isSendingReminder, setIsSendingReminder] = useState(false);

  useEffect(() => {
    if (isScheduleReminderOpen) {
      const minDate = new Date(Date.now() + 60000).toISOString().slice(0, 16);
      setMinScheduleDateTime(minDate);
      if (!scheduleDateTime) {
        setScheduleDateTime(minDate);
      }
    }
  }, [isScheduleReminderOpen, scheduleDateTime]);
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals & Action States
  const [selectedReceipt, setSelectedReceipt] = useState<PaymentItem | null>(null);
  const [isRecordExpenseOpen, setIsRecordExpenseOpen] = useState(false);
  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);
  const [selectedExpenseForVoid, setSelectedExpenseForVoid] = useState<ExpenseItem | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // New Expense Form State
  const [expenseForm, setExpenseForm] = useState({
    title: "",
    categoryId: "",
    payeeName: "",
    amountNaira: "",
    paymentMethod: "BANK_TRANSFER",
    expenseDate: new Date().toISOString().split("T")[0],
    description: "",
    receiptVoucherUrl: "",
  });

  // New Category Form State
  const [categoryForm, setCategoryForm] = useState({
    code: "",
    name: "",
    description: "",
  });

  const fetchFinanceData = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetch("/api/admin/finance/summary"),
      fetch("/api/admin/finance/invoices"),
      fetch("/api/admin/finance/payments"),
      fetch("/api/admin/finance/expenses"),
      fetch("/api/admin/finance/expenses/categories"),
      fetch("/api/admin/finance/outstanding"),
      fetch("/api/admin/finance/reminders"),
    ])
      .then(async ([sRes, iRes, pRes, eRes, cRes, oRes, rRes]) => {
        if (sRes.status === 403 || iRes.status === 403 || pRes.status === 403) {
          throw new Error("ACCESS_RESTRICTED");
        }
        if (!sRes.ok || !iRes.ok || !pRes.ok) {
          throw new Error("Failed to load school financial records.");
        }
        const sJson = await sRes.json();
        const iJson = await iRes.json();
        const pJson = await pRes.json();
        const eJson = eRes.ok ? await eRes.json() : [];
        const cJson = cRes.ok ? await cRes.json() : [];
        const oJson = oRes.ok ? await oRes.json() : null;
        const rJson = rRes.ok ? await rRes.json() : [];
        return [sJson, iJson, pJson, eJson, cJson, oJson, rJson];
      })
      .then(([sJson, iJson, pJson, eJson, cJson, oJson, rJson]) => {
        setSummary(sJson);
        setInvoices(iJson);
        setPayments(pJson);
        setExpenses(eJson);
        setCategories(cJson);
        if (oJson) setOutstandingData(oJson);
        if (Array.isArray(rJson)) setScheduledReminders(rJson);
        if (cJson.length > 0 && !expenseForm.categoryId) {
          setExpenseForm((prev) => ({ ...prev, categoryId: cJson[0].id }));
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Financial ledger unavailable.");
        setLoading(false);
      });
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const tabParam = urlParams.get("tab");
      if (tabParam === "outstanding" || tabParam === "payments" || tabParam === "expenses" || tabParam === "invoices") {
        setActiveTab(tabParam as "invoices" | "outstanding" | "payments" | "expenses");
      }
    }
    fetchFinanceData();
  }, []);

  const handleSendRemindersNow = async () => {
    setIsSendingReminder(true);
    setActionFeedback(null);
    try {
      const res = await fetch("/api/admin/finance/outstanding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType: reminderTargetType,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send payment reminders.");

      setIsImmediateReminderOpen(false);
      setActionFeedback({
        type: "success",
        message: data.message || "Payment reminders sent successfully to parent portals and emails.",
      });
      fetchFinanceData();
    } catch (err: unknown) {
      setActionFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to send payment reminders.",
      });
    } finally {
      setIsSendingReminder(false);
    }
  };

  const handleScheduleReminderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleDateTime) {
      setActionFeedback({ type: "error", message: "Please specify a future date and time." });
      return;
    }

    const scheduledDate = new Date(scheduleDateTime);
    if (isNaN(scheduledDate.getTime()) || scheduledDate.getTime() <= Date.now()) {
      setActionFeedback({ type: "error", message: "Scheduled date & time must be in the future." });
      return;
    }

    setIsSendingReminder(true);
    setActionFeedback(null);
    try {
      const res = await fetch("/api/admin/finance/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledFor: scheduledDate.toISOString(),
          targetType: reminderTargetType,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to schedule payment reminder.");

      setIsScheduleReminderOpen(false);
      setScheduleDateTime("");
      setActionFeedback({
        type: "success",
        message: "Payment reminder scheduled successfully. The school server will process it automatically at the scheduled time.",
      });
      fetchFinanceData();
    } catch (err: unknown) {
      setActionFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to schedule payment reminder.",
      });
    } finally {
      setIsSendingReminder(false);
    }
  };

  const handleCancelReminder = async (id: string) => {
    if (!confirm("Are you sure you want to cancel this scheduled reminder?")) return;
    try {
      const res = await fetch(`/api/admin/finance/reminders/${id}/cancel`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to cancel scheduled reminder.");

      setActionFeedback({ type: "success", message: "Scheduled reminder was cancelled." });
      fetchFinanceData();
    } catch (err: unknown) {
      setActionFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to cancel reminder.",
      });
    }
  };

  const handleRecordExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseForm.title || !expenseForm.categoryId || !expenseForm.payeeName || !expenseForm.amountNaira) {
      setActionFeedback({ type: "error", message: "Please fill in all required expense fields." });
      return;
    }

    const nairaNum = parseFloat(expenseForm.amountNaira.replace(/,/g, ""));
    if (isNaN(nairaNum) || nairaNum <= 0) {
      setActionFeedback({ type: "error", message: "Please enter a valid expense amount greater than 0." });
      return;
    }

    const amountKobo = Math.round(nairaNum * 100).toString();

    setIsSubmitting(true);
    setActionFeedback(null);
    try {
      const res = await fetch("/api/admin/finance/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: expenseForm.title.trim(),
          categoryId: expenseForm.categoryId,
          payeeName: expenseForm.payeeName.trim(),
          amountKobo,
          paymentMethod: expenseForm.paymentMethod,
          expenseDate: new Date(expenseForm.expenseDate).toISOString(),
          description: expenseForm.description.trim() || expenseForm.title.trim(),
          receiptVoucherUrl: expenseForm.receiptVoucherUrl.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to record expense.");
      }

      setIsRecordExpenseOpen(false);
      setExpenseForm({
        title: "",
        categoryId: categories[0]?.id || "",
        payeeName: "",
        amountNaira: "",
        paymentMethod: "BANK_TRANSFER",
        expenseDate: new Date().toISOString().split("T")[0],
        description: "",
        receiptVoucherUrl: "",
      });
      setActionFeedback({ type: "success", message: `Expense recorded successfully as voucher ${data.expenseNumber}.` });
      fetchFinanceData();
    } catch (err: unknown) {
      setActionFeedback({ type: "error", message: err instanceof Error ? err.message : "Failed to record expense." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryForm.code || !categoryForm.name) {
      setActionFeedback({ type: "error", message: "Category code and name are required." });
      return;
    }

    setIsSubmitting(true);
    setActionFeedback(null);
    try {
      const res = await fetch("/api/admin/finance/expenses/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: categoryForm.code.trim().toUpperCase(),
          name: categoryForm.name.trim(),
          description: categoryForm.description.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create category.");
      }

      setIsAddCategoryOpen(false);
      setCategoryForm({ code: "", name: "", description: "" });
      setActionFeedback({ type: "success", message: `Expense category '${data.name}' created.` });
      fetchFinanceData();
    } catch (err: unknown) {
      setActionFeedback({ type: "error", message: err instanceof Error ? err.message : "Failed to create category." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVoidExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExpenseForVoid || !voidReason.trim()) {
      setActionFeedback({ type: "error", message: "Please provide a specific reason for voiding this voucher." });
      return;
    }

    setIsSubmitting(true);
    setActionFeedback(null);
    try {
      const res = await fetch(`/api/admin/finance/expenses/${selectedExpenseForVoid.id}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: voidReason.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to void expense voucher.");
      }

      setSelectedExpenseForVoid(null);
      setVoidReason("");
      setActionFeedback({ type: "success", message: `Voucher ${data.expenseNumber} has been voided.` });
      fetchFinanceData();
    } catch (err: unknown) {
      setActionFeedback({ type: "error", message: err instanceof Error ? err.message : "Failed to void expense." });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="py-12">
        <LoadingState message="Loading financial ledger, invoices, and operational expenses..." />
      </div>
    );
  }

  if (error || !summary) {
    const isRestricted = error === "ACCESS_RESTRICTED" || error?.toLowerCase().includes("restricted");
    return (
      <div className="py-12 max-w-xl mx-auto">
        <ErrorState
          title={isRestricted ? "Access Restricted" : "Finance Hub Unavailable"}
          message={
            isRestricted
              ? "School financial operations, fee structures, and the payment ledger are restricted to Super Administrators."
              : error || "Could not retrieve financial ledger."
          }
          actionLabel={isRestricted ? "Return to Operations Dashboard" : "Retry"}
          onAction={
            isRestricted
              ? () => {
                  window.location.href = "/admin";
                }
              : fetchFinanceData
          }
        />
      </div>
    );
  }

  const totalExpensesKobo = BigInt(summary.totalExpensesKobo || "0");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financial Ledger & Operations"
        description="Authoritative billing records, verified bank credits, official receipts, and procurement vouchers."
        breadcrumbs={[
          { label: "Dashboard", href: "/admin" },
          { label: "Finance" },
        ]}
        actions={
          <Button variant="outline" size="md" onClick={fetchFinanceData}>
            Refresh Ledger
          </Button>
        }
      />

      {actionFeedback && (
        <Alert
          variant={actionFeedback.type === "success" ? "success" : "danger"}
          onClose={() => setActionFeedback(null)}
        >
          {actionFeedback.message}
        </Alert>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border border-[#EADBDA]/80 border-l-4 border-l-[#800020] bg-white shadow-xs">
          <CardHeader className="pb-2">
            <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Total Invoiced (Term)</span>
            <CardTitle className="text-xl sm:text-2xl font-extrabold text-[#5B0612] mt-1">
              {formatNaira(BigInt(summary.totalInvoicedKobo))}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-stone-500">
              {summary.activeTerm?.name || "Current Term"} ({summary.activeSession?.name || "Session"})
            </p>
          </CardContent>
        </Card>

        <Card className="border border-emerald-200 border-l-4 border-l-emerald-600 bg-white shadow-xs">
          <CardHeader className="pb-2">
            <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Total Collected</span>
            <CardTitle className="text-xl sm:text-2xl font-extrabold text-emerald-900 mt-1">
              {formatNaira(BigInt(summary.totalCollectedKobo))}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-stone-500">Confirmed receipts &amp; verified payments</p>
          </CardContent>
        </Card>

        <Card className="border border-amber-200 border-l-4 border-l-amber-500 bg-white shadow-xs">
          <CardHeader className="pb-2">
            <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">Outstanding Balance</span>
            <CardTitle className="text-xl sm:text-2xl font-extrabold text-amber-900 mt-1">
              {formatNaira(BigInt(summary.totalOutstandingKobo))}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-stone-500">Unpaid school fees across enrolled students</p>
          </CardContent>
        </Card>

        <Card className="border border-rose-200 border-l-4 border-l-rose-600 bg-white shadow-xs">
          <CardHeader className="pb-2">
            <span className="text-xs font-bold text-rose-800 uppercase tracking-wider">Operational Expenses</span>
            <CardTitle className="text-xl sm:text-2xl font-extrabold text-rose-900 mt-1">
              {formatNaira(totalExpensesKobo)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-stone-500">{summary.expenseCount || expenses.length} recorded vouchers</p>
          </CardContent>
        </Card>
      </div>

      {/* Navigation Tabs */}
      <Tabs
        tabs={[
          { id: "invoices", label: `Fees / Invoices (${invoices.length})` },
          {
            id: "outstanding",
            label: `Outstanding Fees (${
              outstandingData
                ? outstandingData.counts.noPayment + outstandingData.counts.partialPayment
                : 0
            })`,
          },
          { id: "payments", label: `Payments & Receipts (${payments.length})` },
          { id: "expenses", label: `Expenses & Procurement (${expenses.length})` },
        ]}
        activeTab={activeTab}
        onChange={(tabId) =>
          setActiveTab(tabId as "invoices" | "outstanding" | "payments" | "expenses")
        }
      />

      {/* Invoices Tab */}
      {activeTab === "invoices" && (
        invoices.length === 0 ? (
          <EmptyState
            title="No Invoices Issued"
            description="No term fee invoices have been generated for enrolled students yet. Invoices will automatically appear once billing runs are executed for the active session."
            actionLabel="Refresh Ledger"
            onAction={fetchFinanceData}
          />
        ) : (
          <div>
            {/* Desktop Semantic Table View (>= 768px) */}
            <div className="hidden md:block">
              <TableWrapper className="border border-[#EADBDA]/80">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell className="w-14 text-center font-semibold text-stone-700">S/N</TableHeaderCell>
                      <TableHeaderCell className="w-40 text-left font-semibold text-stone-700">Invoice Number</TableHeaderCell>
                      <TableHeaderCell className="min-w-[180px] text-left font-semibold text-stone-700">Student</TableHeaderCell>
                      <TableHeaderCell className="min-w-[160px] text-left font-semibold text-stone-700">Guardian</TableHeaderCell>
                      <TableHeaderCell className="w-36 text-left font-semibold text-stone-700">Programme</TableHeaderCell>
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
                        <TableCell className="w-40 font-mono text-xs font-bold text-stone-900">
                          {inv.invoiceNumber}
                        </TableCell>
                        <TableCell className="min-w-[180px] font-bold text-stone-900 break-words">
                          {inv.student.firstName} {inv.student.lastName}
                        </TableCell>
                        <TableCell className="min-w-[160px] text-xs text-stone-600 break-words">
                          {inv.guardian.firstName} {inv.guardian.lastName}
                        </TableCell>
                        <TableCell className="w-36 text-xs text-stone-600">
                          {inv.programme.name}
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
                            {inv.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableWrapper>
            </div>

            {/* Mobile Responsive Cards (< 768px) */}
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
                      {inv.student.firstName} {inv.student.lastName}
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
                      {inv.status}
                    </Badge>
                  }
                  fields={[
                    { label: "Total Fee", value: formatNaira(BigInt(inv.totalAmountKobo)) },
                    { label: "Paid", value: formatNaira(BigInt(inv.amountPaidKobo)) },
                    { label: "Balance", value: formatNaira(BigInt(inv.outstandingBalanceKobo)) },
                    { label: "Guardian", value: `${inv.guardian.firstName} ${inv.guardian.lastName}` },
                  ]}
                />
              ))}
            </div>
          </div>
        )
      )}

      {/* Outstanding Fees Tab */}
      {activeTab === "outstanding" && (
        <div className="space-y-6">
          {/* Outstanding Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card
              className={`border border-amber-200 border-l-4 border-l-amber-600 bg-white shadow-xs cursor-pointer transition-all ${
                outstandingFilter === "ALL" ? "ring-2 ring-amber-500" : ""
              }`}
              onClick={() => setOutstandingFilter("ALL")}
            >
              <CardHeader className="pb-2">
                <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">
                  All Outstanding
                </span>
                <CardTitle className="text-xl sm:text-2xl font-extrabold text-amber-900 mt-1 break-words">
                  {outstandingData?.totals.totalOutstandingFormatted || "₦0"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-stone-500">
                  {outstandingData
                    ? outstandingData.counts.noPayment + outstandingData.counts.partialPayment
                    : 0}{" "}
                  students with unpaid balances
                </p>
              </CardContent>
            </Card>

            <Card
              className={`border border-rose-200 border-l-4 border-l-rose-600 bg-white shadow-xs cursor-pointer transition-all ${
                outstandingFilter === "NO_PAYMENT" ? "ring-2 ring-rose-500" : ""
              }`}
              onClick={() => setOutstandingFilter("NO_PAYMENT")}
            >
              <CardHeader className="pb-2">
                <span className="text-xs font-bold text-rose-800 uppercase tracking-wider">
                  No Payment Recorded
                </span>
                <CardTitle className="text-xl sm:text-2xl font-extrabold text-rose-900 mt-1 break-words">
                  {outstandingData?.counts.noPayment || 0} Students
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-stone-500">Zero fee payments made for active term</p>
              </CardContent>
            </Card>

            <Card
              className={`border border-sky-200 border-l-4 border-l-sky-600 bg-white shadow-xs cursor-pointer transition-all ${
                outstandingFilter === "PARTIAL_PAYMENT" ? "ring-2 ring-sky-500" : ""
              }`}
              onClick={() => setOutstandingFilter("PARTIAL_PAYMENT")}
            >
              <CardHeader className="pb-2">
                <span className="text-xs font-bold text-sky-800 uppercase tracking-wider">
                  Partial Payment
                </span>
                <CardTitle className="text-xl sm:text-2xl font-extrabold text-sky-900 mt-1 break-words">
                  {outstandingData?.counts.partialPayment || 0} Students
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-stone-500">Partially paid with remaining balance</p>
              </CardContent>
            </Card>

            <Card
              className={`border border-emerald-200 border-l-4 border-l-emerald-600 bg-white shadow-xs cursor-pointer transition-all ${
                outstandingFilter === "FULLY_PAID" ? "ring-2 ring-emerald-500" : ""
              }`}
              onClick={() => setOutstandingFilter("FULLY_PAID")}
            >
              <CardHeader className="pb-2">
                <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                  Fully Paid
                </span>
                <CardTitle className="text-xl sm:text-2xl font-extrabold text-emerald-900 mt-1 break-words">
                  {outstandingData?.counts.fullyPaid || 0} Students
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-stone-500">All fees completely settled (₦0 balance)</p>
              </CardContent>
            </Card>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-stone-50/80 rounded-xl border border-stone-200">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
              <span className="text-xs font-bold text-stone-500 uppercase shrink-0">Filter:</span>
              <button
                type="button"
                onClick={() => setOutstandingFilter("ALL")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shrink-0 ${
                  outstandingFilter === "ALL"
                    ? "bg-[#800020] text-white"
                    : "bg-white text-stone-700 border border-stone-300 hover:bg-stone-100"
                }`}
              >
                All Outstanding (
                {outstandingData
                  ? outstandingData.counts.noPayment + outstandingData.counts.partialPayment
                  : 0}
                )
              </button>
              <button
                type="button"
                onClick={() => setOutstandingFilter("NO_PAYMENT")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shrink-0 ${
                  outstandingFilter === "NO_PAYMENT"
                    ? "bg-rose-700 text-white"
                    : "bg-white text-stone-700 border border-stone-300 hover:bg-stone-100"
                }`}
              >
                No Payment ({outstandingData?.counts.noPayment || 0})
              </button>
              <button
                type="button"
                onClick={() => setOutstandingFilter("PARTIAL_PAYMENT")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shrink-0 ${
                  outstandingFilter === "PARTIAL_PAYMENT"
                    ? "bg-sky-700 text-white"
                    : "bg-white text-stone-700 border border-stone-300 hover:bg-stone-100"
                }`}
              >
                Partial ({outstandingData?.counts.partialPayment || 0})
              </button>
              <button
                type="button"
                onClick={() => setOutstandingFilter("FULLY_PAID")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shrink-0 ${
                  outstandingFilter === "FULLY_PAID"
                    ? "bg-emerald-700 text-white"
                    : "bg-white text-stone-700 border border-stone-300 hover:bg-stone-100"
                }`}
              >
                Fully Paid ({outstandingData?.counts.fullyPaid || 0})
              </button>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="primary"
                size="md"
                onClick={() => setIsImmediateReminderOpen(true)}
                className="bg-[#800020] hover:bg-[#5B0612] text-white font-bold"
              >
                Send Reminders Now
              </Button>
              <Button
                variant="outline"
                size="md"
                onClick={() => setIsScheduleReminderOpen(true)}
                className="border-[#800020] text-[#800020] hover:bg-[#800020]/10 font-bold"
              >
                Schedule Reminder
              </Button>
            </div>
          </div>

          {/* Student Fee Records */}
          {(() => {
            const records = (outstandingData?.records || []).filter((r) => {
              if (outstandingFilter === "ALL") return r.category !== "FULLY_PAID";
              return r.category === outstandingFilter;
            });

            if (records.length === 0) {
              return (
                <EmptyState
                  title="No records yet."
                  description="No student records match the selected fee category for the active academic session."
                  actionLabel="Refresh Ledger"
                  onAction={fetchFinanceData}
                />
              );
            }

            return (
              <div>
                {/* Desktop Table View */}
                <div className="hidden md:block">
                  <TableWrapper className="border border-[#EADBDA]/80">
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableHeaderCell className="w-14 text-center font-semibold text-stone-700">
                            S/N
                          </TableHeaderCell>
                          <TableHeaderCell className="w-36 text-left font-semibold text-stone-700">
                            Invoice Number
                          </TableHeaderCell>
                          <TableHeaderCell className="min-w-[180px] text-left font-semibold text-stone-700">
                            Student
                          </TableHeaderCell>
                          <TableHeaderCell className="min-w-[160px] text-left font-semibold text-stone-700">
                            Guardian
                          </TableHeaderCell>
                          <TableHeaderCell className="w-32 text-left font-semibold text-stone-700">
                            Class
                          </TableHeaderCell>
                          <TableHeaderCell className="w-32 text-left font-semibold text-stone-700">
                            Total Fee
                          </TableHeaderCell>
                          <TableHeaderCell className="w-32 text-left font-semibold text-stone-700">
                            Amount Paid
                          </TableHeaderCell>
                          <TableHeaderCell className="w-36 text-left font-semibold text-stone-700">
                            Outstanding Balance
                          </TableHeaderCell>
                          <TableHeaderCell className="w-28 text-right font-semibold text-stone-700">
                            Category
                          </TableHeaderCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {records.map((r, index) => (
                          <TableRow key={r.invoiceId}>
                            <TableCell className="w-14 text-center text-xs font-semibold text-stone-500">
                              {index + 1}
                            </TableCell>
                            <TableCell className="w-36 font-mono text-xs font-bold text-stone-900">
                              {r.invoiceNumber}
                            </TableCell>
                            <TableCell className="min-w-[180px] font-bold text-stone-900">
                              <div>{r.studentName}</div>
                              {r.admissionNumber && (
                                <div className="text-[11px] text-stone-500 font-mono">
                                  {r.admissionNumber}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="min-w-[160px] text-xs text-stone-600">
                              <div className="font-semibold text-stone-800">{r.guardianName}</div>
                              {r.guardianEmail && (
                                <div className="text-[11px] text-stone-500">{r.guardianEmail}</div>
                              )}
                              {r.guardianPhone && (
                                <div className="text-[11px] text-stone-500">{r.guardianPhone}</div>
                              )}
                            </TableCell>
                            <TableCell className="w-32 text-xs text-stone-600">
                              {r.className}
                            </TableCell>
                            <TableCell className="w-32 text-xs font-bold text-stone-900">
                              {r.totalAmountFormatted}
                            </TableCell>
                            <TableCell className="w-32 text-xs font-bold text-emerald-800">
                              {r.amountPaidFormatted}
                            </TableCell>
                            <TableCell className="w-36 text-xs font-extrabold text-amber-900">
                              {r.outstandingBalanceFormatted}
                            </TableCell>
                            <TableCell className="w-28 text-right">
                              <Badge
                                variant={
                                  r.category === "FULLY_PAID"
                                    ? "success"
                                    : r.category === "PARTIAL_PAYMENT"
                                    ? "warning"
                                    : "danger"
                                }
                                size="sm"
                              >
                                {r.category === "FULLY_PAID"
                                  ? "Fully Paid"
                                  : r.category === "PARTIAL_PAYMENT"
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

                {/* Mobile Responsive Cards */}
                <div className="block md:hidden space-y-3">
                  {records.map((r, index) => (
                    <TableMobileCard
                      key={r.invoiceId}
                      title={
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-stone-100 text-stone-700 text-xs font-bold shrink-0">
                            {index + 1}
                          </span>
                          <span className="font-mono text-xs font-bold text-stone-900">
                            {r.invoiceNumber}
                          </span>
                        </div>
                      }
                      subtitle={
                        <div className="text-sm font-bold text-stone-900 mt-1">
                          {r.studentName}
                        </div>
                      }
                      badge={
                        <Badge
                          variant={
                            r.category === "FULLY_PAID"
                              ? "success"
                              : r.category === "PARTIAL_PAYMENT"
                              ? "warning"
                              : "danger"
                          }
                          size="sm"
                        >
                          {r.category === "FULLY_PAID"
                            ? "Fully Paid"
                            : r.category === "PARTIAL_PAYMENT"
                            ? "Partial"
                            : "No Payment"}
                        </Badge>
                      }
                      fields={[
                        { label: "Guardian", value: r.guardianName },
                        { label: "Class", value: r.className },
                        { label: "Total Billed", value: r.totalAmountFormatted },
                        { label: "Amount Paid", value: r.amountPaidFormatted },
                        { label: "Outstanding Balance", value: r.outstandingBalanceFormatted },
                      ]}
                    />
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Scheduled Reminders Section */}
          <div className="pt-6 border-t border-stone-200 space-y-4">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-stone-900">
                Scheduled Payment Reminders
              </h3>
              <p className="text-xs text-stone-500 mt-0.5">
                Automated payment reminders managed independently by the production server. At the
                scheduled time, the server re-verifies live database payments and dispatches notices
                only to parents who still have an outstanding balance.
              </p>
            </div>

            {scheduledReminders.length === 0 ? (
              <div className="p-4 bg-white rounded-xl border border-stone-200 text-center text-xs text-stone-500">
                No payment reminders currently scheduled. Click &quot;Schedule Reminder&quot; above to automate future notices.
              </div>
            ) : (
              <div>
                {/* Desktop Table View */}
                <div className="hidden md:block">
                  <TableWrapper className="border border-[#EADBDA]/80">
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableHeaderCell className="w-14 text-center font-semibold text-stone-700">
                            S/N
                          </TableHeaderCell>
                          <TableHeaderCell className="min-w-[160px] text-left font-semibold text-stone-700">
                            Scheduled For
                          </TableHeaderCell>
                          <TableHeaderCell className="w-36 text-left font-semibold text-stone-700">
                            Target Group
                          </TableHeaderCell>
                          <TableHeaderCell className="w-32 text-left font-semibold text-stone-700">
                            Session &amp; Term
                          </TableHeaderCell>
                          <TableHeaderCell className="w-28 text-left font-semibold text-stone-700">
                            Status
                          </TableHeaderCell>
                          <TableHeaderCell className="w-28 text-left font-semibold text-stone-700">
                            Sent Count
                          </TableHeaderCell>
                          <TableHeaderCell className="w-24 text-right font-semibold text-stone-700">
                            Action
                          </TableHeaderCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {scheduledReminders.map((rem, index) => (
                          <TableRow key={rem.id}>
                            <TableCell className="w-14 text-center text-xs font-semibold text-stone-500">
                              {index + 1}
                            </TableCell>
                            <TableCell className="min-w-[160px] text-xs font-bold text-stone-900">
                              {new Date(rem.scheduledFor).toLocaleString("en-GB", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </TableCell>
                            <TableCell className="w-36 text-xs text-stone-700">
                              {rem.targetType === "NO_PAYMENT_ONLY"
                                ? "No Payment Only"
                                : rem.targetType === "PARTIAL_PAYMENT_ONLY"
                                ? "Partial Payment Only"
                                : "All Outstanding"}
                            </TableCell>
                            <TableCell className="w-32 text-xs text-stone-600">
                              {rem.academicTerm?.name || "Current Term"} (
                              {rem.academicSession?.name || "Active"})
                            </TableCell>
                            <TableCell className="w-28">
                              <Badge
                                variant={
                                  rem.status === "COMPLETED"
                                    ? "success"
                                    : rem.status === "PENDING"
                                    ? "warning"
                                    : rem.status === "PROCESSING"
                                    ? "info"
                                    : "neutral"
                                }
                                size="sm"
                              >
                                {rem.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="w-28 text-xs font-mono font-bold text-stone-700">
                              {rem.totalSent} / {rem.totalTargeted}
                            </TableCell>
                            <TableCell className="w-24 text-right">
                              {rem.status === "PENDING" ? (
                                <button
                                  type="button"
                                  onClick={() => handleCancelReminder(rem.id)}
                                  className="text-xs text-rose-700 hover:text-rose-900 font-bold underline"
                                >
                                  Cancel
                                </button>
                              ) : (
                                <span className="text-xs text-stone-400">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableWrapper>
                </div>

                {/* Mobile Cards */}
                <div className="block md:hidden space-y-3">
                  {scheduledReminders.map((rem, index) => (
                    <TableMobileCard
                      key={rem.id}
                      title={
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-stone-100 text-stone-700 text-xs font-bold shrink-0">
                            {index + 1}
                          </span>
                          <span className="text-xs font-bold text-stone-900">
                            {new Date(rem.scheduledFor).toLocaleString("en-GB", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      }
                      badge={
                        <Badge
                          variant={
                            rem.status === "COMPLETED"
                              ? "success"
                              : rem.status === "PENDING"
                              ? "warning"
                              : rem.status === "PROCESSING"
                              ? "info"
                              : "neutral"
                          }
                          size="sm"
                        >
                          {rem.status}
                        </Badge>
                      }
                      fields={[
                        {
                          label: "Target",
                          value:
                            rem.targetType === "NO_PAYMENT_ONLY"
                              ? "No Payment Only"
                              : rem.targetType === "PARTIAL_PAYMENT_ONLY"
                              ? "Partial Payment Only"
                              : "All Outstanding",
                        },
                        {
                          label: "Session & Term",
                          value: `${rem.academicTerm?.name || "Term"} (${rem.academicSession?.name || "Session"})`,
                        },
                        { label: "Sent / Targeted", value: `${rem.totalSent} / ${rem.totalTargeted}` },
                      ]}
                      actions={
                        rem.status === "PENDING" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCancelReminder(rem.id)}
                            className="text-rose-700 border-rose-300 hover:bg-rose-50 w-full"
                          >
                            Cancel Scheduled Reminder
                          </Button>
                        ) : undefined
                      }
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Payments Tab */}
      {activeTab === "payments" && (
        payments.length === 0 ? (
          <EmptyState
            title="No Payment Transactions Recorded"
            description="No bank deposit or direct portal payments have been logged for this period yet. Confirmed tuition payments and manual receipts will appear here."
            actionLabel="Refresh Ledger"
            onAction={fetchFinanceData}
          />
        ) : (
          <div>
            {/* Desktop Semantic Table View (>= 768px) */}
            <div className="hidden md:block">
              <TableWrapper className="border border-[#EADBDA]/80">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell className="w-14 text-center font-semibold text-stone-700">S/N</TableHeaderCell>
                      <TableHeaderCell className="w-40 text-left font-semibold text-stone-700">Payment Ref</TableHeaderCell>
                      <TableHeaderCell className="min-w-[180px] text-left font-semibold text-stone-700">Student</TableHeaderCell>
                      <TableHeaderCell className="min-w-[160px] text-left font-semibold text-stone-700">Payer</TableHeaderCell>
                      <TableHeaderCell className="w-32 text-left font-semibold text-stone-700">Amount</TableHeaderCell>
                      <TableHeaderCell className="w-28 text-left font-semibold text-stone-700">Method</TableHeaderCell>
                      <TableHeaderCell className="w-28 text-left font-semibold text-stone-700">Date</TableHeaderCell>
                      <TableHeaderCell className="w-28 text-left font-semibold text-stone-700">Status</TableHeaderCell>
                      <TableHeaderCell className="w-36 text-right font-semibold text-stone-700">Receipt</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {payments.map((p, index) => (
                      <TableRow key={p.id}>
                        <TableCell className="w-14 text-center text-xs font-semibold text-stone-500">
                          {index + 1}
                        </TableCell>
                        <TableCell className="w-40 font-mono text-xs font-bold text-stone-900">
                          {p.paymentReference}
                        </TableCell>
                        <TableCell className="min-w-[180px] font-bold text-stone-900 break-words">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{p.student.firstName} {p.student.lastName}</span>
                            {p.type === 'APPLICATION_FEE' && (
                              <Badge variant="info" size="sm">Admission Fee</Badge>
                            )}
                          </div>
                          {p.student.admissionNumber && (
                            <span className="text-[10px] font-mono text-stone-500 block">
                              {p.student.admissionNumber}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="min-w-[160px] text-xs text-stone-600 break-words">
                          {p.payerGuardian ? `${p.payerGuardian.firstName} ${p.payerGuardian.lastName}` : "Direct Deposit"}
                        </TableCell>
                        <TableCell className="w-32 text-xs font-bold text-emerald-800">
                          {formatNaira(BigInt(p.amountKobo))}
                        </TableCell>
                        <TableCell className="w-28 text-xs">
                          <Badge variant="neutral" size="sm">
                            {p.paymentMethod}
                          </Badge>
                        </TableCell>
                        <TableCell className="w-28 text-xs text-stone-500">
                          {new Date(p.paidAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="w-28">
                          <Badge variant={p.status === "CONFIRMED" ? "success" : "warning"} size="sm">
                            {p.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="w-36 text-right">
                          {p.receipt ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setSelectedReceipt(p)}
                              className="font-mono text-xs font-bold text-[#5B0612] bg-[#FAF2F4] hover:bg-[#F4E4E7] whitespace-nowrap min-h-[36px]"
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
              </TableWrapper>
            </div>

            {/* Mobile Responsive Cards (< 768px) */}
            <div className="block md:hidden space-y-3">
              {payments.map((p, index) => (
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
                    <div>
                      <div className="text-sm font-bold text-stone-900 mt-1 flex items-center gap-1.5 flex-wrap">
                        <span>{p.student.firstName} {p.student.lastName}</span>
                        {p.type === 'APPLICATION_FEE' && (
                          <Badge variant="info" size="sm">Admission Fee</Badge>
                        )}
                      </div>
                      {p.student.admissionNumber && (
                        <span className="text-[11px] font-mono text-stone-500 block">
                          {p.student.admissionNumber}
                        </span>
                      )}
                    </div>
                  }
                  badge={
                    <Badge variant={p.status === "CONFIRMED" ? "success" : "warning"} size="sm">
                      {p.status}
                    </Badge>
                  }
                  fields={[
                    { label: "Amount", value: formatNaira(BigInt(p.amountKobo)) },
                    { label: "Method", value: p.paymentMethod },
                    { label: "Date", value: new Date(p.paidAt).toLocaleDateString() },
                    {
                      label: "Payer",
                      value: p.payerGuardian ? `${p.payerGuardian.firstName} ${p.payerGuardian.lastName}` : "Direct",
                    },
                  ]}
                  actions={
                    p.receipt ? (
                      <Button
                        variant="secondary"
                        size="md"
                        onClick={() => setSelectedReceipt(p)}
                        className="w-full font-mono text-xs font-bold text-[#5B0612] bg-[#FAF2F4] hover:bg-[#F4E4E7] min-h-[44px]"
                      >
                        View Receipt ({p.receipt.receiptNumber})
                      </Button>
                    ) : undefined
                  }
                />
              ))}
            </div>
          </div>
        )
      )}

      {/* Expenses & Procurement Tab */}
      {activeTab === "expenses" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white p-4 rounded-xl border border-[#EADBDA]/80">
            <div>
              <h3 className="text-sm font-bold text-stone-900">Operational Expenses &amp; Vendor Procurement</h3>
              <p className="text-xs text-stone-500">Track and audit supplier purchases, utility bills, and payroll vouchers.</p>
            </div>
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsAddCategoryOpen(true)}
                className="min-h-[40px]"
              >
                + New Category
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsRecordExpenseOpen(true)}
                className="min-h-[40px] bg-[#800020] hover:bg-[#5B0612] text-white"
              >
                + Record Expense / Purchase
              </Button>
            </div>
          </div>

          {expenses.length === 0 ? (
            <EmptyState
              title="No Operational Expenses Recorded"
              description="No expenditure vouchers or vendor procurement records have been entered for this period. Use the button above to record your first operational expense."
              actionLabel="Record Expense"
              onAction={() => setIsRecordExpenseOpen(true)}
            />
          ) : (
            <div>
              {/* Desktop Semantic Table View (>= 768px) */}
              <div className="hidden md:block">
                <TableWrapper className="border border-[#EADBDA]/80">
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell className="w-14 text-center font-semibold text-stone-700">S/N</TableHeaderCell>
                        <TableHeaderCell className="w-36 text-left font-semibold text-stone-700">Voucher No.</TableHeaderCell>
                        <TableHeaderCell className="min-w-[180px] text-left font-semibold text-stone-700">Expense Title</TableHeaderCell>
                        <TableHeaderCell className="w-36 text-left font-semibold text-stone-700">Category</TableHeaderCell>
                        <TableHeaderCell className="min-w-[160px] text-left font-semibold text-stone-700">Payee / Supplier</TableHeaderCell>
                        <TableHeaderCell className="w-32 text-left font-semibold text-stone-700">Amount</TableHeaderCell>
                        <TableHeaderCell className="w-28 text-left font-semibold text-stone-700">Method</TableHeaderCell>
                        <TableHeaderCell className="w-28 text-left font-semibold text-stone-700">Date</TableHeaderCell>
                        <TableHeaderCell className="w-28 text-left font-semibold text-stone-700">Status</TableHeaderCell>
                        <TableHeaderCell className="w-24 text-right font-semibold text-stone-700">Action</TableHeaderCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {expenses.map((exp, index) => (
                        <TableRow key={exp.id}>
                          <TableCell className="w-14 text-center text-xs font-semibold text-stone-500">
                            {index + 1}
                          </TableCell>
                          <TableCell className="w-36 font-mono text-xs font-bold text-stone-900">
                            {exp.expenseNumber}
                          </TableCell>
                          <TableCell className="min-w-[180px] font-bold text-stone-900 break-words">
                            <div>{exp.title}</div>
                            {exp.description && exp.description !== exp.title && (
                              <div className="text-[11px] text-stone-500 font-normal line-clamp-1">{exp.description}</div>
                            )}
                          </TableCell>
                          <TableCell className="w-36 text-xs text-stone-600">
                            <Badge variant="neutral" size="sm">
                              {exp.category?.name || "General"}
                            </Badge>
                          </TableCell>
                          <TableCell className="min-w-[160px] text-xs font-medium text-stone-800 break-words">
                            {exp.payeeName}
                          </TableCell>
                          <TableCell className="w-32 text-xs font-bold text-rose-900">
                            {formatNaira(BigInt(exp.amountKobo))}
                          </TableCell>
                          <TableCell className="w-28 text-xs text-stone-600">
                            {exp.paymentMethod}
                          </TableCell>
                          <TableCell className="w-28 text-xs text-stone-500">
                            {new Date(exp.expenseDate).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="w-28">
                            <Badge
                              variant={exp.status === "RECORDED" ? "success" : "danger"}
                              size="sm"
                            >
                              {exp.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="w-24 text-right">
                            {exp.status === "RECORDED" ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedExpenseForVoid(exp)}
                                className="text-rose-700 border-rose-300 hover:bg-rose-50 text-xs py-1 px-2.5 min-h-[32px]"
                              >
                                Void
                              </Button>
                            ) : (
                              <span className="text-xs text-stone-400">Voided</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableWrapper>
              </div>

              {/* Mobile Responsive Cards (< 768px) */}
              <div className="block md:hidden space-y-3">
                {expenses.map((exp, index) => (
                  <TableMobileCard
                    key={exp.id}
                    title={
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-stone-100 text-stone-700 text-xs font-bold shrink-0">
                          {index + 1}
                        </span>
                        <span className="font-mono text-xs font-bold text-stone-900">
                          {exp.expenseNumber}
                        </span>
                      </div>
                    }
                    subtitle={
                      <div className="text-sm font-bold text-stone-900 mt-1">
                        {exp.title}
                      </div>
                    }
                    badge={
                      <Badge
                        variant={exp.status === "RECORDED" ? "success" : "danger"}
                        size="sm"
                      >
                        {exp.status}
                      </Badge>
                    }
                    fields={[
                      { label: "Amount", value: formatNaira(BigInt(exp.amountKobo)) },
                      { label: "Payee / Supplier", value: exp.payeeName },
                      { label: "Category", value: exp.category?.name || "General" },
                      { label: "Method", value: exp.paymentMethod },
                      { label: "Date", value: new Date(exp.expenseDate).toLocaleDateString() },
                    ]}
                    actions={
                      exp.status === "RECORDED" ? (
                        <Button
                          variant="outline"
                          size="md"
                          onClick={() => setSelectedExpenseForVoid(exp)}
                          className="w-full text-rose-700 border-rose-300 hover:bg-rose-50 min-h-[44px]"
                        >
                          Void Voucher ({exp.expenseNumber})
                        </Button>
                      ) : undefined
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Official Receipt Modal */}
      {selectedReceipt && selectedReceipt.receipt && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedReceipt(null)}
          title="Official School Receipt"
        >
          <div className="space-y-4 pt-2">
            <div className="p-4 bg-[#FAF7F2] rounded-xl border border-[#EADBDA] text-center space-y-1">
              <span className="text-[11px] font-bold text-[#800020] uppercase tracking-wider">Swanford Academy</span>
              <p className="text-xl font-extrabold text-stone-900">{selectedReceipt.receipt.receiptNumber}</p>
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

      {/* Record Expense Modal */}
      {isRecordExpenseOpen && (
        <Modal
          isOpen={true}
          onClose={() => !isSubmitting && setIsRecordExpenseOpen(false)}
          title="Record Operational Expense / Procurement"
        >
          <form onSubmit={handleRecordExpenseSubmit} className="space-y-4 pt-2">
            <FormGroup label="Expense Title" required>
              <Input
                placeholder="e.g. Generator Diesel Fuel 500L"
                value={expenseForm.title}
                onChange={(e) => setExpenseForm({ ...expenseForm, title: e.target.value })}
                required
              />
            </FormGroup>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormGroup label="Category" required>
                <Select
                  value={expenseForm.categoryId}
                  onChange={(e) => setExpenseForm({ ...expenseForm, categoryId: e.target.value })}
                  options={categories.map((c) => ({ value: c.id, label: c.name }))}
                  required
                />
              </FormGroup>

              <FormGroup label="Payee / Supplier / Vendor" required>
                <Input
                  placeholder="e.g. TotalEnergies Dutse"
                  value={expenseForm.payeeName}
                  onChange={(e) => setExpenseForm({ ...expenseForm, payeeName: e.target.value })}
                  required
                />
              </FormGroup>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormGroup label="Amount (₦)" required>
                <Input
                  placeholder="e.g. 150,000"
                  value={expenseForm.amountNaira}
                  onChange={(e) => setExpenseForm({ ...expenseForm, amountNaira: e.target.value })}
                  required
                />
              </FormGroup>

              <FormGroup label="Payment Method" required>
                <Select
                  value={expenseForm.paymentMethod}
                  onChange={(e) => setExpenseForm({ ...expenseForm, paymentMethod: e.target.value })}
                  options={[
                    { value: "BANK_TRANSFER", label: "Bank Transfer" },
                    { value: "CASH", label: "Cash" },
                    { value: "POS", label: "POS Card Payment" },
                    { value: "CHEQUE", label: "Bank Cheque" },
                  ]}
                  required
                />
              </FormGroup>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormGroup label="Expense Date" required>
                <Input
                  type="date"
                  value={expenseForm.expenseDate}
                  onChange={(e) => setExpenseForm({ ...expenseForm, expenseDate: e.target.value })}
                  required
                />
              </FormGroup>

              <FormGroup label="Receipt / Voucher Reference (Optional)">
                <Input
                  placeholder="e.g. INV-VENDOR-2026-99"
                  value={expenseForm.receiptVoucherUrl}
                  onChange={(e) => setExpenseForm({ ...expenseForm, receiptVoucherUrl: e.target.value })}
                />
              </FormGroup>
            </div>

            <FormGroup label="Description &amp; Procurement Details">
              <Textarea
                placeholder="Itemized items, approval notes, or requisition details..."
                value={expenseForm.description}
                onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                rows={3}
              />
            </FormGroup>

            <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
              <Button
                variant="outline"
                type="button"
                onClick={() => setIsRecordExpenseOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                disabled={isSubmitting}
                className="bg-[#800020] hover:bg-[#5B0612] text-white"
              >
                {isSubmitting ? "Recording..." : "Record Expense Voucher"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Add Category Modal */}
      {isAddCategoryOpen && (
        <Modal
          isOpen={true}
          onClose={() => !isSubmitting && setIsAddCategoryOpen(false)}
          title="Create Expense Category"
        >
          <form onSubmit={handleAddCategorySubmit} className="space-y-4 pt-2">
            <FormGroup label="Category Code (Uppercase)" required>
              <Input
                placeholder="e.g. LABORATORY"
                value={categoryForm.code}
                onChange={(e) => setCategoryForm({ ...categoryForm, code: e.target.value.toUpperCase() })}
                required
              />
            </FormGroup>

            <FormGroup label="Category Name" required>
              <Input
                placeholder="e.g. Science Laboratory Supplies"
                value={categoryForm.name}
                onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                required
              />
            </FormGroup>

            <FormGroup label="Description (Optional)">
              <Input
                placeholder="Brief description of expenses under this category"
                value={categoryForm.description}
                onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
              />
            </FormGroup>

            <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
              <Button
                variant="outline"
                type="button"
                onClick={() => setIsAddCategoryOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                disabled={isSubmitting}
                className="bg-[#800020] hover:bg-[#5B0612] text-white"
              >
                {isSubmitting ? "Creating..." : "Save Category"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Void Expense Modal */}
      {selectedExpenseForVoid && (
        <Modal
          isOpen={true}
          onClose={() => !isSubmitting && setSelectedExpenseForVoid(null)}
          title="Void Expense Voucher"
        >
          <form onSubmit={handleVoidExpenseSubmit} className="space-y-4 pt-2">
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs space-y-1">
              <p className="font-bold text-rose-900">
                You are voiding voucher {selectedExpenseForVoid.expenseNumber}
              </p>
              <p className="text-rose-700">
                {selectedExpenseForVoid.title} ({formatNaira(BigInt(selectedExpenseForVoid.amountKobo))})
              </p>
              <p className="text-stone-500 pt-1">
                Voiding is permanent and will be logged in the immutable audit trail.
              </p>
            </div>

            <FormGroup label="Reason for Voiding" required>
              <Textarea
                placeholder="e.g. Duplicate entry, incorrect vendor amount, or cancelled purchase order..."
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                rows={3}
                required
              />
            </FormGroup>

            <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
              <Button
                variant="outline"
                type="button"
                onClick={() => setSelectedExpenseForVoid(null)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                type="submit"
                disabled={isSubmitting || !voidReason.trim()}
              >
                {isSubmitting ? "Voiding..." : "Confirm Void Voucher"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Immediate Payment Reminder Modal */}
      {isImmediateReminderOpen && (
        <Modal
          isOpen={true}
          onClose={() => !isSendingReminder && setIsImmediateReminderOpen(false)}
          title="Send Payment Reminders Now"
        >
          <div className="space-y-4 pt-2">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-1">
              <p className="font-bold text-amber-900">
                Notice to Parents with Outstanding Balances
              </p>
              <p className="text-amber-800 leading-relaxed">
                The school server will immediately verify real-time payment records and send
                reminders via parent portal notifications and email. Parents who have already
                fully paid are automatically excluded.
              </p>
            </div>

            <FormGroup label="Target Parent Group">
              <Select
                value={reminderTargetType}
                onChange={(e) =>
                  setReminderTargetType(
                    e.target.value as
                      | "ALL_OUTSTANDING"
                      | "NO_PAYMENT_ONLY"
                      | "PARTIAL_PAYMENT_ONLY"
                  )
                }
              >
                <option value="ALL_OUTSTANDING">
                  All Parents with Outstanding Fees (
                  {outstandingData
                    ? outstandingData.counts.noPayment + outstandingData.counts.partialPayment
                    : 0}{" "}
                  students)
                </option>
                <option value="NO_PAYMENT_ONLY">
                  No Payment Only ({outstandingData?.counts.noPayment || 0} students)
                </option>
                <option value="PARTIAL_PAYMENT_ONLY">
                  Partial Payment Only ({outstandingData?.counts.partialPayment || 0} students)
                </option>
              </Select>
            </FormGroup>

            <div className="space-y-3 pt-1">
              <p className="text-xs font-bold text-stone-700 uppercase tracking-wider">
                Message Preview (Polite School Tone):
              </p>
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs text-stone-700 space-y-2 font-sans">
                <div className="border-b border-stone-200 pb-2">
                  <span className="font-bold text-stone-900">1. For parents with No Payment:</span>
                  <p className="italic mt-1 text-stone-600">
                    &quot;Dear Parent/Guardian, This is a gentle payment reminder from Swanford Academy regarding outstanding school fees for [Student Name] ([Session] - [Term]). No payment has been recorded yet. The outstanding amount is [Amount]. Kindly make payment through the school portal or bank transfer. Thank you for your continued support.&quot;
                  </p>
                </div>
                <div>
                  <span className="font-bold text-stone-900">2. For parents with Partial Payment:</span>
                  <p className="italic mt-1 text-stone-600">
                    &quot;Dear Parent/Guardian, Thank you for your previous payment toward school fees for [Student Name] ([Session] - [Term]). We have received [Amount Paid]. The remaining balance is [Balance]. Kindly arrange payment of the outstanding balance. Thank you for partnering with us.&quot;
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
              <Button
                variant="outline"
                type="button"
                onClick={() => setIsImmediateReminderOpen(false)}
                disabled={isSendingReminder}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                type="button"
                onClick={handleSendRemindersNow}
                disabled={isSendingReminder}
                className="bg-[#800020] hover:bg-[#5B0612] text-white font-bold"
              >
                {isSendingReminder ? "Sending Reminders..." : "Send Reminders Now"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Schedule Payment Reminder Modal */}
      {isScheduleReminderOpen && (
        <Modal
          isOpen={true}
          onClose={() => !isSendingReminder && setIsScheduleReminderOpen(false)}
          title="Schedule Payment Reminder"
        >
          <form onSubmit={handleScheduleReminderSubmit} className="space-y-4 pt-2">
            <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl text-xs space-y-1">
              <p className="font-bold text-sky-900">
                Independent Server-Side Scheduled Processing
              </p>
              <p className="text-sky-800 leading-relaxed">
                This schedule will be processed by the deployed school server at the exact time
                specified, even if your computer or phone is offline and you are logged out.
                At that moment, the server will check real-time payments and exclude any parents
                who have already paid.
              </p>
            </div>

            <FormGroup label="Scheduled Date & Time" required>
              <Input
                type="datetime-local"
                value={scheduleDateTime}
                onChange={(e) => setScheduleDateTime(e.target.value)}
                min={minScheduleDateTime || undefined}
                required
              />
            </FormGroup>

            <FormGroup label="Target Parent Group">
              <Select
                value={reminderTargetType}
                onChange={(e) =>
                  setReminderTargetType(
                    e.target.value as
                      | "ALL_OUTSTANDING"
                      | "NO_PAYMENT_ONLY"
                      | "PARTIAL_PAYMENT_ONLY"
                  )
                }
              >
                <option value="ALL_OUTSTANDING">All Parents with Outstanding Fees</option>
                <option value="NO_PAYMENT_ONLY">No Payment Only</option>
                <option value="PARTIAL_PAYMENT_ONLY">Partial Payment Only</option>
              </Select>
            </FormGroup>

            <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
              <Button
                variant="outline"
                type="button"
                onClick={() => setIsScheduleReminderOpen(false)}
                disabled={isSendingReminder}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                disabled={isSendingReminder || !scheduleDateTime}
                className="bg-[#800020] hover:bg-[#5B0612] text-white font-bold"
              >
                {isSendingReminder ? "Saving Schedule..." : "Confirm Schedule"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

"use client";

import React, { useState, useEffect } from "react";
import { Baby, Calendar, Send, CheckCircle2, ShieldCheck, AlertCircle, RefreshCw, Clock } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Button,
  LoadingState,
  EmptyState,
  Table,
  TableHead,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
  TableWrapper,
  TableMobileCard,
  Input,
  Select,
  FormGroup,
  Alert,
} from "@/components";
import { formatNaira } from "@/lib/money";

interface SessionOption {
  id: string;
  name: string;
  isCurrent: boolean;
  terms?: Array<{ id: string; name: string; termCode: string; isCurrent: boolean }>;
}

interface CrecheInvoice {
  id: string;
  invoiceNumber: string;
  totalAmountKobo: string;
  amountPaidKobo: string;
  outstandingBalanceKobo: string;
  status: string;
  dueDate: string;
  billingMonth: number | null;
  billingPeriodName: string | null;
  isSpecialRate: boolean;
  student: { firstName: string; lastName: string; admissionNumber: string | null };
  guardian: { firstName: string; lastName: string; phonePrimary: string };
  programme: { name: string };
  academicTerm: { name: string };
}

const MONTHS = [
  { value: 1, name: "January" },
  { value: 2, name: "February" },
  { value: 3, name: "March" },
  { value: 4, name: "April" },
  { value: 5, name: "May" },
  { value: 6, name: "June" },
  { value: 7, name: "July" },
  { value: 8, name: "August" },
  { value: 9, name: "September" },
  { value: 10, name: "October" },
  { value: 11, name: "November" },
  { value: 12, name: "December" },
];

export function CrecheBillingManagement() {
  const currentMonthNum = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();

  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<SessionOption[]>([]);
  const [crecheProgrammeId, setCrecheProgrammeId] = useState<string>("");
  const [invoices, setInvoices] = useState<CrecheInvoice[]>([]);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Billing form state
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [selectedTermId, setSelectedTermId] = useState("");
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonthNum);
  const [dueDate, setDueDate] = useState<string>(
    new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  );
  const [isGenerating, setIsGenerating] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [sessRes, progRes, invRes] = await Promise.all([
        fetch("/api/admin/academic/sessions"),
        fetch("/api/admin/programmes"),
        fetch("/api/admin/finance/invoices"),
      ]);

      let cProgId = "";
      if (progRes.ok) {
        const progData = await progRes.json();
        const progList = Array.isArray(progData) ? progData : (progData.items || progData.programmes || []);
        const creche = progList.find((p: any) => p.code === "CRECHE" || p.name.toLowerCase().includes("creche"));
        if (creche) {
          cProgId = creche.id;
          setCrecheProgrammeId(creche.id);
        }
      }

      if (sessRes.ok) {
        const sData = await sessRes.json();
        const sessList = Array.isArray(sData) ? sData : sData.sessions || [];
        setSessions(sessList);
        const currentSess = sessList.find((s: SessionOption) => s.isCurrent) || sessList[0];
        if (currentSess) {
          setSelectedSessionId(currentSess.id);
          const currentTerm = currentSess.terms?.find((t: any) => t.isCurrent) || currentSess.terms?.[0];
          if (currentTerm) {
            setSelectedTermId(currentTerm.id);
          }
        }
      }

      if (invRes.ok) {
        const invData = await invRes.json();
        const allInvoices = Array.isArray(invData) ? invData : [];
        // Filter creche invoices (either programme code CRECHE or billingMonth > 0)
        const crecheInvs = allInvoices.filter(
          (inv: any) =>
            (cProgId && inv.programmeId === cProgId) ||
            inv.programme?.name?.toLowerCase().includes("creche") ||
            (inv.billingMonth !== undefined && inv.billingMonth > 0)
        );
        setInvoices(crecheInvs);
      }
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to load Creche billing records.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const currentSession = sessions.find((s) => s.id === selectedSessionId);
  const currentTerms = currentSession?.terms || [];

  const handleGenerateCrecheBilling = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSessionId || !selectedTermId) {
      setFeedback({ type: "error", message: "Please select an active session and term." });
      return;
    }

    const monthObj = MONTHS.find((m) => m.value === Number(selectedMonth));
    const billingPeriodName = `${monthObj?.name || "Monthly"} ${currentYear}`;

    setIsGenerating(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/finance/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "CRECHE_MONTHLY",
          programmeId: crecheProgrammeId || undefined,
          academicSessionId: selectedSessionId,
          academicTermId: selectedTermId,
          billingMonth: Number(selectedMonth),
          billingPeriodName,
          dueDate: new Date(dueDate),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to generate Creche monthly invoices.");
      }

      setFeedback({
        type: "success",
        message: `${data.message || `Creche monthly invoices generated.`} (Period: ${billingPeriodName})`,
      });
      loadData();
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to generate Creche monthly invoices.",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const monthLabel = MONTHS.find((m) => m.value === Number(selectedMonth))?.name || "Selected Month";

  return (
    <div className="space-y-6">
      {/* Creche Header & Rate Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-2 bg-gradient-to-r from-rose-50 via-[#FAF7F2] to-amber-50/40 border border-[#EADBDA]/80">
          <CardContent className="p-5 flex flex-col justify-between h-full space-y-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-[#800020]/10 text-[#800020] rounded-lg">
                  <Baby className="w-5 h-5" />
                </span>
                <h3 className="text-lg font-bold text-stone-900">
                  Creche Monthly Care &amp; Tuition Billing
                </h3>
              </div>
              <p className="text-xs text-stone-600 mt-1.5 leading-relaxed">
                Creche operates on an ongoing monthly billing schedule of <strong>₦10,000 per month</strong> with clear monthly periods (e.g. "October 2026"). The server strictly enforces duplicate-billing prevention so clicking generate will never bill a child twice for the same month.
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs font-semibold text-stone-700 pt-2 border-t border-stone-200">
              <span className="flex items-center gap-1.5 text-emerald-800">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                Duplicate Invoicing Blocked
              </span>
              <span className="flex items-center gap-1.5 text-sky-800">
                <Calendar className="w-4 h-4 text-sky-600" />
                Itemized Monthly Statements
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Standard Fee Rate Highlight Card */}
        <Card className="bg-[#5B0612] text-white border-none shadow-md">
          <CardContent className="p-5 flex flex-col justify-between h-full space-y-3">
            <div className="space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-200 block">
                Standard Creche Rate
              </span>
              <div className="text-2xl sm:text-3xl font-black text-white">
                ₦10,000 <span className="text-xs font-normal text-amber-100">/ month</span>
              </div>
              <p className="text-[11px] text-stone-200 leading-tight">
                Includes daytime care, early development activities, and dedicated supervision.
              </p>
            </div>
            <div className="text-[11px] bg-white/10 rounded-lg p-2 text-stone-200">
              Approved grandfathered rates automatically override this amount when applicable.
            </div>
          </CardContent>
        </Card>
      </div>

      {feedback && (
        <Alert
          variant={feedback.type === "success" ? "success" : "danger"}
          onClose={() => setFeedback(null)}
        >
          {feedback.message}
        </Alert>
      )}

      {/* Monthly Generation Form */}
      <Card className="border border-stone-200">
        <CardHeader className="border-b border-stone-100 pb-3">
          <CardTitle className="text-sm font-bold text-stone-900 flex items-center gap-2">
            <Send className="w-4 h-4 text-[#800020]" />
            Generate Monthly Billing Run
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-5">
          <form onSubmit={handleGenerateCrecheBilling} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <FormGroup label="Academic Session" required>
                <Select
                  value={selectedSessionId}
                  onChange={(e) => setSelectedSessionId(e.target.value)}
                  required
                  className="text-xs"
                >
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.isCurrent ? "(Current)" : ""}
                    </option>
                  ))}
                </Select>
              </FormGroup>

              <FormGroup label="Operating Term" required>
                <Select
                  value={selectedTermId}
                  onChange={(e) => setSelectedTermId(e.target.value)}
                  required
                  className="text-xs"
                >
                  {currentTerms.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </FormGroup>

              <FormGroup label="Billing Month" required>
                <Select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  required
                  className="text-xs font-bold text-stone-900"
                >
                  {MONTHS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.name} ({currentYear})
                    </option>
                  ))}
                </Select>
              </FormGroup>

              <FormGroup label="Payment Due Date" required>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  required
                  className="text-xs"
                />
              </FormGroup>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-stone-100">
              <div className="text-xs text-stone-600">
                Generating invoices for: <strong className="text-stone-900">{monthLabel} {currentYear}</strong>
                <span className="text-stone-400 block text-[11px]">
                  Enrolled Creche students will receive a ₦10,000 monthly fee with due date {new Date(dueDate).toLocaleDateString()}.
                </span>
              </div>
              <Button
                variant="primary"
                type="submit"
                disabled={isGenerating}
                className="bg-[#800020] hover:bg-[#5B0612] text-white font-bold px-6 shrink-0 min-h-[44px]"
              >
                {isGenerating ? "Processing Billing Run..." : `Generate ${monthLabel} Invoices`}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Creche Issued Invoices Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-stone-900">
            Issued Creche Fee Records ({invoices.length})
          </h4>
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            className="text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Refresh List
          </Button>
        </div>

        {loading ? (
          <LoadingState message="Loading Creche invoices..." />
        ) : invoices.length === 0 ? (
          <EmptyState
            title="No Creche Invoices Issued"
            description="No monthly invoices have been issued for Creche students yet. Select a month above and click 'Generate Invoices' to issue the ₦10,000 monthly care fees."
            actionLabel="Generate Now"
            onAction={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          />
        ) : (
          <div>
            {/* Desktop Table */}
            <div className="hidden md:block">
              <TableWrapper className="border border-[#EADBDA]/80">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell className="w-12 text-center font-semibold text-stone-700">S/N</TableHeaderCell>
                      <TableHeaderCell className="w-36 text-left font-semibold text-stone-700">Invoice Number</TableHeaderCell>
                      <TableHeaderCell className="text-left font-semibold text-stone-700">Student</TableHeaderCell>
                      <TableHeaderCell className="w-32 text-left font-semibold text-stone-700">Billing Period</TableHeaderCell>
                      <TableHeaderCell className="w-28 text-left font-semibold text-stone-700">Total Fee</TableHeaderCell>
                      <TableHeaderCell className="w-28 text-left font-semibold text-stone-700">Paid</TableHeaderCell>
                      <TableHeaderCell className="w-28 text-left font-semibold text-stone-700">Balance</TableHeaderCell>
                      <TableHeaderCell className="w-24 text-center font-semibold text-stone-700">Status</TableHeaderCell>
                      <TableHeaderCell className="w-28 text-left font-semibold text-stone-700">Due Date</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {invoices.map((inv, index) => {
                      const bal = BigInt(inv.outstandingBalanceKobo || "0");
                      return (
                        <TableRow key={inv.id}>
                          <TableCell className="w-12 text-center text-xs font-semibold text-stone-500">
                            {index + 1}
                          </TableCell>
                          <TableCell className="w-36 font-mono text-xs font-bold text-stone-900">
                            {inv.invoiceNumber}
                          </TableCell>
                          <TableCell className="font-bold text-stone-900">
                            <div>
                              {inv.student?.firstName} {inv.student?.lastName}
                            </div>
                            {inv.student?.admissionNumber && (
                              <div className="text-[11px] font-mono text-stone-500">
                                {inv.student?.admissionNumber}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="w-32 text-xs font-semibold text-stone-800">
                            <div>{inv.billingPeriodName || inv.academicTerm?.name || "Monthly"}</div>
                            {inv.isSpecialRate && (
                              <Badge variant="brand" size="sm" className="mt-0.5 bg-amber-100 text-amber-900 border-amber-200">
                                Special Rate
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="w-28 text-xs font-bold text-stone-900">
                            {formatNaira(BigInt(inv.totalAmountKobo))}
                          </TableCell>
                          <TableCell className="w-28 text-xs font-bold text-emerald-800">
                            {formatNaira(BigInt(inv.amountPaidKobo))}
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
                              {inv.status === "PAID" ? "Paid" : inv.status === "PARTIALLY_PAID" ? "Partial" : "Awaiting"}
                            </Badge>
                          </TableCell>
                          <TableCell className="w-28 text-xs text-stone-500">
                            {new Date(inv.dueDate).toLocaleDateString()}
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
              {invoices.map((inv, index) => {
                const bal = BigInt(inv.outstandingBalanceKobo || "0");
                return (
                  <TableMobileCard
                    key={inv.id}
                    title={
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-stone-100 text-stone-700 text-xs font-bold shrink-0">
                          {index + 1}
                        </span>
                        <span className="text-sm font-bold text-stone-900">
                          {inv.student?.firstName} {inv.student?.lastName}
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
                        {inv.status}
                      </Badge>
                    }
                    fields={[
                      { label: "Billing Period", value: inv.billingPeriodName || "Monthly" },
                      { label: "Total Fee", value: formatNaira(BigInt(inv.totalAmountKobo)) },
                      { label: "Amount Paid", value: formatNaira(BigInt(inv.amountPaidKobo)) },
                      { label: "Balance", value: formatNaira(bal) },
                      { label: "Due Date", value: new Date(inv.dueDate).toLocaleDateString() },
                    ]}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Button,
  LoadingState,
  ErrorState,
  EmptyState,
  Table,
  TableHeader,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
  TableWrapper,
  StatCard,
} from "@/components";
import { formatNaira } from "@/lib/money";

interface AdminDashboardData {
  isSuperAdmin: boolean;
  overview: {
    activeStudents: number;
    guardians: number;
    teachers: number;
    pendingAdmissions: number;
    activeCycle: { id: string; name: string; code: string } | null;
    activeSession: { id: string; name: string; currentTerm: string | null } | null;
  };
  todayAttendance: {
    present: number;
    absent: number;
    late: number;
    excused: number;
  };
  finance: {
    totalInvoicedKobo: string;
    totalCollectedKobo: string;
    outstandingKobo: string;
  } | null;
  recentApplications: Array<{
    id: string;
    applicationNumber: string;
    applicantFirstName: string;
    applicantLastName: string;
    status: string;
    paymentStatus: string;
    createdAt: string;
    programmeSelections: Array<{
      programme: { name: string; code: string };
    }>;
  }>;
  recentPayments: Array<{
    id: string;
    paymentReference: string;
    receiptNumber: string | null;
    amountPaidKobo: string;
    paymentMethod: string;
    paidAt: string;
    invoice: {
      student: { firstName: string; lastName: string; admissionNumber: string | null };
      guardian: { firstName: string; lastName: string } | null;
    } | null;
    application?: {
      applicantFirstName: string;
      applicantLastName: string;
      applicationNumber: string;
      guardianFirstName: string;
      guardianLastName: string;
    } | null;
  }>;
  recentAuditLogs?: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    createdAt: string;
    user?: { email: string } | null;
  }>;
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = () => {
    setLoading(true);
    setError(null);
    fetch("/api/admin/dashboard")
      .then(async (res) => {
        if (res.status === 401) {
          window.location.href = "/auth/login?from=/admin";
          return;
        }
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Failed to load admin dashboard data.");
        }
        return res.json();
      })
      .then((json) => {
        if (json) {
          setData(json);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load dashboard.");
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  if (loading) {
    return (
      <div className="py-12">
        <LoadingState message="Loading administrative metrics and school status..." />
      </div>
    );
  }

  if (error || !data) {
    const isAuthRequired =
      error?.toLowerCase().includes("authentication") ||
      error?.toLowerCase().includes("sign in") ||
      error?.toLowerCase().includes("unauthorized");

    return (
      <div className="py-8 max-w-xl mx-auto">
        <ErrorState
          title={isAuthRequired ? "Administrator Sign-In Required" : "Operational Overview Unavailable"}
          message={
            isAuthRequired
              ? "You must be signed in with an authorized Administrator account to access school operations and student records."
              : error || "An error occurred while retrieving administrative records."
          }
          actionLabel={isAuthRequired ? "Sign In to Admin Portal" : "Retry Loading"}
          onAction={() => {
            if (isAuthRequired) {
              window.location.href = "/auth/login?from=/admin";
            } else {
              fetchDashboard();
            }
          }}
        />
      </div>
    );
  }

  const { overview, todayAttendance, finance, recentApplications, recentPayments, recentAuditLogs, isSuperAdmin } = data;
  const totalAttendanceRecorded =
    todayAttendance.present + todayAttendance.absent + todayAttendance.late + todayAttendance.excused;
  const attendanceRate =
    totalAttendanceRecorded > 0
      ? Math.round(((todayAttendance.present + todayAttendance.late) / totalAttendanceRecorded) * 100)
      : 0;

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header Banner: Matches Public Website Hero Maroon Palette */}
      <div className="relative rounded-2xl sm:rounded-3xl overflow-hidden bg-gradient-to-r from-[#3B030A] via-[#4D0610] to-[#250105] border border-[#6B1420] text-white shadow-xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        {/* Subtle radial dot texture matching hero */}
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#F5D061_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />

        <div className="relative z-10 space-y-2">
          {/* Official Tag Pill: Cream with Maroon text */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#F5EBDC] border border-[#DFCBB5] text-[#5B0612] text-xs font-extrabold tracking-wider uppercase font-heading shadow-xs">
            <span className="whitespace-nowrap">
              {isSuperAdmin ? "Director & Super Admin Dashboard" : "Operational Admin Dashboard"}
            </span>
            {overview.activeSession && (
              <>
                <span className="opacity-60">•</span>
                <span className="whitespace-nowrap text-[#800020] font-bold">
                  {overview.activeSession.name} ({overview.activeSession.currentTerm || "Term In Session"})
                </span>
              </>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-white font-heading" style={{ color: '#FFFFFF' }}>
            {isSuperAdmin ? "Swanford Academy Governance" : "Admin Operations Center"}
          </h1>
          <p className="text-sm text-stone-200 max-w-xl leading-relaxed">
            {isSuperAdmin
              ? "Comprehensive institutional oversight: enrollment, academics, financial revenue ledger, and audit history."
              : "Real-time school operations: admissions processing, daily attendance roll-call, and community coordination."}
          </p>
        </div>

        <div className="relative z-10 flex flex-wrap items-center gap-2.5 shrink-0">
          <Link href="/admin/admissions">
            <button
              type="button"
              className="min-h-[44px] px-5 py-2.5 rounded-xl font-sans font-bold text-sm whitespace-nowrap bg-[#F59E0B] hover:bg-[#D97706] text-stone-950 shadow-md hover:shadow-lg transition-all inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>Review Admissions</span>
              <span className="px-1.5 py-0.5 rounded-full bg-stone-950/20 text-xs font-extrabold">
                {overview.pendingAdmissions}
              </span>
            </button>
          </Link>
          <Link href="/admin/attendance">
            <button
              type="button"
              className="min-h-[44px] px-4 py-2.5 rounded-xl font-sans font-semibold text-sm whitespace-nowrap bg-white/10 hover:bg-white/20 active:bg-white/30 text-white border border-white/30 backdrop-blur-xs shadow-md hover:shadow-lg transition-all inline-flex items-center justify-center cursor-pointer select-none"
            >
              Attendance Records
            </button>
          </Link>
          {isSuperAdmin && (
            <Link href="/admin/finance">
              <button
                type="button"
                className="min-h-[44px] px-4 py-2.5 rounded-xl font-sans font-bold text-sm whitespace-nowrap bg-white hover:bg-[#FDFBF7] text-[#800020] border border-white shadow-md hover:shadow-lg transition-all inline-flex items-center justify-center cursor-pointer"
              >
                Finance Hub
              </button>
            </Link>
          )}
        </div>
      </div>

      {/* System Setup & Zero-Data State Card */}
      {(!overview.activeSession || overview.activeStudents === 0) && (
        <div className="p-5 sm:p-6 rounded-2xl bg-[#FAF2F4] border border-[#EADBDA] shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#800020] animate-pulse" />
              <span className="text-xs font-bold text-[#800020] uppercase tracking-wider">
                System Initial State &bull; Academic Setup Ready
              </span>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-[#5B0612] tracking-tight">
              Welcome to Swanford Academy Dashboard
            </h3>
            <p className="text-xs sm:text-sm text-stone-600 max-w-2xl leading-relaxed">
              The operational database is clean and ready. Establish your academic session calendar and activate admissions to begin registering pupils and receiving applications.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <Link href="/admin/academic">
              <Button variant="primary" size="md" className="bg-[#800020] hover:bg-[#6b001a] text-white font-bold">
                Create Academic Session
              </Button>
            </Link>
            <Link href="/admin/admissions">
              <Button variant="outline" size="md">
                Admissions Centre
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* 4 Stat Overview Grid: Multi-Color Animated StatCards with High Visibility & Large Digit Support */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <StatCard
          title="Active Students"
          value={overview.activeStudents.toLocaleString()}
          subtitle="Enrolled across Nursery, Primary & Tahfeez"
          icon={<span className="text-xl">🎓</span>}
          badge={<Badge variant="brand" size="sm" className="whitespace-nowrap">Active</Badge>}
          color="maroon"
          href="/admin/students"
        />

        <StatCard
          title="Registered Guardians"
          value={overview.guardians.toLocaleString()}
          subtitle="Verified primary parents and sponsors"
          icon={<span className="text-xl">👨‍👩‍👧</span>}
          badge={<Badge variant="success" size="sm" className="whitespace-nowrap">Verified</Badge>}
          color="emerald"
          href="/admin/guardians"
        />

        <StatCard
          title="Teaching Staff"
          value={overview.teachers.toLocaleString()}
          subtitle="Active instructors with class scopes"
          icon={<span className="text-xl">👩‍🏫</span>}
          badge={<Badge variant="neutral" size="sm" className="whitespace-nowrap">Faculty</Badge>}
          color="blue"
          href="/admin/teachers"
        />

        <StatCard
          title="Pending Admissions"
          value={overview.pendingAdmissions.toLocaleString()}
          subtitle="Applications awaiting operational review"
          icon={<span className="text-xl">📋</span>}
          badge={
            <Badge
              variant={overview.pendingAdmissions > 0 ? "warning" : "success"}
              size="sm"
              className="whitespace-nowrap"
            >
              {overview.pendingAdmissions > 0 ? "Needs Review" : "Clear"}
            </Badge>
          }
          color="amber"
          href="/admin/admissions"
        />
      </div>

      {/* MIDDLE SECTION: Attendance + Role-Specific Right Column */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Attendance Breakdown */}
        <Card className="shadow-xs hover:shadow-md transition-all duration-300">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base sm:text-lg font-bold text-stone-900">Today&apos;s Attendance</CardTitle>
              <p className="text-xs text-stone-500 mt-0.5">Recorded daily roll-call compliance</p>
            </div>
            <Badge variant={attendanceRate >= 80 ? "success" : "warning"} size="md" className="whitespace-nowrap shrink-0">
              {attendanceRate}% Present
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="p-3.5 bg-gradient-to-br from-white to-emerald-50/80 rounded-2xl border border-emerald-200/80 shadow-xs hover:shadow-md transition-all duration-300 hover:-translate-y-1 min-w-0">
                <span className="text-xs font-bold text-emerald-800 uppercase tracking-wide truncate block">Present</span>
                <p className="text-2xl font-extrabold text-emerald-950 mt-1 tabular-nums truncate">{todayAttendance.present}</p>
              </div>
              <div className="p-3.5 bg-gradient-to-br from-white to-amber-50/80 rounded-2xl border border-amber-200/80 shadow-xs hover:shadow-md transition-all duration-300 hover:-translate-y-1 min-w-0">
                <span className="text-xs font-bold text-amber-800 uppercase tracking-wide truncate block">Late</span>
                <p className="text-2xl font-extrabold text-amber-950 mt-1 tabular-nums truncate">{todayAttendance.late}</p>
              </div>
              <div className="p-3.5 bg-gradient-to-br from-white to-rose-50/80 rounded-2xl border border-rose-200/80 shadow-xs hover:shadow-md transition-all duration-300 hover:-translate-y-1 min-w-0">
                <span className="text-xs font-bold text-rose-800 uppercase tracking-wide truncate block">Absent</span>
                <p className="text-2xl font-extrabold text-rose-950 mt-1 tabular-nums truncate">{todayAttendance.absent}</p>
              </div>
              <div className="p-3.5 bg-gradient-to-br from-white to-blue-50/80 rounded-2xl border border-blue-200/80 shadow-xs hover:shadow-md transition-all duration-300 hover:-translate-y-1 min-w-0">
                <span className="text-xs font-bold text-blue-800 uppercase tracking-wide truncate block">Excused</span>
                <p className="text-2xl font-extrabold text-blue-950 mt-1 tabular-nums truncate">{todayAttendance.excused}</p>
              </div>
            </div>

            <div className="pt-2 flex justify-between items-center text-xs text-stone-500 border-t border-stone-100">
              <span className="truncate">Total roll-call entries: {totalAttendanceRecorded}</span>
              <Link href="/admin/attendance" className="text-[#5B0612] font-semibold hover:underline shrink-0 whitespace-nowrap">
                View Class Logs →
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* RIGHT COLUMN: Super Admin gets Finance Ledger; Standard Admin gets Academic Schedule */}
        {isSuperAdmin && finance ? (
          /* Super Admin: Term Finance Ledger */
          <Card className="shadow-xs hover:shadow-md transition-all duration-300">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base sm:text-lg font-bold text-stone-900">Term Finance Ledger</CardTitle>
                <p className="text-xs text-stone-500 mt-0.5">Authoritative invoice and collection reconciliation</p>
              </div>
              <Link href="/admin/finance">
                <Button variant="outline" size="sm" className="whitespace-nowrap shrink-0">
                  Finance Hub
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 bg-gradient-to-br from-white via-white to-stone-50/80 rounded-2xl border border-stone-200/90 shadow-xs hover:shadow-md transition-all duration-300 hover:-translate-y-1 min-w-0">
                  <span className="text-xs font-bold text-stone-600 uppercase tracking-wide truncate block">Total Invoiced</span>
                  <p className="text-lg sm:text-xl font-extrabold text-stone-900 mt-1 tabular-nums truncate whitespace-nowrap">
                    {formatNaira(BigInt(finance.totalInvoicedKobo))}
                  </p>
                </div>
                <div className="p-3.5 bg-gradient-to-br from-white via-white to-emerald-50/80 rounded-2xl border border-emerald-200/90 shadow-xs hover:shadow-md transition-all duration-300 hover:-translate-y-1 min-w-0">
                  <span className="text-xs font-bold text-emerald-800 uppercase tracking-wide truncate block">Total Collected</span>
                  <p className="text-lg sm:text-xl font-extrabold text-emerald-950 mt-1 tabular-nums truncate whitespace-nowrap">
                    {formatNaira(BigInt(finance.totalCollectedKobo))}
                  </p>
                </div>
                <div className="p-3.5 bg-gradient-to-br from-white via-white to-amber-50/80 rounded-2xl border border-amber-200/90 shadow-xs hover:shadow-md transition-all duration-300 hover:-translate-y-1 min-w-0">
                  <span className="text-xs font-bold text-amber-800 uppercase tracking-wide truncate block">Outstanding</span>
                  <p className="text-lg sm:text-xl font-extrabold text-amber-950 mt-1 tabular-nums truncate whitespace-nowrap">
                    {formatNaira(BigInt(finance.outstandingKobo))}
                  </p>
                </div>
              </div>
              <div className="pt-2 flex justify-between items-center text-xs text-stone-500 border-t border-stone-100">
                <span className="truncate">Director-only financial oversight</span>
                <Link href="/admin/finance?tab=payments" className="text-[#5B0612] font-semibold hover:underline shrink-0 whitespace-nowrap">
                  Reconcile Payments →
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          /* Standard Admin: Daily Academic Operations & Status (Strictly NO finance) */
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base sm:text-lg font-bold text-stone-900">Academic Status &amp; Schedule</CardTitle>
                <p className="text-xs text-stone-500 mt-0.5">Active session, terms, and community operations</p>
              </div>
              <Link href="/admin/academic">
                <Button variant="outline" size="sm">
                  Calendar
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 bg-stone-50 rounded-xl border border-stone-200">
                  <span className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Academic Session</span>
                  <p className="text-sm font-bold text-stone-900 mt-1">
                    {overview.activeSession ? overview.activeSession.name : "No active session"}
                  </p>
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    {overview.activeSession?.currentTerm || "Term not configured"}
                  </p>
                </div>
                <div className="p-3 bg-stone-50 rounded-xl border border-stone-200">
                  <span className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Admission Cycle</span>
                  <p className="text-sm font-bold text-stone-900 mt-1">
                    {overview.activeCycle ? overview.activeCycle.name : "Admissions Closed"}
                  </p>
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    {overview.pendingAdmissions} pending application{overview.pendingAdmissions === 1 ? "" : "s"}
                  </p>
                </div>
              </div>

              <div className="pt-2 flex flex-wrap gap-2 text-xs">
                <Link href="/admin/classes" className="px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold transition-colors">
                  Class Rosters →
                </Link>
                <Link href="/admin/subjects" className="px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold transition-colors">
                  Subjects Directory →
                </Link>
                <Link href="/admin/reports" className="px-3 py-1.5 rounded-lg bg-[#FAF2F4] hover:bg-[#F3E2E6] text-[#800020] font-bold transition-colors">
                  Report Sheet Center →
                </Link>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* BOTTOM SECTION: Tables */}
      <div className={`grid grid-cols-1 ${isSuperAdmin ? "lg:grid-cols-2" : "lg:grid-cols-1 max-w-4xl mx-auto"} gap-6`}>
        {/* Recent Applications (Shared) */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base font-bold text-stone-900">Recent Applications</CardTitle>
              <p className="text-xs text-stone-500">Latest admission portal submissions</p>
            </div>
            <Link href="/admin/admissions" className="text-xs text-[#5B0612] font-semibold hover:underline">
              View All ({overview.pendingAdmissions})
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {recentApplications.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  title="No Applications Registered"
                  description="No pupil admission applications have been submitted through the portal yet."
                  actionLabel="Admissions Centre"
                  actionHref="/admin/admissions"
                />
              </div>
            ) : (
              <TableWrapper>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHeaderCell>Applicant</TableHeaderCell>
                      <TableHeaderCell>Programme</TableHeaderCell>
                      <TableHeaderCell>Status</TableHeaderCell>
                      <TableHeaderCell className="text-right">Action</TableHeaderCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentApplications.map((app) => (
                      <TableRow key={app.id}>
                        <TableCell className="font-medium text-stone-900">
                          <div>{app.applicantFirstName} {app.applicantLastName}</div>
                          <span className="text-[11px] font-mono text-stone-500">{app.applicationNumber}</span>
                        </TableCell>
                        <TableCell className="text-xs text-stone-600">
                          {app.programmeSelections[0]?.programme?.name || "General"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              app.status === "OFFERED" || app.status === "ACCEPTED"
                                ? "success"
                                : app.status === "SUBMITTED"
                                ? "info"
                                : "neutral"
                            }
                            size="sm"
                          >
                            {app.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Link href={`/admin/admissions/${app.id}`}>
                            <Button variant="ghost" size="sm" className="text-[#5B0612] hover:bg-[#FDF2F4]">
                              Review
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableWrapper>
            )}
          </CardContent>
        </Card>

        {/* Super Admin ONLY: Recent Confirmed Payments Table */}
        {isSuperAdmin && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-bold text-stone-900">Recent Payments</CardTitle>
                <p className="text-xs text-stone-500">Official credits &amp; receipts</p>
              </div>
              <Link href="/admin/finance?tab=payments" className="text-xs text-[#5B0612] font-semibold hover:underline">
                Ledger →
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {recentPayments.length === 0 ? (
                <div className="p-4">
                  <EmptyState
                    title="No Payment Records Confirmed"
                    description="No school fee or admission payments have been confirmed in the ledger yet."
                    actionLabel="Finance Ledger"
                    actionHref="/admin/finance"
                  />
                </div>
              ) : (
                <TableWrapper>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHeaderCell>Student / Payer</TableHeaderCell>
                        <TableHeaderCell>Amount</TableHeaderCell>
                        <TableHeaderCell>Reference</TableHeaderCell>
                        <TableHeaderCell className="text-right">Receipt</TableHeaderCell>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentPayments.map((pay) => (
                        <TableRow key={pay.id}>
                          <TableCell className="font-medium text-stone-900">
                            {pay.application ? (
                              <>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span>{pay.application.applicantFirstName} {pay.application.applicantLastName}</span>
                                  <Badge variant="info" size="sm">Admission Fee</Badge>
                                </div>
                                <span className="text-[11px] text-stone-500 block truncate">
                                  Payer: {pay.application.guardianFirstName} {pay.application.guardianLastName} ({pay.application.applicationNumber})
                                </span>
                              </>
                            ) : (
                              <>
                                <div>
                                  {pay.invoice?.student?.firstName} {pay.invoice?.student?.lastName}
                                </div>
                                <span className="text-[11px] text-stone-500">
                                  {pay.invoice?.guardian
                                    ? `Payer: ${pay.invoice.guardian.firstName} ${pay.invoice.guardian.lastName}`
                                    : "Direct Payment"}
                                </span>
                              </>
                            )}
                          </TableCell>
                          <TableCell className="font-bold text-emerald-800 text-xs sm:text-sm">
                            {formatNaira(BigInt(pay.amountPaidKobo))}
                          </TableCell>
                          <TableCell className="text-xs font-mono text-stone-600">
                            {pay.paymentReference}
                          </TableCell>
                          <TableCell className="text-right text-xs font-mono text-[#5B0612] font-semibold">
                            {pay.receiptNumber || "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableWrapper>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Super Admin ONLY: Audit Logs Integrity Panel */}
      {isSuperAdmin && recentAuditLogs && recentAuditLogs.length > 0 && (
        <Card className="border border-[#EADBDA]">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base font-bold text-stone-900">Recent Security &amp; Audit Trail</CardTitle>
              <p className="text-xs text-stone-500">Immutable administrative activity log</p>
            </div>
            <Link href="/admin/audit" className="text-xs text-[#5B0612] font-semibold hover:underline">
              Full Audit History →
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-[#EADBDA]/60">
              {recentAuditLogs.map((log) => (
                <div key={log.id} className="p-3.5 flex items-center justify-between text-xs hover:bg-[#FAF7F2]">
                  <div className="flex items-center gap-3">
                    <Badge variant="neutral" size="sm">
                      {log.action}
                    </Badge>
                    <span className="text-stone-700 font-medium">
                      {log.entityType} {log.entityId ? `(${log.entityId.slice(0, 8)}...)` : ""}
                    </span>
                  </div>
                  <div className="text-stone-400 text-[11px] flex items-center gap-2">
                    <span>{log.user?.email || "System"}</span>
                    <span>&bull;</span>
                    <span>{new Date(log.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

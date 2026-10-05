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
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-[#5B0612] via-[#800020] to-[#4A0E17] rounded-2xl p-6 sm:p-8 text-white shadow-md flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="inline-flex flex-wrap items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-xs text-xs font-semibold tracking-wide mb-3">
            <span className="whitespace-nowrap uppercase">
              {isSuperAdmin ? "Director & Super Admin Dashboard" : "Operational Admin Dashboard"}
            </span>
            {overview.activeSession && (
              <>
                <span className="hidden sm:inline">•</span>
                <span className="whitespace-nowrap">
                  {overview.activeSession.name} ({overview.activeSession.currentTerm || "Term In Session"})
                </span>
              </>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white !text-white" style={{ color: '#FFFFFF' }}>
            {isSuperAdmin ? "Swanford Academy Governance" : "Admin Operations Center"}
          </h1>
          <p className="mt-1 text-sm text-stone-200 max-w-xl">
            {isSuperAdmin
              ? "Comprehensive institutional oversight: enrollment, academics, financial revenue ledger, and audit history."
              : "Real-time school operations: admissions processing, daily attendance roll-call, and community coordination."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Link href="/admin/admissions">
            <Button variant="secondary" size="md" className="bg-[#FAF7F2] text-[#5B0612] hover:bg-stone-100 font-bold">
              Review Admissions ({overview.pendingAdmissions})
            </Button>
          </Link>
          <Link href="/admin/attendance">
            <button
              type="button"
              className="min-h-[44px] px-4 py-2 rounded-lg border border-white/40 bg-white/10 hover:bg-white/20 active:bg-white/30 text-white font-semibold text-sm transition-colors duration-150 inline-flex items-center justify-center backdrop-blur-xs select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Attendance Records
            </button>
          </Link>
          {isSuperAdmin && (
            <Link href="/admin/finance">
              <button
                type="button"
                className="min-h-[44px] px-4 py-2 rounded-lg border border-white/40 bg-white/10 hover:bg-white/20 active:bg-white/30 text-white font-semibold text-sm transition-colors duration-150 inline-flex items-center justify-center backdrop-blur-xs select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
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

      {/* 4 Stat Overview Grid (Shared across both roles) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <Card className="border-l-4 border-l-[#5B0612]">
          <CardHeader className="pb-2">
            <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Active Students</span>
            <CardTitle className="text-2xl sm:text-3xl font-extrabold text-stone-900 mt-1">
              {overview.activeStudents.toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-stone-500">Currently enrolled across Nursery, Primary & Tahfeez</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-stone-600">
          <CardHeader className="pb-2">
            <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Registered Guardians</span>
            <CardTitle className="text-2xl sm:text-3xl font-extrabold text-stone-900 mt-1">
              {overview.guardians.toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-stone-500">Verified primary parents and sponsors</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-stone-700">
          <CardHeader className="pb-2">
            <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Teaching Staff</span>
            <CardTitle className="text-2xl sm:text-3xl font-extrabold text-stone-900 mt-1">
              {overview.teachers.toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-stone-500">Instructors with active class & subject scopes</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-[#D4AF37]">
          <CardHeader className="pb-2">
            <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Pending Admissions</span>
            <CardTitle className="text-2xl sm:text-3xl font-extrabold text-stone-900 mt-1">
              {overview.pendingAdmissions.toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-stone-500">Applications awaiting operational review</p>
          </CardContent>
        </Card>
      </div>

      {/* MIDDLE SECTION: Attendance + Role-Specific Right Column */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Attendance Breakdown */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base sm:text-lg font-bold text-stone-900">Today&apos;s Attendance</CardTitle>
              <p className="text-xs text-stone-500 mt-0.5">Recorded daily roll-call compliance</p>
            </div>
            <Badge variant={attendanceRate >= 80 ? "success" : "warning"} size="md">
              {attendanceRate}% Present
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                <span className="text-xs font-semibold text-emerald-800">Present</span>
                <p className="text-xl font-bold text-emerald-900 mt-1">{todayAttendance.present}</p>
              </div>
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
                <span className="text-xs font-semibold text-amber-800">Late</span>
                <p className="text-xl font-bold text-amber-900 mt-1">{todayAttendance.late}</p>
              </div>
              <div className="p-3 bg-rose-50 rounded-xl border border-rose-100">
                <span className="text-xs font-semibold text-rose-800">Absent</span>
                <p className="text-xl font-bold text-rose-900 mt-1">{todayAttendance.absent}</p>
              </div>
              <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
                <span className="text-xs font-semibold text-blue-800">Excused</span>
                <p className="text-xl font-bold text-blue-900 mt-1">{todayAttendance.excused}</p>
              </div>
            </div>

            <div className="pt-2 flex justify-between items-center text-xs text-stone-500 border-t border-stone-100">
              <span>Total roll-call entries: {totalAttendanceRecorded}</span>
              <Link href="/admin/attendance" className="text-[#5B0612] font-semibold hover:underline">
                View Class Logs →
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* RIGHT COLUMN: Super Admin gets Finance Ledger; Standard Admin gets Academic Schedule */}
        {isSuperAdmin && finance ? (
          /* Super Admin: Term Finance Ledger */
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base sm:text-lg font-bold text-stone-900">Term Finance Ledger</CardTitle>
                <p className="text-xs text-stone-500 mt-0.5">Authoritative invoice and collection reconciliation</p>
              </div>
              <Link href="/admin/finance">
                <Button variant="outline" size="sm">
                  Finance Hub
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-stone-50 rounded-xl border border-stone-200">
                  <span className="text-xs font-semibold text-stone-600">Total Invoiced</span>
                  <p className="text-base sm:text-lg font-bold text-stone-900 mt-1 truncate">
                    {formatNaira(BigInt(finance.totalInvoicedKobo))}
                  </p>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="text-xs font-semibold text-emerald-800">Total Collected</span>
                  <p className="text-base sm:text-lg font-bold text-emerald-900 mt-1 truncate">
                    {formatNaira(BigInt(finance.totalCollectedKobo))}
                  </p>
                </div>
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
                  <span className="text-xs font-semibold text-amber-800">Outstanding</span>
                  <p className="text-base sm:text-lg font-bold text-amber-900 mt-1 truncate">
                    {formatNaira(BigInt(finance.outstandingKobo))}
                  </p>
                </div>
              </div>
              <div className="pt-2 flex justify-between items-center text-xs text-stone-500 border-t border-stone-100">
                <span>Director-only financial oversight</span>
                <Link href="/admin/finance?tab=payments" className="text-[#5B0612] font-semibold hover:underline">
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

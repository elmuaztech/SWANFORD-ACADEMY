"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { formatNaira } from "@/lib/money";

interface AdminDashboardData {
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
  };
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
    };
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
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Failed to load admin dashboard data.");
        }
        return res.json();
      })
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load dashboard.");
        setLoading(false);
      });
  };

  useEffect(() => {
    fetch("/api/admin/dashboard")
      .then(async (res) => {
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Failed to load admin dashboard data.");
        }
        return res.json();
      })
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load dashboard.");
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="py-12">
        <LoadingState message="Loading administrative metrics and school status..." />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="py-8">
        <ErrorState
          title="Operational Overview Unavailable"
          message={error || "An error occurred while retrieving administrative records."}
          actionLabel="Retry Loading"
          onAction={fetchDashboard}
        />
      </div>
    );
  }

  const { overview, todayAttendance, finance, recentApplications, recentPayments } = data;
  const totalAttendanceRecorded =
    todayAttendance.present + todayAttendance.absent + todayAttendance.late + todayAttendance.excused;
  const attendanceRate =
    totalAttendanceRecorded > 0
      ? Math.round(((todayAttendance.present + todayAttendance.late) / totalAttendanceRecorded) * 100)
      : 0;

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-[#5B0612] to-[#800020] rounded-2xl p-6 sm:p-8 text-white shadow-md flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-xs text-xs font-semibold tracking-wide uppercase mb-3">
            <span>Official Operations Console</span>
            {overview.activeSession && (
              <>
                <span>•</span>
                <span>{overview.activeSession.name} ({overview.activeSession.currentTerm || "Term In Session"})</span>
              </>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Admin Operations Center</h1>
          <p className="mt-1 text-sm text-stone-200 max-w-xl">
            Real-time enrollment, academic sessions, attendance verification, and school revenue ledger.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Link href="/admin/admissions">
            <Button variant="secondary" size="md" className="bg-[#FDFBF7] text-[#5B0612] hover:bg-stone-100 font-bold">
              Review Admissions ({overview.pendingAdmissions})
            </Button>
          </Link>
          <Link href="/admin/attendance">
            <Button variant="outline" size="md" className="border-white/40 text-white hover:bg-white/10">
              Attendance Records
            </Button>
          </Link>
        </div>
      </div>

      {/* 4 Stat Overview Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <Card className="border-l-4 border-l-[#5B0612]">
          <CardHeader className="pb-2">
            <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Active Students</span>
            <CardTitle className="text-2xl sm:text-3xl font-extrabold text-stone-900 mt-1">
              {overview.activeStudents.toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-stone-500">Currently enrolled across Primary & Tahfeez</p>
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
            <p className="text-xs text-stone-500">Linked to enrolled students</p>
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
            <p className="text-xs text-stone-500">With active class & subject scopes</p>
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
            <p className="text-xs text-stone-500">Applications awaiting review or payment</p>
          </CardContent>
        </Card>
      </div>

      {/* Attendance & Finance Insights */}
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

        {/* Finance Snapshot */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base sm:text-lg font-bold text-stone-900">Term Finance Ledger</CardTitle>
              <p className="text-xs text-stone-500 mt-0.5">Authoritative invoice and payment reconciliation</p>
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

            <p className="text-xs text-stone-500">
              Payments reconciled in Jaiz Bank account: <span className="font-mono font-semibold text-stone-700">0012031162</span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Admissions & Payments Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Admissions */}
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
              <p className="p-6 text-center text-sm text-stone-500">No applications registered yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Applicant</TableHead>
                      <TableHead>Programme</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
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
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Payments */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base font-bold text-stone-900">Recent Payments</CardTitle>
              <p className="text-xs text-stone-500">Official credits & receipts</p>
            </div>
            <Link href="/admin/finance" className="text-xs text-[#5B0612] font-semibold hover:underline">
              Ledger →
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {recentPayments.length === 0 ? (
              <p className="p-6 text-center text-sm text-stone-500">No payment records confirmed yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student / Payer</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead className="text-right">Receipt</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentPayments.map((pay) => (
                      <TableRow key={pay.id}>
                        <TableCell className="font-medium text-stone-900">
                          <div>
                            {pay.invoice?.student?.firstName} {pay.invoice?.student?.lastName}
                          </div>
                          <span className="text-[11px] text-stone-500">
                            {pay.invoice?.guardian
                              ? `Payer: ${pay.invoice.guardian.firstName} ${pay.invoice.guardian.lastName}`
                              : "Direct Payment"}
                          </span>
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
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

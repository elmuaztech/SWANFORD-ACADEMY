"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/states";
import { StatCard } from "@/components/ui/stat-card";
import { formatKoboToNaira } from "@/lib/money";

interface LinkedChild {
  studentId: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  otherNames?: string | null;
  gender: string;
  relationshipType: string;
  receivesInvoices: boolean;
  enrollments: Array<{
    programmeId: string;
    programmeName: string;
    programmeCode: string;
    schoolClassId: string;
    className: string;
    arm: string | null;
  }>;
}

interface ParentProfileData {
  guardian: {
    fullName: string;
    email: string;
    phonePrimary: string;
  };
  children: LinkedChild[];
}

interface ChildAttendanceSummary {
  totalDays: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  excusedCount: number;
  attendancePercentage: number;
}

interface SubjectResultItem {
  subjectName: string;
  totalWeightedScore: number;
  grade: string;
  remark: string;
}

export default function ParentDashboardPage() {
  const [profile, setProfile] = useState<ParentProfileData | null>(null);
  const [selectedChildIndex, setSelectedChildIndex] = useState(0);

  const [attendance, setAttendance] = useState<ChildAttendanceSummary | null>(null);
  const [results, setResults] = useState<SubjectResultItem[]>([]);
  const [balanceKobo, setBalanceKobo] = useState<bigint | number>(0);

  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [admissions, setAdmissions] = useState<any[]>([]);

  // 1. Load Parent Profile & Linked Children
  useEffect(() => {
    fetch("/api/parent/me")
      .then((res) => {
        if (res.status === 401) {
          window.location.href = "/auth/login?from=/parent";
          return;
        }
        if (!res.ok) throw new Error("Failed to load parent profile");
        return res.json();
      })
      .then((d) => {
        if (d) {
          setProfile(d);
          setIsLoadingProfile(false);
        }
      })
      .catch((err) => {
        setError(err.message);
        setIsLoadingProfile(false);
      });

    // Also fetch admission applications for status tracking
    fetch("/api/parent/admissions")
      .then((res) => (res.ok ? res.json() : { admissions: [] }))
      .then((data) => {
        setAdmissions(data.admissions || data.applications || []);
      })
      .catch(() => setAdmissions([]));
  }, []);

  const selectedChild = profile?.children[selectedChildIndex] || null;

  // 2. Load Selected Child's Data
  useEffect(() => {
    if (!selectedChild) return;

    Promise.all([
      // Attendance
      fetch(`/api/parent/children/${selectedChild.studentId}/attendance`).then((r) =>
        r.ok ? r.json() : { summary: null }
      ),
      // Results (Finalized only)
      fetch(`/api/parent/children/${selectedChild.studentId}/results`).then((r) =>
        r.ok ? r.json() : { subjectResults: [] }
      ),
      // Finance (if receivesInvoices)
      selectedChild.receivesInvoices
        ? fetch(`/api/parent/children/${selectedChild.studentId}/finance`).then((r) =>
            r.ok ? r.json() : { invoices: [] }
          )
        : Promise.resolve({ invoices: [] }),
    ])
      .then(([attData, resData, finData]) => {
        setAttendance(attData.summary);
        setResults(resData.subjectResults || []);

        // Calculate outstanding balance across invoices
        let totalUnpaidKobo = BigInt(0);
        if (finData.invoices && Array.isArray(finData.invoices)) {
          for (const inv of finData.invoices) {
            totalUnpaidKobo += BigInt(inv.balanceAmountKobo || 0);
          }
        }
        setBalanceKobo(totalUnpaidKobo);
      })
      .catch(() => {
        // Ignore fetch error on child switch
      });
  }, [selectedChild]);

  if (isLoadingProfile) {
    return <LoadingState description="Loading your parent portal dashboard..." />;
  }

  if (error || !profile) {
    const isAuthRequired =
      error?.toLowerCase().includes("authentication") ||
      error?.toLowerCase().includes("sign in") ||
      error?.toLowerCase().includes("unauthorized");

    return (
      <div className="py-8 max-w-xl mx-auto">
        <ErrorState
          title={isAuthRequired ? "Parent Sign-In Required" : "Dashboard Unavailable"}
          message={
            isAuthRequired
              ? "Please sign in with your verified guardian account to access your children's records, attendance, and fee invoices."
              : error || "Failed to load parent dashboard."
          }
          actionLabel={isAuthRequired ? "Sign In to Parent Portal" : "Try Again"}
          onAction={() => {
            if (isAuthRequired) {
              window.location.href = "/auth/login?from=/parent";
            } else {
              window.location.reload();
            }
          }}
        />
      </div>
    );
  }

  if (profile.children.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={`Welcome, ${profile.guardian.fullName}`}
          subtitle="Swanford Academy Guardian & Parent Portal"
        />

        {admissions.length > 0 ? (
          <div className="space-y-6">
            <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900">
                  Admissions Status
                </span>
                <h3 className="text-base font-bold text-amber-950">
                  You have {admissions.length} admission application{admissions.length > 1 ? "s" : ""} on file
                </h3>
                <p className="text-xs sm:text-sm text-amber-800 max-w-2xl">
                  Once your child’s entrance application is reviewed and formally matriculated by administration, active term attendance, report cards, and fee invoices will automatically populate your dashboard.
                </p>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                <Link href="/parent/admissions" className="w-full sm:w-auto">
                  <Button className="w-full bg-[#800020] hover:bg-[#600018] text-white min-h-[44px]">
                    Track Applications
                  </Button>
                </Link>
              </div>
            </div>

            {/* Applications List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-stone-900 tracking-tight">Your Submitted Applications</h2>
                <Link href="/admissions">
                  <Button variant="outline" size="sm" className="min-h-[40px]">
                    Apply for New Child
                  </Button>
                </Link>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {admissions.map((app) => (
                  <Card key={app.id} className="border border-[#E2D6C5] shadow-xs hover:border-[#800020]/40 transition-all">
                    <CardContent className="p-5 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-bold text-stone-700">{app.applicationNumber}</span>
                        <Badge
                          variant={
                            app.status === "ACCEPTED" || app.status === "ENROLLED"
                              ? "success"
                              : app.status === "UNDER_REVIEW"
                              ? "info"
                              : app.status === "SHORTLISTED"
                              ? "brand"
                              : app.status === "REJECTED"
                              ? "danger"
                              : "warning"
                          }
                        >
                          {app.status.replace("_", " ")}
                        </Badge>
                      </div>
                      <div>
                        <h4 className="text-base font-bold text-[#800020]">{app.studentName}</h4>
                        <p className="text-xs text-stone-600 mt-0.5">
                          Programme: <span className="font-semibold text-stone-800">{app.programmeName}</span>
                          {app.targetClassName && <span> • Class: {app.targetClassName}</span>}
                        </p>
                      </div>
                      <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-xs text-stone-500">
                        <span>Submitted {new Date(app.submittedAt || app.createdAt).toLocaleDateString("en-NG", { dateStyle: "medium" })}</span>
                        <Link href="/parent/admissions" className="text-[#800020] font-semibold hover:underline">
                          View Details &rarr;
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <EmptyState
            title="No Linked Children Found"
            description="Your guardian profile currently has no active student relationships registered with the academy. If your child recently completed admissions, please allow time for administrative matriculation or contact the school office."
            actionLabel="Apply for Admission"
            actionHref="/admissions"
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Page Header */}
      <PageHeader
        title={`Welcome, ${profile.guardian.fullName}`}
        subtitle="Manage your children's academic progression, attendance, and school finances."
        badge={
          <Badge variant="brand" className="bg-[#FAF2F3] text-[#800020] border-[#EFE9DF]">
            Verified Guardian
          </Badge>
        }
      />

      {/* Child Switcher Component (Section 9) */}
      <div className="bg-gradient-to-br from-[#FFFDF9] via-[#FAF7F2] to-[#F5EFE6] p-4 sm:p-5 rounded-2xl border border-[#E2D6C5] shadow-[0_4px_16px_rgba(0,0,0,0.05)] space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
            Active Child Focus ({profile.children.length} {profile.children.length === 1 ? "Child" : "Children"})
          </span>
          {selectedChild && (
            <span className="text-xs font-mono font-bold text-[#800020]">
              {selectedChild.admissionNumber}
            </span>
          )}
        </div>

        {/* Child Switcher UI: Pills for 1-2 children, Selector for 3+ */}
        {profile.children.length <= 2 ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {profile.children.map((child, idx) => {
              const isSelected = idx === selectedChildIndex;
              return (
                <button
                  key={child.studentId}
                  onClick={() => setSelectedChildIndex(idx)}
                  className={`px-4 py-2.5 rounded-lg text-sm font-bold transition-colors cursor-pointer min-h-[44px] flex items-center gap-2 select-none ${
                    isSelected
                      ? "bg-[#800020] text-white shadow-xs"
                      : "bg-[#FAF7F2] text-stone-700 hover:bg-[#F2ECE1] border border-[#EFE9DF]"
                  }`}
                >
                  <span>{child.firstName} {child.lastName}</span>
                  <span className="text-xs font-normal opacity-80">
                    ({(child.enrollments || []).map((e) => e.className).join(", ") || "Enrolled"})
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <select
            value={selectedChildIndex}
            onChange={(e) => setSelectedChildIndex(parseInt(e.target.value, 10))}
            className="w-full bg-[#FAF7F2] border border-[#EFE9DF] rounded-lg px-3.5 py-2.5 text-sm font-bold text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#800020] min-h-[44px]"
          >
            {profile.children.map((child, idx) => (
              <option key={child.studentId} value={idx}>
                {child.firstName} {child.lastName} · {child.admissionNumber} ({(child.enrollments || []).map((e) => e.className).join(", ")})
              </option>
            ))}
          </select>
        )}
      </div>

      {selectedChild && (
        <div className="space-y-6">
          {/* Active Programmes / Multi-Programme Chips */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider mr-1">
              Enrolled Programmes:
            </span>
            {(selectedChild.enrollments || []).map((enr) => (
              <Badge key={enr.programmeId} variant="brand" className="bg-[#FAF2F3] text-[#800020] font-semibold text-xs">
                {enr.programmeName}: {enr.className} {enr.arm ? `(${enr.arm})` : ""}
              </Badge>
            ))}
          </div>

          {/* Quick Metrics Grid: Animated Multi-Color StatCards with Prominent Shadow & Large Digit Support */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            <StatCard
              title="Attendance Rate"
              value={attendance ? `${attendance.attendancePercentage}%` : "—"}
              subtitle={`Total Days: ${attendance?.totalDays || 0} (Absent: ${attendance?.absentCount || 0})`}
              icon={<span className="text-xl">📅</span>}
              badge={
                <Badge variant="success" size="sm" className="whitespace-nowrap">
                  {attendance ? `${attendance.presentCount} Days Present` : "Loading..."}
                </Badge>
              }
              color="emerald"
              href={`/parent/children/${selectedChild.studentId}/attendance`}
            />

            <StatCard
              title="School Fee Balance"
              value={formatKoboToNaira(balanceKobo)}
              subtitle={
                selectedChild.receivesInvoices
                  ? "Official digital invoices & receipting"
                  : "Not designated to receive financial statements"
              }
              icon={<span className="text-xl">💳</span>}
              badge={
                <Badge
                  variant={BigInt(balanceKobo) > BigInt(0) ? "warning" : "success"}
                  size="sm"
                  className="whitespace-nowrap"
                >
                  {BigInt(balanceKobo) > BigInt(0) ? "Outstanding" : "Cleared"}
                </Badge>
              }
              color="amber"
              href={
                selectedChild.receivesInvoices
                  ? `/parent/children/${selectedChild.studentId}/finance`
                  : undefined
              }
            />

            <StatCard
              title="Academic Results"
              value={results.length}
              subtitle="Finalized evaluations across continuous assessments"
              icon={<span className="text-xl">📊</span>}
              badge={<Badge variant="neutral" size="sm" className="whitespace-nowrap">Evaluations</Badge>}
              color="purple"
              href={`/parent/children/${selectedChild.studentId}/results`}
              className="sm:col-span-2 lg:col-span-1"
            />
          </div>

          {/* Child Actions & Subject Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Subject Performance Summary */}
            <Card className="bg-white border-[#EFE9DF] shadow-xs lg:col-span-2">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-base font-bold text-stone-900">
                  Published Subject Performance
                </CardTitle>
                <Link href={`/parent/children/${selectedChild.studentId}/results`} className="text-xs font-semibold text-[#800020] hover:underline">
                  Full Report Card →
                </Link>
              </CardHeader>
              <CardContent className="pt-0">
                {results.length === 0 ? (
                  <p className="text-xs text-stone-500 py-6 text-center italic">
                    No finalized continuous assessments or term examination results have been published for this student yet.
                  </p>
                ) : (
                  <div className="divide-y divide-[#EFE9DF]">
                    {results.slice(0, 5).map((subj) => (
                      <div key={subj.subjectName} className="py-3 flex items-center justify-between text-sm">
                        <div>
                          <span className="font-semibold text-stone-900 block">{subj.subjectName}</span>
                          <span className="text-xs text-stone-500">{subj.remark}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-stone-900">{subj.totalWeightedScore}%</span>
                          <Badge variant="brand" className="bg-[#FAF2F3] text-[#800020] font-bold">
                            {subj.grade}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Actions Card */}
            <Card className="bg-white border-[#EFE9DF] shadow-xs">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold text-stone-900">Child Portal Hub</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5 pt-0">
                <Link href={`/parent/children/${selectedChild.studentId}`} className="block">
                  <Button variant="outline" className="w-full justify-start text-xs min-h-[44px]">
                    👤 Demographics & Profile
                  </Button>
                </Link>
                <Link href={`/parent/children/${selectedChild.studentId}/attendance`} className="block">
                  <Button variant="outline" className="w-full justify-start text-xs min-h-[44px]">
                    📅 Full Attendance History
                  </Button>
                </Link>
                <Link href={`/parent/children/${selectedChild.studentId}/results`} className="block">
                  <Button variant="outline" className="w-full justify-start text-xs min-h-[44px]">
                    📊 Term Academic Report Card
                  </Button>
                </Link>
                {selectedChild.receivesInvoices && (
                  <Link href={`/parent/children/${selectedChild.studentId}/finance`} className="block">
                    <Button variant="primary" className="w-full justify-start text-xs min-h-[44px] bg-[#800020] hover:bg-[#6b001a] text-white">
                      💳 View Invoices & Pay Fees
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

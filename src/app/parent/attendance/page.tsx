"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/states";

interface LinkedChild {
  studentId: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
}

interface AttendanceSummary {
  totalDays: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  excusedCount: number;
  attendancePercentage: number;
}

interface AttendanceRecordItem {
  id: string;
  date: string;
  status: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
  remarks?: string | null;
  className: string;
  programmeName: string;
}

export default function ParentAttendancePage() {
  const [children, setChildren] = useState<LinkedChild[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [records, setRecords] = useState<AttendanceRecordItem[]>([]);
  const [periodFilter, setPeriodFilter] = useState<"week" | "month" | "term">("term");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingAttendance, setIsLoadingAttendance] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1. Fetch linked children
  useEffect(() => {
    fetch("/api/parent/me")
      .then((res) => {
        if (res.status === 401) {
          window.location.href = "/auth/login?from=/parent/attendance";
          return;
        }
        if (!res.ok) throw new Error("Failed to load your children");
        return res.json();
      })
      .then((data) => {
        const childList = data?.children || [];
        setChildren(childList);
        if (childList.length > 0) {
          setSelectedChildId(childList[0].studentId);
        }
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load parent records");
        setIsLoading(false);
      });
  }, []);

  // 2. Fetch attendance for selected child
  useEffect(() => {
    if (!selectedChildId) return;

    setIsLoadingAttendance(true);
    fetch(`/api/parent/children/${selectedChildId}/attendance`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load attendance records");
        return res.json();
      })
      .then((d) => {
        setSummary(d.summary || null);
        setRecords(d.records || []);
        setIsLoadingAttendance(false);
      })
      .catch((err) => {
        setError(err.message);
        setIsLoadingAttendance(false);
      });
  }, [selectedChildId]);

  const filteredRecords = React.useMemo(() => {
    if (periodFilter === "term") return records;

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    if (periodFilter === "week") {
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const weekStr = oneWeekAgo.toISOString().slice(0, 10);
      return records.filter((r) => r.date >= weekStr && r.date <= todayStr);
    }

    if (periodFilter === "month") {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthStr = startOfMonth.toISOString().slice(0, 10);
      return records.filter((r) => r.date >= monthStr && r.date <= todayStr);
    }

    return records;
  }, [records, periodFilter]);

  const activeSummary = React.useMemo(() => {
    if (periodFilter === "term" && summary) return summary;

    const totalDays = filteredRecords.length;
    let presentCount = 0;
    let absentCount = 0;
    let lateCount = 0;
    let excusedCount = 0;

    for (const r of filteredRecords) {
      if (r.status === "PRESENT") presentCount++;
      else if (r.status === "ABSENT") absentCount++;
      else if (r.status === "LATE") lateCount++;
      else if (r.status === "EXCUSED") excusedCount++;
    }

    const attendancePercentage = totalDays > 0 ? Math.round(((presentCount + lateCount) / totalDays) * 100) : 100;

    return {
      totalDays,
      presentCount,
      absentCount,
      lateCount,
      excusedCount,
      attendancePercentage,
    };
  }, [filteredRecords, summary, periodFilter]);

  if (isLoading) {
    return <LoadingState message="Loading attendance records..." />;
  }

  if (error && children.length === 0) {
    return (
      <ErrorState
        title="Attendance Records Unavailable"
        message={error}
        onRetry={() => window.location.reload()}
      />
    );
  }

  if (children.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Attendance"
          description="View daily classroom presence and attendance records for your children."
        />
        <EmptyState
          title="No children registered"
          description="No children are currently linked to your parent account. Please contact the school office to verify enrollment."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        description="View daily classroom presence, punctuality, and attendance records for your children."
      />

      {/* Child selector tabs and Period Filter bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Child selector tabs if more than 1 child */}
        {children.length > 1 ? (
          <div className="flex flex-wrap items-center gap-2 p-1.5 bg-stone-100 rounded-lg max-w-xl">
            {children.map((child) => (
              <button
                key={child.studentId}
                type="button"
                onClick={() => setSelectedChildId(child.studentId)}
                className={`px-4 py-2 text-xs font-semibold rounded-md transition-all min-h-[40px] ${
                  selectedChildId === child.studentId
                    ? "bg-white text-stone-900 shadow-xs border border-stone-200"
                    : "text-stone-600 hover:text-stone-900"
                }`}
              >
                {child.firstName} {child.lastName}
              </button>
            ))}
          </div>
        ) : (
          <div />
        )}

        {/* Period Filter (Week, Month, Term) */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto p-1 bg-stone-100 rounded-lg border border-stone-200">
          {(["week", "month", "term"] as const).map((period) => (
            <button
              key={period}
              type="button"
              onClick={() => setPeriodFilter(period)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all min-h-[36px] ${
                periodFilter === period
                  ? "bg-white text-stone-900 shadow-xs border border-stone-200 font-bold"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              {period === "week" ? "This Week" : period === "month" ? "This Month" : "This Term"}
            </button>
          ))}
        </div>
      </div>

      {isLoadingAttendance ? (
        <LoadingState message="Loading child attendance history..." />
      ) : (
        <>
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card className="border-[#EADBDA] bg-white">
              <CardContent className="p-4">
                <span className="text-xs text-stone-500 font-medium block">Total Days</span>
                <span className="text-2xl font-bold text-stone-900 mt-1 block">
                  {activeSummary.totalDays}
                </span>
              </CardContent>
            </Card>

            <Card className="border-[#EADBDA] bg-white">
              <CardContent className="p-4">
                <span className="text-xs text-emerald-700 font-medium block">Present</span>
                <span className="text-2xl font-bold text-emerald-600 mt-1 block">
                  {activeSummary.presentCount}
                </span>
              </CardContent>
            </Card>

            <Card className="border-[#EADBDA] bg-white">
              <CardContent className="p-4">
                <span className="text-xs text-rose-700 font-medium block">Absent</span>
                <span className="text-2xl font-bold text-rose-600 mt-1 block">
                  {activeSummary.absentCount}
                </span>
              </CardContent>
            </Card>

            <Card className="border-[#EADBDA] bg-white">
              <CardContent className="p-4">
                <span className="text-xs text-stone-500 font-medium block">Attendance Rate</span>
                <span className="text-2xl font-bold text-[#800020] mt-1 block">
                  {activeSummary.attendancePercentage}%
                </span>
              </CardContent>
            </Card>
          </div>

          {/* Daily Table */}
          {filteredRecords.length === 0 ? (
            <EmptyState
              title="No attendance records found for this period"
              description={`No attendance records logged for ${
                periodFilter === "week"
                  ? "the past 7 days"
                  : periodFilter === "month"
                  ? "this month"
                  : "this term"
              }.`}
            />
          ) : (
            <Card className="border-[#EADBDA] bg-white overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-stone-50 border-b border-stone-200/80 text-stone-600 uppercase tracking-wider font-semibold">
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Class</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {filteredRecords.map((r) => (
                      <tr key={r.id} className="hover:bg-stone-50/50">
                        <td className="py-3 px-4 font-mono font-medium text-stone-900">
                          {r.date}
                        </td>
                        <td className="py-3 px-4 text-stone-700">
                          {r.className}
                        </td>
                        <td className="py-3 px-4">
                          <Badge
                            variant={
                              r.status === "PRESENT"
                                ? "success"
                                : r.status === "ABSENT"
                                ? "danger"
                                : "warning"
                            }
                            className="text-[11px]"
                          >
                            {r.status}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-stone-500 italic">
                          {r.remarks || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

"use client";

import React, { useEffect, useState, use } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/states";

interface AttendanceRecordItem {
  id: string;
  date: string;
  status: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
  remarks?: string | null;
  className: string;
  programmeName: string;
}

interface AttendanceSummary {
  totalDays: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  excusedCount: number;
  attendancePercentage: number;
}

export default function ParentChildAttendancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const studentId = resolvedParams.id;

  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [records, setRecords] = useState<AttendanceRecordItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/parent/children/${studentId}/attendance`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load attendance records");
        return res.json();
      })
      .then((d) => {
        setSummary(d.summary);
        setRecords(d.records || []);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setIsLoading(false);
      });
  }, [studentId]);

  if (isLoading) {
    return <LoadingState description="Loading child attendance history..." />;
  }

  if (error) {
    return (
      <ErrorState
        title="Attendance Records Unavailable"
        message={error}
        onRetry={() => window.location.reload()}
      />
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PRESENT":
        return <Badge variant="success">Present</Badge>;
      case "ABSENT":
        return <Badge variant="danger">Absent</Badge>;
      case "LATE":
        return <Badge variant="warning">Late</Badge>;
      case "EXCUSED":
        return <Badge variant="neutral">Excused</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance History"
        subtitle="Official daily attendance record as marked by class and subject educators."
        breadcrumbs={[
          { label: "Parent Portal", href: "/parent" },
          { label: "Children" },
          { label: "Attendance" },
        ]}
      />

      {/* Summary KPI Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
          <Card className="bg-white border-[#EFE9DF] shadow-xs">
            <CardContent className="p-4 text-center">
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider block">Attendance Rate</span>
              <span className="text-2xl sm:text-3xl font-bold text-stone-900 mt-1 block">
                {summary.attendancePercentage}%
              </span>
            </CardContent>
          </Card>

          <Card className="bg-white border-[#EFE9DF] shadow-xs">
            <CardContent className="p-4 text-center">
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider block">Days Present</span>
              <span className="text-2xl sm:text-3xl font-bold text-emerald-700 mt-1 block">
                {summary.presentCount}
              </span>
            </CardContent>
          </Card>

          <Card className="bg-white border-[#EFE9DF] shadow-xs">
            <CardContent className="p-4 text-center">
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider block">Days Absent</span>
              <span className="text-2xl sm:text-3xl font-bold text-rose-700 mt-1 block">
                {summary.absentCount}
              </span>
            </CardContent>
          </Card>

          <Card className="bg-white border-[#EFE9DF] shadow-xs">
            <CardContent className="p-4 text-center">
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider block">Days Late</span>
              <span className="text-2xl sm:text-3xl font-bold text-amber-700 mt-1 block">
                {summary.lateCount}
              </span>
            </CardContent>
          </Card>

          <Card className="bg-white border-[#EFE9DF] shadow-xs col-span-2 sm:col-span-1">
            <CardContent className="p-4 text-center">
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider block">Total Days</span>
              <span className="text-2xl sm:text-3xl font-bold text-stone-900 mt-1 block">
                {summary.totalDays}
              </span>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Attendance Register List */}
      {records.length === 0 ? (
        <EmptyState
          title="No Attendance Records Yet"
          description="Daily attendance has not yet been recorded for this student in the current academic term."
        />
      ) : (
        <div className="space-y-4">
          {/* Mobile view */}
          <div className="md:hidden space-y-2.5">
            {records.map((rec) => (
              <Card key={rec.id} className="bg-white border-[#EFE9DF] shadow-xs">
                <CardContent className="p-3.5 flex items-center justify-between gap-2">
                  <div>
                    <span className="text-sm font-bold text-stone-900 block">
                      {new Date(rec.date).toLocaleDateString("en-NG", {
                        weekday: "short",
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <span className="text-xs text-stone-500 block mt-0.5">
                      {rec.className} · {rec.programmeName}
                    </span>
                    {rec.remarks && (
                      <span className="text-xs text-stone-600 italic block mt-1">
                        Note: {rec.remarks}
                      </span>
                    )}
                  </div>
                  {getStatusBadge(rec.status)}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Desktop view */}
          <div className="hidden md:block bg-white rounded-xl border border-[#EFE9DF] shadow-xs overflow-hidden">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-[#FAF7F2] border-b border-[#EFE9DF] text-xs font-semibold text-stone-600 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Date</th>
                  <th className="py-3.5 px-4">Programme & Class</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFE9DF]">
                {records.map((rec) => (
                  <tr key={rec.id} className="hover:bg-[#FAF7F2]/60 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-stone-900">
                      {new Date(rec.date).toLocaleDateString("en-NG", {
                        weekday: "long",
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td className="py-3.5 px-4 text-stone-700">
                      {rec.programmeName} — {rec.className}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {getStatusBadge(rec.status)}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-stone-500">
                      {rec.remarks || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

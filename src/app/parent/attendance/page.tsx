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

      {/* Child selector tabs if more than 1 child */}
      {children.length > 1 && (
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
      )}

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
                  {summary ? summary.totalDays : 0}
                </span>
              </CardContent>
            </Card>

            <Card className="border-[#EADBDA] bg-white">
              <CardContent className="p-4">
                <span className="text-xs text-emerald-700 font-medium block">Present</span>
                <span className="text-2xl font-bold text-emerald-600 mt-1 block">
                  {summary ? summary.presentCount : 0}
                </span>
              </CardContent>
            </Card>

            <Card className="border-[#EADBDA] bg-white">
              <CardContent className="p-4">
                <span className="text-xs text-rose-700 font-medium block">Absent</span>
                <span className="text-2xl font-bold text-rose-600 mt-1 block">
                  {summary ? summary.absentCount : 0}
                </span>
              </CardContent>
            </Card>

            <Card className="border-[#EADBDA] bg-white">
              <CardContent className="p-4">
                <span className="text-xs text-stone-500 font-medium block">Attendance Rate</span>
                <span className="text-2xl font-bold text-[#800020] mt-1 block">
                  {summary ? `${summary.attendancePercentage}%` : "—"}
                </span>
              </CardContent>
            </Card>
          </div>

          {/* Daily Table */}
          {records.length === 0 ? (
            <EmptyState
              title="No attendance records recorded yet"
              description="No attendance sessions have been logged for this student yet."
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
                    {records.map((r) => (
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

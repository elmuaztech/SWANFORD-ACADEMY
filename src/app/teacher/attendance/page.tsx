"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/layout/page-header";
import { LoadingState, EmptyState } from "@/components/ui/states";
import { TableWrapper } from "@/components/ui/table";

type AttendanceStatusType = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

interface StudentAttendanceItem {
  student: {
    id: string;
    admissionNumber: string;
    firstName: string;
    lastName: string;
    otherNames?: string | null;
    gender: string;
  };
  attendance: {
    id: string;
    status: AttendanceStatusType;
    remarks?: string | null;
  } | null;
}

interface AssignedClass {
  schoolClassId: string;
  className: string;
  arm: string | null;
  programmeId: string;
  programmeName: string;
}

function TeacherAttendanceContent() {
  const searchParams = useSearchParams();
  const initialClassId = searchParams.get("schoolClassId") || "";
  const initialProgrammeId = searchParams.get("programmeId") || "";

  const [classes, setClasses] = useState<AssignedClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState(initialClassId);
  const [selectedProgrammeId, setSelectedProgrammeId] = useState(initialProgrammeId);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [roster, setRoster] = useState<StudentAttendanceItem[]>([]);
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatusType>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});

  const [isLoadingClasses, setIsLoadingClasses] = useState(true);
  const [isLoadingRoster, setIsLoadingRoster] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // 1. Fetch teacher classes
  useEffect(() => {
    fetch("/api/teacher/me")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load teacher scopes");
        return res.json();
      })
      .then((d) => {
        const cl: AssignedClass[] = d.classes || [];
        setClasses(cl);
        setIsLoadingClasses(false);

        if (cl.length > 0) {
          setSelectedClassId((curr) => curr || cl[0].schoolClassId);
          setSelectedProgrammeId((curr) => curr || cl[0].programmeId);
        }
      })
      .catch((err) => {
        setIsLoadingClasses(false);
        setFeedback({ type: "error", message: err.message });
      });
  }, []);

  // 2. Fetch attendance roster when class or date changes
  useEffect(() => {
    if (!selectedClassId || !selectedProgrammeId) return;

    let isSubscribed = true;
    queueMicrotask(() => {
      if (isSubscribed) {
        setIsLoadingRoster(true);
        setFeedback(null);
      }
    });

    fetch(
      `/api/teacher/attendance?programmeId=${selectedProgrammeId}&schoolClassId=${selectedClassId}&date=${date}`
    )
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch attendance register");
        return res.json();
      })
      .then((d) => {
        if (!isSubscribed) return;
        const studentRoster: StudentAttendanceItem[] = d.roster || d.students || [];
        setRoster(studentRoster);

        // Pre-fill existing statuses or default to PRESENT
        const initialStatuses: Record<string, AttendanceStatusType> = {};
        const initialRemarks: Record<string, string> = {};

        for (const item of studentRoster) {
          initialStatuses[item.student.id] = item.attendance?.status || "PRESENT";
          if (item.attendance?.remarks) {
            initialRemarks[item.student.id] = item.attendance.remarks;
          }
        }

        setStatuses(initialStatuses);
        setRemarks(initialRemarks);
        setIsLoadingRoster(false);
      })
      .catch((err) => {
        if (!isSubscribed) return;
        setIsLoadingRoster(false);
        setFeedback({ type: "error", message: err.message });
      });

    return () => {
      isSubscribed = false;
    };
  }, [selectedClassId, selectedProgrammeId, date]);

  const handleClassChange = (newClassId: string) => {
    setSelectedClassId(newClassId);
    const found = classes.find((c) => c.schoolClassId === newClassId);
    if (found) {
      setSelectedProgrammeId(found.programmeId);
    }
  };

  const handleMarkAll = (status: AttendanceStatusType) => {
    const updated: Record<string, AttendanceStatusType> = {};
    for (const item of roster) {
      updated[item.student.id] = status;
    }
    setStatuses(updated);
  };

  const handleStatusChange = (studentId: string, status: AttendanceStatusType) => {
    setStatuses((prev) => ({ ...prev, [studentId]: status }));
  };

  const handleRemarkChange = (studentId: string, text: string) => {
    setRemarks((prev) => ({ ...prev, [studentId]: text }));
  };

  const handleSaveAttendance = async () => {
    if (!selectedClassId || !selectedProgrammeId || roster.length === 0) return;

    setIsSaving(true);
    setFeedback(null);

    const items = roster.map((item) => ({
      studentId: item.student.id,
      status: statuses[item.student.id] || "PRESENT",
      remarks: remarks[item.student.id] || undefined,
    }));

    try {
      const res = await fetch("/api/teacher/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programmeId: selectedProgrammeId,
          schoolClassId: selectedClassId,
          date,
          items,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save attendance register");
      }

      setFeedback({
        type: "success",
        message: `Attendance register saved successfully for ${data.recordsCount} students.`,
      });
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Error saving attendance register.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoadingClasses) {
    return <LoadingState description="Loading teacher class scopes..." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Daily Attendance Register"
        subtitle="Mark official daily attendance for your assigned class."
        breadcrumbs={[
          { label: "Teacher Portal", href: "/teacher" },
          { label: "Attendance" },
        ]}
      />

      {feedback && (
        <Alert
          variant={feedback.type === "success" ? "success" : "error"}
          title={feedback.type === "success" ? "Register Saved" : "Action Failed"}
          onClose={() => setFeedback(null)}
        >
          {feedback.message}
        </Alert>
      )}

      {/* Filter Controls Bar */}
      <Card className="bg-white border-[#EFE9DF] shadow-xs">
        <CardContent className="p-4 sm:p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label htmlFor="class-select" className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
                Assigned Class
              </label>
              <select
                id="class-select"
                value={selectedClassId}
                onChange={(e) => handleClassChange(e.target.value)}
                className="w-full bg-[#FAF7F2] border border-[#EFE9DF] rounded-lg px-3 py-2 text-sm font-semibold text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#800020] min-h-[44px]"
              >
                {classes.map((cls) => (
                  <option key={`${cls.schoolClassId}_${cls.programmeId}`} value={cls.schoolClassId}>
                    {cls.className} {cls.arm ? `(${cls.arm})` : ""} · {cls.programmeName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="attendance-date" className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
                Attendance Date
              </label>
              <input
                id="attendance-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-[#FAF7F2] border border-[#EFE9DF] rounded-lg px-3 py-2 text-sm font-semibold text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#800020] min-h-[44px]"
              />
            </div>

            <div className="flex items-end gap-2">
              <Button
                variant="outline"
                size="md"
                className="flex-1 min-h-[44px] text-xs font-semibold"
                onClick={() => handleMarkAll("PRESENT")}
                disabled={roster.length === 0 || isLoadingRoster}
              >
                Mark All Present
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Student Attendance Roster */}
      {isLoadingRoster ? (
        <LoadingState description="Loading class attendance roster..." />
      ) : roster.length === 0 ? (
        <EmptyState
          title="No Students in Roster"
          description="No active students are currently enrolled in this class for the selected session."
        />
      ) : (
        <div className="space-y-4">
          {/* Mobile View: Cards with Touch Targets >= 44px */}
          <div className="md:hidden space-y-3">
            {roster.map((item, idx) => {
              const currentStatus = statuses[item.student.id] || "PRESENT";
              return (
                <Card key={item.student.id} className="bg-white border-[#EFE9DF] shadow-xs">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-xs font-mono text-[#800020] font-semibold">
                          {item.student.admissionNumber}
                        </span>
                        <h4 className="text-base font-bold text-[#5B0612]">
                          {idx + 1}. {item.student.lastName}, {item.student.firstName}
                        </h4>
                      </div>
                      <Badge variant="neutral" className="text-[10px]">
                        {item.student.gender}
                      </Badge>
                    </div>

                    {/* Status Pill Buttons with 44px touch targets */}
                    <div className="grid grid-cols-4 gap-1.5">
                      {(["PRESENT", "ABSENT", "LATE", "EXCUSED"] as AttendanceStatusType[]).map((st) => {
                        const isSelected = currentStatus === st;
                        const colorStyles = {
                          PRESENT: isSelected ? "bg-emerald-700 text-white font-bold" : "bg-emerald-50 text-emerald-800 border border-emerald-200",
                          ABSENT: isSelected ? "bg-rose-700 text-white font-bold" : "bg-rose-50 text-rose-800 border border-rose-200",
                          LATE: isSelected ? "bg-amber-700 text-white font-bold" : "bg-amber-50 text-amber-800 border border-amber-200",
                          EXCUSED: isSelected ? "bg-sky-700 text-white font-bold" : "bg-sky-50 text-sky-800 border border-sky-200",
                        }[st];

                        return (
                          <button
                            key={st}
                            type="button"
                            onClick={() => handleStatusChange(item.student.id, st)}
                            className={`min-h-[44px] rounded-lg text-xs transition-colors flex items-center justify-center select-none ${colorStyles}`}
                          >
                            {st}
                          </button>
                        );
                      })}
                    </div>

                    {/* Optional Remark input */}
                    <input
                      type="text"
                      placeholder="Optional remark (e.g. sick with doctor's note)"
                      value={remarks[item.student.id] || ""}
                      onChange={(e) => handleRemarkChange(item.student.id, e.target.value)}
                      className="w-full bg-[#FAF7F2] border border-[#EFE9DF] rounded-lg px-3 py-2 text-xs text-stone-800 placeholder:text-stone-400 min-h-[40px]"
                    />
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Desktop Table with Dual Horizontal Scroll */}
          <div className="hidden md:block">
            <TableWrapper className="border border-[#EFE9DF]">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-[#FAF7F2] border-b border-[#EFE9DF] text-xs font-semibold text-stone-600 uppercase tracking-wider">
                    <th className="py-3.5 px-4 w-12">#</th>
                    <th className="py-3.5 px-4">Admission No.</th>
                    <th className="py-3.5 px-4">Student Name</th>
                    <th className="py-3.5 px-4 text-center">Status</th>
                    <th className="py-3.5 px-4">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFE9DF]">
                  {roster.map((item, idx) => {
                    const currentStatus = statuses[item.student.id] || "PRESENT";
                    return (
                      <tr key={item.student.id} className="hover:bg-[#FAF7F2]/60 transition-colors">
                        <td className="py-3 px-4 text-xs font-mono text-stone-400">{idx + 1}</td>
                        <td className="py-3 px-4 text-xs font-mono font-bold text-[#800020]">{item.student.admissionNumber}</td>
                        <td className="py-3 px-4 font-semibold text-stone-900">
                          {item.student.lastName}, {item.student.firstName}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex justify-center gap-1.5">
                            {(["PRESENT", "ABSENT", "LATE", "EXCUSED"] as AttendanceStatusType[]).map((st) => {
                              const isSelected = currentStatus === st;
                              const colors = {
                                PRESENT: isSelected ? "bg-emerald-700 text-white font-bold" : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
                                ABSENT: isSelected ? "bg-rose-700 text-white font-bold" : "bg-rose-50 text-rose-800 hover:bg-rose-100",
                                LATE: isSelected ? "bg-amber-700 text-white font-bold" : "bg-amber-50 text-amber-800 hover:bg-amber-100",
                                EXCUSED: isSelected ? "bg-sky-700 text-white font-bold" : "bg-sky-50 text-sky-800 hover:bg-sky-100",
                              }[st];

                              return (
                                <button
                                  key={st}
                                  type="button"
                                  onClick={() => handleStatusChange(item.student.id, st)}
                                  className={`px-2.5 py-1.5 min-h-[36px] rounded-md text-xs transition-colors cursor-pointer select-none ${colors}`}
                                >
                                  {st}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <input
                            type="text"
                            placeholder="Optional notes"
                            value={remarks[item.student.id] || ""}
                            onChange={(e) => handleRemarkChange(item.student.id, e.target.value)}
                            className="w-full bg-[#FAF7F2] border border-[#EFE9DF] rounded-md px-2.5 py-1.5 text-xs text-stone-800"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrapper>
          </div>

          {/* Persistent Save Button Container */}
          <div className="sticky bottom-4 z-20 bg-white/95 backdrop-blur-md p-4 rounded-xl border border-[#EFE9DF] shadow-md flex items-center justify-between gap-4">
            <span className="text-xs sm:text-sm font-semibold text-stone-700">
              {roster.length} Student records ready to save
            </span>
            <Button
              variant="primary"
              size="lg"
              className="bg-[#800020] hover:bg-[#6b001a] text-white px-8 font-bold min-h-[48px]"
              onClick={handleSaveAttendance}
              isLoading={isSaving}
            >
              Save Attendance Register
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TeacherAttendancePage() {
  return (
    <Suspense fallback={<LoadingState description="Loading daily attendance register..." />}>
      <TeacherAttendanceContent />
    </Suspense>
  );
}

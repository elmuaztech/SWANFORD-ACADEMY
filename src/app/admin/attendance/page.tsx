"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  Card,
  CardContent,
  Badge,
  Button,
  Input,
  Select,
  Textarea,
  Modal,
  LoadingState,
  ErrorState,
  EmptyState,
  PageHeader,
  Alert,
  FormGroup,
  Table,
  TableHead,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
  TableWrapper,
  TableMobileCard,
} from "@/components";
import { AttendanceStatus } from "@prisma/client";

interface AttendanceRecordItem {
  id: string;
  date: string;
  status: AttendanceStatus;
  remarks: string | null;
  student: { id: string; firstName: string; lastName: string; admissionNumber: string | null };
  programme: { id: string; name: string };
  schoolClass: { id: string; name: string };
  recordedByTeacher: { firstName: string; lastName: string; staffId?: string };
}

interface AttendanceResponse {
  date: string;
  totalRecords: number;
  breakdown: {
    present: number;
    absent: number;
    late: number;
    excused: number;
  };
  records: AttendanceRecordItem[];
}

interface TermRegisterRow {
  student: {
    id: string;
    admissionNumber: string | null;
    firstName: string;
    lastName: string;
    gender: string;
  };
  programme: { id: string; name: string } | null;
  schoolClass: { id: string; name: string } | null;
  daysPresent: number;
  daysLate: number;
  daysAbsent: number;
  daysExcused: number;
  totalDays: number;
  attendancePercentage: number;
}

interface TermRegisterData {
  session: { id?: string; name: string };
  term: { id?: string; name: string };
  programme: { id: string; name: string; code?: string } | null;
  schoolClass: { id: string; name: string; code?: string } | null;
  totalStudents: number;
  totalSessionsHeld: number;
  averageAttendanceRate: number;
  register: TermRegisterRow[];
}

export default function AdminAttendancePage() {
  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);

  // Top Tabs
  const [activeTab, setActiveTab] = useState<"daily" | "termRegister">("daily");

  // Metadata Lists
  const [programmesList, setProgrammesList] = useState<Array<{ id: string; name: string }>>([]);
  const [classesList, setClassesList] = useState<Array<{ id: string; name: string; programmeId: string }>>([]);
  const [sessionsList, setSessionsList] = useState<Array<{
    id: string;
    name: string;
    isCurrent: boolean;
    terms: Array<{ id: string; name: string; isCurrent: boolean }>;
  }>>([]);

  // Daily Attendance Filters
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [periodFilter, setPeriodFilter] = useState<"day" | "week" | "month" | "term">("day");
  const [selectedProgFilter, setSelectedProgFilter] = useState("");
  const [selectedClassFilter, setSelectedClassFilter] = useState("");

  const [data, setData] = useState<AttendanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Correction Modal State
  const [correctionRecord, setCorrectionRecord] = useState<AttendanceRecordItem | null>(null);
  const [newStatus, setNewStatus] = useState<AttendanceStatus>(AttendanceStatus.PRESENT);
  const [reason, setReason] = useState("");
  const [correctionRemarks, setCorrectionRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Take Attendance Modal State
  const [showTakeModal, setShowTakeModal] = useState(false);
  const [takeProgId, setTakeProgId] = useState("");
  const [takeClassId, setTakeClassId] = useState("");
  const [takeDate, setTakeDate] = useState(todayStr);
  const [takeRoster, setTakeRoster] = useState<Array<{
    student: { id: string; firstName: string; lastName: string; admissionNumber: string | null; gender?: string };
    attendance: { status: string; remarks?: string | null } | null;
  }>>([]);
  const [takeStatuses, setTakeStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [submittingRoster, setSubmittingRoster] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);

  // Term Register State
  const [termProgId, setTermProgId] = useState("");
  const [termClassId, setTermClassId] = useState("");
  const [termSessionId, setTermSessionId] = useState("");
  const [termTermId, setTermTermId] = useState("");
  const [termRegisterData, setTermRegisterData] = useState<TermRegisterData | null>(null);
  const [loadingTermRegister, setLoadingTermRegister] = useState(false);
  const [termRegisterError, setTermRegisterError] = useState<string | null>(null);

  // 1. Fetch metadata (Programmes, Classes, Sessions & Terms)
  useEffect(() => {
    fetch("/api/admin/programmes")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list = Array.isArray(d?.items) ? d.items : Array.isArray(d) ? d : [];
        setProgrammesList(list);
      })
      .catch(() => {});

    fetch("/api/admin/classes")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list = Array.isArray(d?.items) ? d.items : Array.isArray(d) ? d : [];
        setClassesList(list);
      })
      .catch(() => {});

    fetch("/api/admin/academic/sessions")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const sList = Array.isArray(d?.sessions) ? d.sessions : [];
        setSessionsList(sList);
        const curr = sList.find((s: any) => s.isCurrent) || sList[0];
        if (curr) {
          setTermSessionId(curr.id);
          const currTerm = curr.terms?.find((t: any) => t.isCurrent) || curr.terms?.[0];
          if (currTerm) setTermTermId(currTerm.id);
        }
      })
      .catch(() => {});
  }, []);

  // 2. Fetch daily attendance overview
  const fetchAttendance = useCallback(() => {
    setLoading(true);
    setError(null);
    let url = `/api/admin/attendance?period=${periodFilter}`;
    if (periodFilter === "day") {
      url += `&date=${selectedDate}`;
    }
    if (selectedProgFilter) url += `&programmeId=${selectedProgFilter}`;
    if (selectedClassFilter) url += `&schoolClassId=${selectedClassFilter}`;

    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Failed to load attendance records.");
        }
        return res.json();
      })
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Error loading attendance.");
        setLoading(false);
      });
  }, [selectedDate, selectedProgFilter, selectedClassFilter, periodFilter]);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  // 3. Fetch class roster for Roll-Call Modal
  useEffect(() => {
    if (!showTakeModal || !takeProgId || !takeClassId) return;
    setLoadingRoster(true);
    setRosterError(null);
    fetch(`/api/teacher/attendance?programmeId=${takeProgId}&schoolClassId=${takeClassId}&date=${takeDate}`)
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to load class roster.");
        }
        return res.json();
      })
      .then((d) => {
        // Robust fallback: support both d.roster and d.students
        const students = Array.isArray(d?.roster)
          ? d.roster
          : Array.isArray(d?.students)
          ? d.students
          : [];

        setTakeRoster(students);

        // Crucial requirement: default all enrolled students to PRESENT
        const initialMap: Record<string, AttendanceStatus> = {};
        students.forEach((item: any) => {
          initialMap[item.student.id] =
            (item.attendance?.status as AttendanceStatus) || AttendanceStatus.PRESENT;
        });
        setTakeStatuses(initialMap);
        setLoadingRoster(false);
      })
      .catch((e) => {
        setRosterError(e.message);
        setLoadingRoster(false);
      });
  }, [showTakeModal, takeProgId, takeClassId, takeDate]);

  // 4. Fetch Term Attendance Register
  const fetchTermRegister = useCallback(() => {
    setLoadingTermRegister(true);
    setTermRegisterError(null);
    const params = new URLSearchParams();
    if (termProgId) params.append("programmeId", termProgId);
    if (termClassId) params.append("schoolClassId", termClassId);
    if (termSessionId) params.append("academicSessionId", termSessionId);
    if (termTermId) params.append("academicTermId", termTermId);

    fetch(`/api/admin/attendance/term-register?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to load term register.");
        }
        return res.json();
      })
      .then((data: TermRegisterData) => {
        setTermRegisterData(data);
        setLoadingTermRegister(false);
      })
      .catch((err) => {
        setTermRegisterError(err.message);
        setLoadingTermRegister(false);
      });
  }, [termProgId, termClassId, termSessionId, termTermId]);

  useEffect(() => {
    if (activeTab === "termRegister") {
      fetchTermRegister();
    }
  }, [activeTab, fetchTermRegister]);

  // Open Roll Call Modal
  const handleOpenTakeModal = (progId?: string, classId?: string) => {
    setShowTakeModal(true);
    const pId = progId || selectedProgFilter || programmesList[0]?.id || "";
    setTakeProgId(pId);
    const matchingClasses = classesList.filter((c) => !pId || c.programmeId === pId);
    const cId = classId || selectedClassFilter || matchingClasses[0]?.id || classesList[0]?.id || "";
    setTakeClassId(cId);
    setTakeDate(selectedDate || todayStr);
    setRosterError(null);
  };

  const handleMarkAllPresent = () => {
    const updated: Record<string, AttendanceStatus> = {};
    takeRoster.forEach((r) => {
      updated[r.student.id] = AttendanceStatus.PRESENT;
    });
    setTakeStatuses(updated);
  };

  const handleSubmitTakeRoster = async () => {
    if (!takeProgId || !takeClassId || takeRoster.length === 0) return;
    setSubmittingRoster(true);
    setRosterError(null);
    try {
      const items = takeRoster.map((r) => ({
        studentId: r.student.id,
        status: takeStatuses[r.student.id] || AttendanceStatus.PRESENT,
      }));

      const res = await fetch("/api/teacher/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programmeId: takeProgId,
          schoolClassId: takeClassId,
          date: takeDate,
          items,
        }),
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || "Failed to save attendance register.");

      setShowTakeModal(false);
      setActionSuccess(`Class attendance successfully recorded for ${items.length} students.`);
      fetchAttendance();
      if (activeTab === "termRegister") fetchTermRegister();
    } catch (err: unknown) {
      setRosterError(err instanceof Error ? err.message : "Failed to record attendance.");
    } finally {
      setSubmittingRoster(false);
    }
  };

  // Correction handlers
  const openCorrection = (record: AttendanceRecordItem) => {
    setCorrectionRecord(record);
    setNewStatus(record.status);
    setReason("");
    setCorrectionRemarks(record.remarks || "");
    setActionError(null);
    setActionSuccess(null);
  };

  const submitCorrection = async () => {
    if (!correctionRecord) return;
    if (!reason.trim()) {
      setActionError("Please provide an administrative reason for this correction.");
      return;
    }

    setSubmitting(true);
    setActionError(null);
    try {
      const res = await fetch("/api/admin/attendance/correct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: correctionRecord.student.id,
          programmeId: correctionRecord.programme.id,
          schoolClassId: correctionRecord.schoolClass.id,
          date: correctionRecord.date,
          status: newStatus,
          reason: reason.trim(),
          remarks: correctionRemarks.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to correct attendance.");
      setCorrectionRecord(null);
      setActionSuccess("Attendance record corrected and audit entry logged.");
      await fetchAttendance();
      if (activeTab === "termRegister") fetchTermRegister();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Correction failed.");
    } finally {
      setSubmitting(false);
    }
  };

  // Metrics
  const total = data?.totalRecords || data?.records?.length || 0;
  const breakdown = data?.breakdown || { present: 0, absent: 0, late: 0, excused: 0 };
  const presentRate =
    total > 0 ? Math.round(((breakdown.present + breakdown.late) / total) * 100) : 0;

  // Selected session terms
  const currentSessionTerms = useMemo(() => {
    const s = sessionsList.find((sess) => sess.id === termSessionId);
    return s?.terms || [];
  }, [sessionsList, termSessionId]);

  return (
    <div className="space-y-6">
      {/* Print-only Official Sheet Header */}
      <div className="hidden print:block text-center border-b-2 border-stone-800 pb-4 mb-6">
        <h1 className="text-2xl font-black uppercase tracking-wider text-stone-900">
          Swanford Academy
        </h1>
        <p className="text-sm font-semibold uppercase tracking-widest text-stone-700 mt-0.5">
          Official Academic Term Attendance Register
        </p>
        <div className="flex justify-between items-center text-xs text-stone-600 mt-3 pt-2 border-t border-stone-300">
          <div>
            <span className="font-bold">Session:</span> {termRegisterData?.session?.name || "Current Session"} •{" "}
            <span className="font-bold">Term:</span> {termRegisterData?.term?.name || "Current Term"}
          </div>
          <div>
            <span className="font-bold">Class:</span> {termRegisterData?.schoolClass?.name || "All Classes"} •{" "}
            <span className="font-bold">Programme:</span> {termRegisterData?.programme?.name || "All Programmes"}
          </div>
          <div>
            <span className="font-bold">Printed:</span> {new Date().toLocaleDateString("en-GB")}
          </div>
        </div>
      </div>

      {/* Screen Header */}
      <div className="no-print">
        <PageHeader
          title="Attendance Management"
          description="Institutional roll-call registers, daily attendance tracking, and official term registers."
          breadcrumbs={[
            { label: "Dashboard", href: "/admin" },
            { label: "Attendance" },
          ]}
          actions={
            <div className="flex items-center gap-2">
              {activeTab === "termRegister" && (
                <Button
                  variant="outline"
                  size="md"
                  onClick={() => window.print()}
                  className="font-bold flex items-center gap-2 bg-white"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5Zm-3 0h.008v.008H15V10.5Z" />
                  </svg>
                  <span>Print Register</span>
                </Button>
              )}
              <Button
                variant="primary"
                size="md"
                onClick={() => handleOpenTakeModal()}
                className="font-bold flex items-center gap-2 shadow-xs"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                <span>Take Attendance</span>
              </Button>
            </div>
          }
        />

        {/* Tab Switcher */}
        <div className="flex border-b border-stone-200 gap-2 mb-6">
          <button
            type="button"
            onClick={() => setActiveTab("daily")}
            className={`pb-3 px-4 text-xs font-bold transition-all relative flex items-center gap-2 ${
              activeTab === "daily"
                ? "text-[#800020] border-b-2 border-[#800020]"
                : "text-stone-500 hover:text-stone-800"
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
            </svg>
            <span>Daily Roll-Call & Registers</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("termRegister")}
            className={`pb-3 px-4 text-xs font-bold transition-all relative flex items-center gap-2 ${
              activeTab === "termRegister"
                ? "text-[#800020] border-b-2 border-[#800020]"
                : "text-stone-500 hover:text-stone-800"
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
            <span>General Term Register (Printable)</span>
            <Badge variant="brand" size="sm">Official Sheet</Badge>
          </button>
        </div>
      </div>

      {actionSuccess && (
        <div className="no-print">
          <Alert variant="success" onClose={() => setActionSuccess(null)}>
            {actionSuccess}
          </Alert>
        </div>
      )}

      {actionError && (
        <div className="no-print">
          <Alert variant="danger" onClose={() => setActionError(null)}>
            {actionError}
          </Alert>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: DAILY ATTENDANCE & ROLL CALL                                       */}
      {/* ========================================================================= */}
      {activeTab === "daily" && (
        <div className="space-y-6 no-print">
          {/* Aligned Filter Controls Card */}
          <Card className="border border-[#EADBDA]/80 shadow-xs bg-white">
            <CardContent className="p-4 space-y-3">
              {/* Period filter buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-stone-500 uppercase tracking-wider mr-1">Period:</span>
                  <div className="inline-flex rounded-lg p-1 bg-stone-100 border border-stone-200">
                    {(["day", "week", "month", "term"] as const).map((period) => (
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
                        {period === "day"
                          ? "Single Day"
                          : period === "week"
                          ? "This Week"
                          : period === "month"
                          ? "This Month"
                          : "This Term"}
                      </button>
                    ))}
                  </div>
                </div>
                {periodFilter !== "day" && (
                  <span className="text-xs font-medium text-stone-500 bg-stone-50 px-2.5 py-1 rounded-md border border-stone-200">
                    Aggregating attendance records across{" "}
                    {periodFilter === "week"
                      ? "the past 7 days"
                      : periodFilter === "month"
                      ? "this calendar month"
                      : "the current academic term"}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
                {periodFilter === "day" && (
                  <div>
                    <label className="block text-xs font-bold text-stone-600 mb-1">Attendance Date</label>
                    <Input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="w-full"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-bold text-stone-600 mb-1">Programme</label>
                  <Select
                    value={selectedProgFilter}
                    onChange={(e) => {
                      setSelectedProgFilter(e.target.value);
                      setSelectedClassFilter("");
                    }}
                    className="w-full text-xs"
                  >
                    <option value="">All Programmes</option>
                    {programmesList.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-600 mb-1">Class</label>
                  <Select
                    value={selectedClassFilter}
                    onChange={(e) => setSelectedClassFilter(e.target.value)}
                    className="w-full text-xs"
                  >
                    <option value="">All Classes</option>
                    {classesList
                      .filter((c) => !selectedProgFilter || c.programmeId === selectedProgFilter)
                      .map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button variant="primary" size="md" onClick={fetchAttendance} className="flex-1 font-bold">
                    Apply Filters
                  </Button>
                  <Button
                    variant="outline"
                    size="md"
                    onClick={() => {
                      setSelectedDate(todayStr);
                      setSelectedProgFilter("");
                      setSelectedClassFilter("");
                      setPeriodFilter("day");
                    }}
                  >
                    Reset
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {loading ? (
            <div className="py-12">
              <LoadingState message="Loading daily roll-call records..." />
            </div>
          ) : error ? (
            <ErrorState
              title="Attendance Log Unavailable"
              message={error}
              actionLabel="Try Again"
              onAction={fetchAttendance}
            />
          ) : !data || data.records.length === 0 ? (
            <Card className="border border-dashed border-stone-300 bg-stone-50/50 p-8 text-center rounded-2xl">
              <div className="max-w-md mx-auto space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center mx-auto">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.75" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-stone-900 font-display">
                  No Roll-Call Records for {new Date(selectedDate + "T00:00:00").toLocaleDateString()}
                </h3>
                <p className="text-xs text-stone-600 leading-relaxed">
                  Attendance has not yet been submitted for this selection. You can record morning roll-call for any active class now.
                </p>
                <div className="pt-2 flex justify-center gap-3">
                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => handleOpenTakeModal(selectedProgFilter, selectedClassFilter)}
                    className="font-bold flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    <span>Record Class Roll-Call Now</span>
                  </Button>
                </div>
              </div>
            </Card>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="p-3.5 bg-white rounded-xl border border-[#EADBDA]/80 text-center shadow-xs">
                  <span className="text-xs font-semibold text-stone-500">Total Entries</span>
                  <p className="text-2xl font-bold text-stone-900 mt-1 font-display">{total}</p>
                </div>
                <div className="p-3.5 bg-[#FAFDF7] rounded-xl border border-emerald-200 text-center shadow-xs">
                  <span className="text-xs font-semibold text-emerald-800">Present</span>
                  <p className="text-2xl font-bold text-emerald-900 mt-1 font-display">{breakdown.present}</p>
                </div>
                <div className="p-3.5 bg-[#FDFBF7] rounded-xl border border-amber-200 text-center shadow-xs">
                  <span className="text-xs font-semibold text-amber-800">Late</span>
                  <p className="text-2xl font-bold text-amber-900 mt-1 font-display">{breakdown.late}</p>
                </div>
                <div className="p-3.5 bg-[#FDF8F7] rounded-xl border border-rose-200 text-center shadow-xs">
                  <span className="text-xs font-semibold text-rose-800">Absent</span>
                  <p className="text-2xl font-bold text-rose-900 mt-1 font-display">{breakdown.absent}</p>
                </div>
                <div className="p-3.5 bg-[#F8FAFD] rounded-xl border border-blue-200 text-center shadow-xs">
                  <span className="text-xs font-semibold text-blue-800">Attendance Rate</span>
                  <p className="text-2xl font-bold text-blue-900 mt-1 font-display">{presentRate}%</p>
                </div>
              </div>

              {/* Desktop Semantic Table View (>= 768px) */}
              <div className="hidden md:block">
                <TableWrapper className="border border-[#EADBDA]/80">
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell className="w-14 text-center font-semibold text-stone-700">S/N</TableHeaderCell>
                        <TableHeaderCell className="min-w-[180px] text-left font-semibold text-stone-700">Student</TableHeaderCell>
                        <TableHeaderCell className="w-36 text-left font-semibold text-stone-700">Class</TableHeaderCell>
                        <TableHeaderCell className="w-44 text-left font-semibold text-stone-700">Programme</TableHeaderCell>
                        <TableHeaderCell className="w-28 text-left font-semibold text-stone-700">Status</TableHeaderCell>
                        <TableHeaderCell className="min-w-[160px] text-left font-semibold text-stone-700">Recorded By</TableHeaderCell>
                        <TableHeaderCell className="min-w-[160px] text-left font-semibold text-stone-700">Remarks</TableHeaderCell>
                        <TableHeaderCell className="w-32 text-right font-semibold text-stone-700">Action</TableHeaderCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.records.map((rec, index) => (
                        <TableRow key={rec.id}>
                          <TableCell className="w-14 text-center text-xs font-semibold text-stone-500">
                            {index + 1}
                          </TableCell>
                          <TableCell className="min-w-[180px]">
                            <div className="font-bold text-stone-900">
                              {rec.student.firstName} {rec.student.lastName}
                            </div>
                            <span className="font-mono text-xs text-stone-400">
                              {rec.student.admissionNumber || "—"}
                            </span>
                          </TableCell>
                          <TableCell className="w-36 text-xs text-stone-800 font-semibold">
                            {rec.schoolClass.name}
                          </TableCell>
                          <TableCell className="w-44 text-xs text-stone-600">
                            {rec.programme.name}
                          </TableCell>
                          <TableCell className="w-28">
                            <Badge
                              variant={
                                rec.status === "PRESENT"
                                  ? "success"
                                  : rec.status === "LATE"
                                  ? "warning"
                                  : rec.status === "EXCUSED"
                                  ? "info"
                                  : "danger"
                              }
                              size="sm"
                            >
                              {rec.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="min-w-[160px] text-xs text-stone-600">
                            {rec.recordedByTeacher?.firstName} {rec.recordedByTeacher?.lastName}
                          </TableCell>
                          <TableCell className="min-w-[160px] text-xs text-stone-500">
                            {rec.remarks || "—"}
                          </TableCell>
                          <TableCell className="w-32 text-right">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => openCorrection(rec)}
                              className="bg-[#FDF2F4] text-[#5B0612] hover:bg-[#F9E2E6] font-semibold whitespace-nowrap min-h-[36px]"
                            >
                              Correct
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableWrapper>
              </div>

              {/* Mobile Responsive Cards (< 768px) */}
              <div className="block md:hidden space-y-3">
                {data.records.map((rec, index) => (
                  <TableMobileCard
                    key={rec.id}
                    title={
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-stone-100 text-stone-700 text-xs font-bold shrink-0">
                          {index + 1}
                        </span>
                        <span className="font-bold text-sm text-stone-900">
                          {rec.student.firstName} {rec.student.lastName}
                        </span>
                      </div>
                    }
                    subtitle={
                      <div className="font-mono text-xs text-stone-500 mt-0.5">
                        {rec.student.admissionNumber || "—"} • {rec.schoolClass.name}
                      </div>
                    }
                    badge={
                      <Badge
                        variant={
                          rec.status === "PRESENT"
                            ? "success"
                            : rec.status === "LATE"
                            ? "warning"
                            : rec.status === "EXCUSED"
                            ? "info"
                            : "danger"
                        }
                        size="sm"
                      >
                        {rec.status}
                      </Badge>
                    }
                    fields={[
                      { label: "Programme", value: rec.programme.name },
                      {
                        label: "Teacher",
                        value: `${rec.recordedByTeacher?.firstName} ${rec.recordedByTeacher?.lastName}`,
                      },
                      { label: "Remarks", value: rec.remarks || "—" },
                    ]}
                    actions={
                      <Button
                        variant="secondary"
                        size="md"
                        onClick={() => openCorrection(rec)}
                        className="w-full bg-[#FDF2F4] text-[#5B0612] hover:bg-[#F9E2E6] font-semibold min-h-[44px]"
                      >
                        Correct Attendance
                      </Button>
                    }
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: GENERAL TERM REGISTER (PRINTABLE)                                  */}
      {/* ========================================================================= */}
      {activeTab === "termRegister" && (
        <div className="space-y-6">
          {/* Controls Bar (Hidden during print) */}
          <Card className="border border-[#EADBDA]/80 bg-white shadow-xs no-print">
            <CardContent className="p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
                <div>
                  <label className="block text-xs font-bold text-stone-600 mb-1">Academic Session</label>
                  <Select
                    value={termSessionId}
                    onChange={(e) => {
                      setTermSessionId(e.target.value);
                      const s = sessionsList.find((sess) => sess.id === e.target.value);
                      setTermTermId(s?.terms?.[0]?.id || "");
                    }}
                    className="w-full text-xs"
                  >
                    {sessionsList.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.isCurrent ? "(Current)" : ""}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-600 mb-1">Academic Term</label>
                  <Select
                    value={termTermId}
                    onChange={(e) => setTermTermId(e.target.value)}
                    className="w-full text-xs"
                  >
                    <option value="">All Terms in Session</option>
                    {currentSessionTerms.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} {t.isCurrent ? "(Current)" : ""}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-600 mb-1">Programme</label>
                  <Select
                    value={termProgId}
                    onChange={(e) => {
                      setTermProgId(e.target.value);
                      setTermClassId("");
                    }}
                    className="w-full text-xs"
                  >
                    <option value="">All Programmes</option>
                    {programmesList.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-600 mb-1">Class</label>
                  <Select
                    value={termClassId}
                    onChange={(e) => setTermClassId(e.target.value)}
                    className="w-full text-xs"
                  >
                    <option value="">All Classes</option>
                    {classesList
                      .filter((c) => !termProgId || c.programmeId === termProgId)
                      .map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                  </Select>
                </div>
              </div>

              <div className="pt-2 border-t border-stone-100 flex items-center justify-between gap-3">
                <span className="text-xs text-stone-500">
                  Select a specific Class or Programme to generate targeted grade registers.
                </span>
                <div className="flex gap-2">
                  <Button variant="primary" size="sm" onClick={fetchTermRegister} className="font-bold">
                    Refresh Register
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.print()}
                    className="font-bold flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5Zm-3 0h.008v.008H15V10.5Z" />
                    </svg>
                    <span>Print</span>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {loadingTermRegister ? (
            <div className="py-12 no-print">
              <LoadingState message="Compiling official term attendance register..." />
            </div>
          ) : termRegisterError ? (
            <div className="no-print">
              <ErrorState
                title="Failed to Load Term Register"
                message={termRegisterError}
                actionLabel="Retry"
                onAction={fetchTermRegister}
              />
            </div>
          ) : !termRegisterData || termRegisterData.register.length === 0 ? (
            <div className="no-print">
              <EmptyState
                title="No Enrolled Pupils Found"
                description="No active students match the selected programme, class, or term. Check your filters or ensure pupils are enrolled."
              />
            </div>
          ) : (
            <>
              {/* Term Statistics Header Cards (Hidden during print) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 no-print">
                <div className="p-3.5 bg-white rounded-xl border border-[#EADBDA]/80 text-center shadow-xs">
                  <span className="text-xs font-semibold text-stone-500">Enrolled Pupils</span>
                  <p className="text-2xl font-bold text-stone-900 mt-1 font-display">
                    {termRegisterData.totalStudents}
                  </p>
                </div>
                <div className="p-3.5 bg-[#FAFDF7] rounded-xl border border-emerald-200 text-center shadow-xs">
                  <span className="text-xs font-semibold text-emerald-800">Roll-Calls Conducted</span>
                  <p className="text-2xl font-bold text-emerald-900 mt-1 font-display">
                    {termRegisterData.totalSessionsHeld} Days
                  </p>
                </div>
                <div className="p-3.5 bg-[#F8FAFD] rounded-xl border border-blue-200 text-center shadow-xs">
                  <span className="text-xs font-semibold text-blue-800">Term Average Rate</span>
                  <p className="text-2xl font-bold text-blue-900 mt-1 font-display">
                    {termRegisterData.averageAttendanceRate}%
                  </p>
                </div>
                <div className="p-3.5 bg-[#FDFBF7] rounded-xl border border-amber-200 text-center shadow-xs">
                  <span className="text-xs font-semibold text-amber-800">Perfect Attendance</span>
                  <p className="text-2xl font-bold text-amber-900 mt-1 font-display">
                    {termRegisterData.register.filter((r) => r.attendancePercentage === 100).length}
                  </p>
                </div>
              </div>

              {/* Official Register Table (Prints beautifully) */}
              <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-xs print:border-none print:shadow-none">
                <div className="px-5 py-3.5 border-b border-stone-200 bg-stone-50/50 flex items-center justify-between no-print">
                  <div>
                    <h3 className="text-sm font-bold text-stone-900 font-display">
                      {termRegisterData.schoolClass?.name || "School-Wide"} Register Sheet
                    </h3>
                    <p className="text-xs text-stone-500">
                      Term: {termRegisterData.term?.name} • Session: {termRegisterData.session?.name}
                    </p>
                  </div>
                  <Badge variant="brand" size="sm">
                    {termRegisterData.register.length} Pupils
                  </Badge>
                </div>

                <TableWrapper className="border-0 shadow-none">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-stone-100 text-stone-700 font-bold border-b border-stone-200 print:bg-stone-200 print:text-black">
                        <th className="py-2.5 px-3 text-center w-12 border-r border-stone-200">S/N</th>
                        <th className="py-2.5 px-3 min-w-[110px] border-r border-stone-200">Adm No</th>
                        <th className="py-2.5 px-3 min-w-[180px] border-r border-stone-200">Pupil Full Name</th>
                        <th className="py-2.5 px-3 w-16 text-center border-r border-stone-200">Gender</th>
                        <th className="py-2.5 px-3 min-w-[120px] border-r border-stone-200">Class</th>
                        <th className="py-2.5 px-3 text-center text-emerald-800 font-bold border-r border-stone-200 bg-emerald-50/40 print:bg-transparent">
                          Present
                        </th>
                        <th className="py-2.5 px-3 text-center text-amber-800 font-bold border-r border-stone-200 bg-amber-50/40 print:bg-transparent">
                          Late
                        </th>
                        <th className="py-2.5 px-3 text-center text-rose-800 font-bold border-r border-stone-200 bg-rose-50/40 print:bg-transparent">
                          Absent
                        </th>
                        <th className="py-2.5 px-3 text-center text-blue-800 font-bold border-r border-stone-200 bg-blue-50/40 print:bg-transparent">
                          Excused
                        </th>
                        <th className="py-2.5 px-3 text-center font-bold border-r border-stone-200">Total</th>
                        <th className="py-2.5 px-3 text-center font-bold">Rate (%)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-200">
                      {termRegisterData.register.map((row, idx) => (
                        <tr
                          key={row.student.id}
                          className="hover:bg-stone-50 transition-colors print:hover:bg-transparent"
                        >
                          <td className="py-2 px-3 text-center font-mono font-medium text-stone-500 border-r border-stone-200">
                            {idx + 1}
                          </td>
                          <td className="py-2 px-3 font-mono text-stone-700 font-medium border-r border-stone-200 whitespace-nowrap">
                            {row.student.admissionNumber || "—"}
                          </td>
                          <td className="py-2 px-3 font-bold text-stone-900 border-r border-stone-200">
                            {row.student.lastName}, {row.student.firstName}
                          </td>
                          <td className="py-2 px-3 text-center text-stone-600 border-r border-stone-200 uppercase font-medium">
                            {row.student.gender ? row.student.gender[0] : "—"}
                          </td>
                          <td className="py-2 px-3 text-stone-700 border-r border-stone-200 whitespace-nowrap">
                            {row.schoolClass?.name || "—"}
                          </td>
                          <td className="py-2 px-3 text-center font-bold text-emerald-700 border-r border-stone-200 bg-emerald-50/20 print:bg-transparent">
                            {row.daysPresent}
                          </td>
                          <td className="py-2 px-3 text-center font-bold text-amber-700 border-r border-stone-200 bg-amber-50/20 print:bg-transparent">
                            {row.daysLate}
                          </td>
                          <td className="py-2 px-3 text-center font-bold text-rose-700 border-r border-stone-200 bg-rose-50/20 print:bg-transparent">
                            {row.daysAbsent}
                          </td>
                          <td className="py-2 px-3 text-center font-bold text-blue-700 border-r border-stone-200 bg-blue-50/20 print:bg-transparent">
                            {row.daysExcused}
                          </td>
                          <td className="py-2 px-3 text-center font-medium text-stone-700 border-r border-stone-200">
                            {row.totalDays}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span
                              className={`inline-block px-2 py-0.5 rounded font-bold text-[11px] ${
                                row.attendancePercentage >= 90
                                  ? "bg-emerald-100 text-emerald-800"
                                  : row.attendancePercentage >= 75
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-rose-100 text-rose-800"
                              } print:bg-transparent print:text-black`}
                            >
                              {row.attendancePercentage}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrapper>

                {/* Print-only Signatures Section */}
                <div className="hidden print:block pt-12 pb-6 px-4 mt-6 border-t-2 border-stone-800 text-xs">
                  <div className="grid grid-cols-3 gap-6">
                    <div>
                      <p className="font-bold text-stone-800 mb-8">Class Teacher's Signature:</p>
                      <div className="border-b border-stone-400 w-44" />
                      <p className="text-[10px] text-stone-500 mt-1">Date: ________________________</p>
                    </div>

                    <div>
                      <p className="font-bold text-stone-800 mb-8">Head of School / Principal:</p>
                      <div className="border-b border-stone-400 w-44" />
                      <p className="text-[10px] text-stone-500 mt-1">Date: ________________________</p>
                    </div>

                    <div className="text-right">
                      <p className="font-bold text-stone-800 mb-4">Official School Stamp:</p>
                      <div className="border border-dashed border-stone-400 w-32 h-20 ml-auto rounded-lg flex items-center justify-center text-stone-400 text-[9px] uppercase tracking-wider">
                        Seal / Stamp
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: ADMINISTRATIVE ATTENDANCE CORRECTION                             */}
      {/* ========================================================================= */}
      {correctionRecord && (
        <Modal
          isOpen={true}
          onClose={() => setCorrectionRecord(null)}
          title="Administrative Attendance Correction"
        >
          <div className="space-y-4 pt-2">
            <div className="p-3 bg-[#FAF7F2] rounded-xl border border-[#EADBDA] text-xs">
              <p className="font-bold text-stone-900">
                Student: {correctionRecord.student.firstName} {correctionRecord.student.lastName}
              </p>
              <p className="text-stone-600 mt-0.5">
                Class: {correctionRecord.schoolClass.name} • Date:{" "}
                {new Date(correctionRecord.date).toLocaleDateString()}
              </p>
              <p className="text-stone-600 mt-1">
                Current Status: <span className="font-bold text-stone-900">{correctionRecord.status}</span>
              </p>
            </div>

            <FormGroup label="Corrected Status">
              <Select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as AttendanceStatus)}
              >
                <option value="PRESENT">Present</option>
                <option value="LATE">Late</option>
                <option value="ABSENT">Absent</option>
                <option value="EXCUSED">Excused</option>
              </Select>
            </FormGroup>

            <FormGroup label="Administrative Reason" required hint="Required for audit compliance">
              <Textarea
                rows={2}
                placeholder="Reason for correction (e.g. medical excuse letter presented, clerical error)..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </FormGroup>

            <FormGroup label="Remarks (Optional)">
              <Input
                placeholder="Additional notes for roll-call log..."
                value={correctionRemarks}
                onChange={(e) => setCorrectionRemarks(e.target.value)}
              />
            </FormGroup>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setCorrectionRecord(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={submitting || !reason.trim()}
                onClick={submitCorrection}
                className="font-bold"
              >
                {submitting ? "Saving..." : "Apply Correction & Log Audit"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: RECORD CLASS ROLL-CALL                                           */}
      {/* ========================================================================= */}
      {showTakeModal && (
        <Modal
          isOpen={true}
          onClose={() => setShowTakeModal(false)}
          title="Record Class Roll-Call"
        >
          <div className="space-y-4 pt-2">
            {rosterError && (
              <Alert variant="danger" onClose={() => setRosterError(null)}>
                {rosterError}
              </Alert>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <FormGroup label="Programme" required>
                <Select
                  value={takeProgId}
                  onChange={(e) => {
                    const newProg = e.target.value;
                    setTakeProgId(newProg);
                    const matchingClass = classesList.find((c) => c.programmeId === newProg);
                    if (matchingClass) setTakeClassId(matchingClass.id);
                  }}
                >
                  <option value="">Select Programme</option>
                  {programmesList.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Select>
              </FormGroup>

              <FormGroup label="Class" required>
                <Select
                  value={takeClassId}
                  onChange={(e) => setTakeClassId(e.target.value)}
                >
                  <option value="">Select Class</option>
                  {classesList
                    .filter((c) => !takeProgId || c.programmeId === takeProgId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </Select>
              </FormGroup>

              <FormGroup label="Date" required>
                <Input
                  type="date"
                  value={takeDate}
                  onChange={(e) => setTakeDate(e.target.value)}
                />
              </FormGroup>
            </div>

            {loadingRoster ? (
              <div className="py-8">
                <LoadingState message="Loading class roster..." />
              </div>
            ) : takeRoster.length === 0 ? (
              <div className="py-8 text-center bg-stone-50 rounded-xl border border-dashed border-stone-200">
                <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-2 text-stone-400">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                  </svg>
                </div>
                <p className="text-xs font-bold text-stone-800">No Active Students Enrolled</p>
                <p className="text-[11px] text-stone-500 mt-1 max-w-sm mx-auto">
                  No enrolled pupils were found for this class and programme. Ensure students are enrolled under Active status.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between pt-2 border-t border-stone-200">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-stone-800 font-display">
                      Enrolled Pupils ({takeRoster.length})
                    </span>
                    <span className="text-[11px] text-stone-500">
                      • Defaulted to Present
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleMarkAllPresent}
                    className="text-xs text-emerald-700 hover:text-emerald-800 font-semibold"
                  >
                    Mark All Present
                  </Button>
                </div>

                <div className="max-h-[340px] overflow-y-auto space-y-2 pr-1">
                  {takeRoster.map((item) => {
                    const currentStatus = takeStatuses[item.student.id] || "PRESENT";
                    return (
                      <div
                        key={item.student.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl border border-stone-200/90 bg-white hover:border-[#800020]/30 transition-all shadow-2xs"
                      >
                        <div>
                          <p className="text-xs font-bold text-stone-900">
                            {item.student.lastName}, {item.student.firstName}
                          </p>
                          <p className="text-[11px] font-mono text-stone-500">
                            {item.student.admissionNumber || "No Adm No"}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {(["PRESENT", "LATE", "ABSENT", "EXCUSED"] as AttendanceStatus[]).map((st) => (
                            <button
                              key={st}
                              type="button"
                              onClick={() =>
                                setTakeStatuses((prev) => ({ ...prev, [item.student.id]: st }))
                              }
                              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all min-h-[32px] cursor-pointer ${
                                currentStatus === st
                                  ? st === "PRESENT"
                                    ? "bg-emerald-600 text-white shadow-xs"
                                    : st === "LATE"
                                    ? "bg-amber-600 text-white shadow-xs"
                                    : st === "ABSENT"
                                    ? "bg-rose-600 text-white shadow-xs"
                                    : "bg-blue-600 text-white shadow-xs"
                                  : "bg-stone-50 border border-stone-200 text-stone-600 hover:bg-stone-100"
                              }`}
                            >
                              {st === "PRESENT"
                                ? "Present"
                                : st === "LATE"
                                ? "Late"
                                : st === "ABSENT"
                                ? "Absent"
                                : "Excused"}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
              <Button variant="outline" onClick={() => setShowTakeModal(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={submittingRoster || takeRoster.length === 0}
                onClick={handleSubmitTakeRoster}
                className="font-bold"
              >
                {submittingRoster ? "Saving..." : "Submit Attendance Register"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

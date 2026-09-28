"use client";

import React, { useEffect, useState } from "react";
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
  recordedByTeacher: { firstName: string; lastName: string; staffId: string };
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

export default function AdminAttendancePage() {
  const todayStr = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [periodFilter, setPeriodFilter] = useState<"day" | "week" | "month" | "term">("day");
  const [selectedProgFilter, setSelectedProgFilter] = useState("");
  const [selectedClassFilter, setSelectedClassFilter] = useState("");
  const [programmesList, setProgrammesList] = useState<Array<{ id: string; name: string }>>([]);
  const [classesList, setClassesList] = useState<Array<{ id: string; name: string; programmeId: string }>>([]);

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
    student: { id: string; firstName: string; lastName: string; admissionNumber: string | null };
    attendance: { status: string } | null;
  }>>([]);
  const [takeStatuses, setTakeStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [submittingRoster, setSubmittingRoster] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);

  // 1. Fetch metadata (Programmes and Classes)
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
  }, []);

  const fetchAttendance = () => {
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
  };

  useEffect(() => {
    fetchAttendance();
  }, [selectedDate, selectedProgFilter, selectedClassFilter, periodFilter]);

  // Load roster when take modal programme and class are chosen
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
        const students = Array.isArray(d?.students) ? d.students : [];
        setTakeRoster(students);
        const initialMap: Record<string, AttendanceStatus> = {};
        students.forEach((item: any) => {
          initialMap[item.student.id] = (item.attendance?.status as AttendanceStatus) || AttendanceStatus.PRESENT;
        });
        setTakeStatuses(initialMap);
        setLoadingRoster(false);
      })
      .catch((e) => {
        setRosterError(e.message);
        setLoadingRoster(false);
      });
  }, [showTakeModal, takeProgId, takeClassId, takeDate]);

  const handleOpenTakeModal = () => {
    setShowTakeModal(true);
    setTakeProgId(programmesList[0]?.id || "");
    setTakeClassId(classesList[0]?.id || "");
    setTakeDate(selectedDate);
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
    } catch (err: unknown) {
      setRosterError(err instanceof Error ? err.message : "Failed to record attendance.");
    } finally {
      setSubmittingRoster(false);
    }
  };

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
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Correction failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const total = data?.totalRecords || 0;
  const presentRate =
    total > 0 && data
      ? Math.round(((data.breakdown.present + data.breakdown.late) / total) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        description="Daily student attendance registers and roll-call records."
        breadcrumbs={[
          { label: "Dashboard", href: "/admin" },
          { label: "Attendance" },
        ]}
        actions={
          <Button variant="primary" size="md" onClick={handleOpenTakeModal} className="font-bold">
            + Take Attendance
          </Button>
        }
      />

      {/* Aligned Filter Controls Card */}
      <Card className="border border-[#EADBDA]/80 shadow-xs">
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
                    {period === "day" ? "Single Day" : period === "week" ? "This Week" : period === "month" ? "This Month" : "This Term"}
                  </button>
                ))}
              </div>
            </div>
            {periodFilter !== "day" && (
              <span className="text-xs font-medium text-stone-500 bg-stone-50 px-2.5 py-1 rounded-md border border-stone-200">
                Aggregating attendance records across {periodFilter === "week" ? "the past 7 days" : periodFilter === "month" ? "this calendar month" : "the current academic term"}
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
                }}
              >
                Reset
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {actionSuccess && (
        <Alert variant="success" onClose={() => setActionSuccess(null)}>
          {actionSuccess}
        </Alert>
      )}

      {actionError && (
        <Alert variant="danger" onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}

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
        <EmptyState
          title={`No Attendance Recorded for ${new Date(selectedDate + "T00:00:00").toLocaleDateString()}`}
          description="Teachers have not recorded attendance rolls for this date yet. Check back after daily morning roll call or select another date."
          actionLabel="View Today"
          onAction={() => setSelectedDate(todayStr)}
        />
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="p-3 bg-white rounded-xl border border-[#EADBDA]/80 text-center shadow-xs">
              <span className="text-xs font-semibold text-stone-500">Total Entries</span>
              <p className="text-2xl font-bold text-stone-900 mt-1">{total}</p>
            </div>
            <div className="p-3 bg-[#FAFDF7] rounded-xl border border-emerald-200 text-center shadow-xs">
              <span className="text-xs font-semibold text-emerald-800">Present</span>
              <p className="text-2xl font-bold text-emerald-900 mt-1">{data.breakdown.present}</p>
            </div>
            <div className="p-3 bg-[#FDFBF7] rounded-xl border border-amber-200 text-center shadow-xs">
              <span className="text-xs font-semibold text-amber-800">Late</span>
              <p className="text-2xl font-bold text-amber-900 mt-1">{data.breakdown.late}</p>
            </div>
            <div className="p-3 bg-[#FDF8F7] rounded-xl border border-rose-200 text-center shadow-xs">
              <span className="text-xs font-semibold text-rose-800">Absent</span>
              <p className="text-2xl font-bold text-rose-900 mt-1">{data.breakdown.absent}</p>
            </div>
            <div className="p-3 bg-[#F8FAFD] rounded-xl border border-blue-200 text-center shadow-xs">
              <span className="text-xs font-semibold text-blue-800">Attendance Rate</span>
              <p className="text-2xl font-bold text-blue-900 mt-1">{presentRate}%</p>
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

      {/* Correction Modal */}
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
                Class: {correctionRecord.schoolClass.name} • Date: {new Date(correctionRecord.date).toLocaleDateString()}
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
                placeholder="Reason for correction (e.g. medical excuse letter presented, teacher clerical error)..."
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

      {/* Take Attendance Modal */}
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
                    setTakeProgId(e.target.value);
                    const matchingClass = classesList.find((c) => c.programmeId === e.target.value);
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
              <div className="py-6 text-center text-stone-500 text-xs">
                No active students enrolled in this class and programme.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between pt-2 border-t border-stone-200">
                  <span className="text-xs font-semibold text-stone-600">
                    Enrolled Pupils ({takeRoster.length})
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleMarkAllPresent}
                    className="text-xs text-emerald-700 hover:text-emerald-800"
                  >
                    Mark All Present
                  </Button>
                </div>

                <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1">
                  {takeRoster.map((item) => {
                    const currentStatus = takeStatuses[item.student.id] || "PRESENT";
                    return (
                      <div
                        key={item.student.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-lg border border-stone-200/80 bg-stone-50/50"
                      >
                        <div>
                          <p className="text-xs font-bold text-stone-900">
                            {item.student.firstName} {item.student.lastName}
                          </p>
                          <p className="text-[11px] font-mono text-stone-500">
                            {item.student.admissionNumber || "No Adm No"}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {(["PRESENT", "LATE", "ABSENT", "EXCUSED"] as AttendanceStatus[]).map((st) => (
                            <button
                              key={st}
                              type="button"
                              onClick={() =>
                                setTakeStatuses((prev) => ({ ...prev, [item.student.id]: st }))
                              }
                              className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all min-h-[32px] ${
                                currentStatus === st
                                  ? st === "PRESENT"
                                    ? "bg-emerald-600 text-white shadow-xs"
                                    : st === "LATE"
                                    ? "bg-amber-600 text-white shadow-xs"
                                    : st === "ABSENT"
                                    ? "bg-rose-600 text-white shadow-xs"
                                    : "bg-blue-600 text-white shadow-xs"
                                  : "bg-white border border-stone-200 text-stone-600 hover:bg-stone-100"
                              }`}
                            >
                              {st}
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
                {submittingRoster ? "Submitting Register..." : "Submit Attendance Register"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

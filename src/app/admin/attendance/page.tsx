"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
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
  const [data, setData] = useState<AttendanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Correction Modal State
  const [correctionRecord, setCorrectionRecord] = useState<AttendanceRecordItem | null>(null);
  const [newStatus, setNewStatus] = useState<AttendanceStatus>(AttendanceStatus.PRESENT);
  const [reason, setReason] = useState("");
  const [correctionRemarks, setCorrectionRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchAttendance = () => {
    setLoading(true);
    setError(null);
    fetch(`/api/admin/attendance?date=${selectedDate}`)
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
    fetch(`/api/admin/attendance?date=${selectedDate}`)
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
  }, [selectedDate]);

  const openCorrection = (record: AttendanceRecordItem) => {
    setCorrectionRecord(record);
    setNewStatus(record.status);
    setReason("");
    setCorrectionRemarks(record.remarks || "");
  };

  const submitCorrection = async () => {
    if (!correctionRecord) return;
    if (!reason.trim()) {
      alert("Please provide an administrative reason for this correction.");
      return;
    }

    setSubmitting(true);
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
      await fetchAttendance();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Correction failed.");
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight">
            Attendance Verification & Correction
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Review teacher roll-call entries and execute audit-backed administrative corrections.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-44"
          />
          <Button variant="outline" size="md" onClick={fetchAttendance}>
            Refresh
          </Button>
        </div>
      </div>

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
        <Card className="py-12 text-center">
          <CardContent>
            <p className="text-base font-semibold text-stone-700">No attendance records found for {selectedDate}.</p>
            <p className="text-xs text-stone-500 mt-1">Teachers may not have recorded attendance for this date yet.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="p-3 bg-white rounded-xl border border-stone-200 text-center">
              <span className="text-xs font-semibold text-stone-500">Total Entries</span>
              <p className="text-2xl font-bold text-stone-900 mt-1">{total}</p>
            </div>
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-center">
              <span className="text-xs font-semibold text-emerald-800">Present</span>
              <p className="text-2xl font-bold text-emerald-900 mt-1">{data.breakdown.present}</p>
            </div>
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-center">
              <span className="text-xs font-semibold text-amber-800">Late</span>
              <p className="text-2xl font-bold text-amber-900 mt-1">{data.breakdown.late}</p>
            </div>
            <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-center">
              <span className="text-xs font-semibold text-rose-800">Absent</span>
              <p className="text-2xl font-bold text-rose-900 mt-1">{data.breakdown.absent}</p>
            </div>
            <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 text-center">
              <span className="text-xs font-semibold text-blue-800">Attendance Rate</span>
              <p className="text-2xl font-bold text-blue-900 mt-1">{presentRate}%</p>
            </div>
          </div>

          {/* Roll-call Table */}
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Programme</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Recorded By</TableHead>
                    <TableHead>Remarks</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.records.map((rec) => (
                    <TableRow key={rec.id}>
                      <TableCell className="font-bold text-stone-900">
                        <div>
                          {rec.student.firstName} {rec.student.lastName}
                        </div>
                        <span className="text-[11px] font-mono text-stone-500">
                          {rec.student.admissionNumber || "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-stone-800">
                        {rec.schoolClass.name}
                      </TableCell>
                      <TableCell className="text-xs text-stone-600">
                        {rec.programme.name}
                      </TableCell>
                      <TableCell>
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
                      <TableCell className="text-xs text-stone-600">
                        {rec.recordedByTeacher?.firstName} {rec.recordedByTeacher?.lastName}
                      </TableCell>
                      <TableCell className="text-xs text-stone-500">
                        {rec.remarks || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openCorrection(rec)}
                          className="text-[#5B0612] hover:bg-[#FDF2F4] font-semibold"
                        >
                          Correct
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
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
            <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs">
              <p className="font-bold text-stone-900">
                Student: {correctionRecord.student.firstName} {correctionRecord.student.lastName}
              </p>
              <p className="text-stone-600">
                Class: {correctionRecord.schoolClass.name} • Date: {new Date(correctionRecord.date).toLocaleDateString()}
              </p>
              <p className="text-stone-600 mt-1">Current Status: <span className="font-bold">{correctionRecord.status}</span></p>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Corrected Status</label>
              <Select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as AttendanceStatus)}
              >
                <option value="PRESENT">Present</option>
                <option value="LATE">Late</option>
                <option value="ABSENT">Absent</option>
                <option value="EXCUSED">Excused</option>
              </Select>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Administrative Reason (Required)</label>
              <Textarea
                rows={2}
                placeholder="Reason for correction (e.g. medical excuse letter presented, teacher clerical error)..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Remarks (Optional)</label>
              <Input
                placeholder="Additional notes for roll-call log..."
                value={correctionRemarks}
                onChange={(e) => setCorrectionRemarks(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setCorrectionRecord(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={submitting || !reason.trim()}
                onClick={submitCorrection}
                className="bg-[#5B0612] text-white font-bold"
              >
                {submitting ? "Saving..." : "Apply Correction & Log Audit"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

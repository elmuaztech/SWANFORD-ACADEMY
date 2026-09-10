"use client";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { Avatar } from "@/components/ui/avatar";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { StudentStatus } from "@prisma/client";

interface StudentDetail {
  id: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  gender: string;
  dob: string;
  status: StudentStatus;
  primaryClass: { id: string; name: string } | null;
  tahfeezClass: { id: string; name: string } | null;
  user: { id: string; email: string } | null;
  programmeEnrollments: Array<{
    id: string;
    programme: { name: string; code: string };
    schoolClass: { name: string };
    status: string;
  }>;
  guardians: Array<{
    id: string;
    relationshipType: string;
    isPrimaryPayer: boolean;
    isEmergencyContact: boolean;
    guardian: {
      id: string;
      firstName: string;
      lastName: string;
      phonePrimary: string;
      email: string | null;
      residentialAddress: string | null;
    };
  }>;
  attendanceRecords: Array<{
    id: string;
    date: string;
    status: string;
    remarks: string | null;
    schoolClass: { name: string };
  }>;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    totalAmountKobo: string;
    amountPaidKobo: string;
    outstandingBalanceKobo: string;
    status: string;
  }>;
}

export default function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const studentId = resolvedParams.id;
  const router = useRouter();

  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Status Change Modal State
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState<StudentStatus>(StudentStatus.ACTIVE);
  const [statusReason, setStatusReason] = useState("");
  const [statusSubmitting, setStatusSubmitting] = useState(false);

  const fetchStudent = () => {
    setLoading(true);
    setError(null);
    fetch(`/api/admin/students/${studentId}`)
      .then(async (res) => {
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Failed to load student details.");
        }
        return res.json();
      })
      .then((json) => {
        setStudent(json);
        setNewStatus(json.status);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load student.");
        setLoading(false);
      });
  };

  useEffect(() => {
    fetch(`/api/admin/students/${studentId}`)
      .then(async (res) => {
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Failed to load student details.");
        }
        return res.json();
      })
      .then((json) => {
        setStudent(json);
        setNewStatus(json.status);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load student.");
        setLoading(false);
      });
  }, [studentId]);

  const handleStatusChange = async () => {
    if (!statusReason.trim()) {
      alert("Please provide an administrative reason for this status change.");
      return;
    }
    setStatusSubmitting(true);
    try {
      const res = await fetch(`/api/admin/students/${studentId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, reason: statusReason.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update status.");
      setShowStatusModal(false);
      setStatusReason("");
      await fetchStudent();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Status update failed.");
    } finally {
      setStatusSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="py-12">
        <LoadingState message="Loading student records..." />
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="py-8">
        <ErrorState
          title="Student Record Unavailable"
          message={error || "Could not find student dossier."}
          actionLabel="Return to Students"
          onAction={() => router.push("/admin/students")}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-stone-500 mb-1">
            <Link href="/admin/students" className="hover:underline">
              ← Students Directory
            </Link>
            <span>/</span>
            <span className="font-mono">{student.admissionNumber}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight">
            {student.firstName} {student.middleName ? `${student.middleName} ` : ""}{student.lastName}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="md"
            onClick={() => setShowStatusModal(true)}
            className="font-bold border-stone-300"
          >
            Manage Enrollment Status
          </Button>
        </div>
      </div>

      {/* Overview Card & Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Student Bio Card */}
        <Card className="md:col-span-1">
          <CardHeader className="text-center pb-2">
            <div className="flex justify-center mb-3">
              <Avatar
                size="lg"
                fallback={`${student.firstName[0]}${student.lastName[0]}`}
                alt={`${student.firstName} ${student.lastName}`}
              />
            </div>
            <CardTitle className="text-lg font-bold text-stone-900">
              {student.firstName} {student.lastName}
            </CardTitle>
            <span className="text-xs font-mono font-bold text-[#5B0612]">{student.admissionNumber}</span>
          </CardHeader>
          <CardContent className="space-y-3 pt-2 text-xs">
            <div className="flex justify-between py-1.5 border-b border-stone-100">
              <span className="text-stone-500">Enrollment Status</span>
              <Badge
                variant={
                  student.status === "ACTIVE"
                    ? "success"
                    : student.status === "SUSPENDED"
                    ? "warning"
                    : "danger"
                }
                size="sm"
              >
                {student.status}
              </Badge>
            </div>
            <div className="flex justify-between py-1.5 border-b border-stone-100">
              <span className="text-stone-500">Gender</span>
              <span className="font-semibold text-stone-900">{student.gender}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-stone-100">
              <span className="text-stone-500">Date of Birth</span>
              <span className="font-semibold text-stone-900">
                {new Date(student.dob).toLocaleDateString()}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-stone-100">
              <span className="text-stone-500">Primary Class</span>
              <span className="font-bold text-stone-900">{student.primaryClass?.name || "Unassigned"}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-stone-100">
              <span className="text-stone-500">Tahfeez Class</span>
              <span className="font-bold text-stone-900">{student.tahfeezClass?.name || "Unassigned"}</span>
            </div>
          </CardContent>
        </Card>

        {/* Right Column: Guardians & Enrollments */}
        <div className="md:col-span-2 space-y-6">
          {/* Linked Guardians */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold text-stone-900">Linked Guardians</CardTitle>
            </CardHeader>
            <CardContent>
              {student.guardians.length === 0 ? (
                <p className="text-xs text-stone-500">No guardian contacts linked to student.</p>
              ) : (
                <div className="space-y-3">
                  {student.guardians.map((g) => (
                    <div
                      key={g.id}
                      className="p-3 rounded-xl border border-stone-200 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-stone-900">
                            {g.guardian.firstName} {g.guardian.lastName}
                          </span>
                          <span className="text-xs text-stone-500">({g.relationshipType})</span>
                          {g.isPrimaryPayer && (
                            <Badge variant="brand" size="sm">
                              Primary Payer
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-stone-600 mt-0.5">Phone: {g.guardian.phonePrimary}</p>
                        {g.guardian.email && (
                          <p className="text-xs text-stone-600">Email: {g.guardian.email}</p>
                        )}
                      </div>
                      <Link href={`/admin/guardians/${g.guardian.id}`}>
                        <Button variant="ghost" size="sm" className="text-[#5B0612] font-semibold">
                          View Guardian →
                        </Button>
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Programme Enrollments */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold text-stone-900">Programme Enrollments</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {student.programmeEnrollments.map((enr) => (
                  <div
                    key={enr.id}
                    className="p-3 rounded-xl border border-stone-200 bg-stone-50 flex items-center justify-between"
                  >
                    <div>
                      <p className="font-bold text-sm text-stone-900">{enr.programme.name}</p>
                      <p className="text-xs text-stone-600">Assigned Class: {enr.schoolClass.name}</p>
                    </div>
                    <Badge variant="success" size="sm">
                      {enr.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Attendance History */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold text-stone-900">Recent Attendance Records</CardTitle>
            <p className="text-xs text-stone-500">Roll-call entries for this student</p>
          </div>
          <Link href="/admin/attendance">
            <Button variant="outline" size="sm">
              Attendance Log
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {student.attendanceRecords.length === 0 ? (
            <p className="p-6 text-center text-sm text-stone-500">No attendance entries recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Remarks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {student.attendanceRecords.map((att) => (
                    <TableRow key={att.id}>
                      <TableCell className="text-xs font-semibold text-stone-900">
                        {new Date(att.date).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-xs text-stone-700">{att.schoolClass.name}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            att.status === "PRESENT"
                              ? "success"
                              : att.status === "LATE"
                              ? "warning"
                              : "danger"
                          }
                          size="sm"
                        >
                          {att.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-stone-500">{att.remarks || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status Management Modal */}
      <Modal
        isOpen={showStatusModal}
        onClose={() => setShowStatusModal(false)}
        title="Change Student Enrollment Status"
      >
        <div className="space-y-4 pt-2">
          <p className="text-xs text-stone-600">
            Modifying a student&apos;s status affects enrollment, class participation, and invoice generation.
            An authoritative audit entry is logged.
          </p>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">Target Status</label>
            <Select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value as StudentStatus)}
            >
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="EXPELLED">Expelled</option>
              <option value="WITHDRAWN">Withdrawn</option>
              <option value="GRADUATED">Graduated</option>
            </Select>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">Administrative Reason</label>
            <Textarea
              rows={3}
              placeholder="State reason for status change (required for audit compliance)..."
              value={statusReason}
              onChange={(e) => setStatusReason(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowStatusModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={statusSubmitting || !statusReason.trim()}
              onClick={handleStatusChange}
              className="bg-[#5B0612] text-white font-bold"
            >
              {statusSubmitting ? "Updating..." : "Confirm Status Change"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

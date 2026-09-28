"use client";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Button,
  Modal,
  Textarea,
  Select,
  LoadingState,
  ErrorState,
  Avatar,
  Table,
  TableHeader,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
  TableWrapper,
  PageHeader,
  Alert,
} from "@/components";
import { ImageUpload } from "@/components/ui/image-upload";
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
  profilePhotoId?: string | null;
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
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Status Change Modal State
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
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
    fetchStudent();
  }, [studentId]);

  const handleStatusChange = async () => {
    if (!statusReason.trim()) {
      setActionError("Please provide a reason for the enrollment status modification.");
      return;
    }
    setStatusSubmitting(true);
    setActionError(null);
    setActionSuccess(null);
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
      setActionSuccess(`Enrollment status updated to ${newStatus}.`);
      await fetchStudent();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Status update failed.");
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
      <PageHeader
        title={`${student.firstName} ${student.middleName ? `${student.middleName} ` : ""}${student.lastName}`}
        description={`Admission #${student.admissionNumber} • Primary Class: ${student.primaryClass?.name || "Unassigned"}`}
        breadcrumbs={[
          { label: "Dashboard", href: "/admin" },
          { label: "Students", href: "/admin/students" },
          { label: student.admissionNumber },
        ]}
        actions={
          <Button
            variant="outline"
            size="md"
            onClick={() => setShowStatusModal(true)}
            className="font-bold border-stone-300"
          >
            Manage Enrollment Status
          </Button>
        }
      />

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

      {/* Overview Card & Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Student Bio Card */}
        <Card className="md:col-span-1 border border-[#EADBDA]/80">
          <CardHeader className="text-center pb-2">
            <div className="flex flex-col items-center justify-center mb-3">
              <Avatar
                size="xl"
                src={student.profilePhotoId ? `/api/media/${student.profilePhotoId}` : null}
                fallback={`${student.firstName[0]}${student.lastName[0]}`}
                alt={`${student.firstName} ${student.lastName}`}
              />
              <button
                type="button"
                onClick={() => setShowPhotoModal(true)}
                className="mt-2 text-xs font-semibold text-[#800020] hover:text-[#5B0612] hover:underline transition-colors min-h-[36px] flex items-center justify-center px-2.5 py-1 rounded-md bg-[#FAF7F2] border border-[#EADBDA]/60"
              >
                {student.profilePhotoId ? "📷 Change Photo" : "📷 Upload Photo"}
              </button>
            </div>
            <CardTitle className="text-lg font-bold text-stone-900">
              {student.firstName} {student.lastName}
            </CardTitle>
            <span className="text-xs font-mono font-bold text-[#800020]">{student.admissionNumber}</span>
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
          <Card className="border border-[#EADBDA]/80">
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
                        <Button variant="ghost" size="sm" className="text-[#800020] font-semibold">
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
          <Card className="border border-[#EADBDA]/80">
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
      <Card className="border border-[#EADBDA]/80">
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
            <TableWrapper>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell>Date</TableHeaderCell>
                    <TableHeaderCell>Class</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    <TableHeaderCell>Remarks</TableHeaderCell>
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
            </TableWrapper>
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
              className="font-bold"
            >
              {statusSubmitting ? "Updating..." : "Confirm Status Change"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Student Identification Photo Upload Modal */}
      {showPhotoModal && (
        <Modal
          isOpen={showPhotoModal}
          onClose={() => setShowPhotoModal(false)}
          title={`Identification Photo — ${student.firstName} ${student.lastName}`}
        >
          <div className="p-4 space-y-4">
            <ImageUpload
              label="Student Passport Photo"
              helperText="Upload official student passport photograph. Automatically compressed to preserve face clarity while saving VPS bandwidth."
              currentImageUrl={student.profilePhotoId ? `/api/media/${student.profilePhotoId}` : null}
              uploadEndpoint={`/api/admin/students/${studentId}/photo`}
              onUploadSuccess={({ assetId }) => {
                setStudent((prev) => (prev ? { ...prev, profilePhotoId: assetId } : null));
                setShowPhotoModal(false);
                setActionSuccess("Student identification photo successfully updated.");
              }}
              onRemove={async () => {
                try {
                  const res = await fetch(`/api/admin/students/${studentId}/photo`, { method: "DELETE" });
                  if (res.ok) {
                    setStudent((prev) => (prev ? { ...prev, profilePhotoId: null } : null));
                    setShowPhotoModal(false);
                    setActionSuccess("Student identification photo removed.");
                  }
                } catch {
                  // ignore
                }
              }}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}

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
  Input,
  Textarea,
  Select,
  FormGroup,
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
import { StudentStatus, Gender } from "@prisma/client";

interface StudentDetail {
  id: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  otherNames?: string | null;
  preferredName?: string | null;
  gender: string;
  dob?: string;
  dateOfBirth?: string;
  status: StudentStatus;
  currentStatus?: StudentStatus;
  profilePhotoId?: string | null;
  primaryClass: { id: string; name: string } | null;
  tahfeezClass: { id: string; name: string } | null;
  user?: { id: string; email: string } | null;
  bloodGroup?: string | null;
  genotype?: string | null;
  medicalNotes?: string | null;
  allergies?: string | null;
  medicalConditions?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelationship?: string | null;
  programmeEnrollments?: Array<{
    id: string;
    programme: { name: string; code: string };
    schoolClass: { name: string };
    status: string;
  }>;
  guardians?: Array<{
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
  attendanceRecords?: Array<{
    id: string;
    date: string;
    status: string;
    remarks: string | null;
    schoolClass: { name: string };
  }>;
  invoices?: Array<{
    id: string;
    invoiceNumber: string;
    totalAmountKobo: string;
    amountPaidKobo: string;
    outstandingBalanceKobo: string;
    status: string;
  }>;
}

interface AvailableClass {
  id: string;
  name: string;
  code: string;
  programme?: { id: string; code: string; name: string };
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

  // Current authenticated user (to check Super Admin privilege)
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string; roles?: string[] } | null>(null);
  const isSuperAdmin = Boolean(currentUser?.roles?.includes("SUPER_ADMIN"));

  // Status Change Modal State
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [newStatus, setNewStatus] = useState<StudentStatus>(StudentStatus.ACTIVE);
  const [statusReason, setStatusReason] = useState("");
  const [statusSubmitting, setStatusSubmitting] = useState(false);

  // Edit Student Dossier Modal State (Super Admin Exclusive)
  const [showEditModal, setShowEditModal] = useState(false);
  const [availableClasses, setAvailableClasses] = useState<AvailableClass[]>([]);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    firstName: "",
    lastName: "",
    otherNames: "",
    preferredName: "",
    gender: "MALE" as Gender,
    dateOfBirth: "",
    currentStatus: "ACTIVE" as StudentStatus,
    bloodGroup: "",
    genotype: "",
    allergies: "",
    medicalConditions: "",
    medicalNotes: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    emergencyContactRelationship: "",
    primaryClassId: "",
    tahfeezClassId: "",
  });

  // Delete Student Modal State (Super Admin Exclusive)
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
        setNewStatus(json.status || json.currentStatus || StudentStatus.ACTIVE);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load student.");
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchStudent();
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user) setCurrentUser(d.user);
      })
      .catch(() => {});
  }, [studentId]);

  // Load available school classes when edit modal is opened
  useEffect(() => {
    if (showEditModal && availableClasses.length === 0) {
      fetch("/api/admin/classes?includeInactive=false")
        .then((r) => r.json())
        .then((d) => {
          if (Array.isArray(d.items)) {
            setAvailableClasses(d.items);
          }
        })
        .catch(() => {});
    }
  }, [showEditModal, availableClasses.length]);

  const handleOpenEditModal = () => {
    if (!student) return;
    const dobFormatted = student.dateOfBirth
      ? new Date(student.dateOfBirth).toISOString().split("T")[0]
      : student.dob
      ? new Date(student.dob).toISOString().split("T")[0]
      : "";

    setEditForm({
      firstName: student.firstName || "",
      lastName: student.lastName || "",
      otherNames: student.otherNames || student.middleName || "",
      preferredName: student.preferredName || "",
      gender: (student.gender as Gender) || Gender.MALE,
      dateOfBirth: dobFormatted,
      currentStatus: student.currentStatus || student.status || StudentStatus.ACTIVE,
      bloodGroup: student.bloodGroup || "",
      genotype: student.genotype || "",
      allergies: student.allergies || "",
      medicalConditions: student.medicalConditions || "",
      medicalNotes: student.medicalNotes || "",
      emergencyContactName: student.emergencyContactName || "",
      emergencyContactPhone: student.emergencyContactPhone || "",
      emergencyContactRelationship: student.emergencyContactRelationship || "",
      primaryClassId: student.primaryClass?.id || "",
      tahfeezClassId: student.tahfeezClass?.id || "",
    });
    setEditError(null);
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editForm.firstName.trim() || !editForm.lastName.trim()) {
      setEditError("Pupil first name and last name are required.");
      return;
    }

    setEditSubmitting(true);
    setEditError(null);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch(`/api/admin/students/${studentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: editForm.firstName.trim(),
          lastName: editForm.lastName.trim(),
          otherNames: editForm.otherNames.trim() || null,
          preferredName: editForm.preferredName.trim() || null,
          gender: editForm.gender,
          dateOfBirth: editForm.dateOfBirth ? new Date(editForm.dateOfBirth).toISOString() : undefined,
          currentStatus: editForm.currentStatus,
          bloodGroup: editForm.bloodGroup.trim() || null,
          genotype: editForm.genotype.trim() || null,
          allergies: editForm.allergies.trim() || null,
          medicalConditions: editForm.medicalConditions.trim() || null,
          medicalNotes: editForm.medicalNotes.trim() || null,
          emergencyContactName: editForm.emergencyContactName.trim() || null,
          emergencyContactPhone: editForm.emergencyContactPhone.trim() || null,
          emergencyContactRelationship: editForm.emergencyContactRelationship.trim() || null,
          primaryClassId: editForm.primaryClassId || null,
          tahfeezClassId: editForm.tahfeezClassId || null,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update student dossier.");

      setShowEditModal(false);
      setActionSuccess("Student dossier and academic assignments updated successfully.");
      fetchStudent();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Failed to update student profile.");
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDeleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (deleteConfirmation.trim() !== student?.admissionNumber) {
      setDeleteError(`Please type "${student?.admissionNumber}" exactly to confirm permanent deletion.`);
      return;
    }

    setDeleteSubmitting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/admin/students/${studentId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to delete student record.");

      setShowDeleteModal(false);
      router.push("/admin/students?actionNotice=student_deleted");
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete student.");
      setDeleteSubmitting(false);
    }
  };

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
      fetchStudent();
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

  // Defensive array resolution to guarantee zero runtime crashes
  const guardians = student.guardians || [];
  const programmeEnrollments = student.programmeEnrollments || [];
  const attendanceRecords = student.attendanceRecords || [];
  const invoices = student.invoices || [];

  const mainClasses = availableClasses.filter(
    (c) => !c.programme || c.programme.code !== "TAHFEEZ"
  );
  const tahfeezClasses = availableClasses.filter(
    (c) => c.programme && c.programme.code === "TAHFEEZ"
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <PageHeader
        title={`${student.firstName} ${student.otherNames || student.middleName ? `${student.otherNames || student.middleName} ` : ""}${student.lastName}`}
        description={`Admission #${student.admissionNumber} • Primary Class: ${student.primaryClass?.name || "Unassigned"}`}
        breadcrumbs={[
          { label: "Dashboard", href: "/admin" },
          { label: "Students", href: "/admin/students" },
          { label: student.admissionNumber },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="md"
              onClick={() => setShowStatusModal(true)}
              className="font-bold border-stone-300 min-h-[44px]"
            >
              Enrollment Status
            </Button>
            {isSuperAdmin ? (
              <>
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleOpenEditModal}
                  className="font-bold min-h-[44px]"
                >
                  ✏️ Edit Student Dossier
                </Button>
                <Button
                  variant="danger"
                  size="md"
                  onClick={() => {
                    setDeleteConfirmation("");
                    setDeleteError(null);
                    setShowDeleteModal(true);
                  }}
                  className="font-bold min-h-[44px]"
                >
                  🗑️ Delete Student
                </Button>
              </>
            ) : (
              <Badge variant="neutral" size="sm" className="py-1 px-2.5 text-xs text-stone-500">
                Super Admin Privilege Required to Edit / Delete
              </Badge>
            )}
          </div>
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

      {/* Overview Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Student Bio & Medical Info */}
        <div className="md:col-span-1 space-y-6">
          <Card className="border border-[#EADBDA]/80">
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
              {student.preferredName && (
                <p className="text-xs text-stone-500 italic">(&quot;{student.preferredName}&quot;)</p>
              )}
              <span className="text-xs font-mono font-bold text-[#800020]">{student.admissionNumber}</span>
            </CardHeader>
            <CardContent className="space-y-3 pt-2 text-xs">
              <div className="flex justify-between py-1.5 border-b border-stone-100">
                <span className="text-stone-500">Enrollment Status</span>
                <Badge
                  variant={
                    (student.currentStatus || student.status) === "ACTIVE"
                      ? "success"
                      : (student.currentStatus || student.status) === "SUSPENDED"
                      ? "warning"
                      : "danger"
                  }
                  size="sm"
                >
                  {student.currentStatus || student.status}
                </Badge>
              </div>
              <div className="flex justify-between py-1.5 border-b border-stone-100">
                <span className="text-stone-500">Gender</span>
                <span className="font-semibold text-stone-900">{student.gender}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-stone-100">
                <span className="text-stone-500">Date of Birth</span>
                <span className="font-semibold text-stone-900">
                  {student.dateOfBirth
                    ? new Date(student.dateOfBirth).toLocaleDateString()
                    : student.dob
                    ? new Date(student.dob).toLocaleDateString()
                    : "—"}
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

          {/* Medical Profile Card */}
          <Card className="border border-[#EADBDA]/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-stone-900 flex items-center justify-between">
                <span>Medical & Clinical Safety</span>
                <span className="text-xs font-normal text-stone-500">Confidential</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-stone-100">
                <span className="text-stone-500">Blood Group</span>
                <span className="font-bold text-stone-900">{student.bloodGroup || "Not Recorded"}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-100">
                <span className="text-stone-500">Genotype</span>
                <span className="font-bold text-stone-900">{student.genotype || "Not Recorded"}</span>
              </div>
              <div className="py-1 border-b border-stone-100">
                <span className="text-stone-500 block mb-0.5">Allergies</span>
                <span className="text-stone-900 font-medium">{student.allergies || "None reported"}</span>
              </div>
              <div className="py-1 border-b border-stone-100">
                <span className="text-stone-500 block mb-0.5">Medical Conditions</span>
                <span className="text-stone-900 font-medium">{student.medicalConditions || "None reported"}</span>
              </div>
              <div className="py-1">
                <span className="text-stone-500 block mb-0.5">Emergency Contact</span>
                {student.emergencyContactName ? (
                  <p className="font-semibold text-stone-900">
                    {student.emergencyContactName} ({student.emergencyContactRelationship || "Contact"}) •{" "}
                    {student.emergencyContactPhone || "No phone"}
                  </p>
                ) : (
                  <p className="text-stone-500">None explicitly listed</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Guardians & Enrollments */}
        <div className="md:col-span-2 space-y-6">
          {/* Linked Guardians */}
          <Card className="border border-[#EADBDA]/80">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold text-stone-900">Linked Guardians</CardTitle>
            </CardHeader>
            <CardContent>
              {guardians.length === 0 ? (
                <p className="text-xs text-stone-500">No guardian contacts linked to student.</p>
              ) : (
                <div className="space-y-3">
                  {guardians.map((g) => (
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
                        <Button variant="ghost" size="sm" className="text-[#800020] font-semibold min-h-[36px]">
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
              {programmeEnrollments.length === 0 ? (
                <p className="text-xs text-stone-500">No active programme enrollments recorded.</p>
              ) : (
                <div className="space-y-2">
                  {programmeEnrollments.map((enr) => (
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
              )}
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
            <Button variant="outline" size="sm" className="min-h-[36px]">
              Attendance Log
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {attendanceRecords.length === 0 ? (
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
                  {attendanceRecords.map((att) => (
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

      {/* Financial Invoices Table */}
      <Card className="border border-[#EADBDA]/80">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold text-stone-900">Student Invoices</CardTitle>
            <p className="text-xs text-stone-500">Tuition, term fees, and auxiliary billing records</p>
          </div>
          <Link href="/admin/finance">
            <Button variant="outline" size="sm" className="min-h-[36px]">
              Finance Ledger
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {invoices.length === 0 ? (
            <p className="p-6 text-center text-sm text-stone-500">No invoices issued for this student yet.</p>
          ) : (
            <TableWrapper>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell>Invoice #</TableHeaderCell>
                    <TableHeaderCell>Total Amount</TableHeaderCell>
                    <TableHeaderCell>Amount Paid</TableHeaderCell>
                    <TableHeaderCell>Balance</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="text-xs font-mono font-bold text-stone-900">
                        {inv.invoiceNumber}
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-stone-900">
                        ₦{(Number(inv.totalAmountKobo) / 100).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs text-emerald-700 font-semibold">
                        ₦{(Number(inv.amountPaidKobo) / 100).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs text-stone-700">
                        ₦{(Number(inv.outstandingBalanceKobo) / 100).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            inv.status === "PAID"
                              ? "success"
                              : inv.status === "PARTIALLY_PAID"
                              ? "warning"
                              : "danger"
                          }
                          size="sm"
                        >
                          {inv.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableWrapper>
          )}
        </CardContent>
      </Card>

      {/* Edit Student Dossier Modal (Super Admin Exclusive) */}
      {showEditModal && (
        <Modal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          title={`Edit Student Dossier — ${student.admissionNumber}`}
        >
          <form onSubmit={handleEditSubmit} className="space-y-4 pt-2">
            {editError && (
              <Alert variant="danger" onClose={() => setEditError(null)}>
                {editError}
              </Alert>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormGroup label="First Name" required>
                <Input
                  value={editForm.firstName}
                  onChange={(e) => setEditForm((p) => ({ ...p, firstName: e.target.value }))}
                  required
                />
              </FormGroup>
              <FormGroup label="Last Name" required>
                <Input
                  value={editForm.lastName}
                  onChange={(e) => setEditForm((p) => ({ ...p, lastName: e.target.value }))}
                  required
                />
              </FormGroup>
              <FormGroup label="Other Names (Middle)">
                <Input
                  value={editForm.otherNames}
                  onChange={(e) => setEditForm((p) => ({ ...p, otherNames: e.target.value }))}
                />
              </FormGroup>
              <FormGroup label="Preferred Name">
                <Input
                  value={editForm.preferredName}
                  onChange={(e) => setEditForm((p) => ({ ...p, preferredName: e.target.value }))}
                />
              </FormGroup>
              <FormGroup label="Gender" required>
                <Select
                  value={editForm.gender}
                  onChange={(e) => setEditForm((p) => ({ ...p, gender: e.target.value as Gender }))}
                >
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                </Select>
              </FormGroup>
              <FormGroup label="Date of Birth" required>
                <Input
                  type="date"
                  value={editForm.dateOfBirth}
                  onChange={(e) => setEditForm((p) => ({ ...p, dateOfBirth: e.target.value }))}
                  required
                />
              </FormGroup>
            </div>

            <div className="border-t border-stone-200 pt-3">
              <h4 className="text-xs font-bold text-stone-800 uppercase tracking-wider mb-2">
                Academic Class Assignments
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormGroup label="Primary Academic Class">
                  <Select
                    value={editForm.primaryClassId}
                    onChange={(e) => setEditForm((p) => ({ ...p, primaryClassId: e.target.value }))}
                  >
                    <option value="">— Unassigned —</option>
                    {mainClasses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.programme ? `(${c.programme.name})` : ""}
                      </option>
                    ))}
                  </Select>
                </FormGroup>
                <FormGroup label="Tahfeez Halaqah Class">
                  <Select
                    value={editForm.tahfeezClassId}
                    onChange={(e) => setEditForm((p) => ({ ...p, tahfeezClassId: e.target.value }))}
                  >
                    <option value="">— None / Not Enrolled —</option>
                    {tahfeezClasses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </FormGroup>
              </div>
            </div>

            <div className="border-t border-stone-200 pt-3">
              <h4 className="text-xs font-bold text-stone-800 uppercase tracking-wider mb-2">
                Medical & Emergency Safety Profile
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormGroup label="Blood Group">
                  <Select
                    value={editForm.bloodGroup}
                    onChange={(e) => setEditForm((p) => ({ ...p, bloodGroup: e.target.value }))}
                  >
                    <option value="">Unknown / Not Provided</option>
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                  </Select>
                </FormGroup>
                <FormGroup label="Genotype">
                  <Select
                    value={editForm.genotype}
                    onChange={(e) => setEditForm((p) => ({ ...p, genotype: e.target.value }))}
                  >
                    <option value="">Unknown / Not Provided</option>
                    <option value="AA">AA</option>
                    <option value="AS">AS</option>
                    <option value="SS">SS</option>
                    <option value="AC">AC</option>
                  </Select>
                </FormGroup>
                <FormGroup label="Known Allergies" className="sm:col-span-2">
                  <Input
                    placeholder="e.g. Peanuts, Penicillin, Asthma triggers..."
                    value={editForm.allergies}
                    onChange={(e) => setEditForm((p) => ({ ...p, allergies: e.target.value }))}
                  />
                </FormGroup>
                <FormGroup label="Medical Conditions" className="sm:col-span-2">
                  <Input
                    placeholder="e.g. Mild asthma, wears corrective lenses..."
                    value={editForm.medicalConditions}
                    onChange={(e) => setEditForm((p) => ({ ...p, medicalConditions: e.target.value }))}
                  />
                </FormGroup>
                <FormGroup label="Emergency Contact Name">
                  <Input
                    value={editForm.emergencyContactName}
                    onChange={(e) => setEditForm((p) => ({ ...p, emergencyContactName: e.target.value }))}
                  />
                </FormGroup>
                <FormGroup label="Emergency Contact Phone">
                  <Input
                    value={editForm.emergencyContactPhone}
                    onChange={(e) => setEditForm((p) => ({ ...p, emergencyContactPhone: e.target.value }))}
                  />
                </FormGroup>
                <FormGroup label="Emergency Relationship" className="sm:col-span-2">
                  <Input
                    placeholder="e.g. Uncle, Mother, Family Physician"
                    value={editForm.emergencyContactRelationship}
                    onChange={(e) => setEditForm((p) => ({ ...p, emergencyContactRelationship: e.target.value }))}
                  />
                </FormGroup>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowEditModal(false)}
                className="min-h-[44px]"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={editSubmitting}
                className="font-bold min-h-[44px]"
              >
                {editSubmitting ? "Saving Changes..." : "Save Student Dossier"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Student Confirmation Modal (Super Admin Exclusive) */}
      {showDeleteModal && (
        <Modal
          isOpen={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          title="Permanently Delete Student Dossier"
        >
          <form onSubmit={handleDeleteSubmit} className="space-y-4 pt-2">
            <Alert variant="danger">
              <p className="font-bold text-sm">Action cannot be reversed!</p>
              <p className="text-xs mt-1">
                Permanently deleting this student removes their student profile, guardian relationships,
                active and historical programme enrollments, attendance roll-calls, and academic dossiers.
              </p>
            </Alert>

            {deleteError && (
              <Alert variant="danger" onClose={() => setDeleteError(null)}>
                {deleteError}
              </Alert>
            )}

            <div>
              <p className="text-xs text-stone-700 mb-2">
                To confirm permanent deletion of{" "}
                <span className="font-bold text-stone-900">
                  {student.firstName} {student.lastName}
                </span>
                , please enter their admission number{" "}
                <span className="font-mono font-bold text-[#800020] bg-stone-100 px-1 py-0.5 rounded">
                  {student.admissionNumber}
                </span>{" "}
                below:
              </p>
              <Input
                placeholder={`Type "${student.admissionNumber}" to confirm`}
                value={deleteConfirmation}
                onChange={(e) => setDeleteConfirmation(e.target.value)}
                required
                className="font-mono text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-stone-200">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowDeleteModal(false)}
                className="min-h-[44px]"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="danger"
                disabled={deleteSubmitting || deleteConfirmation.trim() !== student.admissionNumber}
                className="font-bold min-h-[44px]"
              >
                {deleteSubmitting ? "Deleting Record..." : "Confirm Permanent Deletion"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

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
            <Button variant="outline" onClick={() => setShowStatusModal(false)} className="min-h-[44px]">
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={statusSubmitting || !statusReason.trim()}
              onClick={handleStatusChange}
              className="font-bold min-h-[44px]"
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

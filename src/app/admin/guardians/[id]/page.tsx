"use client";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Button,
  LoadingState,
  ErrorState,
  Avatar,
  Modal,
  FormGroup,
  Input,
  Select,
  Checkbox,
  Alert,
} from "@/components";

interface StudentItem {
  id: string;
  admissionNumber: string | null;
  firstName: string;
  lastName: string;
  currentStatus: string;
}

interface GuardianDetail {
  id: string;
  title: string | null;
  firstName: string;
  lastName: string;
  relationshipType: string;
  phonePrimary: string;
  phoneSecondary: string | null;
  email: string | null;
  occupation: string | null;
  residentialAddress: string | null;
  user: {
    id: string;
    email: string;
    status: string;
    lastLoginAt: string | null;
  } | null;
  relationships: Array<{
    id: string;
    relationshipType: string;
    isPrimaryContact: boolean;
    canPickup: boolean;
    receivesInvoices: boolean;
    student: {
      id: string;
      admissionNumber: string | null;
      firstName: string;
      lastName: string;
      currentStatus: string;
      programmeEnrollments?: Array<{
        programme: { name: string; code: string };
        schoolClass?: { name: string; arm?: string } | null;
      }>;
    };
  }>;
}

export default function GuardianDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const guardianId = resolvedParams.id;

  const [guardian, setGuardian] = useState<GuardianDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionAlert, setActionAlert] = useState<{ type: "success" | "danger"; message: string } | null>(null);

  // Portal Account Action state
  const [provisioning, setProvisioning] = useState(false);

  // Link Student Modal state
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [searchResults, setSearchResults] = useState<StudentItem[]>([]);
  const [searchingStudents, setSearchingStudents] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [linkRelationType, setLinkRelationType] = useState("FATHER");
  const [linkPrimary, setLinkPrimary] = useState(false);
  const [linkPickup, setLinkPickup] = useState(true);
  const [linkInvoices, setLinkInvoices] = useState(true);
  const [linkingStudent, setLinkingStudent] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Unlink state
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

  const fetchGuardian = () => {
    setLoading(true);
    setError(null);
    fetch(`/api/admin/guardians/${guardianId}`)
      .then(async (res) => {
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Failed to load guardian record.");
        }
        return res.json();
      })
      .then((json) => {
        setGuardian(json);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Error retrieving guardian.");
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchGuardian();
  }, [guardianId]);

  const handleProvisionPortalAccount = async () => {
    if (!guardian) return;
    setProvisioning(true);
    setActionAlert(null);
    try {
      const res = await fetch(`/api/admin/guardians/${guardianId}/user`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to provision portal account.");
      }
      setActionAlert({
        type: "success",
        message: data.message || "Portal account created and activation email dispatched.",
      });
      fetchGuardian();
    } catch (err: unknown) {
      setActionAlert({
        type: "danger",
        message: err instanceof Error ? err.message : "Failed to provision account.",
      });
    } finally {
      setProvisioning(false);
    }
  };

  const handleSearchStudents = (query: string) => {
    setStudentSearch(query);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    setSearchingStudents(true);
    fetch(`/api/admin/students?search=${encodeURIComponent(query.trim())}&limit=10`)
      .then((res) => res.json())
      .then((json) => {
        setSearchResults(json.students || []);
        setSearchingStudents(false);
      })
      .catch(() => {
        setSearchingStudents(false);
      });
  };

  const handleOpenLinkModal = () => {
    setSelectedStudentId("");
    setStudentSearch("");
    setSearchResults([]);
    setLinkRelationType("FATHER");
    setLinkPrimary(false);
    setLinkPickup(true);
    setLinkInvoices(true);
    setLinkError(null);
    setShowLinkModal(true);
  };

  const handleLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentId) {
      setLinkError("Please select a student to link.");
      return;
    }
    setLinkingStudent(true);
    setLinkError(null);

    try {
      const res = await fetch(`/api/admin/guardians/${guardianId}/relationships`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: selectedStudentId,
          relationshipType: linkRelationType,
          isPrimaryContact: linkPrimary,
          canPickup: linkPickup,
          receivesInvoices: linkInvoices,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to link student to guardian.");
      }

      setShowLinkModal(false);
      setActionAlert({
        type: "success",
        message: "Student linked successfully to guardian.",
      });
      fetchGuardian();
    } catch (err: unknown) {
      setLinkError(err instanceof Error ? err.message : "Failed to link student.");
    } finally {
      setLinkingStudent(false);
    }
  };

  const handleUnlink = async (relationshipId: string, studentName: string) => {
    if (!window.confirm(`Are you sure you want to unlink ${studentName} from this guardian?`)) {
      return;
    }
    setUnlinkingId(relationshipId);
    setActionAlert(null);

    try {
      const res = await fetch(
        `/api/admin/guardians/${guardianId}/relationships?relationshipId=${encodeURIComponent(relationshipId)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to unlink student.");
      }
      setActionAlert({
        type: "success",
        message: `${studentName} was unlinked from guardian.`,
      });
      fetchGuardian();
    } catch (err: unknown) {
      setActionAlert({
        type: "danger",
        message: err instanceof Error ? err.message : "Failed to unlink student.",
      });
    } finally {
      setUnlinkingId(null);
    }
  };

  if (loading) {
    return (
      <div className="py-12">
        <LoadingState message="Loading guardian profile..." />
      </div>
    );
  }

  if (error || !guardian) {
    return (
      <div className="py-8">
        <ErrorState
          title="Guardian Not Found"
          message={error || "Could not retrieve guardian profile."}
          actionLabel="Retry"
          onAction={fetchGuardian}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {actionAlert && (
        <Alert variant={actionAlert.type} title={actionAlert.type === "success" ? "Success" : "Error"}>
          {actionAlert.message}
        </Alert>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-stone-500 mb-1">
            <Link href="/admin/guardians" className="hover:underline">
              ← Guardians Directory
            </Link>
            <span>/</span>
            <span>Profile</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#5B0612] tracking-tight">
            {guardian.title ? `${guardian.title} ` : ""}
            {guardian.firstName} {guardian.lastName}
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Bio & Portal Account Card */}
        <div className="md:col-span-1 space-y-6">
          <Card className="border border-[#EADBDA]/80">
            <CardHeader className="text-center pb-2">
              <div className="flex justify-center mb-3">
                <Avatar
                  size="lg"
                  fallback={`${guardian.firstName[0]}${guardian.lastName[0]}`}
                  alt={`${guardian.firstName} ${guardian.lastName}`}
                />
              </div>
              <CardTitle className="text-lg font-bold text-stone-900">
                {guardian.firstName} {guardian.lastName}
              </CardTitle>
              <Badge variant="brand" size="sm" className="mt-1">
                {guardian.relationshipType}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-1 pt-2 text-xs divide-y divide-stone-100">
              <div className="flex items-center justify-between gap-3 py-2">
                <span className="text-stone-500 font-medium shrink-0">Primary Phone</span>
                <span className="font-semibold text-stone-900 text-right truncate">{guardian.phonePrimary}</span>
              </div>
              {guardian.phoneSecondary && (
                <div className="flex items-center justify-between gap-3 py-2">
                  <span className="text-stone-500 font-medium shrink-0">Secondary Phone</span>
                  <span className="font-semibold text-stone-900 text-right truncate">{guardian.phoneSecondary}</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-3 py-2">
                <span className="text-stone-500 font-medium shrink-0">Email Address</span>
                <span
                  className="font-semibold text-stone-900 text-right truncate max-w-[190px] sm:max-w-[220px]"
                  title={guardian.email || "None provided"}
                >
                  {guardian.email || "None provided"}
                </span>
              </div>
              {guardian.occupation && (
                <div className="flex items-center justify-between gap-3 py-2">
                  <span className="text-stone-500 font-medium shrink-0">Occupation</span>
                  <span className="font-semibold text-stone-900 text-right truncate">{guardian.occupation}</span>
                </div>
              )}
              {guardian.residentialAddress && (
                <div className="flex items-center justify-between gap-3 py-2">
                  <span className="text-stone-500 font-medium shrink-0">Residential Address</span>
                  <span
                    className="font-semibold text-stone-900 text-right truncate max-w-[200px]"
                    title={guardian.residentialAddress}
                  >
                    {guardian.residentialAddress}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Portal User Account Status Card */}
          <Card className="border border-[#EADBDA]/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-stone-900">Portal Account Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              {guardian.user ? (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-stone-500 font-medium">Account:</span>
                    <Badge
                      variant={guardian.user.status === "ACTIVE" ? "success" : "warning"}
                      size="sm"
                    >
                      {guardian.user.status}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between gap-3 py-2 border-b border-stone-100">
                    <span className="text-stone-500 font-medium shrink-0">Login Email</span>
                    <span
                      className="font-semibold text-stone-900 text-right truncate max-w-[190px] sm:max-w-[220px]"
                      title={guardian.user.email}
                    >
                      {guardian.user.email}
                    </span>
                  </div>
                  <div className="pt-2 flex flex-col gap-2">
                    {guardian.user.status === "PENDING_VERIFICATION" && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="w-full bg-[#FAF2F4] text-[#5B0612] hover:bg-[#F3E2E6] font-semibold"
                        onClick={handleProvisionPortalAccount}
                        disabled={provisioning}
                      >
                        {provisioning ? "Dispatching..." : "Resend Activation Email"}
                      </Button>
                    )}
                    <Link href={`/admin/users/${guardian.user.id}`} className="w-full">
                      <Button variant="outline" size="sm" className="w-full text-xs font-semibold">
                        View User Account →
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900">
                    <p className="font-semibold">No Portal Account Linked</p>
                    <p className="text-[11px] text-amber-800 mt-0.5">
                      This guardian does not yet have access to the Swanford Parent Portal.
                    </p>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    className="w-full font-bold"
                    onClick={handleProvisionPortalAccount}
                    disabled={provisioning || !guardian.email}
                  >
                    {provisioning ? "Provisioning..." : "Provision Portal Account"}
                  </Button>
                  {!guardian.email && (
                    <p className="text-[11px] text-rose-600 font-medium">
                      An email address is required to create a parent portal account.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Wards Card */}
        <div className="md:col-span-2 space-y-6">
          <Card className="border border-[#EADBDA]/80">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold text-stone-900">
                  Enrolled Students / Wards
                </CardTitle>
                <p className="text-xs text-stone-500 mt-0.5">
                  Children authorized for portal access, attendance, academic reports, and billing.
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                className="font-bold flex items-center gap-1.5 shrink-0"
                onClick={handleOpenLinkModal}
              >
                <span>+</span> Link Ward
              </Button>
            </CardHeader>
            <CardContent>
              {guardian.relationships.length === 0 ? (
                <div className="py-8 text-center bg-stone-50 rounded-xl border border-dashed border-stone-200">
                  <p className="text-xs font-medium text-stone-600">No students currently linked to this guardian.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 font-semibold"
                    onClick={handleOpenLinkModal}
                  >
                    + Link First Student
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {guardian.relationships.map((rel) => {
                    const enrollments = rel.student.programmeEnrollments || [];
                    const classLabel =
                      enrollments.length > 0
                        ? enrollments
                            .map((e) => `${e.programme.name}${e.schoolClass ? ` (${e.schoolClass.name})` : ""}`)
                            .join(", ")
                        : "General";

                    return (
                      <div
                        key={rel.id}
                        className="p-4 rounded-xl border border-stone-200 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-stone-900">
                              {rel.student.firstName} {rel.student.lastName}
                            </span>
                            <span className="text-xs font-mono text-stone-500">
                              ({rel.student.admissionNumber || "Pending"})
                            </span>
                            <Badge
                              variant={rel.student.currentStatus === "ACTIVE" ? "success" : "neutral"}
                              size="sm"
                            >
                              {rel.student.currentStatus}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-stone-600 mt-1.5">
                            <span className="font-medium text-stone-800">
                              Relationship: {rel.relationshipType}
                            </span>
                            <span>•</span>
                            <span>Class: {classLabel}</span>
                            {rel.isPrimaryContact && (
                              <span className="text-[#5B0612] font-bold bg-[#FAF2F4] px-2 py-0.5 rounded-full text-[11px]">
                                Primary Contact
                              </span>
                            )}
                            {rel.receivesInvoices && (
                              <span className="text-stone-700 bg-stone-100 px-2 py-0.5 rounded-full text-[11px]">
                                Receives Invoices
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 self-end sm:self-center">
                          <Link href={`/admin/students/${rel.student.id}`}>
                            <Button variant="outline" size="sm" className="font-semibold text-xs">
                              View Student
                            </Button>
                          </Link>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-rose-700 hover:bg-rose-50 border-rose-200 font-semibold text-xs"
                            onClick={() =>
                              handleUnlink(rel.id, `${rel.student.firstName} ${rel.student.lastName}`)
                            }
                            disabled={unlinkingId === rel.id}
                          >
                            {unlinkingId === rel.id ? "Unlinking..." : "Unlink"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Link Student / Ward Modal */}
      <Modal
        isOpen={showLinkModal}
        onClose={() => !linkingStudent && setShowLinkModal(false)}
        title="Link Student / Ward to Guardian"
        description="Search enrolled students to authorize this guardian for attendance, billing, and portal monitoring."
        size="lg"
      >
        <form onSubmit={handleLinkSubmit} className="space-y-4">
          {linkError && (
            <Alert variant="danger" title="Linking Failed">
              {linkError}
            </Alert>
          )}

          <FormGroup id="student-search-input" label="Find Student" required helperText="Search by student name or admission number.">
            <Input
              id="student-search-input"
              placeholder="e.g. Ibrahim, Fatima, SA-2026..."
              value={studentSearch}
              onChange={(e) => handleSearchStudents(e.target.value)}
            />
          </FormGroup>

          {searchingStudents && <p className="text-xs text-stone-500 italic">Searching students...</p>}

          {searchResults.length > 0 && (
            <div className="max-h-48 overflow-y-auto border border-stone-200 rounded-lg divide-y divide-stone-100">
              {searchResults.map((s) => (
                <div
                  key={s.id}
                  onClick={() => setSelectedStudentId(s.id)}
                  className={`p-3 cursor-pointer text-xs flex items-center justify-between transition-colors ${
                    selectedStudentId === s.id
                      ? "bg-[#FAF2F4] border-l-4 border-[#800020] font-bold text-[#5B0612]"
                      : "hover:bg-stone-50 text-stone-800"
                  }`}
                >
                  <div>
                    <span className="font-semibold">
                      {s.firstName} {s.lastName}
                    </span>
                    <span className="font-mono text-stone-500 ml-2">
                      ({s.admissionNumber || "Pending"})
                    </span>
                  </div>
                  <Badge variant={s.currentStatus === "ACTIVE" ? "success" : "neutral"} size="sm">
                    {s.currentStatus}
                  </Badge>
                </div>
              ))}
            </div>
          )}

          {selectedStudentId && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 font-medium">
              ✓ Student selected for linkage.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormGroup id="link-relation-type" label="Relationship Type" required>
              <Select
                id="link-relation-type"
                value={linkRelationType}
                onChange={(e) => setLinkRelationType(e.target.value)}
              >
                <option value="FATHER">Father</option>
                <option value="MOTHER">Mother</option>
                <option value="LEGAL_GUARDIAN">Legal Guardian</option>
                <option value="SPONSOR">Sponsor</option>
              </Select>
            </FormGroup>

            <div className="space-y-2 pt-6">
              <label className="flex items-center gap-2 text-xs font-semibold text-stone-800 cursor-pointer">
                <Checkbox
                  checked={linkPrimary}
                  onChange={(e) => setLinkPrimary(e.target.checked)}
                />
                Primary Contact for Student
              </label>

              <label className="flex items-center gap-2 text-xs font-semibold text-stone-800 cursor-pointer">
                <Checkbox
                  checked={linkPickup}
                  onChange={(e) => setLinkPickup(e.target.checked)}
                />
                Authorized for Daily Pickup
              </label>

              <label className="flex items-center gap-2 text-xs font-semibold text-stone-800 cursor-pointer">
                <Checkbox
                  checked={linkInvoices}
                  onChange={(e) => setLinkInvoices(e.target.checked)}
                />
                Receives Invoices & Billing
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-stone-200">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setShowLinkModal(false)}
              disabled={linkingStudent}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              className="font-bold min-w-[130px]"
              disabled={linkingStudent || !selectedStudentId}
            >
              {linkingStudent ? "Linking..." : "Confirm Linkage"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

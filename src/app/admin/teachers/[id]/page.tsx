"use client";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { Avatar } from "@/components/ui/avatar";

interface TeacherDetail {
  id: string;
  staffId: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  phonePrimary: string;
  phoneSecondary: string | null;
  qualification: string | null;
  employmentStatus: string;
  user: { id: string; email: string; status: string };
  scopes: Array<{
    id: string;
    scopeType: string;
    isClassTeacher: boolean;
    academicSession: { name: string };
    programme: { id: string; name: string };
    schoolClass: { id: string; name: string } | null;
    subject: { id: string; name: string } | null;
  }>;
}

interface ConfigData {
  academicSessions: Array<{ id: string; name: string; isCurrent: boolean }>;
  programmes: Array<{
    id: string;
    name: string;
    classes: Array<{ id: string; name: string }>;
  }>;
}

interface ProbationRecord {
  id: string;
  monthNumber: number;
  position: string;
  recommendation: string;
  ratings: Record<string, string>;
  comments?: Record<string, string>;
  strengths?: string | null;
  areasForImprovement?: string | null;
  isFinal: boolean;
  createdAt: string;
  assessor: { email: string };
}

interface StaffDoc {
  id: string;
  documentType: string;
  title: string;
  status: string;
  documentNumber: string;
  issuedAt: string | null;
  createdAt: string;
}

const LIFECYCLE_STATES = [
  "APPLICANT",
  "TEMPORARY",
  "PROBATION",
  "CONFIRMED",
  "ACTIVE",
  "ON_LEAVE",
  "SUSPENDED",
  "TRANSFERRED",
  "RESIGNED",
  "DISMISSED",
  "DECEASED",
  "RETIRED",
  "FORMER_STAFF",
  "INACTIVE",
];

const PROBATION_CORE_VALUES = [
  "Lesson Preparation & Curriculum Delivery",
  "Classroom Management & Pupil Discipline",
  "Punctuality & Attendance",
  "Alignment with Islamic Moral Etiquette",
  "Relationship with Parents & Staff",
  "Dedication to Student Holistic Growth",
];

export default function TeacherDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const teacherId = resolvedParams.id;
  const router = useRouter();

  const [teacher, setTeacher] = useState<TeacherDetail | null>(null);
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"scopes" | "probation" | "documents">("scopes");

  // Status Change Modal State
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState("");
  const [statusReason, setStatusReason] = useState("");
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Scope Modal State
  const [showScopeModal, setShowScopeModal] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [selectedProgrammeId, setSelectedProgrammeId] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [isClassTeacher, setIsClassTeacher] = useState(false);
  const [scopeSubmitting, setScopeSubmitting] = useState(false);

  // Probation State
  const [probationRecords, setProbationRecords] = useState<ProbationRecord[]>([]);
  const [showProbationModal, setShowProbationModal] = useState(false);
  const [probationMonth, setProbationMonth] = useState(1);
  const [probationRatings, setProbationRatings] = useState<Record<string, string>>({});
  const [probationRecommendation, setProbationRecommendation] = useState("CONTINUE_PROBATION");
  const [probationStrengths, setProbationStrengths] = useState("");
  const [probationImprovements, setProbationImprovements] = useState("");
  const [isSavingProbation, setIsSavingProbation] = useState(false);

  // Documents State
  const [staffDocuments, setStaffDocuments] = useState<StaffDoc[]>([]);
  const [showDocModal, setShowDocModal] = useState(false);
  const [selectedDocType, setSelectedDocType] = useState("TEMPORARY_APPOINTMENT_LETTER");
  const [isGeneratingDoc, setIsGeneratingDoc] = useState(false);
  const [previewDocHtml, setPreviewDocHtml] = useState<string | null>(null);

  const fetchTeacher = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`/api/admin/teachers/${teacherId}`),
      fetch(`/api/super-admin/config`),
    ])
      .then(async ([tRes, cRes]) => {
        if (!tRes.ok) throw new Error("Failed to load teacher profile.");
        const tJson = await tRes.json();
        setTeacher(tJson);
        setNewStatus(tJson.employmentStatus);

        if (cRes.ok) {
          const cJson = await cRes.json();
          setConfig(cJson);
          const currentSession = cJson.academicSessions?.find((s: { isCurrent: boolean }) => s.isCurrent);
          if (currentSession) setSelectedSessionId(currentSession.id);
          if (cJson.programmes?.[0]) setSelectedProgrammeId(cJson.programmes[0].id);
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Error retrieving teacher.");
        setLoading(false);
      });
  };

  const fetchProbationRecords = async () => {
    try {
      const res = await fetch(`/api/admin/teachers/${teacherId}/probation`);
      if (res.ok) {
        const json = await res.json();
        setProbationRecords(json.records || []);
      }
    } catch {
      // Ignore
    }
  };

  const fetchDocuments = async () => {
    try {
      const res = await fetch(`/api/admin/teachers/${teacherId}/documents`);
      if (res.ok) {
        const json = await res.json();
        setStaffDocuments(json.documents || []);
      }
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    fetchTeacher();
    fetchProbationRecords();
    fetchDocuments();
  }, [teacherId]);

  const handleUpdateStatus = async () => {
    if (!newStatus) return;
    setIsUpdatingStatus(true);
    try {
      const res = await fetch(`/api/admin/teachers/${teacherId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          reason: statusReason.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update employment status.");
      setShowStatusModal(false);
      fetchTeacher();
    } catch (err: any) {
      alert(err.message || "Failed to update status.");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleAssignScope = async () => {
    if (!selectedSessionId || !selectedProgrammeId) {
      alert("Academic Session and Programme are required.");
      return;
    }
    setScopeSubmitting(true);
    try {
      const res = await fetch(`/api/admin/teachers/${teacherId}/scopes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          academicSessionId: selectedSessionId,
          programmeId: selectedProgrammeId,
          schoolClassId: selectedClassId || undefined,
          isClassTeacher,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to assign scope.");
      setShowScopeModal(false);
      await fetchTeacher();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Scope assignment failed.");
    } finally {
      setScopeSubmitting(false);
    }
  };

  const handleRevokeScope = async (scopeId: string) => {
    if (!confirm("Are you sure you want to revoke this pedagogical scope?")) return;
    try {
      const res = await fetch(`/api/admin/teachers/${teacherId}/scopes/${scopeId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to revoke scope.");
      await fetchTeacher();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Scope revocation failed.");
    }
  };

  const handleSaveProbation = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProbation(true);
    try {
      const res = await fetch(`/api/admin/teachers/${teacherId}/probation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthNumber: probationMonth,
          ratings: probationRatings,
          recommendation: probationRecommendation,
          strengths: probationStrengths.trim() || undefined,
          areasForImprovement: probationImprovements.trim() || undefined,
          isFinal: probationMonth === 4,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save probation assessment.");
      setShowProbationModal(false);
      fetchProbationRecords();
    } catch (err: any) {
      alert(err.message || "Failed to save probation record.");
    } finally {
      setIsSavingProbation(false);
    }
  };

  const handleGenerateDoc = async () => {
    setIsGeneratingDoc(true);
    try {
      const res = await fetch(`/api/admin/teachers/${teacherId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentType: selectedDocType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate document.");
      setShowDocModal(false);
      fetchDocuments();
    } catch (err: any) {
      alert(err.message || "Failed to generate staff document.");
    } finally {
      setIsGeneratingDoc(false);
    }
  };

  const handleIssueDoc = async (docId: string) => {
    if (!confirm("Issue this official document to the teacher? They will be able to view and print it immediately.")) return;
    try {
      const res = await fetch(`/api/admin/staff-documents/${docId}/issue`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to issue document.");
      fetchDocuments();
    } catch (err: any) {
      alert(err.message || "Failed to issue document.");
    }
  };

  const handlePreviewDoc = async (docId: string) => {
    try {
      const res = await fetch(`/api/admin/staff-documents/${docId}`);
      if (res.ok) {
        const html = await res.text();
        setPreviewDocHtml(html);
      }
    } catch {
      alert("Failed to load document preview.");
    }
  };

  if (loading) {
    return (
      <div className="py-12">
        <LoadingState message="Loading teacher profile and lifecycle records..." />
      </div>
    );
  }

  if (error || !teacher) {
    return (
      <div className="py-8">
        <ErrorState
          title="Teacher Unavailable"
          message={error || "Could not retrieve teacher."}
          actionLabel="Back to Teachers"
          onAction={() => router.push("/admin/teachers")}
        />
      </div>
    );
  }

  const selectedProgramme = config?.programmes?.find((p) => p.id === selectedProgrammeId);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-stone-500 mb-1">
            <Link href="/admin/teachers" className="hover:underline">
              ← Teachers Directory
            </Link>
            <span>/</span>
            <span className="font-mono font-bold text-stone-700">{teacher.staffId}</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#5B0612] tracking-tight font-display">
              {teacher.firstName} {teacher.lastName}
            </h1>
            <Badge
              variant={
                teacher.employmentStatus === "ACTIVE" || teacher.employmentStatus === "CONFIRMED"
                  ? "success"
                  : teacher.employmentStatus === "PROBATION"
                  ? "warning"
                  : "neutral"
              }
              size="md"
            >
              {teacher.employmentStatus.replace(/_/g, " ")}
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="md"
            onClick={() => setShowStatusModal(true)}
            className="font-semibold"
          >
            Change Status
          </Button>

          <Button
            variant="primary"
            size="md"
            onClick={() => setShowScopeModal(true)}
            className="bg-[#800020] text-white font-bold"
          >
            + Assign Scope
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Bio Card */}
        <Card className="md:col-span-1">
          <CardHeader className="text-center pb-2">
            <div className="flex justify-center mb-3">
              <Avatar
                size="lg"
                fallback={`${teacher.firstName[0]}${teacher.lastName[0]}`}
                alt={`${teacher.firstName} ${teacher.lastName}`}
              />
            </div>
            <CardTitle className="text-lg font-bold text-stone-900 font-display">
              {teacher.firstName} {teacher.lastName}
            </CardTitle>
            <span className="text-xs font-mono font-bold text-[#800020]">{teacher.staffId}</span>
          </CardHeader>
          <CardContent className="space-y-3 pt-2 text-xs">
            <div className="flex justify-between py-1.5 border-b border-stone-100">
              <span className="text-stone-500 font-medium">Employment Status</span>
              <span className="font-bold text-stone-900">{teacher.employmentStatus.replace(/_/g, " ")}</span>
            </div>
            <div className="py-1.5 border-b border-stone-100">
              <span className="text-stone-500 font-medium block">Email Address</span>
              <span className="font-semibold text-stone-900">{teacher.user?.email}</span>
            </div>
            <div className="py-1.5 border-b border-stone-100">
              <span className="text-stone-500 font-medium block">Primary Phone</span>
              <span className="font-semibold text-stone-900">{teacher.phonePrimary}</span>
            </div>
            <div className="py-1.5">
              <span className="text-stone-500 font-medium block">Qualification</span>
              <span className="font-semibold text-stone-900">{teacher.qualification || "Unspecified"}</span>
            </div>
          </CardContent>
        </Card>

        {/* Right Tabbed Content */}
        <div className="md:col-span-2 space-y-4">
          {/* Tabs Navigation */}
          <div className="flex items-center gap-2 border-b border-[#EADBDA] pb-2">
            <button
              type="button"
              onClick={() => setActiveTab("scopes")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                activeTab === "scopes"
                  ? "bg-[#800020] text-white"
                  : "text-stone-600 hover:bg-stone-100"
              }`}
            >
              Academic Scopes ({teacher.scopes?.length || 0})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("probation")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                activeTab === "probation"
                  ? "bg-[#800020] text-white"
                  : "text-stone-600 hover:bg-stone-100"
              }`}
            >
              Probation Reviews ({probationRecords.length}/4)
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("documents")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                activeTab === "documents"
                  ? "bg-[#800020] text-white"
                  : "text-stone-600 hover:bg-stone-100"
              }`}
            >
              Issued Documents ({staffDocuments.length})
            </button>
          </div>

          {/* TAB 1: ACADEMIC SCOPES */}
          {activeTab === "scopes" && (
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-stone-900">
                    Teaching &amp; Class Scopes
                  </CardTitle>
                  <p className="text-xs text-stone-500">
                    Determines which classes and roll-call records this educator is authorized to manage.
                  </p>
                </div>
              </CardHeader>
              <CardContent>
                {teacher.scopes.length === 0 ? (
                  <div className="p-6 text-center text-xs text-stone-500 bg-stone-50 rounded-xl border border-stone-200">
                    No academic scopes assigned. Click &quot;Assign Scope&quot; above to grant permissions.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {teacher.scopes.map((sc) => (
                      <div
                        key={sc.id}
                        className="p-4 rounded-xl border border-stone-200 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-stone-900">
                              {sc.programme.name} — {sc.schoolClass?.name || "All Classes"}
                            </span>
                            {sc.isClassTeacher && (
                              <Badge variant="brand" size="sm">
                                Class Teacher
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-stone-600 mt-1">
                            Session: {sc.academicSession.name}
                            {sc.subject && ` • Subject: ${sc.subject.name}`}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRevokeScope(sc.id)}
                          className="text-rose-700 hover:bg-rose-50 font-semibold"
                        >
                          Revoke
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* TAB 2: PROBATION REVIEWS */}
          {activeTab === "probation" && (
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-stone-900">
                    4-Month Probation Assessments
                  </CardTitle>
                  <p className="text-xs text-stone-500">
                    Structured reviews tracking 6 core values before confirmation.
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setShowProbationModal(true)}
                  className="bg-[#800020] text-white font-bold"
                >
                  + Record Assessment
                </Button>
              </CardHeader>
              <CardContent>
                {probationRecords.length === 0 ? (
                  <div className="p-8 text-center text-xs text-stone-500 bg-stone-50 rounded-xl border border-stone-200">
                    No probation assessment records yet. Click &quot;Record Assessment&quot; to begin month 1 evaluation.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {probationRecords.map((pr) => (
                      <div
                        key={pr.id}
                        className="p-4 rounded-xl border border-stone-200 bg-white space-y-3"
                      >
                        <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                          <div>
                            <span className="font-bold text-sm text-[#800020]">
                              Month {pr.monthNumber} Evaluation
                            </span>
                            <span className="text-xs text-stone-400 ml-2">
                              {new Date(pr.createdAt).toLocaleDateString("en-NG")}
                            </span>
                          </div>
                          <Badge
                            variant={
                              pr.recommendation === "RECOMMEND_CONFIRMATION"
                                ? "success"
                                : pr.recommendation === "CONTINUE_PROBATION"
                                ? "brand"
                                : "warning"
                            }
                            size="sm"
                          >
                            {pr.recommendation.replace(/_/g, " ")}
                          </Badge>
                        </div>

                        {/* Core Values Ratings Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          {Object.entries(pr.ratings || {}).map(([val, rating]) => (
                            <div key={val} className="flex justify-between p-2 rounded bg-stone-50">
                              <span className="text-stone-700 font-medium">{val}</span>
                              <span className="font-bold text-[#800020]">{rating}</span>
                            </div>
                          ))}
                        </div>

                        {pr.strengths && (
                          <p className="text-xs text-stone-700">
                            <strong>Observed Strengths:</strong> {pr.strengths}
                          </p>
                        )}
                        {pr.areasForImprovement && (
                          <p className="text-xs text-stone-700">
                            <strong>Areas for Improvement:</strong> {pr.areasForImprovement}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* TAB 3: ISSUED DOCUMENTS */}
          {activeTab === "documents" && (
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-stone-900">
                    Official Employment Documents
                  </CardTitle>
                  <p className="text-xs text-stone-500">
                    Formal appointment letters and confirmation certificates with institutional branding.
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setShowDocModal(true)}
                  className="bg-[#800020] text-white font-bold"
                >
                  + Generate Document
                </Button>
              </CardHeader>
              <CardContent>
                {staffDocuments.length === 0 ? (
                  <div className="p-8 text-center text-xs text-stone-500 bg-stone-50 rounded-xl border border-stone-200">
                    No official employment documents have been issued to this staff member yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {staffDocuments.map((doc) => (
                      <div
                        key={doc.id}
                        className="p-4 rounded-xl border border-stone-200 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-stone-900">{doc.title}</span>
                            <Badge
                              variant={doc.status === "ISSUED" ? "success" : "neutral"}
                              size="sm"
                            >
                              {doc.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-stone-500 mt-0.5">
                            Ref: {doc.documentNumber} &bull; Generated:{" "}
                            {new Date(doc.createdAt).toLocaleDateString("en-NG")}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePreviewDoc(doc.id)}
                            className="font-semibold text-xs"
                          >
                            Preview
                          </Button>
                          {doc.status !== "ISSUED" && (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleIssueDoc(doc.id)}
                              className="bg-[#800020] text-white font-bold text-xs"
                            >
                              Issue to Staff
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Status Change Modal */}
      {showStatusModal && (
        <Modal
          isOpen={showStatusModal}
          onClose={() => setShowStatusModal(false)}
          title="Update Staff Lifecycle Status"
        >
          <div className="space-y-4 pt-2">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Select Employment Status
              </label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                className="w-full h-11 px-3 rounded-lg border border-stone-300 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#800020]"
              >
                {LIFECYCLE_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Reason / Administrative Note (Optional)
              </label>
              <textarea
                rows={3}
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                placeholder="Reason for lifecycle transition..."
                className="w-full p-2.5 rounded-lg border border-stone-300 text-xs focus:outline-none focus:ring-2 focus:ring-[#800020]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowStatusModal(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={isUpdatingStatus}
                onClick={handleUpdateStatus}
                className="bg-[#800020] text-white font-bold"
              >
                {isUpdatingStatus ? "Updating..." : "Confirm Status"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Scope Assignment Modal */}
      {showScopeModal && (
        <Modal
          isOpen={showScopeModal}
          onClose={() => setShowScopeModal(false)}
          title="Assign Educator Academic Scope"
        >
          <div className="space-y-4 pt-2">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Academic Session</label>
              <select
                value={selectedSessionId}
                onChange={(e) => setSelectedSessionId(e.target.value)}
                className="w-full h-11 px-3 rounded-lg border border-stone-300 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#800020]"
              >
                {config?.academicSessions?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.isCurrent ? "(Current)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Programme</label>
              <select
                value={selectedProgrammeId}
                onChange={(e) => setSelectedProgrammeId(e.target.value)}
                className="w-full h-11 px-3 rounded-lg border border-stone-300 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#800020]"
              >
                {config?.programmes?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Class</label>
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="w-full h-11 px-3 rounded-lg border border-stone-300 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#800020]"
              >
                <option value="">Programme-wide (All Classes)</option>
                {selectedProgramme?.classes?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="inline-flex items-center gap-2 text-sm font-semibold text-stone-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isClassTeacher}
                  onChange={(e) => setIsClassTeacher(e.target.checked)}
                  className="w-4 h-4 text-[#800020] rounded border-stone-300 focus:ring-[#800020]"
                />
                Designate as Class Teacher (Roll-call primary)
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowScopeModal(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={scopeSubmitting}
                onClick={handleAssignScope}
                className="bg-[#800020] text-white font-bold"
              >
                {scopeSubmitting ? "Assigning..." : "Assign Scope"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Record Probation Modal */}
      {showProbationModal && (
        <Modal
          isOpen={showProbationModal}
          onClose={() => setShowProbationModal(false)}
          title="Record Probation Assessment"
          size="lg"
        >
          <form onSubmit={handleSaveProbation} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Month Number</label>
                <select
                  value={probationMonth}
                  onChange={(e) => setProbationMonth(Number(e.target.value))}
                  className="w-full h-10 px-3 rounded-lg border border-stone-300 text-xs font-semibold"
                >
                  <option value={1}>Month 1</option>
                  <option value={2}>Month 2</option>
                  <option value={3}>Month 3</option>
                  <option value={4}>Month 4 (Final Confirmation Review)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Recommendation</label>
                <select
                  value={probationRecommendation}
                  onChange={(e) => setProbationRecommendation(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-stone-300 text-xs font-semibold"
                >
                  <option value="CONTINUE_PROBATION">Continue Probation</option>
                  <option value="RECOMMEND_CONFIRMATION">Recommend Confirmation</option>
                  <option value="EXTEND_PROBATION">Extend Probation</option>
                  <option value="TERMINATE_PROBATION">Terminate Probation</option>
                </select>
              </div>
            </div>

            {/* Core Values Ratings */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-[#800020] uppercase tracking-wider">
                Core Institutional Values Rating
              </p>
              <div className="space-y-2">
                {PROBATION_CORE_VALUES.map((val) => (
                  <div key={val} className="flex items-center justify-between p-2 rounded-lg bg-stone-50 text-xs">
                    <span className="font-semibold text-stone-800">{val}</span>
                    <select
                      value={probationRatings[val] || "GOOD"}
                      onChange={(e) =>
                        setProbationRatings((prev) => ({ ...prev, [val]: e.target.value }))
                      }
                      className="h-8 px-2 rounded border border-stone-300 bg-white text-xs font-bold"
                    >
                      <option value="OUTSTANDING">Outstanding</option>
                      <option value="VERY_GOOD">Very Good</option>
                      <option value="GOOD">Good</option>
                      <option value="SATISFACTORY">Satisfactory</option>
                      <option value="UNSATISFACTORY">Unsatisfactory</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Observed Strengths</label>
              <textarea
                rows={2}
                value={probationStrengths}
                onChange={(e) => setProbationStrengths(e.target.value)}
                placeholder="Specific positive demonstrations..."
                className="w-full p-2 rounded-lg border border-stone-300 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Areas for Improvement</label>
              <textarea
                rows={2}
                value={probationImprovements}
                onChange={(e) => setProbationImprovements(e.target.value)}
                placeholder="Key growth areas before next month..."
                className="w-full p-2 rounded-lg border border-stone-300 text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-stone-200">
              <Button type="button" variant="outline" onClick={() => setShowProbationModal(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSavingProbation}
                variant="primary"
                className="bg-[#800020] text-white font-bold"
              >
                {isSavingProbation ? "Saving..." : "Save Assessment"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Generate Document Modal */}
      {showDocModal && (
        <Modal
          isOpen={showDocModal}
          onClose={() => setShowDocModal(false)}
          title="Generate Official Employment Document"
        >
          <div className="space-y-4 pt-2">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Document Type</label>
              <select
                value={selectedDocType}
                onChange={(e) => setSelectedDocType(e.target.value)}
                className="w-full h-11 px-3 rounded-lg border border-stone-300 text-sm font-semibold"
              >
                <option value="TEMPORARY_APPOINTMENT_LETTER">Temporary Appointment Letter</option>
                <option value="CONFIRMATION_LETTER">Letter of Confirmation of Appointment</option>
                <option value="PROBATION_ASSESSMENT_FORM">Formal Probation Assessment Report</option>
              </select>
            </div>

            <p className="text-xs text-stone-500">
              This will draft an official institutional letter with Swanford Academy branding in Dutse, Jigawa State. You can preview and issue it to the staff member when ready.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowDocModal(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={isGeneratingDoc}
                onClick={handleGenerateDoc}
                className="bg-[#800020] text-white font-bold"
              >
                {isGeneratingDoc ? "Generating..." : "Generate Document"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Document HTML Preview Modal */}
      {previewDocHtml && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-3 border-b border-[#EADBDA] flex items-center justify-between bg-[#FDFCF9]">
              <span className="font-bold text-xs text-[#5B0612]">Document Preview</span>
              <button
                type="button"
                onClick={() => setPreviewDocHtml(null)}
                className="p-1 rounded text-stone-400 hover:text-stone-700 font-bold"
              >
                &times; Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 bg-stone-100">
              <div
                className="bg-white p-6 shadow-sm mx-auto max-w-3xl"
                dangerouslySetInnerHTML={{ __html: previewDocHtml }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

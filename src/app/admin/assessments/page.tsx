"use client";

import React, { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  Badge,
  Button,
  Input,
  Select,
  Modal,
  Textarea,
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
  Tabs,
} from "@/components";
import { AssessmentStatus, AssessmentType } from "@prisma/client";

interface AssessmentItem {
  id: string;
  title: string;
  type: AssessmentType;
  maxScore: string;
  weightPercentage: string;
  status: AssessmentStatus;
  programme: { name: string };
  schoolClass: { name: string };
  subject: { name: string } | null;
  academicSession: { name: string };
  academicTerm: { name: string };
  createdBy: { email: string };
  _count: { scores: number };
}

interface AssessmentConfigItem {
  id: string;
  name: string;
  code: string;
  description: string | null;
  totalMaxScore: number;
  isDefault: boolean;
  programme: { id: string; name: string; code: string } | null;
  components: Array<{
    name: string;
    shortCode: string;
    maxScore: number;
    weightPercentage: number;
    type: AssessmentType;
  }>;
  _count: { assessments: number };
}

export default function AdminAssessmentsPage() {
  const [activeTab, setActiveTab] = useState<string>("assessments");
  const [assessments, setAssessments] = useState<AssessmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Review & Finalize Modals
  const [finalizeAssessment, setFinalizeAssessment] = useState<AssessmentItem | null>(null);
  const [returnAssessment, setReturnAssessment] = useState<AssessmentItem | null>(null);
  const [returnComment, setReturnComment] = useState("");
  const [reopenAssessmentId, setReopenAssessmentId] = useState<string | null>(null);
  const [reopenReason, setReopenReason] = useState("");

  // Filters
  const [searchFilter, setSearchFilter] = useState("");
  const [progFilter, setProgFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Release Terminal Reports Modal State
  const [showReleaseModal, setShowReleaseModal] = useState(false);
  const [sessions, setSessions] = useState<Array<{ id: string; name: string; isCurrent: boolean }>>([]);
  const [terms, setTerms] = useState<Array<{ id: string; name: string; isCurrent: boolean }>>([]);
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>([]);
  const [programmes, setProgrammes] = useState<Array<{ id: string; name: string }>>([]);
  const [releaseSessionId, setReleaseSessionId] = useState("");
  const [releaseTermId, setReleaseTermId] = useState("");
  const [releaseClassId, setReleaseClassId] = useState("");
  const [releaseNotes, setReleaseNotes] = useState("");
  const [releaseSubmitting, setReleaseSubmitting] = useState(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);

  // Assessment Structure Configs (Super Admin)
  const [configs, setConfigs] = useState<AssessmentConfigItem[]>([]);
  const [configsLoading, setConfigsLoading] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configSubmitting, setConfigSubmitting] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [newConfig, setNewConfig] = useState<{
    name: string;
    code: string;
    description: string;
    isDefault: boolean;
    programmeId: string;
    components: Array<{
      name: string;
      shortCode: string;
      maxScore: number;
      weightPercentage: number;
      type: AssessmentType;
    }>;
  }>({
    name: "",
    code: "",
    description: "",
    isDefault: false,
    programmeId: "",
    components: [
      { name: "Continuous Assessment", shortCode: "CA", maxScore: 30, weightPercentage: 30, type: AssessmentType.CONTINUOUS_ASSESSMENT },
      { name: "Term Examination", shortCode: "EXAM", maxScore: 70, weightPercentage: 70, type: AssessmentType.EXAMINATION },
    ],
  });

  const fetchAssessments = () => {
    setLoading(true);
    setError(null);
    fetch("/api/admin/assessments")
      .then(async (res) => {
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Failed to load assessments.");
        }
        return res.json();
      })
      .then((json) => {
        setAssessments(json);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Error retrieving assessments.");
        setLoading(false);
      });
  };

  const fetchConfigs = () => {
    setConfigsLoading(true);
    fetch("/api/super-admin/assessment-config")
      .then(async (res) => {
        if (!res.ok) return { configs: [] };
        return res.json();
      })
      .then((data) => {
        setConfigs(data.configs || []);
        setConfigsLoading(false);
      })
      .catch(() => setConfigsLoading(false));
  };

  const fetchMetadata = () => {
    Promise.all([
      fetch("/api/super-admin/config").then((r) => r.json()).catch(() => ({})),
      fetch("/api/admin/classes?includeInactive=false").then((r) => r.json()).catch(() => ({})),
      fetch("/api/admin/programmes?includeInactive=false").then((r) => r.json()).catch(() => ({})),
    ]).then(([configData, classesData, progData]) => {
      if (configData.academicSessions) {
        setSessions(configData.academicSessions);
        const curr = configData.academicSessions.find((s: any) => s.isCurrent);
        if (curr) setReleaseSessionId(curr.id);
      }
      if (configData.academicTerms) {
        setTerms(configData.academicTerms);
        const currTerm = configData.academicTerms.find((t: any) => t.isCurrent);
        if (currTerm) setReleaseTermId(currTerm.id);
      }
      if (classesData.items) setClasses(classesData.items);
      if (progData.items) setProgrammes(progData.items);
    });
  };

  useEffect(() => {
    fetchAssessments();
    fetchConfigs();
    fetchMetadata();
  }, []);

  const filteredAssessments = assessments.filter((ass) => {
    if (progFilter && ass.programme?.name !== progFilter) return false;
    if (statusFilter && ass.status !== statusFilter) return false;
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      const matchTitle = ass.title.toLowerCase().includes(q);
      const matchSubject = ass.subject?.name?.toLowerCase().includes(q);
      const matchClass = ass.schoolClass?.name?.toLowerCase().includes(q);
      const matchTeacher = ass.createdBy?.email?.toLowerCase().includes(q);
      if (!matchTitle && !matchSubject && !matchClass && !matchTeacher) return false;
    }
    return true;
  });

  // Action: Approve Assessment
  const handleApprove = async (id: string, title: string) => {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/assessments/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "APPROVE" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to approve assessment.");
      setActionSuccess(`Assessment "${title}" approved. Ready for final publication.`);
      await fetchAssessments();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Approval failed.");
    } finally {
      setActionLoading(false);
    }
  };

  // Action: Return for Correction
  const handleReturnSubmit = async () => {
    if (!returnAssessment) return;
    if (returnComment.trim().length < 5) {
      setActionError("Please provide clear revision instructions (minimum 5 characters).");
      return;
    }

    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/assessments/${returnAssessment.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "RETURN", comment: returnComment.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to return assessment for correction.");
      setReturnAssessment(null);
      setReturnComment("");
      setActionSuccess(`Assessment "${returnAssessment.title}" returned to teacher for correction.`);
      await fetchAssessments();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Return action failed.");
    } finally {
      setActionLoading(false);
    }
  };

  // Action: Finalize and Publish
  const handleFinalizeConfirm = async () => {
    if (!finalizeAssessment) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/assessments/${finalizeAssessment.id}/finalize`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to finalize assessment.");
      setFinalizeAssessment(null);
      setActionSuccess(`Assessment "${finalizeAssessment.title}" finalized and results published.`);
      await fetchAssessments();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Finalization failed.");
    } finally {
      setActionLoading(false);
    }
  };

  // Action: Reopen Assessment
  const handleReopenSubmit = async () => {
    if (!reopenAssessmentId || !reopenReason.trim()) {
      setActionError("Please provide an administrative reason to reopen this finalized assessment.");
      return;
    }
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/assessments/${reopenAssessmentId}/reopen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reopenReason.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to reopen assessment.");
      setReopenAssessmentId(null);
      setReopenReason("");
      setActionSuccess("Assessment reopened for mark editing.");
      await fetchAssessments();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Reopen failed.");
    } finally {
      setActionLoading(false);
    }
  };

  // Action: Release Terminal Reports
  const handleReleaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!releaseSessionId || !releaseTermId) {
      setReleaseError("Academic Session and Term are required.");
      return;
    }

    setReleaseSubmitting(true);
    setReleaseError(null);
    try {
      const res = await fetch("/api/admin/reports/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          academicSessionId: releaseSessionId,
          academicTermId: releaseTermId,
          schoolClassId: releaseClassId || undefined,
          notes: releaseNotes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to release terminal reports.");

      setActionSuccess(data.message || "Terminal reports released successfully.");
      setShowReleaseModal(false);
      setReleaseNotes("");
    } catch (err: unknown) {
      setReleaseError(err instanceof Error ? err.message : "Failed to release reports.");
    } finally {
      setReleaseSubmitting(false);
    }
  };

  // Action: Create Assessment Structure Config
  const handleCreateConfigSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newConfig.name.trim() || !newConfig.code.trim()) {
      setConfigError("Configuration name and code are required.");
      return;
    }

    const total = newConfig.components.reduce((sum, c) => sum + (Number(c.maxScore) || 0), 0);
    if (total <= 0) {
      setConfigError("Total component max scores must be greater than zero.");
      return;
    }

    setConfigSubmitting(true);
    setConfigError(null);
    try {
      const res = await fetch("/api/super-admin/assessment-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newConfig.name.trim(),
          code: newConfig.code.trim().toUpperCase(),
          description: newConfig.description.trim() || undefined,
          isDefault: newConfig.isDefault,
          programmeId: newConfig.programmeId || undefined,
          components: newConfig.components,
          totalMaxScore: total,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create assessment structure configuration.");

      setActionSuccess("Assessment structure configuration created successfully.");
      setShowConfigModal(false);
      fetchConfigs();
    } catch (err: unknown) {
      setConfigError(err instanceof Error ? err.message : "Failed to create configuration.");
    } finally {
      setConfigSubmitting(false);
    }
  };

  const getStatusBadge = (status: AssessmentStatus) => {
    switch (status) {
      case AssessmentStatus.FINALIZED:
        return <Badge variant="success" size="sm">Finalized & Published</Badge>;
      case AssessmentStatus.APPROVED:
        return <Badge variant="info" size="sm">Approved</Badge>;
      case AssessmentStatus.SUBMITTED:
        return <Badge variant="warning" size="sm">Submitted for Review</Badge>;
      case AssessmentStatus.RETURNED_FOR_CORRECTION:
        return <Badge variant="danger" size="sm">Returned for Correction</Badge>;
      case AssessmentStatus.DRAFT:
      default:
        return <Badge variant="neutral" size="sm">Draft</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assessments & Terminal Reports"
        description="Continuous assessments, examination review workflows, structure configurations, and terminal report publication."
        breadcrumbs={[
          { label: "Dashboard", href: "/admin" },
          { label: "Assessments" },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="md"
              className="font-bold border-[#800020] text-[#800020] hover:bg-[#FAF2F4]"
              onClick={() => setShowReleaseModal(true)}
            >
              Release Terminal Reports
            </Button>
            {activeTab === "structures" && (
              <Button
                variant="primary"
                size="md"
                className="font-bold"
                onClick={() => {
                  setConfigError(null);
                  setShowConfigModal(true);
                }}
              >
                + New Component Structure
              </Button>
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

      <Tabs
        activeTab={activeTab}
        onChange={setActiveTab}
        tabs={[
          { id: "assessments", label: "Assessment Records & Review", count: assessments.length },
          { id: "structures", label: "Assessment Structure Configurations", count: configs.length },
        ]}
      />

      {activeTab === "assessments" ? (
        <div className="space-y-6">
          <Card className="border border-[#EADBDA]/80">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                <div className="w-full sm:w-80">
                  <Input
                    placeholder="Search title, class, teacher, or subject..."
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
                  <Select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-40 text-xs"
                  >
                    <option value="">All Statuses</option>
                    <option value="DRAFT">Draft</option>
                    <option value="SUBMITTED">Submitted</option>
                    <option value="RETURNED_FOR_CORRECTION">Returned</option>
                    <option value="APPROVED">Approved</option>
                    <option value="FINALIZED">Finalized</option>
                  </Select>
                  <Button variant="outline" size="md" onClick={fetchAssessments}>
                    Refresh
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {loading ? (
            <div className="py-12">
              <LoadingState message="Loading assessments roster..." />
            </div>
          ) : error ? (
            <ErrorState
              title="Assessments Unavailable"
              message={error}
              actionLabel="Try Again"
              onAction={fetchAssessments}
            />
          ) : assessments.length === 0 ? (
            <EmptyState
              title="No Assessments Found"
              description="No continuous assessments or examinations recorded yet. Teachers submit marks through the teacher portal."
              actionLabel="Refresh List"
              onAction={fetchAssessments}
            />
          ) : (
            <div>
              {/* Desktop Semantic Table View (>= 768px) */}
              <div className="hidden md:block">
                <TableWrapper className="border border-[#EADBDA]/80">
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell className="w-14 text-center font-semibold text-stone-700">S/N</TableHeaderCell>
                        <TableHeaderCell className="min-w-[200px] text-left font-semibold text-stone-700">Assessment Title</TableHeaderCell>
                        <TableHeaderCell className="w-44 text-left font-semibold text-stone-700">Class & Programme</TableHeaderCell>
                        <TableHeaderCell className="min-w-[140px] text-left font-semibold text-stone-700">Subject</TableHeaderCell>
                        <TableHeaderCell className="w-24 text-left font-semibold text-stone-700">Max Score</TableHeaderCell>
                        <TableHeaderCell className="w-28 text-left font-semibold text-stone-700">Entries</TableHeaderCell>
                        <TableHeaderCell className="w-40 text-left font-semibold text-stone-700">Status</TableHeaderCell>
                        <TableHeaderCell className="w-56 text-right font-semibold text-stone-700">Actions</TableHeaderCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredAssessments.map((ass, index) => (
                        <TableRow key={ass.id}>
                          <TableCell className="w-14 text-center text-xs font-semibold text-stone-500">
                            {index + 1}
                          </TableCell>
                          <TableCell className="min-w-[200px]">
                            <div className="font-bold text-stone-900">{ass.title}</div>
                            <span className="text-[11px] text-stone-400">By {ass.createdBy?.email}</span>
                          </TableCell>
                          <TableCell className="w-44 text-xs font-semibold text-stone-800">
                            {ass.schoolClass.name}
                            <div className="text-[11px] text-stone-400 font-normal">{ass.programme.name}</div>
                          </TableCell>
                          <TableCell className="min-w-[140px] text-xs text-stone-600">
                            {ass.subject?.name || "General"}
                          </TableCell>
                          <TableCell className="w-24 text-xs font-semibold text-stone-800">
                            {ass.maxScore} pts
                          </TableCell>
                          <TableCell className="w-28 text-xs font-semibold text-stone-700">
                            {ass._count.scores} recorded
                          </TableCell>
                          <TableCell className="w-40">
                            {getStatusBadge(ass.status)}
                          </TableCell>
                          <TableCell className="w-56 text-right">
                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                              {ass.status === "SUBMITTED" && (
                                <>
                                  <Button
                                    variant="primary"
                                    size="sm"
                                    disabled={actionLoading}
                                    onClick={() => handleApprove(ass.id, ass.title)}
                                    className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold whitespace-nowrap min-h-[34px] px-2.5"
                                  >
                                    Approve
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={actionLoading}
                                    onClick={() => {
                                      setReturnAssessment(ass);
                                      setReturnComment("");
                                    }}
                                    className="text-red-700 border-red-300 hover:bg-red-50 font-bold whitespace-nowrap min-h-[34px] px-2.5"
                                  >
                                    Return
                                  </Button>
                                </>
                              )}
                              {(ass.status === "APPROVED" || ass.status === "SUBMITTED") && (
                                <Button
                                  variant="primary"
                                  size="sm"
                                  disabled={actionLoading}
                                  onClick={() => setFinalizeAssessment(ass)}
                                  className="font-bold whitespace-nowrap min-h-[34px] px-2.5"
                                >
                                  Finalize & Publish
                                </Button>
                              )}
                              {ass.status === "FINALIZED" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={actionLoading}
                                  onClick={() => setReopenAssessmentId(ass.id)}
                                  className="text-amber-800 border-amber-300 hover:bg-amber-50 font-bold whitespace-nowrap min-h-[34px] px-2.5"
                                >
                                  Reopen
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableWrapper>
              </div>

              {/* Mobile Responsive Cards (< 768px) */}
              <div className="block md:hidden space-y-3">
                {filteredAssessments.map((ass, index) => (
                  <TableMobileCard
                    key={ass.id}
                    title={
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-stone-100 text-stone-700 text-xs font-bold shrink-0">
                          {index + 1}
                        </span>
                        <span className="font-bold text-sm text-stone-900">
                          {ass.title}
                        </span>
                      </div>
                    }
                    subtitle={
                      <div className="text-xs text-stone-500 mt-0.5">
                        {ass.schoolClass.name} • {ass.subject?.name || "General"}
                      </div>
                    }
                    badge={getStatusBadge(ass.status)}
                    fields={[
                      { label: "Class", value: ass.schoolClass.name },
                      { label: "Max Score", value: `${ass.maxScore} pts` },
                      { label: "Scores Recorded", value: `${ass._count.scores} entries` },
                      { label: "Teacher", value: ass.createdBy?.email },
                    ]}
                    actions={
                      <div className="w-full space-y-2 pt-1">
                        {ass.status === "SUBMITTED" && (
                          <div className="grid grid-cols-2 gap-2">
                            <Button
                              variant="primary"
                              size="md"
                              disabled={actionLoading}
                              onClick={() => handleApprove(ass.id, ass.title)}
                              className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold min-h-[44px]"
                            >
                              Approve
                            </Button>
                            <Button
                              variant="outline"
                              size="md"
                              disabled={actionLoading}
                              onClick={() => {
                                setReturnAssessment(ass);
                                setReturnComment("");
                              }}
                              className="w-full text-red-700 border-red-300 hover:bg-red-50 font-bold min-h-[44px]"
                            >
                              Return
                            </Button>
                          </div>
                        )}
                        {(ass.status === "APPROVED" || ass.status === "SUBMITTED") && (
                          <Button
                            variant="primary"
                            size="md"
                            disabled={actionLoading}
                            onClick={() => setFinalizeAssessment(ass)}
                            className="w-full font-bold min-h-[44px]"
                          >
                            Finalize & Publish
                          </Button>
                        )}
                        {ass.status === "FINALIZED" && (
                          <Button
                            variant="outline"
                            size="md"
                            disabled={actionLoading}
                            onClick={() => setReopenAssessmentId(ass.id)}
                            className="w-full text-amber-800 border-amber-300 hover:bg-amber-50 font-bold min-h-[44px]"
                          >
                            Reopen Assessment
                          </Button>
                        )}
                      </div>
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Assessment Structure Configurations View (Super Admin) */
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-stone-900">Score Breakdown & Weighting Templates</h2>
              <p className="text-xs text-stone-500">
                Define continuous assessment components (e.g. CA 30 + Exam 70 = 100) per programme.
              </p>
            </div>
          </div>

          {configsLoading ? (
            <div className="py-12">
              <LoadingState message="Loading structure configurations..." />
            </div>
          ) : configs.length === 0 ? (
            <EmptyState
              title="No Structure Configs Configured"
              description="Create default assessment component templates to allow teachers to record separate CA and Examination marks."
              actionLabel="Create Structure Configuration"
              onAction={() => {
                setConfigError(null);
                setShowConfigModal(true);
              }}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {configs.map((cfg) => (
                <Card key={cfg.id} className="border border-stone-200 hover:shadow-sm transition-shadow">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-sm text-stone-900">{cfg.name}</h3>
                          {cfg.isDefault && (
                            <Badge variant="info" size="sm">Default</Badge>
                          )}
                        </div>
                        <span className="font-mono text-xs text-stone-500">{cfg.code}</span>
                      </div>
                      <span className="text-xs font-bold text-[#800020] bg-[#FAF2F4] px-2 py-0.5 rounded-full border border-[#EADBDA]">
                        Total: {cfg.totalMaxScore} pts
                      </span>
                    </div>

                    {cfg.description && (
                      <p className="text-xs text-stone-600 line-clamp-2">{cfg.description}</p>
                    )}

                    <div className="text-xs text-stone-500">
                      Programme: <strong>{cfg.programme?.name || "School-Wide (All Programmes)"}</strong>
                    </div>

                    <div className="border-t border-stone-100 pt-2.5 space-y-1.5">
                      <p className="text-[11px] font-bold text-stone-700 uppercase tracking-wider">
                        Components ({cfg.components?.length || 0})
                      </p>
                      <div className="space-y-1">
                        {cfg.components?.map((comp, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs bg-stone-50 px-2 py-1 rounded">
                            <span className="font-medium text-stone-800">
                              {comp.name} ({comp.shortCode})
                            </span>
                            <span className="font-semibold text-stone-700">
                              {comp.maxScore} marks ({comp.weightPercentage}%)
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="text-[11px] text-stone-400 pt-1">
                      Used in {cfg._count?.assessments || 0} assessment records
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Return for Correction Modal */}
      {returnAssessment && (
        <Modal
          isOpen={true}
          onClose={() => setReturnAssessment(null)}
          title="Return Assessment for Correction"
          description="Return this assessment to the teacher with mandatory revision instructions. The teacher will be notified to adjust scores and re-submit."
        >
          <div className="space-y-4 pt-2">
            <div className="p-3 bg-[#FAF7F2] rounded-xl border border-[#EADBDA] text-xs space-y-1">
              <p className="text-stone-700"><strong>Assessment:</strong> {returnAssessment.title}</p>
              <p className="text-stone-700"><strong>Class:</strong> {returnAssessment.schoolClass.name}</p>
              <p className="text-stone-700"><strong>Teacher:</strong> {returnAssessment.createdBy?.email}</p>
            </div>

            <FormGroup id="return-comment" label="Revision Instructions / Reason" required helperText="Specify what errors, omissions, or adjustments are needed.">
              <Textarea
                id="return-comment"
                rows={4}
                required
                placeholder="e.g. Please verify student continuous assessment breakdown; CA marks exceed the 30% weighting for two pupils..."
                value={returnComment}
                onChange={(e) => setReturnComment(e.target.value)}
              />
            </FormGroup>

            <div className="flex justify-end gap-2 pt-2 border-t border-stone-200">
              <Button variant="outline" onClick={() => setReturnAssessment(null)} disabled={actionLoading}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={actionLoading || returnComment.trim().length < 5}
                onClick={handleReturnSubmit}
                className="bg-red-700 hover:bg-red-800 text-white font-bold"
              >
                {actionLoading ? "Returning..." : "Return to Teacher"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Finalize Confirmation Modal */}
      {finalizeAssessment && (
        <Modal
          isOpen={true}
          onClose={() => setFinalizeAssessment(null)}
          title="Finalize Assessment & Publish Results"
          description="Are you sure you want to finalize this assessment? Marks will become official records and will be aggregated into terminal report sheets."
        >
          <div className="space-y-4 pt-2">
            <div className="p-3 bg-[#FAF7F2] rounded-xl border border-[#EADBDA] text-xs space-y-1">
              <p className="text-stone-700"><strong>Assessment:</strong> {finalizeAssessment.title}</p>
              <p className="text-stone-700"><strong>Class:</strong> {finalizeAssessment.schoolClass.name}</p>
              <p className="text-stone-700"><strong>Subject:</strong> {finalizeAssessment.subject?.name || "General Assessment"}</p>
              <p className="text-stone-700"><strong>Marks Entered:</strong> {finalizeAssessment._count.scores} student scores</p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-stone-200">
              <Button variant="outline" onClick={() => setFinalizeAssessment(null)} disabled={actionLoading}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={actionLoading}
                onClick={handleFinalizeConfirm}
                className="font-bold"
              >
                {actionLoading ? "Publishing..." : "Finalize & Publish Results"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Reopen Modal */}
      {reopenAssessmentId && (
        <Modal
          isOpen={true}
          onClose={() => setReopenAssessmentId(null)}
          title="Administrative Assessment Reopen"
          description="Reopening a finalized assessment changes its status back to SUBMITTED and allows marks to be re-edited. An audit log will be created."
        >
          <div className="space-y-4 pt-2">
            <FormGroup id="reopen-reason" label="Administrative Reason" required helperText="Required for audit compliance and governance.">
              <Textarea
                id="reopen-reason"
                rows={3}
                placeholder="State reason for reopening (e.g. mark recalculation request approved by Academic Board)..."
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
              />
            </FormGroup>

            <div className="flex justify-end gap-2 pt-2 border-t border-stone-200">
              <Button variant="outline" onClick={() => setReopenAssessmentId(null)} disabled={actionLoading}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={actionLoading || !reopenReason.trim()}
                onClick={handleReopenSubmit}
                className="font-bold"
              >
                {actionLoading ? "Reopening..." : "Reopen Assessment"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Release Terminal Reports Modal */}
      <Modal
        isOpen={showReleaseModal}
        onClose={() => !releaseSubmitting && setShowReleaseModal(false)}
        title="Release Terminal Academic Reports"
        description="Officially release terminal report sheets for student guardians. This will generate official releases and dispatch portal & email notifications to all connected parents."
        size="lg"
      >
        <form onSubmit={handleReleaseSubmit} className="space-y-4">
          {releaseError && (
            <Alert variant="danger" title="Release Failed">
              {releaseError}
            </Alert>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Academic Session <span className="text-red-500">*</span>
              </label>
              <select
                className="w-full h-10 px-3 rounded-lg border border-stone-300 bg-white text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#800020]"
                value={releaseSessionId}
                onChange={(e) => setReleaseSessionId(e.target.value)}
                required
              >
                <option value="">Select Academic Session</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.isCurrent ? "(Current)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Academic Term <span className="text-red-500">*</span>
              </label>
              <select
                className="w-full h-10 px-3 rounded-lg border border-stone-300 bg-white text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#800020]"
                value={releaseTermId}
                onChange={(e) => setReleaseTermId(e.target.value)}
                required
              >
                <option value="">Select Academic Term</option>
                {terms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.isCurrent ? "(Current)" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Target Class (Optional)
            </label>
            <select
              className="w-full h-10 px-3 rounded-lg border border-stone-300 bg-white text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#800020]"
              value={releaseClassId}
              onChange={(e) => setReleaseClassId(e.target.value)}
            >
              <option value="">All Classes (School-Wide Publication)</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-stone-500 mt-1">
              Leave set to &quot;All Classes&quot; to release reports for the entire student body simultaneously.
            </p>
          </div>

          <FormGroup id="release-notes" label="Administrative Publication Notes (Optional)" helperText="Appears on release logs and notifications sent to guardians.">
            <Textarea
              id="release-notes"
              rows={3}
              placeholder="e.g. Official end-of-term academic results published following Board ratification..."
              value={releaseNotes}
              onChange={(e) => setReleaseNotes(e.target.value)}
            />
          </FormGroup>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-stone-200">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setShowReleaseModal(false)}
              disabled={releaseSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              className="font-bold min-w-[190px]"
              disabled={releaseSubmitting}
            >
              {releaseSubmitting ? "Releasing Reports..." : "Execute Official Release"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Create Assessment Structure Config Modal */}
      <Modal
        isOpen={showConfigModal}
        onClose={() => !configSubmitting && setShowConfigModal(false)}
        title="Create Assessment Structure Template"
        description="Configure scoring components and weightings (e.g. CA 30 + Exam 70). Teachers assigned to this template will enter component scores that automatically aggregate."
        size="lg"
      >
        <form onSubmit={handleCreateConfigSubmit} className="space-y-4">
          {configError && (
            <Alert variant="danger" title="Configuration Error">
              {configError}
            </Alert>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormGroup id="config-name" label="Configuration Name" required>
              <Input
                id="config-name"
                required
                placeholder="e.g. Primary Standard (CA 30 + Exam 70)"
                value={newConfig.name}
                onChange={(e) => setNewConfig({ ...newConfig, name: e.target.value })}
              />
            </FormGroup>

            <FormGroup id="config-code" label="Short Code" required helperText="Unique identifier, e.g. PRI-STD-100">
              <Input
                id="config-code"
                required
                placeholder="e.g. PRI-STD-100"
                value={newConfig.code}
                onChange={(e) => setNewConfig({ ...newConfig, code: e.target.value })}
              />
            </FormGroup>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Programme</label>
              <select
                className="w-full h-10 px-3 rounded-lg border border-stone-300 bg-white text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#800020]"
                value={newConfig.programmeId}
                onChange={(e) => setNewConfig({ ...newConfig, programmeId: e.target.value })}
              >
                <option value="">All Programmes (School-Wide Default)</option>
                {programmes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                id="isDefaultCheck"
                checked={newConfig.isDefault}
                onChange={(e) => setNewConfig({ ...newConfig, isDefault: e.target.checked })}
                className="w-4 h-4 text-[#800020] rounded border-stone-300 focus:ring-[#800020]"
              />
              <label htmlFor="isDefaultCheck" className="text-xs font-semibold text-stone-800">
                Set as Default Template for Selected Programme
              </label>
            </div>
          </div>

          <FormGroup id="config-desc" label="Description (Optional)">
            <Input
              id="config-desc"
              placeholder="e.g. Continuous assessment (30 marks) and Terminal examination (70 marks)"
              value={newConfig.description}
              onChange={(e) => setNewConfig({ ...newConfig, description: e.target.value })}
            />
          </FormGroup>

          <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-stone-900 uppercase tracking-wider">
                Scoring Components (Total: {newConfig.components.reduce((sum, c) => sum + (Number(c.maxScore) || 0), 0)} marks)
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setNewConfig({
                    ...newConfig,
                    components: [
                      ...newConfig.components,
                      { name: "New Component", shortCode: "COMP", maxScore: 10, weightPercentage: 10, type: AssessmentType.CONTINUOUS_ASSESSMENT },
                    ],
                  })
                }
              >
                + Add Component
              </Button>
            </div>

            {newConfig.components.map((comp, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-white p-2.5 rounded-lg border border-stone-200">
                <div className="col-span-12 sm:col-span-4">
                  <label className="block text-[10px] font-medium text-stone-600 mb-0.5">Component Name</label>
                  <Input
                    value={comp.name}
                    onChange={(e) => {
                      const updated = [...newConfig.components];
                      updated[idx].name = e.target.value;
                      setNewConfig({ ...newConfig, components: updated });
                    }}
                    placeholder="e.g. Continuous Assessment"
                  />
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <label className="block text-[10px] font-medium text-stone-600 mb-0.5">Code</label>
                  <Input
                    value={comp.shortCode}
                    onChange={(e) => {
                      const updated = [...newConfig.components];
                      updated[idx].shortCode = e.target.value.toUpperCase();
                      setNewConfig({ ...newConfig, components: updated });
                    }}
                    placeholder="e.g. CA"
                  />
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <label className="block text-[10px] font-medium text-stone-600 mb-0.5">Max Score</label>
                  <Input
                    type="number"
                    value={comp.maxScore}
                    onChange={(e) => {
                      const updated = [...newConfig.components];
                      const val = Number(e.target.value);
                      updated[idx].maxScore = val;
                      updated[idx].weightPercentage = val;
                      setNewConfig({ ...newConfig, components: updated });
                    }}
                  />
                </div>
                <div className="col-span-4 sm:col-span-3">
                  <label className="block text-[10px] font-medium text-stone-600 mb-0.5">Type</label>
                  <select
                    className="w-full h-10 px-2 rounded-lg border border-stone-300 bg-white text-xs text-stone-900"
                    value={comp.type}
                    onChange={(e) => {
                      const updated = [...newConfig.components];
                      updated[idx].type = e.target.value as AssessmentType;
                      setNewConfig({ ...newConfig, components: updated });
                    }}
                  >
                    <option value={AssessmentType.CONTINUOUS_ASSESSMENT}>CA</option>
                    <option value={AssessmentType.EXAMINATION}>Exam</option>
                    <option value={AssessmentType.TAHFEEZ_EVALUATION}>Tahfeez Evaluation</option>
                    <option value={AssessmentType.PROJECT}>Project</option>
                  </select>
                </div>
                <div className="col-span-12 sm:col-span-1 flex justify-end">
                  {newConfig.components.length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const updated = newConfig.components.filter((_, i) => i !== idx);
                        setNewConfig({ ...newConfig, components: updated });
                      }}
                      className="text-red-600 hover:bg-red-50 p-2 min-h-[36px]"
                    >
                      ×
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-stone-200">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setShowConfigModal(false)}
              disabled={configSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              className="font-bold min-w-[170px]"
              disabled={configSubmitting}
            >
              {configSubmitting ? "Creating..." : "Save Configuration"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

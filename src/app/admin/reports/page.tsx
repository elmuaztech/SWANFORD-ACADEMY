"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  Badge,
  Button,
  Input,
  LoadingState,
  ErrorState,
  EmptyState,
  PageHeader,
  Table,
  TableHead,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
  TableWrapper,
  TableMobileCard,
  Modal,
  FormGroup,
  Alert,
  Tabs,
} from "@/components";

interface AcademicTerm {
  id: string;
  name: string;
  termNumber: number;
  isCurrent: boolean;
}

interface AcademicSession {
  id: string;
  name: string;
  isCurrent: boolean;
  terms: AcademicTerm[];
}

interface SchoolClass {
  id: string;
  name: string;
  code: string;
}

interface Programme {
  id: string;
  name: string;
  code: string;
  classes: SchoolClass[];
}

interface StudentReportItem {
  id: string;
  admissionNumber: string;
  fullName: string;
  gender?: string | null;
  programme: { id: string; name: string; code: string };
  schoolClass: { id: string; name: string; code: string };
  approvedScoresCount: number;
  isReleased: boolean;
}

interface TemplateConfig {
  id?: string;
  name: string;
  schoolName: string;
  schoolMotto: string;
  schoolAddress: string;
  schoolPhone: string;
  schoolEmail: string;
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
  fontSize: string;
  tableBorderColor: string;
  showAttendance: boolean;
  showPosition: boolean;
  showClassAverage: boolean;
  showTeacherComment: boolean;
  showDirectorComment: boolean;
}

export default function AdminReportsPage() {
  const [activeTab, setActiveTab] = useState("preview-sheet");
  const [previewPupilId, setPreviewPupilId] = useState<string>("specimen");

  // Filter state
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [selectedTermId, setSelectedTermId] = useState<string>("");
  const [selectedProgrammeId, setSelectedProgrammeId] = useState<string>("ALL");
  const [selectedClassId, setSelectedClassId] = useState<string>("ALL");
  const [search, setSearch] = useState<string>("");

  // Data state
  const [students, setStudents] = useState<StudentReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Release action state
  const [releasingStudentId, setReleasingStudentId] = useState<string | null>(null);
  const [releaseAllLoading, setReleaseAllLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Preview Modal
  const [previewStudent, setPreviewStudent] = useState<StudentReportItem | null>(null);

  // Template customizer state
  const [templateConfig, setTemplateConfig] = useState<TemplateConfig>({
    name: "Official Swanford Primary Report Template",
    schoolName: "SWANFORD NURSERY AND PRIMARY SCHOOL",
    schoolMotto: "NURSERY, PRIMARY & TAHFEEZ SCHOOL",
    schoolAddress: "Block E6, 60 Housing Units, Ibrahim Aliyu Bye-Pass, Adjacent To Federal University Dutse, Jigawa State.",
    schoolPhone: "08038598318, 08060412439",
    schoolEmail: "Swanford99@gmail.com",
    primaryColor: "#5B0612",
    accentColor: "#C49A45",
    fontFamily: "Inter",
    fontSize: "9.5px",
    tableBorderColor: "#2D0408",
    showAttendance: true,
    showPosition: true,
    showClassAverage: true,
    showTeacherComment: true,
    showDirectorComment: true,
  });
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateMessage, setTemplateMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Fetch report data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedSessionId) params.set("sessionId", selectedSessionId);
      if (selectedTermId) params.set("termId", selectedTermId);
      if (selectedProgrammeId !== "ALL") params.set("programmeId", selectedProgrammeId);
      if (selectedClassId !== "ALL") params.set("classId", selectedClassId);

      const res = await fetch(`/api/admin/reports?${params.toString()}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to load report data.");
      }

      const data = await res.json();
      setSessions(data.sessions || []);
      setProgrammes(data.programmes || []);
      setStudents(data.students || []);

      if (!selectedSessionId && data.selectedSessionId) {
        setSelectedSessionId(data.selectedSessionId);
      }
      if (!selectedTermId && data.selectedTermId) {
        setSelectedTermId(data.selectedTermId);
      }
      setLoading(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load report data.");
      setLoading(false);
    }
  }, [selectedSessionId, selectedTermId, selectedProgrammeId, selectedClassId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch template configuration
  const fetchTemplateConfig = useCallback(async () => {
    setTemplateLoading(true);
    try {
      const res = await fetch("/api/admin/reports/templates");
      if (res.ok) {
        const json = await res.json();
        if (json.config) {
          setTemplateConfig(json.config);
        }
      }
    } catch {
      // Keep defaults
    } finally {
      setTemplateLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "template-customizer") {
      fetchTemplateConfig();
    }
  }, [activeTab, fetchTemplateConfig]);

  // Save template configuration
  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setTemplateSaving(true);
    setTemplateMessage(null);
    try {
      const res = await fetch("/api/admin/reports/templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(templateConfig),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || "Failed to save template configuration.");
      }
      setTemplateMessage({ type: "success", text: "Report template configuration updated successfully." });
    } catch (err: unknown) {
      setTemplateMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to save template." });
    } finally {
      setTemplateSaving(false);
    }
  };

  // Handle single release
  const handleReleaseStudent = async (studentId: string) => {
    if (!selectedSessionId || !selectedTermId) {
      alert("Academic Session and Term are required.");
      return;
    }

    setReleasingStudentId(studentId);
    setActionMessage(null);
    try {
      const res = await fetch("/api/admin/reports/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          academicSessionId: selectedSessionId,
          academicTermId: selectedTermId,
          studentId,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || "Failed to release report.");
      }

      setActionMessage({ type: "success", text: json.message || "Report released successfully." });
      // Update local state
      setStudents((prev) =>
        prev.map((s) => (s.id === studentId ? { ...s, isReleased: true } : s))
      );
    } catch (err: unknown) {
      setActionMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to release report." });
    } finally {
      setReleasingStudentId(null);
    }
  };

  // Handle class bulk release
  const handleReleaseAllInClass = async () => {
    if (!selectedSessionId || !selectedTermId) {
      alert("Please select an Academic Session and Term.");
      return;
    }

    const confirmRelease = window.confirm(
      selectedClassId !== "ALL"
        ? "Are you sure you want to release reports for all students in this class? Guardians will receive notifications."
        : "Are you sure you want to release reports for all enrolled students in this term? Guardians will receive notifications."
    );
    if (!confirmRelease) return;

    setReleaseAllLoading(true);
    setActionMessage(null);
    try {
      const res = await fetch("/api/admin/reports/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          academicSessionId: selectedSessionId,
          academicTermId: selectedTermId,
          schoolClassId: selectedClassId !== "ALL" ? selectedClassId : undefined,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || "Failed to release reports.");
      }

      setActionMessage({ type: "success", text: json.message || "Reports released successfully." });
      fetchData();
    } catch (err: unknown) {
      setActionMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to release reports." });
    } finally {
      setReleaseAllLoading(false);
    }
  };

  // Resolve terms for current session
  const activeSessionObj = sessions.find((s) => s.id === selectedSessionId);
  const availableTerms = activeSessionObj ? activeSessionObj.terms : [];

  // Available classes for selected programme
  const availableClasses =
    selectedProgrammeId === "ALL"
      ? programmes.flatMap((p) => p.classes)
      : programmes.find((p) => p.id === selectedProgrammeId)?.classes || [];

  // Filter students by search term
  const filteredStudents = students.filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      s.fullName.toLowerCase().includes(q) ||
      s.admissionNumber.toLowerCase().includes(q) ||
      s.schoolClass.name.toLowerCase().includes(q)
    );
  });

  const releasedCount = students.filter((s) => s.isReleased).length;

  const getPreviewUrl = () => {
    if (previewPupilId === "specimen") {
      const p = new URLSearchParams();
      if (selectedSessionId) p.set("sessionId", selectedSessionId);
      return `/api/admin/reports/preview?${p.toString()}`;
    }
    const p = new URLSearchParams();
    if (selectedTermId) p.set("termId", selectedTermId);
    if (selectedSessionId) p.set("sessionId", selectedSessionId);
    return `/api/admin/reports/view/${previewPupilId}?${p.toString()}`;
  };

  const handlePrintPreview = () => {
    const iframe = document.getElementById("main-report-preview-frame") as HTMLIFrameElement;
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.print();
    }
  };

  const handleOpenFullscreen = () => {
    window.open(getPreviewUrl(), "_blank");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Report Sheet Center"
        subtitle="Compile, customize, preview, and release official terminal report cards for pupils."
        primaryAction={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setActiveTab("preview-sheet")}
              className={`min-h-[44px] font-bold ${
                activeTab === "preview-sheet"
                  ? "bg-[#800020] text-white border-[#800020]"
                  : "border-[#800020] text-[#800020] hover:bg-[#800020]/10"
              }`}
            >
              <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Preview A4 Report Sheet
            </Button>
            {activeTab === "terminal-reports" && students.length > 0 && (
              <Button
                variant="primary"
                onClick={handleReleaseAllInClass}
                disabled={releaseAllLoading}
                className="min-h-[44px]"
              >
                {releaseAllLoading
                  ? "Releasing Reports..."
                  : selectedClassId !== "ALL"
                  ? "Release Class Reports"
                  : "Release All Enrolled Reports"}
              </Button>
            )}
          </div>
        }
      />

      {/* Tabs */}
      <Tabs
        activeTab={activeTab}
        onChange={setActiveTab}
        tabs={[
          { id: "preview-sheet", label: "A4 Report Sheet Live Preview" },
          { id: "terminal-reports", label: "Terminal Student Reports" },
          { id: "template-customizer", label: "Report Template Customizer" },
        ]}
      />

      {actionMessage && (
        <Alert variant={actionMessage.type === "success" ? "success" : "error"}>
          {actionMessage.text}
        </Alert>
      )}

      {/* TAB 0: LIVE A4 REPORT SHEET PREVIEW */}
      {activeTab === "preview-sheet" && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <Card className="border border-stone-200 bg-white shadow-xs">
            <CardContent className="p-4 sm:p-5">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-stone-900">
                      Official Swanford Nursery &amp; Primary School A4 Report Sheet
                    </h3>
                    <Badge variant="success" size="sm">A4 Print Ready</Badge>
                  </div>
                  <p className="text-xs text-stone-500">
                    High-elegance institutional layout matching Swanford Academy&apos;s physical report sheet with side-by-side assessment tables, 12-trait behavioral matrix, and single-page print optimization.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-semibold text-stone-600">Viewing:</label>
                    <select
                      className="h-10 px-3 rounded-lg border border-stone-300 bg-white text-stone-900 text-xs font-medium focus:ring-2 focus:ring-[#800020]"
                      value={previewPupilId}
                      onChange={(e) => setPreviewPupilId(e.target.value)}
                    >
                      <option value="specimen">Official Specimen (Muaz Ahmad Suleiman - Primary 1)</option>
                      {students.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.fullName} ({s.admissionNumber})
                        </option>
                      ))}
                    </select>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleOpenFullscreen}
                    className="min-h-[40px] text-xs font-semibold"
                  >
                    <svg className="w-3.5 h-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Fullscreen
                  </Button>

                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handlePrintPreview}
                    className="min-h-[40px] text-xs font-bold bg-[#800020] hover:bg-[#6b001a] text-white"
                  >
                    <svg className="w-3.5 h-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <polyline points="6 9 6 2 18 2 18 9"></polyline>
                      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                      <rect x="6" y="14" width="12" height="8"></rect>
                    </svg>
                    Print A4 Report Sheet
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Interactive A4 Sheet Frame */}
          <div className="w-full flex justify-center py-4 bg-stone-200/70 rounded-2xl border border-stone-300/80 p-2 sm:p-6 overflow-x-auto">
            <div className="w-full max-w-[218mm] bg-white rounded-lg shadow-2xl overflow-hidden border border-stone-300">
              <iframe
                id="main-report-preview-frame"
                src={getPreviewUrl()}
                className="w-full h-[960px] sm:h-[1050px] border-none"
                title="A4 Report Sheet Live Preview"
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB 1: TERMINAL REPORTS */}
      {activeTab === "terminal-reports" && (
        <div className="space-y-6">
          {/* Quick Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 sm:p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Enrolled Pupils</p>
                <p className="mt-1 text-2xl sm:text-3xl font-bold text-stone-900">{students.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 sm:p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Reports Released</p>
                <p className="mt-1 text-2xl sm:text-3xl font-bold text-emerald-700">{releasedCount}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 sm:p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Pending Release</p>
                <p className="mt-1 text-2xl sm:text-3xl font-bold text-amber-600">
                  {Math.max(0, students.length - releasedCount)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Filters Card */}
          <Card>
            <CardContent className="p-4 sm:p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Session Filter */}
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Academic Session</label>
                  <select
                    className="w-full h-11 px-3 rounded-lg border border-stone-300 bg-white text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#800020]"
                    value={selectedSessionId}
                    onChange={(e) => {
                      setSelectedSessionId(e.target.value);
                      const sess = sessions.find((s) => s.id === e.target.value);
                      if (sess && sess.terms.length > 0) {
                        setSelectedTermId(sess.terms[0].id);
                      }
                    }}
                  >
                    {sessions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.isCurrent ? "(Current)" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Term Filter */}
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Academic Term</label>
                  <select
                    className="w-full h-11 px-3 rounded-lg border border-stone-300 bg-white text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#800020]"
                    value={selectedTermId}
                    onChange={(e) => setSelectedTermId(e.target.value)}
                  >
                    {availableTerms.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} {t.isCurrent ? "(Active)" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Programme Filter */}
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Programme</label>
                  <select
                    className="w-full h-11 px-3 rounded-lg border border-stone-300 bg-white text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#800020]"
                    value={selectedProgrammeId}
                    onChange={(e) => {
                      setSelectedProgrammeId(e.target.value);
                      setSelectedClassId("ALL");
                    }}
                  >
                    <option value="ALL">All Programmes</option>
                    {programmes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.code})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Class Filter */}
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Class</label>
                  <select
                    className="w-full h-11 px-3 rounded-lg border border-stone-300 bg-white text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#800020]"
                    value={selectedClassId}
                    onChange={(e) => setSelectedClassId(e.target.value)}
                  >
                    <option value="ALL">All Classes</option>
                    {availableClasses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Pupil Search */}
              <div className="pt-2 border-t border-stone-100 flex flex-col sm:flex-row gap-3 items-center justify-between">
                <div className="w-full sm:max-w-md">
                  <Input
                    placeholder="Search by student name or admission number..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                {search && (
                  <Button variant="ghost" size="sm" onClick={() => setSearch("")}>
                    Clear Search
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Student List Content */}
          {loading ? (
            <LoadingState message="Loading student report compilation records..." />
          ) : error ? (
            <ErrorState title="Error Loading Reports" message={error} onRetry={fetchData} />
          ) : students.length === 0 ? (
            <EmptyState
              title="No Enrolled Pupils Registered Yet"
              description="No students are enrolled in the selected session or term yet. You can inspect, customize, and print the official Swanford A4 Report Sheet design right now in the Live Preview tab."
              actions={
                <Button
                  variant="primary"
                  onClick={() => setActiveTab("preview-sheet")}
                  className="min-h-[44px] font-bold"
                >
                  View Official A4 Report Sheet Preview
                </Button>
              }
            />
          ) : filteredStudents.length === 0 ? (
            <EmptyState
              title="No matching students"
              description="No students match your search filter."
              actions={
                <Button variant="outline" onClick={() => setSearch("")}>
                  Clear Search
                </Button>
              }
            />
          ) : (
            <TableWrapper>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Pupil</TableHeaderCell>
                    <TableHeaderCell>Admission No</TableHeaderCell>
                    <TableHeaderCell>Class & Programme</TableHeaderCell>
                    <TableHeaderCell>Approved Subjects</TableHeaderCell>
                    <TableHeaderCell>Release Status</TableHeaderCell>
                    <TableHeaderCell className="text-right">Actions</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredStudents.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <p className="font-semibold text-stone-900">{s.fullName}</p>
                        {s.gender && <p className="text-xs text-stone-500 capitalize">{s.gender.toLowerCase()}</p>}
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs font-bold text-stone-700 bg-stone-100 px-2 py-0.5 rounded">
                          {s.admissionNumber}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-xs font-semibold text-stone-800">{s.schoolClass.name}</p>
                          <p className="text-[11px] text-stone-500">{s.programme.name}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-stone-700">
                          {s.approvedScoresCount > 0 ? (
                            <span className="font-semibold text-emerald-700">{s.approvedScoresCount} Subjects Assessed</span>
                          ) : (
                            <span className="text-stone-400">0 Subjects</span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={s.isReleased ? "success" : "neutral"}>
                          {s.isReleased ? "Released to Parent" : "Draft / Unreleased"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPreviewStudent(s)}
                          >
                            View / Print A4
                          </Button>
                          {!s.isReleased ? (
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={releasingStudentId === s.id}
                              onClick={() => handleReleaseStudent(s.id)}
                            >
                              {releasingStudentId === s.id ? "Releasing..." : "Release"}
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={releasingStudentId === s.id}
                              onClick={() => handleReleaseStudent(s.id)}
                            >
                              Re-release
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Mobile View */}
              <div className="lg:hidden space-y-3 p-3">
                {filteredStudents.map((s) => (
                  <TableMobileCard
                    key={s.id}
                    title={s.fullName}
                    subtitle={`${s.admissionNumber} • ${s.schoolClass.name}`}
                    badge={
                      <Badge variant={s.isReleased ? "success" : "neutral"}>
                        {s.isReleased ? "Released" : "Draft"}
                      </Badge>
                    }
                    fields={[
                      { label: "Class", value: s.schoolClass.name },
                      { label: "Programme", value: s.programme.name },
                      { label: "Approved Subjects", value: `${s.approvedScoresCount} subjects` },
                    ]}
                    actions={
                      <div className="flex gap-2 w-full pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 min-h-[44px]"
                          onClick={() => setPreviewStudent(s)}
                        >
                          View / Print A4
                        </Button>
                        <Button
                          variant={s.isReleased ? "outline" : "primary"}
                          size="sm"
                          className="flex-1 min-h-[44px]"
                          disabled={releasingStudentId === s.id}
                          onClick={() => handleReleaseStudent(s.id)}
                        >
                          {releasingStudentId === s.id ? "Releasing..." : s.isReleased ? "Re-release" : "Release"}
                        </Button>
                      </div>
                    }
                  />
                ))}
              </div>
            </TableWrapper>
          )}
        </div>
      )}

      {/* TAB 2: TEMPLATE CUSTOMIZER */}
      {activeTab === "template-customizer" && (
        <Card>
          <CardHeader>
            <div>
              <h3 className="text-lg font-bold text-stone-900">Official Report Sheet Branding &amp; Customizer</h3>
              <p className="text-xs text-stone-500">Configure official school identity, colors, fonts, and section visibility on all generated A4 report cards.</p>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            {templateLoading ? (
              <LoadingState message="Loading template configuration..." />
            ) : (
              <form onSubmit={handleSaveTemplate} className="space-y-6">
                {templateMessage && (
                  <Alert variant={templateMessage.type === "success" ? "success" : "error"}>
                    {templateMessage.text}
                  </Alert>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormGroup label="School Name" required>
                    <Input
                      value={templateConfig.schoolName}
                      onChange={(e) => setTemplateConfig({ ...templateConfig, schoolName: e.target.value })}
                      required
                    />
                  </FormGroup>

                  <FormGroup label="School Motto / Subtitle" required>
                    <Input
                      value={templateConfig.schoolMotto}
                      onChange={(e) => setTemplateConfig({ ...templateConfig, schoolMotto: e.target.value })}
                      required
                    />
                  </FormGroup>
                </div>

                <FormGroup label="School Address" required>
                  <Input
                    value={templateConfig.schoolAddress}
                    onChange={(e) => setTemplateConfig({ ...templateConfig, schoolAddress: e.target.value })}
                    required
                  />
                </FormGroup>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormGroup label="Telephone Contact(s)" required>
                    <Input
                      value={templateConfig.schoolPhone}
                      onChange={(e) => setTemplateConfig({ ...templateConfig, schoolPhone: e.target.value })}
                      required
                    />
                  </FormGroup>

                  <FormGroup label="School Email Address" required>
                    <Input
                      type="email"
                      value={templateConfig.schoolEmail}
                      onChange={(e) => setTemplateConfig({ ...templateConfig, schoolEmail: e.target.value })}
                      required
                    />
                  </FormGroup>
                </div>

                {/* Colors & Typography */}
                <div className="pt-4 border-t border-stone-200">
                  <h4 className="text-sm font-bold text-stone-900 mb-3">Color Palette & Typography</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <FormGroup label="Primary Color">
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={templateConfig.primaryColor}
                          onChange={(e) => setTemplateConfig({ ...templateConfig, primaryColor: e.target.value })}
                          className="h-10 w-12 rounded border border-stone-300 cursor-pointer p-0.5 bg-white"
                        />
                        <Input
                          value={templateConfig.primaryColor}
                          onChange={(e) => setTemplateConfig({ ...templateConfig, primaryColor: e.target.value })}
                        />
                      </div>
                    </FormGroup>

                    <FormGroup label="Accent Color">
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={templateConfig.accentColor}
                          onChange={(e) => setTemplateConfig({ ...templateConfig, accentColor: e.target.value })}
                          className="h-10 w-12 rounded border border-stone-300 cursor-pointer p-0.5 bg-white"
                        />
                        <Input
                          value={templateConfig.accentColor}
                          onChange={(e) => setTemplateConfig({ ...templateConfig, accentColor: e.target.value })}
                        />
                      </div>
                    </FormGroup>

                    <FormGroup label="Font Family">
                      <select
                        className="w-full h-11 px-3 rounded-lg border border-stone-300 bg-white text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#800020]"
                        value={templateConfig.fontFamily}
                        onChange={(e) => setTemplateConfig({ ...templateConfig, fontFamily: e.target.value })}
                      >
                        <option value="Inter">Inter (Clean Modern)</option>
                        <option value="Arial">Arial (Standard)</option>
                        <option value="Times New Roman">Times New Roman (Formal)</option>
                        <option value="Georgia">Georgia (Classic Serif)</option>
                      </select>
                    </FormGroup>

                    <FormGroup label="Base Font Size">
                      <select
                        className="w-full h-11 px-3 rounded-lg border border-stone-300 bg-white text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#800020]"
                        value={templateConfig.fontSize}
                        onChange={(e) => setTemplateConfig({ ...templateConfig, fontSize: e.target.value })}
                      >
                        <option value="10px">10px (Compact)</option>
                        <option value="10.5px">10.5px (Recommended)</option>
                        <option value="11px">11px (Legible)</option>
                        <option value="12px">12px (Spacious)</option>
                      </select>
                    </FormGroup>
                  </div>
                </div>

                {/* Section Visibility Toggles */}
                <div className="pt-4 border-t border-stone-200">
                  <h4 className="text-sm font-bold text-stone-900 mb-3">Section Visibility Controls</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <label className="flex items-center gap-2 text-sm text-stone-700 p-2 rounded-lg border border-stone-100 hover:bg-stone-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={templateConfig.showAttendance}
                        onChange={(e) => setTemplateConfig({ ...templateConfig, showAttendance: e.target.checked })}
                        className="w-4 h-4 text-[#800020] rounded border-stone-300 focus:ring-[#800020]"
                      />
                      Show Attendance Record
                    </label>

                    <label className="flex items-center gap-2 text-sm text-stone-700 p-2 rounded-lg border border-stone-100 hover:bg-stone-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={templateConfig.showPosition}
                        onChange={(e) => setTemplateConfig({ ...templateConfig, showPosition: e.target.checked })}
                        className="w-4 h-4 text-[#800020] rounded border-stone-300 focus:ring-[#800020]"
                      />
                      Show Class Position
                    </label>

                    <label className="flex items-center gap-2 text-sm text-stone-700 p-2 rounded-lg border border-stone-100 hover:bg-stone-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={templateConfig.showClassAverage}
                        onChange={(e) => setTemplateConfig({ ...templateConfig, showClassAverage: e.target.checked })}
                        className="w-4 h-4 text-[#800020] rounded border-stone-300 focus:ring-[#800020]"
                      />
                      Show Class Average Score
                    </label>

                    <label className="flex items-center gap-2 text-sm text-stone-700 p-2 rounded-lg border border-stone-100 hover:bg-stone-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={templateConfig.showTeacherComment}
                        onChange={(e) => setTemplateConfig({ ...templateConfig, showTeacherComment: e.target.checked })}
                        className="w-4 h-4 text-[#800020] rounded border-stone-300 focus:ring-[#800020]"
                      />
                      Show Class Teacher Remark
                    </label>

                    <label className="flex items-center gap-2 text-sm text-stone-700 p-2 rounded-lg border border-stone-100 hover:bg-stone-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={templateConfig.showDirectorComment}
                        onChange={(e) => setTemplateConfig({ ...templateConfig, showDirectorComment: e.target.checked })}
                        className="w-4 h-4 text-[#800020] rounded border-stone-300 focus:ring-[#800020]"
                      />
                      Show Director / Head Teacher Remark
                    </label>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-stone-200">
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={templateSaving}
                    className="min-h-[44px]"
                  >
                    {templateSaving ? "Saving Template Settings..." : "Save Template Settings"}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {/* MODAL: VIEW / PRINT A4 REPORT SHEET */}
      {previewStudent && selectedTermId && (
        <Modal
          isOpen={!!previewStudent}
          onClose={() => setPreviewStudent(null)}
          title={`Official Report Sheet — ${previewStudent.fullName} (${previewStudent.admissionNumber})`}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <div>
                <p className="text-sm font-semibold text-stone-900">{previewStudent.fullName}</p>
                <p className="text-xs text-stone-500">
                  Class: {previewStudent.schoolClass.name} | Programme: {previewStudent.programme.name}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    const iframe = document.getElementById("report-preview-frame") as HTMLIFrameElement;
                    if (iframe && iframe.contentWindow) {
                      iframe.contentWindow.print();
                    }
                  }}
                >
                  Print Report
                </Button>
              </div>
            </div>

            {/* A4 Preview Container */}
            <div className="w-full bg-stone-100 p-2 sm:p-4 rounded-lg overflow-hidden border border-stone-200">
              <iframe
                id="report-preview-frame"
                src={`/api/admin/reports/view/${previewStudent.id}?termId=${selectedTermId}&sessionId=${selectedSessionId || ""}`}
                className="w-full h-[650px] bg-white rounded border border-stone-300 shadow-sm"
                title="Pupil A4 Report Sheet"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-200">
              <Button variant="outline" onClick={() => setPreviewStudent(null)}>
                Close Preview
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

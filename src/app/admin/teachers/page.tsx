"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
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
} from "@/components";

interface TeacherItem {
  id: string;
  staffId: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  phonePrimary: string;
  qualification: string | null;
  employmentStatus: string;
  user: { id: string; email: string; status: string };
  scopes: Array<{
    id: string;
    scopeType: string;
    isClassTeacher: boolean;
    programme: { name: string };
    schoolClass: { name: string } | null;
    subject: { name: string } | null;
  }>;
}

export default function AdminTeachersPage() {
  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Add Teacher Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [programmes, setProgrammes] = useState<Array<{ id: string; name: string }>>([]);
  const [classes, setClasses] = useState<Array<{ id: string; name: string; programmeId: string }>>([]);
  const [subjects, setSubjects] = useState<Array<{ id: string; name: string; programmeId: string }>>([]);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phonePrimary: "",
    qualification: "",
    staffIdNumber: "",
    programmeId: "",
    schoolClassId: "",
    subjectId: "",
    isClassTeacher: false,
  });

  // Atomic Switch Modal State
  const [showSwitchModal, setShowSwitchModal] = useState(false);
  const [sessions, setSessions] = useState<Array<{ id: string; name: string; isCurrent: boolean }>>([]);
  const [switchTeacherA, setSwitchTeacherA] = useState("");
  const [switchClassA, setSwitchClassA] = useState("");
  const [switchTeacherB, setSwitchTeacherB] = useState("");
  const [switchClassB, setSwitchClassB] = useState("");
  const [switchProgrammeId, setSwitchProgrammeId] = useState("");
  const [switchSessionId, setSwitchSessionId] = useState("");
  const [switchReason, setSwitchReason] = useState("");
  const [switchSubmitting, setSwitchSubmitting] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [switchSuccess, setSwitchSuccess] = useState<string | null>(null);

  const handleOpenSwitchModal = () => {
    setSwitchError(null);
    setSwitchSuccess(null);
    setSwitchReason("");
    if (programmes.length > 0 && !switchProgrammeId) {
      setSwitchProgrammeId(programmes[0].id);
    }
    setShowSwitchModal(true);
  };

  const handleSwitchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSwitchError(null);
    setSwitchSuccess(null);

    if (!switchTeacherA || !switchClassA || !switchTeacherB || !switchClassB) {
      setSwitchError("Please select both teachers and their corresponding classes.");
      return;
    }

    if (switchTeacherA === switchTeacherB) {
      setSwitchError("Teacher A and Teacher B must be different staff members.");
      return;
    }

    if (switchClassA === switchClassB) {
      setSwitchError("Class A and Class B must be different classes.");
      return;
    }

    if (!switchProgrammeId || !switchSessionId) {
      setSwitchError("Programme and Academic Session are required.");
      return;
    }

    setSwitchSubmitting(true);
    try {
      const res = await fetch("/api/admin/teachers/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teacherAId: switchTeacherA,
          classAId: switchClassA,
          teacherBId: switchTeacherB,
          classBId: switchClassB,
          programmeId: switchProgrammeId,
          academicSessionId: switchSessionId,
          reason: switchReason.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to execute atomic teacher class switch.");
      }

      setSwitchSuccess("Atomic teacher swap completed successfully! Academic assignments have been updated.");
      fetchTeachers();
      setTimeout(() => {
        setShowSwitchModal(false);
        setSwitchSuccess(null);
      }, 2000);
    } catch (err: unknown) {
      setSwitchError(err instanceof Error ? err.message : "Failed to execute switch.");
    } finally {
      setSwitchSubmitting(false);
    }
  };

  const fetchTeachers = (query?: string) => {
    setLoading(true);
    setError(null);
    let url = "/api/admin/teachers";
    const q = query !== undefined ? query : search;
    if (q) url += `?search=${encodeURIComponent(q)}`;
    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Failed to load teachers roster.");
        }
        return res.json();
      })
      .then((json) => {
        setTeachers(json.teachers || json);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load teachers.");
        setLoading(false);
      });
  };

  const fetchAcademicDropdowns = () => {
    Promise.all([
      fetch("/api/admin/programmes?includeInactive=false").then((r) => r.json()).catch(() => ({})),
      fetch("/api/admin/classes?includeInactive=false").then((r) => r.json()).catch(() => ({})),
      fetch("/api/admin/subjects?includeInactive=false").then((r) => r.json()).catch(() => ({})),
      fetch("/api/super-admin/config").then((r) => r.json()).catch(() => ({})),
    ]).then(([progsData, classesData, subsData, configData]) => {
      if (progsData.items) setProgrammes(progsData.items);
      if (classesData.items) setClasses(classesData.items);
      if (subsData.items) setSubjects(subsData.items);
      if (configData.academicSessions) {
        setSessions(configData.academicSessions);
        const curr = configData.academicSessions.find((s: any) => s.isCurrent);
        if (curr) setSwitchSessionId(curr.id);
      }
    });
  };

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user) setCurrentUser(d.user);
      })
      .catch(() => {});
  }, []);

  const handleImpersonateTeacher = async (teacherId: string) => {
    try {
      setImpersonatingId(teacherId);
      setError(null);
      const res = await fetch("/api/super-admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to impersonate teacher account");
      }
      window.location.href = data.redirectUrl || "/teacher";
    } catch (err: any) {
      setError(err?.message || "Failed to impersonate teacher.");
      setImpersonatingId(null);
    }
  };

  useEffect(() => {
    fetchTeachers("");
    fetchAcademicDropdowns();
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTeachers();
  };

  const handleClear = () => {
    setSearch("");
    fetchTeachers("");
  };

  const handleOpenAddModal = () => {
    setFormData({
      firstName: "",
      lastName: "",
      email: "",
      phonePrimary: "",
      qualification: "",
      staffIdNumber: "",
      programmeId: programmes[0]?.id || "",
      schoolClassId: "",
      subjectId: "",
      isClassTeacher: false,
    });
    setFormError(null);
    setFormSuccess(null);
    setShowAddModal(true);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    setSubmitting(true);

    try {
      const payload: any = {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim(),
        phonePrimary: formData.phonePrimary.trim(),
        qualification: formData.qualification.trim() || undefined,
        staffIdNumber: formData.staffIdNumber.trim() || undefined,
      };

      if (formData.programmeId) {
        payload.scopes = [
          {
            programmeId: formData.programmeId,
            schoolClassId: formData.schoolClassId || null,
            subjectId: formData.subjectId || null,
            isClassTeacher: formData.isClassTeacher,
          },
        ];
      }

      const res = await fetch("/api/admin/teachers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to provision teacher profile.");
      }

      setFormSuccess(
        `Teacher ${formData.firstName} ${formData.lastName} provisioned successfully! Activation email has been dispatched.`
      );
      fetchTeachers();
      setTimeout(() => {
        setShowAddModal(false);
        setFormSuccess(null);
      }, 1800);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to provision teacher.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Teachers"
        description="School teachers, assigned classes, and subject responsibilities."
        breadcrumbs={[
          { label: "Dashboard", href: "/admin" },
          { label: "Teachers" },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="md"
              className="font-bold border-[#800020] text-[#800020] hover:bg-[#FAF2F4]"
              onClick={handleOpenSwitchModal}
            >
              Swap / Switch Teachers
            </Button>
            <Button
              variant="primary"
              size="md"
              className="font-bold flex items-center gap-1.5"
              onClick={handleOpenAddModal}
            >
              <span>+</span> Add Teacher
            </Button>
          </div>
        }
      />

      <Card className="border border-[#EADBDA]/80">
        <CardContent className="p-4">
          <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row items-stretch md:items-center gap-3 w-full">
            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder="Search staff name, ID, or qualification..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full"
              />
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Button type="submit" variant="primary" size="md" className="font-bold whitespace-nowrap">
                Search
              </Button>
              {search && (
                <Button type="button" variant="outline" size="md" onClick={handleClear} className="whitespace-nowrap">
                  Clear
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {loading ? (
        <div className="py-12">
          <LoadingState message="Loading teachers..." />
        </div>
      ) : error ? (
        <ErrorState
          title="Teachers Unavailable"
          message={error}
          actionLabel="Try Again"
          onAction={() => fetchTeachers()}
        />
      ) : teachers.length === 0 ? (
        search ? (
          <EmptyState
            title="No Teachers Match Search"
            description="No teachers match your search keywords."
            actionLabel="Clear Search Filter"
            onAction={handleClear}
          />
        ) : (
          <EmptyState
            title="No records yet."
            description="No teacher records exist in the system yet. Click 'Add Teacher' to create the first teacher account."
            actionLabel="Add Teacher"
            onAction={handleOpenAddModal}
          />
        )
      ) : (
        <div>
          {/* Desktop Semantic Table View (>= 768px) */}
          <div className="hidden md:block">
            <TableWrapper className="border border-[#EADBDA]/80">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell className="w-14 text-center font-semibold text-stone-700">S/N</TableHeaderCell>
                    <TableHeaderCell className="w-36 text-left font-semibold text-stone-700">Staff ID</TableHeaderCell>
                    <TableHeaderCell className="min-w-[180px] text-left font-semibold text-stone-700">Teacher Name</TableHeaderCell>
                    <TableHeaderCell className="min-w-[180px] text-left font-semibold text-stone-700">Contact</TableHeaderCell>
                    <TableHeaderCell className="min-w-[160px] text-left font-semibold text-stone-700">Qualification</TableHeaderCell>
                    <TableHeaderCell className="w-36 text-left font-semibold text-stone-700">Active Scopes</TableHeaderCell>
                    <TableHeaderCell className="w-28 text-left font-semibold text-stone-700">Status</TableHeaderCell>
                    <TableHeaderCell className="min-w-[240px] text-right font-semibold text-stone-700">Actions</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {teachers.map((t, index) => (
                    <TableRow key={t.id}>
                      <TableCell className="w-14 text-center text-xs font-semibold text-stone-500">
                        {index + 1}
                      </TableCell>
                      <TableCell className="w-36 font-mono text-xs font-bold text-stone-900">
                        {t.staffId}
                      </TableCell>
                      <TableCell className="min-w-[180px] font-bold text-stone-900 break-words">
                        {t.firstName} {t.lastName}
                      </TableCell>
                      <TableCell className="min-w-[180px] text-xs text-stone-600">
                        <div>{t.phonePrimary}</div>
                        <span className="text-[11px] text-stone-400">{t.user?.email}</span>
                      </TableCell>
                      <TableCell className="min-w-[160px] text-xs text-stone-700">
                        {t.qualification || "—"}
                      </TableCell>
                      <TableCell className="w-36 text-xs">
                        {t.scopes?.length ? (
                          <span className="font-bold text-[#800020] bg-[#FAF2F4] border border-[#EADBDA] px-2.5 py-0.5 rounded-full text-xs inline-block">
                            {t.scopes.length} Scope{t.scopes.length > 1 ? "s" : ""}
                          </span>
                        ) : (
                          <span className="text-stone-400">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell className="w-28">
                        <Badge variant={t.employmentStatus === "ACTIVE" ? "success" : "neutral"} size="sm">
                          {t.employmentStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="min-w-[240px] text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {currentUser?.roles?.includes("SUPER_ADMIN") && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={impersonatingId === t.id}
                              onClick={() => handleImpersonateTeacher(t.id)}
                              className="border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 font-semibold text-xs whitespace-nowrap min-h-[36px]"
                              title="Directly impersonate this educator and open Teacher Dashboard"
                            >
                              {impersonatingId === t.id ? "Loading..." : "🎭 Impersonate"}
                            </Button>
                          )}
                          <Link href={`/admin/teachers/${t.id}?edit=true`}>
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-stone-300 text-stone-700 hover:bg-stone-50 font-semibold text-xs whitespace-nowrap min-h-[36px]"
                              title="Edit teacher profile details"
                            >
                              ✏️ Edit
                            </Button>
                          </Link>
                          <Link href={`/admin/teachers/${t.id}`}>
                            <Button variant="secondary" size="sm" className="bg-[#FDF2F4] text-[#5B0612] hover:bg-[#F9E2E6] font-semibold whitespace-nowrap min-h-[36px]">
                              Manage Scopes
                            </Button>
                          </Link>
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
            {teachers.map((t, index) => (
              <TableMobileCard
                key={t.id}
                title={
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-stone-100 text-stone-700 text-xs font-bold shrink-0">
                      {index + 1}
                    </span>
                    <span className="text-sm font-bold text-stone-900 truncate">
                      {t.firstName} {t.lastName}
                    </span>
                  </div>
                }
                subtitle={
                  <span className="font-mono text-xs font-semibold text-[#800020] pl-8 block">
                    {t.staffId}
                  </span>
                }
                badge={
                  <Badge variant={t.employmentStatus === "ACTIVE" ? "success" : "neutral"} size="sm">
                    {t.employmentStatus}
                  </Badge>
                }
                fields={[
                  { label: "Phone", value: t.phonePrimary },
                  { label: "Email", value: t.user?.email || "—" },
                  { label: "Qualification", value: t.qualification || "—" },
                  {
                    label: "Scopes",
                    value: t.scopes?.length ? `${t.scopes.length} Assigned` : "Unassigned",
                  },
                ]}
                actions={
                  <div className="w-full space-y-2">
                    {currentUser?.roles?.includes("SUPER_ADMIN") && (
                      <Button
                        variant="outline"
                        size="md"
                        disabled={impersonatingId === t.id}
                        onClick={() => handleImpersonateTeacher(t.id)}
                        className="w-full border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 font-semibold min-h-[44px]"
                      >
                        {impersonatingId === t.id ? "Switching..." : "🎭 Impersonate Teacher"}
                      </Button>
                    )}
                    <Link href={`/admin/teachers/${t.id}?edit=true`} className="w-full block">
                      <Button
                        variant="outline"
                        size="md"
                        className="w-full font-semibold min-h-[44px]"
                      >
                        ✏️ Edit Details
                      </Button>
                    </Link>
                    <Link href={`/admin/teachers/${t.id}`} className="w-full block">
                      <Button
                        variant="secondary"
                        size="md"
                        className="w-full bg-[#FDF2F4] text-[#5B0612] hover:bg-[#F9E2E6] font-semibold min-h-[44px]"
                      >
                        Manage Scopes
                      </Button>
                    </Link>
                  </div>
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* Add Teacher Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => !submitting && setShowAddModal(false)}
        title="Add Teacher"
        description="Create a teacher profile, assign class and subject, and send login details."
        size="lg"
      >
        <form onSubmit={handleAddSubmit} className="space-y-4">
          {formError && (
            <Alert variant="danger" title="Provisioning Failed">
              {formError}
            </Alert>
          )}

          {formSuccess && (
            <Alert variant="success" title="Success">
              {formSuccess}
            </Alert>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormGroup id="teacher-firstName" label="First Name" required>
              <Input
                id="teacher-firstName"
                required
                placeholder="e.g. Samuel"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              />
            </FormGroup>

            <FormGroup id="teacher-lastName" label="Last Name" required>
              <Input
                id="teacher-lastName"
                required
                placeholder="e.g. Adebayo"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              />
            </FormGroup>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormGroup id="teacher-email" label="Email Address" required helperText="Used for portal login and activation email.">
              <Input
                id="teacher-email"
                type="email"
                required
                placeholder="e.g. s.adebayo@swanford.sch.ng"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </FormGroup>

            <FormGroup id="teacher-phone" label="Primary Phone" helperText="WhatsApp or voice reachable line.">
              <Input
                id="teacher-phone"
                type="tel"
                placeholder="e.g. 08012345678"
                value={formData.phonePrimary}
                onChange={(e) => setFormData({ ...formData, phonePrimary: e.target.value })}
              />
            </FormGroup>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormGroup id="teacher-staffId" label="Staff ID Number" helperText="Leave empty to auto-generate (e.g. STF-2026-0001).">
              <Input
                id="teacher-staffId"
                placeholder="Auto-generated if blank"
                value={formData.staffIdNumber}
                onChange={(e) => setFormData({ ...formData, staffIdNumber: e.target.value })}
              />
            </FormGroup>

            <FormGroup id="teacher-qualification" label="Academic Qualification" helperText="e.g. B.Sc. Ed Mathematics, TRCN">
              <Input
                id="teacher-qualification"
                placeholder="e.g. B.Ed, M.Sc, TRCN"
                value={formData.qualification}
                onChange={(e) => setFormData({ ...formData, qualification: e.target.value })}
              />
            </FormGroup>
          </div>

          {/* Academic Scope Assignment */}
          <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-lg space-y-3">
            <p className="text-xs font-bold text-stone-900 uppercase tracking-wider">
              Academic Assignment (Optional upon creation)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">Programme</label>
                <select
                  className="w-full h-10 px-2.5 rounded-lg border border-stone-300 bg-white text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#800020]"
                  value={formData.programmeId}
                  onChange={(e) => setFormData({ ...formData, programmeId: e.target.value, schoolClassId: "", subjectId: "" })}
                >
                  <option value="">No Programme</option>
                  {programmes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">Class</label>
                <select
                  className="w-full h-10 px-2.5 rounded-lg border border-stone-300 bg-white text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#800020]"
                  value={formData.schoolClassId}
                  onChange={(e) => setFormData({ ...formData, schoolClassId: e.target.value })}
                  disabled={!formData.programmeId}
                >
                  <option value="">All Classes / None</option>
                  {classes
                    .filter((c) => !formData.programmeId || c.programmeId === formData.programmeId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">Subject</label>
                <select
                  className="w-full h-10 px-2.5 rounded-lg border border-stone-300 bg-white text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#800020]"
                  value={formData.subjectId}
                  onChange={(e) => setFormData({ ...formData, subjectId: e.target.value })}
                  disabled={!formData.programmeId}
                >
                  <option value="">All Subjects / None</option>
                  {subjects
                    .filter((s) => !formData.programmeId || s.programmeId === formData.programmeId)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="isTeacherFormCheck"
                checked={formData.isClassTeacher}
                onChange={(e) => setFormData({ ...formData, isClassTeacher: e.target.checked })}
                className="w-4 h-4 text-[#800020] rounded border-stone-300 focus:ring-[#800020]"
              />
              <label htmlFor="isTeacherFormCheck" className="text-xs font-medium text-stone-800">
                Assign as Class Teacher / Form Teacher (Class-Wide Authority)
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-stone-200">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setShowAddModal(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              className="font-bold min-w-[140px]"
              disabled={submitting}
            >
              {submitting ? "Saving Teacher..." : "Save Teacher"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Atomic Switch / Swap Teachers Modal */}
      <Modal
        isOpen={showSwitchModal}
        onClose={() => !switchSubmitting && setShowSwitchModal(false)}
        title="Swap / Switch Teachers Between Classes"
        description="Execute an atomic reassignment between two teachers and their classes. Historical student assessment records, attendance, and scores remain permanently preserved."
        size="lg"
      >
        <form onSubmit={handleSwitchSubmit} className="space-y-4">
          {switchError && (
            <Alert variant="danger" title="Switch Failed">
              {switchError}
            </Alert>
          )}

          {switchSuccess && (
            <Alert variant="success" title="Success">
              {switchSuccess}
            </Alert>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Programme <span className="text-red-500">*</span>
              </label>
              <select
                className="w-full h-10 px-3 rounded-lg border border-stone-300 bg-white text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#800020]"
                value={switchProgrammeId}
                onChange={(e) => {
                  setSwitchProgrammeId(e.target.value);
                  setSwitchClassA("");
                  setSwitchClassB("");
                }}
                required
              >
                <option value="">Select Programme</option>
                {programmes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Academic Session <span className="text-red-500">*</span>
              </label>
              <select
                className="w-full h-10 px-3 rounded-lg border border-stone-300 bg-white text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#800020]"
                value={switchSessionId}
                onChange={(e) => setSwitchSessionId(e.target.value)}
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
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3.5 bg-stone-50 border border-stone-200 rounded-lg">
            {/* Teacher A / Class A */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-[#800020] text-white text-[11px] font-bold flex items-center justify-center">
                  A
                </span>
                <span className="text-xs font-bold text-stone-900 uppercase">First Teacher</span>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">Teacher</label>
                <select
                  className="w-full h-10 px-2.5 rounded-lg border border-stone-300 bg-white text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#800020]"
                  value={switchTeacherA}
                  onChange={(e) => setSwitchTeacherA(e.target.value)}
                  required
                >
                  <option value="">Select Staff Member</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id} disabled={t.id === switchTeacherB}>
                      {t.firstName} {t.lastName} ({t.staffId})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">Current Class</label>
                <select
                  className="w-full h-10 px-2.5 rounded-lg border border-stone-300 bg-white text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#800020]"
                  value={switchClassA}
                  onChange={(e) => setSwitchClassA(e.target.value)}
                  required
                  disabled={!switchProgrammeId}
                >
                  <option value="">Select Class</option>
                  {classes
                    .filter((c) => !switchProgrammeId || c.programmeId === switchProgrammeId)
                    .map((c) => (
                      <option key={c.id} value={c.id} disabled={c.id === switchClassB}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {/* Teacher B / Class B */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-[#800020] text-white text-[11px] font-bold flex items-center justify-center">
                  B
                </span>
                <span className="text-xs font-bold text-stone-900 uppercase">Second Teacher</span>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">Teacher</label>
                <select
                  className="w-full h-10 px-2.5 rounded-lg border border-stone-300 bg-white text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#800020]"
                  value={switchTeacherB}
                  onChange={(e) => setSwitchTeacherB(e.target.value)}
                  required
                >
                  <option value="">Select Staff Member</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id} disabled={t.id === switchTeacherA}>
                      {t.firstName} {t.lastName} ({t.staffId})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">Current Class</label>
                <select
                  className="w-full h-10 px-2.5 rounded-lg border border-stone-300 bg-white text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#800020]"
                  value={switchClassB}
                  onChange={(e) => setSwitchClassB(e.target.value)}
                  required
                  disabled={!switchProgrammeId}
                >
                  <option value="">Select Class</option>
                  {classes
                    .filter((c) => !switchProgrammeId || c.programmeId === switchProgrammeId)
                    .map((c) => (
                      <option key={c.id} value={c.id} disabled={c.id === switchClassA}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>
          </div>

          <FormGroup id="switch-reason" label="Administrative Handover Reason" helperText="Recorded into audit log and teacher assignment history.">
            <Input
              id="switch-reason"
              placeholder="e.g. Mid-term staff restructuring / mutual class reassignment"
              value={switchReason}
              onChange={(e) => setSwitchReason(e.target.value)}
            />
          </FormGroup>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-stone-200">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setShowSwitchModal(false)}
              disabled={switchSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              className="font-bold min-w-[170px]"
              disabled={switchSubmitting}
            >
              {switchSubmitting ? "Executing Swap..." : "Execute Atomic Swap"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}


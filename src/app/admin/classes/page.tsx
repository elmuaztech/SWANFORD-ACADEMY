"use client";

import React, { useEffect, useState, useCallback } from "react";
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

interface Programme {
  id: string;
  name: string;
  code: string;
}

interface TeacherScopeItem {
  id: string;
  isClassTeacher: boolean;
  teacher: {
    id: string;
    staffId: string;
    firstName: string;
    lastName: string;
  };
  subject?: {
    id: string;
    name: string;
  } | null;
}

interface ClassItem {
  id: string;
  code: string;
  name: string;
  arm: string | null;
  capacity: number;
  isActive: boolean;
  displayOrder: number;
  programmeId: string;
  programme: Programme;
  teacherScopes?: TeacherScopeItem[];
  _count?: {
    enrollments: number;
  };
}

interface StudentInClass {
  id: string;
  student: {
    id: string;
    admissionNumber: string;
    firstName: string;
    lastName: string;
    otherNames: string | null;
    gender: string;
  };
}

interface TeacherOption {
  id: string;
  firstName: string;
  lastName: string;
  staffId: string;
}

export default function AdminClassesPage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [selectedProgramme, setSelectedProgramme] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");

  // Modal: Create / Edit Class
  const [showClassModal, setShowClassModal] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [classForm, setClassForm] = useState({
    programmeId: "",
    code: "",
    name: "",
    arm: "",
    capacity: 30,
    displayOrder: 0,
    isActive: true,
  });

  // Modal: View Class Students
  const [viewingClassStudents, setViewingClassStudents] = useState<ClassItem | null>(null);
  const [studentsList, setStudentsList] = useState<StudentInClass[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);

  // Modal: Assign Teacher to Class
  const [assigningClass, setAssigningClass] = useState<ClassItem | null>(null);
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [isFormTeacher, setIsFormTeacher] = useState(true);
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignSuccess, setAssignSuccess] = useState<string | null>(null);

  const fetchInitialData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [classesRes, progsRes, teachersRes] = await Promise.all([
        fetch("/api/admin/classes?includeInactive=true"),
        fetch("/api/admin/programmes?includeInactive=true"),
        fetch("/api/admin/teachers?limit=100"),
      ]);

      if (!classesRes.ok) throw new Error("Failed to load classes.");
      const classesData = await classesRes.json();
      setClasses(Array.isArray(classesData.items) ? classesData.items : []);

      if (progsRes.ok) {
        const progsData = await progsRes.json();
        setProgrammes(Array.isArray(progsData.items) ? progsData.items : []);
      }

      if (teachersRes.ok) {
        const teachersData = await teachersRes.json();
        const list = Array.isArray(teachersData.teachers)
          ? teachersData.teachers
          : Array.isArray(teachersData.items)
          ? teachersData.items
          : [];
        setTeachers(list);
      }

      setLoading(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load classes roster.");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const handleOpenCreate = () => {
    setEditingClass(null);
    setClassForm({
      programmeId: programmes[0]?.id || "",
      code: "",
      name: "",
      arm: "",
      capacity: 30,
      displayOrder: classes.length + 1,
      isActive: true,
    });
    setFormError(null);
    setFormSuccess(null);
    setShowClassModal(true);
  };

  const handleOpenEdit = (c: ClassItem) => {
    setEditingClass(c);
    setClassForm({
      programmeId: c.programmeId,
      code: c.code,
      name: c.name,
      arm: c.arm || "",
      capacity: c.capacity,
      displayOrder: c.displayOrder,
      isActive: c.isActive,
    });
    setFormError(null);
    setFormSuccess(null);
    setShowClassModal(true);
  };

  const handleSaveClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setFormSuccess(null);

    try {
      const url = editingClass
        ? `/api/admin/classes/${editingClass.id}`
        : "/api/admin/classes";
      const method = editingClass ? "PATCH" : "POST";

      const payload = editingClass
        ? {
            name: classForm.name.trim(),
            arm: classForm.arm.trim() || undefined,
            capacity: Number(classForm.capacity),
            displayOrder: Number(classForm.displayOrder),
            isActive: classForm.isActive,
          }
        : {
            programmeId: classForm.programmeId,
            code: classForm.code.trim().toUpperCase(),
            name: classForm.name.trim(),
            arm: classForm.arm.trim() || undefined,
            capacity: Number(classForm.capacity),
            displayOrder: Number(classForm.displayOrder),
            isActive: classForm.isActive,
          };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || "Failed to save class.");
      }

      setFormSuccess(editingClass ? "Class updated successfully." : "Class created successfully.");
      setTimeout(() => {
        setShowClassModal(false);
        fetchInitialData();
      }, 800);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to save class.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (c: ClassItem) => {
    try {
      const res = await fetch(`/api/admin/classes/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !c.isActive }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to update class status.");
      }
      fetchInitialData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to update class status.");
    }
  };

  const handleViewStudents = async (c: ClassItem) => {
    setViewingClassStudents(c);
    setLoadingStudents(true);
    try {
      const res = await fetch(`/api/admin/classes/${c.id}`);
      if (!res.ok) throw new Error("Failed to load class roster.");
      const data = await res.json();
      setStudentsList(Array.isArray(data.enrollments) ? data.enrollments : []);
    } catch {
      setStudentsList([]);
    } finally {
      setLoadingStudents(false);
    }
  };

  const handleOpenAssignTeacher = (c: ClassItem) => {
    setAssigningClass(c);
    setSelectedTeacherId(teachers[0]?.id || "");
    setIsFormTeacher(true);
    setAssignError(null);
    setAssignSuccess(null);
  };

  const handleAssignTeacherSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigningClass) return;
    setAssignSubmitting(true);
    setAssignError(null);
    setAssignSuccess(null);

    try {
      const res = await fetch(`/api/admin/classes/${assigningClass.id}/assign-teacher`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teacherId: selectedTeacherId,
          isClassTeacher: isFormTeacher,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || "Failed to assign teacher.");
      }

      setAssignSuccess("Teacher assigned to class successfully.");
      setTimeout(() => {
        setAssigningClass(null);
        fetchInitialData();
      }, 800);
    } catch (err: unknown) {
      setAssignError(err instanceof Error ? err.message : "Failed to assign teacher.");
    } finally {
      setAssignSubmitting(false);
    }
  };

  const filtered = classes.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.code.toLowerCase().includes(search.toLowerCase()) ||
      (c.arm && c.arm.toLowerCase().includes(search.toLowerCase()));

    if (!matchesSearch) return false;
    if (selectedProgramme !== "ALL" && c.programmeId !== selectedProgramme) return false;
    if (statusFilter === "ACTIVE") return c.isActive;
    if (statusFilter === "INACTIVE") return !c.isActive;
    return true;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Class Management"
        subtitle="Manage school classes, pupil capacities, arms, and teacher assignments."
        actions={
          <Button variant="primary" onClick={handleOpenCreate}>
            + Add Class
          </Button>
        }
      />

      {/* Filter and Search Bar */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
            <div className="flex-1 max-w-md">
              <Input
                placeholder="Search classes by name, arm, or code..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Programme Filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-stone-500">Programme:</span>
                <select
                  className="h-9 px-3 rounded-lg border border-stone-200 bg-white text-xs font-medium text-stone-800 focus:outline-none focus:ring-2 focus:ring-[#800020]"
                  value={selectedProgramme}
                  onChange={(e) => setSelectedProgramme(e.target.value)}
                >
                  <option value="ALL">All Programmes</option>
                  {programmes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status Filter */}
              <div className="inline-flex rounded-lg border border-stone-200 bg-stone-50 p-0.5">
                {(["ALL", "ACTIVE", "INACTIVE"] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      statusFilter === st
                        ? "bg-white text-stone-900 shadow-xs"
                        : "text-stone-500 hover:text-stone-800"
                    }`}
                  >
                    {st === "ALL" ? "All" : st === "ACTIVE" ? "Active" : "Inactive"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content Area */}
      {loading ? (
        <LoadingState message="Loading classes roster..." />
      ) : error ? (
        <ErrorState title="Error Loading Classes" message={error} onRetry={fetchInitialData} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No classes found"
          description={
            search || selectedProgramme !== "ALL" || statusFilter !== "ALL"
              ? "No classes match your current filter settings."
              : "No classes created yet."
          }
          actions={
            search || selectedProgramme !== "ALL" || statusFilter !== "ALL" ? (
              <Button
                variant="outline"
                onClick={() => {
                  setSearch("");
                  setSelectedProgramme("ALL");
                  setStatusFilter("ALL");
                }}
              >
                Clear Filters
              </Button>
            ) : (
              <Button variant="primary" onClick={handleOpenCreate}>
                Create First Class
              </Button>
            )
          }
        />
      ) : (
        <TableWrapper>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Class Name</TableHeaderCell>
                <TableHeaderCell>Code</TableHeaderCell>
                <TableHeaderCell>Programme</TableHeaderCell>
                <TableHeaderCell>Students / Capacity</TableHeaderCell>
                <TableHeaderCell>Teachers Assigned</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell className="text-right">Actions</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((c) => {
                const studentCount = c._count?.enrollments || 0;
                const formTeacher = c.teacherScopes?.find((ts) => ts.isClassTeacher);
                const otherTeachers = c.teacherScopes?.filter((ts) => !ts.isClassTeacher) || [];

                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div>
                        <p className="font-semibold text-stone-900">
                          {c.name} {c.arm ? `(${c.arm})` : ""}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs font-bold text-stone-700 bg-stone-100 px-2 py-0.5 rounded">
                        {c.code}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs font-medium text-stone-700">
                        {c.programme?.name || "N/A"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-stone-900">{studentCount}</span>
                        <span className="text-xs text-stone-400">/ {c.capacity}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5 text-[11px] text-[#800020] hover:bg-[#FDF2F4]"
                          onClick={() => handleViewStudents(c)}
                        >
                          View Roster
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs space-y-0.5">
                        {formTeacher ? (
                          <p className="font-medium text-stone-900">
                            ⭐ {formTeacher.teacher.firstName} {formTeacher.teacher.lastName}{" "}
                            <span className="text-[10px] text-amber-700">(Form)</span>
                          </p>
                        ) : (
                          <p className="text-stone-400 italic">No Form Teacher</p>
                        )}
                        {otherTeachers.length > 0 && (
                          <p className="text-[11px] text-stone-500">
                            +{otherTeachers.length} Subject Teacher(s)
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.isActive ? "success" : "neutral"}>
                        {c.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenAssignTeacher(c)}
                          title="Assign Teacher to Class"
                        >
                          Assign
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenEdit(c)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant={c.isActive ? "outline" : "primary"}
                          size="sm"
                          onClick={() => handleToggleStatus(c)}
                        >
                          {c.isActive ? "Deactivate" : "Activate"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {/* Mobile view */}
          <div className="lg:hidden space-y-3 p-3">
            {filtered.map((c) => (
              <TableMobileCard
                key={c.id}
                title={`${c.name} ${c.arm ? `(${c.arm})` : ""}`}
                subtitle={`${c.code} • ${c.programme?.name}`}
                badge={
                  <Badge variant={c.isActive ? "success" : "neutral"}>
                    {c.isActive ? "Active" : "Inactive"}
                  </Badge>
                }
                fields={[
                  { label: "Enrolled Pupils", value: `${c._count?.enrollments || 0} / ${c.capacity}` },
                  {
                    label: "Form Teacher",
                    value: c.teacherScopes?.[0]?.teacher
                      ? `${c.teacherScopes[0].teacher.firstName} ${c.teacherScopes[0].teacher.lastName}`
                      : "Unassigned",
                  },
                ]}
                actions={
                  <div className="grid grid-cols-2 gap-2 w-full pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 min-h-[44px]"
                      onClick={() => handleViewStudents(c)}
                    >
                      Roster ({c._count?.enrollments || 0})
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 min-h-[44px]"
                      onClick={() => handleOpenAssignTeacher(c)}
                    >
                      Teacher
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 min-h-[44px]"
                      onClick={() => handleOpenEdit(c)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant={c.isActive ? "outline" : "primary"}
                      size="sm"
                      className="flex-1 min-h-[44px]"
                      onClick={() => handleToggleStatus(c)}
                    >
                      {c.isActive ? "Deactivate" : "Activate"}
                    </Button>
                  </div>
                }
              />
            ))}
          </div>
        </TableWrapper>
      )}

      {/* Modal: Create / Edit Class */}
      <Modal
        isOpen={showClassModal}
        onClose={() => setShowClassModal(false)}
        title={editingClass ? "Edit Class" : "Add Class"}
      >
        <form onSubmit={handleSaveClass} className="space-y-4">
          {formError && <Alert variant="error">{formError}</Alert>}
          {formSuccess && <Alert variant="success">{formSuccess}</Alert>}

          {!editingClass && (
            <FormGroup label="Programme" required>
              <select
                className="w-full h-11 px-3 rounded-lg border border-stone-300 bg-white text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#800020]"
                value={classForm.programmeId}
                onChange={(e) => setClassForm({ ...classForm, programmeId: e.target.value })}
                required
              >
                <option value="" disabled>Select Programme</option>
                {programmes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </select>
            </FormGroup>
          )}

          {!editingClass && (
            <FormGroup label="Class Code (Uppercase alphanumeric, e.g. PRI_1)" required>
              <Input
                placeholder="PRI_1, NUR_1, TAH_A"
                value={classForm.code}
                onChange={(e) => setClassForm({ ...classForm, code: e.target.value.toUpperCase() })}
                required
              />
            </FormGroup>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormGroup label="Class Name" required>
              <Input
                placeholder="e.g. Primary 1"
                value={classForm.name}
                onChange={(e) => setClassForm({ ...classForm, name: e.target.value })}
                required
              />
            </FormGroup>

            <FormGroup label="Arm / Stream (Optional)">
              <Input
                placeholder="e.g. A, Gold, Alpha"
                value={classForm.arm}
                onChange={(e) => setClassForm({ ...classForm, arm: e.target.value })}
              />
            </FormGroup>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormGroup label="Maximum Capacity" required>
              <Input
                type="number"
                min="1"
                value={classForm.capacity}
                onChange={(e) => setClassForm({ ...classForm, capacity: parseInt(e.target.value, 10) || 30 })}
                required
              />
            </FormGroup>

            <FormGroup label="Display Order">
              <Input
                type="number"
                value={classForm.displayOrder}
                onChange={(e) => setClassForm({ ...classForm, displayOrder: parseInt(e.target.value, 10) || 0 })}
              />
            </FormGroup>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="isActiveClass"
              checked={classForm.isActive}
              onChange={(e) => setClassForm({ ...classForm, isActive: e.target.checked })}
              className="w-4 h-4 text-[#800020] rounded border-stone-300 focus:ring-[#800020]"
            />
            <label htmlFor="isActiveClass" className="text-sm font-medium text-stone-700">
              Active Class
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-stone-200">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowClassModal(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? "Saving..." : editingClass ? "Update Class" : "Create Class"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: View Class Roster */}
      <Modal
        isOpen={Boolean(viewingClassStudents)}
        onClose={() => setViewingClassStudents(null)}
        title={viewingClassStudents ? `Class Roster: ${viewingClassStudents.name}` : "Class Roster"}
      >
        <div className="space-y-4">
          {loadingStudents ? (
            <LoadingState message="Loading pupils in class..." />
          ) : studentsList.length === 0 ? (
            <div className="py-8 text-center text-stone-500">
              <p className="font-semibold text-stone-700">No students registered yet in this class.</p>
              <p className="text-xs text-stone-400 mt-1">
                Pupils can be enrolled from the Students section.
              </p>
            </div>
          ) : (
            <div className="max-h-[360px] overflow-y-auto divide-y divide-stone-100">
              {studentsList.map((item, idx) => (
                <div key={item.id} className="py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-stone-400 w-6 text-right">
                      {idx + 1}.
                    </span>
                    <div>
                      <p className="font-medium text-stone-900 text-sm">
                        {item.student.lastName}, {item.student.firstName} {item.student.otherNames || ""}
                      </p>
                      <p className="font-mono text-xs text-stone-500">
                        {item.student.admissionNumber} &bull; {item.student.gender}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end pt-3 border-t border-stone-200">
            <Button variant="outline" onClick={() => setViewingClassStudents(null)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Assign Teacher */}
      <Modal
        isOpen={Boolean(assigningClass)}
        onClose={() => setAssigningClass(null)}
        title={assigningClass ? `Assign Teacher to ${assigningClass.name}` : "Assign Teacher"}
      >
        <form onSubmit={handleAssignTeacherSubmit} className="space-y-4">
          {assignError && <Alert variant="error">{assignError}</Alert>}
          {assignSuccess && <Alert variant="success">{assignSuccess}</Alert>}

          <FormGroup label="Select Teacher" required>
            {teachers.length === 0 ? (
              <p className="text-xs text-stone-500">No teachers registered yet.</p>
            ) : (
              <select
                className="w-full h-11 px-3 rounded-lg border border-stone-300 bg-white text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#800020]"
                value={selectedTeacherId}
                onChange={(e) => setSelectedTeacherId(e.target.value)}
                required
              >
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.firstName} {t.lastName} ({t.staffId})
                  </option>
                ))}
              </select>
            )}
          </FormGroup>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="isFormTeacherCheck"
              checked={isFormTeacher}
              onChange={(e) => setIsFormTeacher(e.target.checked)}
              className="w-4 h-4 text-[#800020] rounded border-stone-300 focus:ring-[#800020]"
            />
            <label htmlFor="isFormTeacherCheck" className="text-sm font-medium text-stone-700">
              Form Teacher (Class-Wide Operational Authority)
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-stone-200">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAssigningClass(null)}
              disabled={assignSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={assignSubmitting || teachers.length === 0}
            >
              {assignSubmitting ? "Assigning..." : "Confirm Assignment"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

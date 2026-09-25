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
  teacher: {
    firstName: string;
    lastName: string;
    staffId: string;
  };
  schoolClass?: {
    name: string;
  } | null;
}

interface SubjectItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  displayOrder: number;
  isActive: boolean;
  programmeId: string;
  programme: Programme;
  teacherScopes?: TeacherScopeItem[];
}

export default function AdminSubjectsPage() {
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [selectedProgramme, setSelectedProgramme] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");

  // Create / Edit Modal
  const [showModal, setShowModal] = useState(false);
  const [editingSubject, setEditingSubject] = useState<SubjectItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    programmeId: "",
    code: "",
    name: "",
    description: "",
    displayOrder: 0,
    isActive: true,
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [subjectsRes, progsRes] = await Promise.all([
        fetch("/api/admin/subjects?includeInactive=true"),
        fetch("/api/admin/programmes?includeInactive=true"),
      ]);

      if (!subjectsRes.ok) throw new Error("Failed to load subjects.");
      const subsData = await subjectsRes.json();
      setSubjects(Array.isArray(subsData.items) ? subsData.items : []);

      if (progsRes.ok) {
        const progsData = await progsRes.json();
        setProgrammes(Array.isArray(progsData.items) ? progsData.items : []);
      }

      setLoading(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load subjects.");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleOpenCreate = () => {
    setEditingSubject(null);
    setFormData({
      programmeId: programmes[0]?.id || "",
      code: "",
      name: "",
      description: "",
      displayOrder: subjects.length + 1,
      isActive: true,
    });
    setFormError(null);
    setFormSuccess(null);
    setShowModal(true);
  };

  const handleOpenEdit = (s: SubjectItem) => {
    setEditingSubject(s);
    setFormData({
      programmeId: s.programmeId,
      code: s.code,
      name: s.name,
      description: s.description || "",
      displayOrder: s.displayOrder,
      isActive: s.isActive,
    });
    setFormError(null);
    setFormSuccess(null);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setFormSuccess(null);

    try {
      const url = editingSubject
        ? `/api/admin/subjects/${editingSubject.id}`
        : "/api/admin/subjects";
      const method = editingSubject ? "PATCH" : "POST";

      const payload = editingSubject
        ? {
            name: formData.name.trim(),
            description: formData.description.trim() || undefined,
            displayOrder: Number(formData.displayOrder),
            isActive: formData.isActive,
          }
        : {
            programmeId: formData.programmeId,
            code: formData.code.trim().toUpperCase(),
            name: formData.name.trim(),
            description: formData.description.trim() || undefined,
            displayOrder: Number(formData.displayOrder),
            isActive: formData.isActive,
          };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || "Failed to save subject.");
      }

      setFormSuccess(editingSubject ? "Subject updated successfully." : "Subject created successfully.");
      setTimeout(() => {
        setShowModal(false);
        fetchData();
      }, 800);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to save subject.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (s: SubjectItem) => {
    try {
      const res = await fetch(`/api/admin/subjects/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !s.isActive }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to update subject status.");
      }
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to update subject status.");
    }
  };

  const filtered = subjects.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.code.toLowerCase().includes(search.toLowerCase()) ||
      (s.description && s.description.toLowerCase().includes(search.toLowerCase()));

    if (!matchesSearch) return false;
    if (selectedProgramme !== "ALL" && s.programmeId !== selectedProgramme) return false;
    if (statusFilter === "ACTIVE") return s.isActive;
    if (statusFilter === "INACTIVE") return !s.isActive;
    return true;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subject Management"
        subtitle="Manage academic curriculum subjects and assign them to programmes."
        actions={
          <Button variant="primary" onClick={handleOpenCreate}>
            + Add Subject
          </Button>
        }
      />

      {/* Filter and Search Bar */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
            <div className="flex-1 max-w-md">
              <Input
                placeholder="Search subjects by name, code, or description..."
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
        <LoadingState message="Loading subjects catalogue..." />
      ) : error ? (
        <ErrorState title="Error Loading Subjects" message={error} onRetry={fetchData} />
      ) : subjects.length === 0 ? (
        <EmptyState
          title="No subjects have been created yet."
          description="Start by creating academic curriculum subjects and assigning them to programmes."
          actions={
            <Button variant="primary" onClick={handleOpenCreate}>
              + Add Subject
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No matching subjects"
          description="No subjects match your current filter settings."
          actions={
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
          }
        />
      ) : (
        <TableWrapper>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Subject</TableHeaderCell>
                <TableHeaderCell>Code</TableHeaderCell>
                <TableHeaderCell>Programme</TableHeaderCell>
                <TableHeaderCell>Instructors</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell className="text-right">Actions</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((s) => {
                const teachersCount = s.teacherScopes ? s.teacherScopes.length : 0;
                return (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div>
                        <p className="font-semibold text-stone-900">{s.name}</p>
                        {s.description && (
                          <p className="text-xs text-stone-500 line-clamp-1">{s.description}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs font-bold text-stone-700 bg-stone-100 px-2 py-0.5 rounded">
                        {s.code}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs font-medium text-stone-700">
                        {s.programme?.name || "N/A"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-stone-600">
                        {teachersCount > 0
                          ? `${teachersCount} Teacher(s) assigned`
                          : "No teachers assigned yet"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={s.isActive ? "success" : "neutral"}>
                        {s.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenEdit(s)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant={s.isActive ? "outline" : "primary"}
                          size="sm"
                          onClick={() => handleToggleStatus(s)}
                        >
                          {s.isActive ? "Deactivate" : "Activate"}
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
            {filtered.map((s) => (
              <TableMobileCard
                key={s.id}
                title={s.name}
                subtitle={`${s.code} • ${s.programme?.name || "General"}`}
                badge={
                  <Badge variant={s.isActive ? "success" : "neutral"}>
                    {s.isActive ? "Active" : "Inactive"}
                  </Badge>
                }
                fields={[
                  { label: "Programme", value: s.programme?.name || "General" },
                  { label: "Assigned Teachers", value: `${s.teacherScopes?.length || 0} teachers` },
                  { label: "Description", value: s.description || "—" },
                ]}
                actions={
                  <div className="flex gap-2 w-full pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 min-h-[44px]"
                      onClick={() => handleOpenEdit(s)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant={s.isActive ? "outline" : "primary"}
                      size="sm"
                      className="flex-1 min-h-[44px]"
                      onClick={() => handleToggleStatus(s)}
                    >
                      {s.isActive ? "Deactivate" : "Activate"}
                    </Button>
                  </div>
                }
              />
            ))}
          </div>
        </TableWrapper>
      )}

      {/* Modal: Create / Edit Subject */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingSubject ? "Edit Subject" : "Add Subject"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && <Alert variant="error">{formError}</Alert>}
          {formSuccess && <Alert variant="success">{formSuccess}</Alert>}

          {!editingSubject && (
            <FormGroup label="Programme" required>
              <select
                className="w-full h-11 px-3 rounded-lg border border-stone-300 bg-white text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#800020]"
                value={formData.programmeId}
                onChange={(e) => setFormData({ ...formData, programmeId: e.target.value })}
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

          {!editingSubject && (
            <FormGroup label="Subject Code (Uppercase alphanumeric, e.g. MATH, ENG)" required>
              <Input
                placeholder="MATH, ENG, QURAN, BASIC_SCI"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                required
              />
            </FormGroup>
          )}

          <FormGroup label="Subject Name" required>
            <Input
              placeholder="e.g. Mathematics, English Language, Islamic Studies"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </FormGroup>

          <FormGroup label="Description">
            <textarea
              className="w-full min-h-[80px] p-3 rounded-lg border border-stone-300 bg-white text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#800020]"
              placeholder="Curriculum outline or subject overview..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </FormGroup>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormGroup label="Display Order">
              <Input
                type="number"
                value={formData.displayOrder}
                onChange={(e) => setFormData({ ...formData, displayOrder: parseInt(e.target.value, 10) || 0 })}
              />
            </FormGroup>

            <div className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                id="isActiveSubject"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                className="w-4 h-4 text-[#800020] rounded border-stone-300 focus:ring-[#800020]"
              />
              <label htmlFor="isActiveSubject" className="text-sm font-medium text-stone-700">
                Active Subject
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-stone-200">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowModal(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? "Saving..." : editingSubject ? "Update Subject" : "Create Subject"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

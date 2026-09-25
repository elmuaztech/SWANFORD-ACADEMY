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

interface ProgrammeItem {
  id: string;
  code: string;
  name: string;
  isMainAcademic: boolean;
  isActive: boolean;
  description: string | null;
  displayOrder: number;
  classes?: Array<{ id: string; name: string }>;
  subjects?: Array<{ id: string; name: string }>;
}

export default function AdminProgrammesPage() {
  const [programmes, setProgrammes] = useState<ProgrammeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");

  // Modal State for Create / Edit
  const [showModal, setShowModal] = useState(false);
  const [editingProg, setEditingProg] = useState<ProgrammeItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    code: "",
    name: "",
    description: "",
    isMainAcademic: true,
    displayOrder: 0,
    isActive: true,
  });

  const fetchProgrammes = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/admin/programmes?includeInactive=true")
      .then(async (res) => {
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Failed to load programmes.");
        }
        return res.json();
      })
      .then((json) => {
        const list = Array.isArray(json.items) ? json.items : Array.isArray(json) ? json : [];
        setProgrammes(list);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load programmes.");
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchProgrammes();
  }, [fetchProgrammes]);

  const handleOpenCreate = () => {
    setEditingProg(null);
    setFormData({
      code: "",
      name: "",
      description: "",
      isMainAcademic: true,
      displayOrder: programmes.length + 1,
      isActive: true,
    });
    setFormError(null);
    setFormSuccess(null);
    setShowModal(true);
  };

  const handleOpenEdit = (p: ProgrammeItem) => {
    setEditingProg(p);
    setFormData({
      code: p.code,
      name: p.name,
      description: p.description || "",
      isMainAcademic: p.isMainAcademic,
      displayOrder: p.displayOrder,
      isActive: p.isActive,
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
      const url = editingProg
        ? `/api/admin/programmes/${editingProg.id}`
        : "/api/admin/programmes";
      const method = editingProg ? "PATCH" : "POST";

      const payload = editingProg
        ? {
            name: formData.name.trim(),
            description: formData.description.trim() || undefined,
            displayOrder: Number(formData.displayOrder),
            isActive: formData.isActive,
          }
        : {
            code: formData.code,
            name: formData.name.trim(),
            description: formData.description.trim() || undefined,
            isMainAcademic: formData.isMainAcademic,
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
        throw new Error(json.error || "Failed to save programme.");
      }

      setFormSuccess(editingProg ? "Programme updated successfully." : "Programme created successfully.");
      setTimeout(() => {
        setShowModal(false);
        fetchProgrammes();
      }, 800);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to save programme.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (p: ProgrammeItem) => {
    try {
      const res = await fetch(`/api/admin/programmes/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !p.isActive }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to update status.");
      }
      fetchProgrammes();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to update programme status.");
    }
  };

  const filtered = programmes.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.code.toLowerCase().includes(search.toLowerCase()) ||
      (p.description && p.description.toLowerCase().includes(search.toLowerCase()));

    if (!matchesSearch) return false;
    if (statusFilter === "ACTIVE") return p.isActive;
    if (statusFilter === "INACTIVE") return !p.isActive;
    return true;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Academic Programmes"
        subtitle="Manage the school's active divisions, curricular tracks, and programmes."
        actions={
          <Button variant="primary" onClick={handleOpenCreate}>
            + Add Programme
          </Button>
        }
      />

      {/* Filter and Search Bar */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="flex-1 max-w-md">
              <Input
                placeholder="Search programmes by name or code..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-stone-500">Status:</span>
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
        <LoadingState message="Loading academic programmes..." />
      ) : error ? (
        <ErrorState title="Error Loading Programmes" message={error} onRetry={fetchProgrammes} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={programmes.length === 0 ? "No programmes have been created yet." : "No programmes found"}
          description={
            search || statusFilter !== "ALL"
              ? "No programmes match your current search or filter criteria."
              : "No programmes have been created yet. Click below to add an academic or specialized programme."
          }
          actions={
            search || statusFilter !== "ALL" ? (
              <Button
                variant="outline"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("ALL");
                }}
              >
                Clear Filters
              </Button>
            ) : (
              <Button variant="primary" onClick={handleOpenCreate}>
                Create First Programme
              </Button>
            )
          }
        />
      ) : (
        <TableWrapper>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Programme</TableHeaderCell>
                <TableHeaderCell>Code</TableHeaderCell>
                <TableHeaderCell>Curricular Type</TableHeaderCell>
                <TableHeaderCell>Classes</TableHeaderCell>
                <TableHeaderCell>Subjects</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell className="text-right">Actions</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div>
                      <p className="font-semibold text-stone-900">{p.name}</p>
                      {p.description && (
                        <p className="text-xs text-stone-500 line-clamp-1">{p.description}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs font-bold text-stone-700 bg-stone-100 px-2 py-0.5 rounded">
                      {p.code}
                    </span>
                  </TableCell>
                  <TableCell>
                    {p.isMainAcademic ? (
                      <span className="text-xs text-stone-600">Main Academic</span>
                    ) : (
                      <span className="text-xs text-amber-700 font-medium">Specialized / Quranic</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs font-medium text-stone-700">
                      {p.classes ? p.classes.length : 0} classes
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs font-medium text-stone-700">
                      {p.subjects ? p.subjects.length : 0} subjects
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.isActive ? "success" : "neutral"}>
                      {p.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenEdit(p)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant={p.isActive ? "outline" : "primary"}
                        size="sm"
                        onClick={() => handleToggleStatus(p)}
                      >
                        {p.isActive ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Mobile view */}
          <div className="lg:hidden space-y-3 p-3">
            {filtered.map((p) => (
              <TableMobileCard
                key={p.id}
                title={p.name}
                subtitle={p.code}
                badge={
                  <Badge variant={p.isActive ? "success" : "neutral"}>
                    {p.isActive ? "Active" : "Inactive"}
                  </Badge>
                }
                fields={[
                  { label: "Classes", value: `${p.classes?.length || 0} classes` },
                  { label: "Subjects", value: `${p.subjects?.length || 0} subjects` },
                  { label: "Type", value: p.isMainAcademic ? "Main Academic" : "Specialized" },
                  { label: "Description", value: p.description || "—" },
                ]}
                actions={
                  <div className="flex gap-2 w-full pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 min-h-[44px]"
                      onClick={() => handleOpenEdit(p)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant={p.isActive ? "outline" : "primary"}
                      size="sm"
                      className="flex-1 min-h-[44px]"
                      onClick={() => handleToggleStatus(p)}
                    >
                      {p.isActive ? "Deactivate" : "Activate"}
                    </Button>
                  </div>
                }
              />
            ))}
          </div>
        </TableWrapper>
      )}

      {/* Create / Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingProg ? "Edit Programme" : "Add Programme"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && <Alert variant="error">{formError}</Alert>}
          {formSuccess && <Alert variant="success">{formSuccess}</Alert>}

          {!editingProg && (
            <FormGroup
              label="Programme Code"
              required
              helperText="Unique uppercase identifier (e.g. NURSERY, PRIMARY, TAHFEEZ, SECONDARY, ISLAMIC)"
            >
              <Input
                placeholder="e.g. NURSERY, SECONDARY, TAHFEEZ"
                value={formData.code}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""),
                  })
                }
                required
              />
            </FormGroup>
          )}

          <FormGroup label="Programme Name" required>
            <Input
              placeholder="e.g. Primary School, Tahfeez Ul-Quran"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </FormGroup>

          <FormGroup label="Description">
            <textarea
              className="w-full min-h-[80px] p-3 rounded-lg border border-stone-300 bg-white text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#800020]"
              placeholder="Brief description of the programme..."
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

            {!editingProg && (
              <div className="flex items-center gap-2 pt-6">
                <input
                  type="checkbox"
                  id="isMainAcademic"
                  checked={formData.isMainAcademic}
                  onChange={(e) => setFormData({ ...formData, isMainAcademic: e.target.checked })}
                  className="w-4 h-4 text-[#800020] rounded border-stone-300 focus:ring-[#800020]"
                />
                <label htmlFor="isMainAcademic" className="text-sm font-medium text-stone-700">
                  Main Academic Track
                </label>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="isActive"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              className="w-4 h-4 text-[#800020] rounded border-stone-300 focus:ring-[#800020]"
            />
            <label htmlFor="isActive" className="text-sm font-medium text-stone-700">
              Active Programme
            </label>
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
              {submitting ? "Saving..." : editingProg ? "Update Programme" : "Create Programme"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

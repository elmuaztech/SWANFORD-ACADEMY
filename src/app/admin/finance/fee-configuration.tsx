"use client";

import React, { useState, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Button,
  Modal,
  LoadingState,
  EmptyState,
  Table,
  TableHead,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
  TableWrapper,
  TableMobileCard,
  Input,
  Select,
  FormGroup,
  Alert,
} from "@/components";
import { formatNaira } from "@/lib/money";

interface FeeItemData {
  id?: string;
  name: string;
  amountNaira: number;
}

export interface FeeStructureData {
  id: string;
  name: string;
  sessionId: string;
  sessionName: string;
  termId: string;
  termName: string;
  programmeId: string;
  programmeName: string;
  programmeCode: string;
  schoolClassId: string | null;
  className: string;
  applicableGender: "ALL" | "MALE" | "FEMALE";
  isAdmissionFee: boolean;
  isActive: boolean;
  totalAmountKobo: string;
  totalAmountNaira: number;
  items: FeeItemData[];
  createdAt: string;
}

interface SessionOption {
  id: string;
  name: string;
  isCurrent: boolean;
  terms?: Array<{ id: string; name: string; termCode: string; isCurrent: boolean }>;
}

interface ProgrammeOption {
  id: string;
  name: string;
  code: string;
}

interface ClassOption {
  id: string;
  name: string;
  programmeId: string;
}

export function FeeConfigurationSection() {
  const [loading, setLoading] = useState(true);
  const [feeStructures, setFeeStructures] = useState<FeeStructureData[]>([]);
  const [formFeeNaira, setFormFeeNaira] = useState<number>(5000);
  const [newFormFeeInput, setNewFormFeeInput] = useState<string>("5000");
  const [isUpdatingFormFee, setIsUpdatingFormFee] = useState(false);
  const [formFeeFeedback, setFormFeeFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProgrammeFilter, setSelectedProgrammeFilter] = useState("ALL");

  // Options for modal
  const [sessions, setSessions] = useState<SessionOption[]>([]);
  const [programmes, setProgrammes] = useState<ProgrammeOption[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalFeedback, setModalFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    academicSessionId: "",
    academicTermId: "",
    programmeId: "ALL",
    schoolClassId: "",
    applicableGender: "ALL" as "ALL" | "MALE" | "FEMALE",
    isAdmissionFee: false,
    items: [
      { name: "Tuition / School Fee", amountNaira: 50000 },
      { name: "Books & Stationery", amountNaira: 15000 },
    ] as FeeItemData[],
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [fsRes, sRes, pRes, cRes] = await Promise.all([
        fetch("/api/admin/finance/fee-structures"),
        fetch("/api/admin/academic/sessions"),
        fetch("/api/admin/programmes"),
        fetch("/api/admin/classes"),
      ]);

      if (fsRes.ok) {
        const fsData = await fsRes.json();
        setFeeStructures(fsData.feeStructures || []);
        if (fsData.formFeeNaira !== undefined) {
          setFormFeeNaira(fsData.formFeeNaira);
          setNewFormFeeInput(fsData.formFeeNaira.toString());
        }
      }

      if (sRes.ok) {
        const sData = await sRes.json();
        const sessList = Array.isArray(sData) ? sData : sData.sessions || [];
        setSessions(sessList);
        if (sessList.length > 0 && !formData.academicSessionId) {
          const currentSess = sessList.find((s: SessionOption) => s.isCurrent) || sessList[0];
          setFormData((prev) => ({
            ...prev,
            academicSessionId: currentSess.id,
            academicTermId: currentSess.terms?.[0]?.id || "",
          }));
        }
      }

      if (pRes.ok) {
        const pData = await pRes.json();
        setProgrammes(Array.isArray(pData) ? pData : pData.programmes || []);
      }

      if (cRes.ok) {
        const cData = await cRes.json();
        setClasses(Array.isArray(cData) ? cData : cData.classes || []);
      }
    } catch {
      // Quiet fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Update Form Fee
  const handleUpdateFormFee = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormFeeFeedback(null);
    const parsed = parseFloat(newFormFeeInput);
    if (isNaN(parsed) || parsed <= 0) {
      setFormFeeFeedback({ type: "error", message: "Please enter a valid amount greater than zero." });
      return;
    }

    setIsUpdatingFormFee(true);
    try {
      const res = await fetch("/api/admin/finance/form-fee", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formFeeNaira: parsed }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update form fee.");
      }
      setFormFeeNaira(parsed);
      setFormFeeFeedback({ type: "success", message: `Application form fee updated to ₦${parsed.toLocaleString()} successfully!` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update application form fee.";
      setFormFeeFeedback({ type: "error", message: msg });
    } finally {
      setIsUpdatingFormFee(false);
    }
  };

  const handleOpenCreateModal = () => {
    setEditingId(null);
    setModalFeedback(null);
    const activeSess = sessions.find((s) => s.isCurrent) || sessions[0];
    setFormData({
      name: "",
      academicSessionId: activeSess?.id || "",
      academicTermId: activeSess?.terms?.[0]?.id || "",
      programmeId: "ALL",
      schoolClassId: "",
      applicableGender: "ALL",
      isAdmissionFee: false,
      items: [
        { name: "Tuition / School Fee", amountNaira: 50000 },
        { name: "Books & Stationery", amountNaira: 15000 },
      ],
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (fs: FeeStructureData) => {
    setEditingId(fs.id);
    setModalFeedback(null);
    setFormData({
      name: fs.name,
      academicSessionId: fs.sessionId,
      academicTermId: fs.termId,
      programmeId: fs.programmeId,
      schoolClassId: fs.schoolClassId || "",
      applicableGender: fs.applicableGender,
      isAdmissionFee: fs.isAdmissionFee,
      items: fs.items.map((i) => ({ name: i.name, amountNaira: i.amountNaira })),
    });
    setIsModalOpen(true);
  };

  const handleAddItem = (name = "New Fee Item", amount = 10000) => {
    setFormData((prev) => ({
      ...prev,
      items: [...prev.items, { name, amountNaira: amount }],
    }));
  };

  const handleRemoveItem = (index: number) => {
    if (formData.items.length <= 1) return;
    setFormData((prev) => ({
      ...prev,
      items: prev.items.filter((_, idx) => idx !== index),
    }));
  };

  const handleItemChange = (index: number, field: "name" | "amountNaira", val: string | number) => {
    setFormData((prev) => {
      const updated = [...prev.items];
      if (field === "name") {
        updated[index].name = val as string;
      } else {
        updated[index].amountNaira = Number(val) || 0;
      }
      return { ...prev, items: updated };
    });
  };

  const calculateTotal = () => {
    return formData.items.reduce((sum, item) => sum + (Number(item.amountNaira) || 0), 0);
  };

  const handleSubmitFeeStructure = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalFeedback(null);

    if (!formData.name.trim()) {
      setModalFeedback({ type: "error", message: "Fee structure name is required." });
      return;
    }
    if (!formData.academicSessionId) {
      setModalFeedback({ type: "error", message: "Academic session is required." });
      return;
    }
    if (!formData.academicTermId) {
      setModalFeedback({ type: "error", message: "Academic term is required." });
      return;
    }
    if (formData.items.length === 0) {
      setModalFeedback({ type: "error", message: "At least one fee item is required." });
      return;
    }

    setIsSubmitting(true);
    try {
      const url = editingId
        ? `/api/admin/finance/fee-structures/${editingId}`
        : "/api/admin/finance/fee-structures";
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save fee structure.");
      }

      setIsModalOpen(false);
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save fee structure.";
      setModalFeedback({ type: "error", message: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteFeeStructure = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete or deactivate '${name}'?`)) return;

    try {
      const res = await fetch(`/api/admin/finance/fee-structures/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete fee structure.");
      }
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error deleting fee structure.");
    }
  };

  // Selected session terms
  const currentSessionTerms =
    sessions.find((s) => s.id === formData.academicSessionId)?.terms || [];

  // Filtered classes by selected programme
  const availableClasses = formData.programmeId === "ALL"
    ? classes
    : classes.filter((c) => c.programmeId === formData.programmeId);

  // Filtered list
  const filteredStructures = feeStructures.filter((fs) => {
    const matchesSearch =
      fs.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      fs.programmeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      fs.className.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesProgramme =
      selectedProgrammeFilter === "ALL" || fs.programmeId === selectedProgrammeFilter;
    return matchesSearch && matchesProgramme;
  });

  if (loading) {
    return <LoadingState message="Loading fee structures and rates..." />;
  }

  return (
    <div className="space-y-6">
      {/* 1. APPLICATION FORM FEE SECTION */}
      <Card className="bg-white border-[#EADBDA] shadow-xs">
        <div className="bg-[#6B0B1A] text-white px-5 py-3 rounded-t-xl flex items-center justify-between">
          <div>
            <h2 className="text-sm font-extrabold uppercase tracking-wide">
              Admission Application Form Fee
            </h2>
            <p className="text-[11px] text-rose-200">
              Official processing fee charged before prospective students access the application form
            </p>
          </div>
          <Badge variant="neutral" size="sm" className="bg-rose-900/60 text-white border-rose-700">
            System Config
          </Badge>
        </div>

        <CardContent className="p-5 sm:p-6 space-y-4">
          {formFeeFeedback && (
            <Alert variant={formFeeFeedback.type} title={formFeeFeedback.type === "success" ? "Updated" : "Notice"}>
              {formFeeFeedback.message}
            </Alert>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#FAF7F2] p-4 rounded-xl border border-[#EADBDA]">
            <div>
              <span className="text-xs text-stone-500 uppercase font-bold block">Current Form Fee</span>
              <span className="text-2xl sm:text-3xl font-black text-[#5B0612]">
                {formatNaira(formFeeNaira * 100)}
              </span>
              <span className="text-xs text-stone-500 block mt-0.5">
                Saved in PostgreSQL database. Applies to public admissions immediately.
              </span>
            </div>

            <form onSubmit={handleUpdateFormFee} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <div className="w-full sm:w-44">
                <Input
                  type="number"
                  min="0"
                  step="500"
                  required
                  placeholder="e.g. 5000"
                  value={newFormFeeInput}
                  onChange={(e) => setNewFormFeeInput(e.target.value)}
                  className="font-bold text-stone-900"
                />
              </div>
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={isUpdatingFormFee}
                className="bg-[#5B0612] hover:bg-[#43040D] text-white font-bold whitespace-nowrap shadow-xs"
              >
                {isUpdatingFormFee ? "Saving..." : "Change Form Fee"}
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>

      {/* 2. SCHOOL FEES, BOOKS, UNIFORMS & FEE STRUCTURES */}
      <Card className="bg-white border-[#EADBDA] shadow-xs">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
          <div>
            <CardTitle className="text-lg font-bold text-[#5B0612]">
              Academic Fee Schedules &amp; Rates
            </CardTitle>
            <p className="text-xs text-stone-500 mt-0.5">
              Configure tuition, books, uniform, and exam levies across programmes and classes.
            </p>
          </div>
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={handleOpenCreateModal}
            className="bg-[#800020] hover:bg-[#5B0612] text-white font-bold flex items-center gap-2 shadow-xs"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <span>Create Fee Structure</span>
          </Button>
        </CardHeader>

        <CardContent className="p-4 sm:p-6 space-y-4">
          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="w-full sm:w-72">
              <Input
                placeholder="Search fee structure..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="w-full sm:w-56">
              <Select
                value={selectedProgrammeFilter}
                onChange={(e) => setSelectedProgrammeFilter(e.target.value)}
              >
                <option value="ALL">All Programmes</option>
                {programmes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {filteredStructures.length === 0 ? (
            <EmptyState
              title="No Fee Structures Configured"
              description="No fee schedules match the selected filters. Click 'Create Fee Structure' to add school fees, books fee, or tuition rates."
              actionLabel="Create Fee Structure"
              onAction={handleOpenCreateModal}
            />
          ) : (
            <TableWrapper>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Fee Structure Name</TableHeaderCell>
                    <TableHeaderCell>Programme &amp; Class</TableHeaderCell>
                    <TableHeaderCell>Session &amp; Term</TableHeaderCell>
                    <TableHeaderCell>Category</TableHeaderCell>
                    <TableHeaderCell>Total Amount</TableHeaderCell>
                    <TableHeaderCell>Breakdown</TableHeaderCell>
                    <TableHeaderCell className="text-right">Actions</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredStructures.map((fs) => (
                    <TableRow key={fs.id}>
                      <TableCell>
                        <div className="font-bold text-stone-900 text-sm">{fs.name}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {fs.isAdmissionFee && (
                            <Badge variant="brand" size="sm">Admission Intake</Badge>
                          )}
                          {!fs.isActive && (
                            <Badge variant="neutral" size="sm">Deactivated</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-semibold text-stone-800 text-xs">{fs.programmeName}</div>
                        <div className="text-[11px] text-stone-500">{fs.className}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs font-medium text-stone-800">{fs.sessionName}</div>
                        <div className="text-[11px] text-stone-500">{fs.termName}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="neutral" size="sm">
                          {fs.applicableGender === "ALL" ? "All Pupils" : fs.applicableGender === "MALE" ? "Boys Only" : "Girls Only"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="font-black text-sm text-[#5B0612]">
                          {formatNaira(Number(fs.totalAmountKobo))}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {fs.items.map((it, idx) => (
                            <span
                              key={idx}
                              className="text-[10px] bg-stone-100 text-stone-700 px-1.5 py-0.5 rounded border border-stone-200"
                            >
                              {it.name}: ₦{it.amountNaira.toLocaleString()}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenEditModal(fs)}
                            className="text-xs font-semibold"
                          >
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteFeeStructure(fs.id, fs.name)}
                            className="text-xs text-rose-700 border-rose-200 hover:bg-rose-50"
                          >
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableWrapper>
          )}
        </CardContent>
      </Card>

      {/* 3. MODAL: CREATE / EDIT FEE STRUCTURE */}
      {isModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => !isSubmitting && setIsModalOpen(false)}
          title={editingId ? "Edit Fee Structure" : "Create New Fee Structure"}
        >
          <form onSubmit={handleSubmitFeeStructure} className="space-y-4 pt-2">
            {modalFeedback && (
              <Alert variant={modalFeedback.type} title="Notice">
                {modalFeedback.message}
              </Alert>
            )}

            <FormGroup label="Fee Structure Name" required hint="e.g. Primary 1 First Term Comprehensive Fees">
              <Input
                required
                placeholder="e.g. Primary 1 First Term Fees"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </FormGroup>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormGroup label="Academic Session" required>
                <Select
                  value={formData.academicSessionId}
                  onChange={(e) => {
                    const sId = e.target.value;
                    const match = sessions.find((s) => s.id === sId);
                    setFormData((prev) => ({
                      ...prev,
                      academicSessionId: sId,
                      academicTermId: match?.terms?.[0]?.id || prev.academicTermId,
                    }));
                  }}
                >
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.isCurrent ? "(Current)" : ""}
                    </option>
                  ))}
                </Select>
              </FormGroup>

              <FormGroup label="Academic Term" required>
                <Select
                  value={formData.academicTermId}
                  onChange={(e) => setFormData({ ...formData, academicTermId: e.target.value })}
                >
                  {currentSessionTerms.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </FormGroup>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormGroup label="Programme" required hint="Choose specific programme or 'All Programmes'">
                <Select
                  value={formData.programmeId}
                  onChange={(e) => setFormData({ ...formData, programmeId: e.target.value, schoolClassId: "" })}
                >
                  <option value="ALL">All Programmes</option>
                  {programmes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </FormGroup>

              <FormGroup label="Class Level" hint="Optional - All classes if left blank">
                <Select
                  value={formData.schoolClassId}
                  onChange={(e) => setFormData({ ...formData, schoolClassId: e.target.value })}
                  disabled={formData.programmeId === "ALL"}
                >
                  <option value="">All Classes in Programme</option>
                  {availableClasses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </FormGroup>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormGroup label="Category / Gender">
                <Select
                  value={formData.applicableGender}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      applicableGender: e.target.value as "ALL" | "MALE" | "FEMALE",
                    })
                  }
                >
                  <option value="ALL">All Pupils (Co-ed)</option>
                  <option value="MALE">Boys Only</option>
                  <option value="FEMALE">Girls Only</option>
                </Select>
              </FormGroup>

              <div className="flex items-center pt-6">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-stone-800">
                  <input
                    type="checkbox"
                    checked={formData.isAdmissionFee}
                    onChange={(e) => setFormData({ ...formData, isAdmissionFee: e.target.checked })}
                    className="w-4 h-4 rounded text-[#800020]"
                  />
                  <span>Is Entrance / Admission Fee</span>
                </label>
              </div>
            </div>

            {/* DYNAMIC ITEMIZED BREAKDOWN */}
            <div className="space-y-3 pt-3 border-t border-stone-200">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold uppercase text-stone-800 block">
                    Itemized Fee Items Breakdown *
                  </span>
                  <span className="text-[11px] text-stone-500">
                    Add components (Tuition, Books, Uniform, etc.) with their respective amounts
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-stone-400 block uppercase">Total Amount</span>
                  <span className="text-sm font-black text-[#5B0612]">
                    ₦{calculateTotal().toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Quick Template Buttons */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddItem("Tuition Fee", 50000)}
                  className="text-[10px] py-1"
                >
                  + Add Tuition
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddItem("Books & Stationery", 15000)}
                  className="text-[10px] py-1"
                >
                  + Add Books
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddItem("Uniform & Sportswear", 12000)}
                  className="text-[10px] py-1"
                >
                  + Add Uniform
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddItem("ICT & Examination Levy", 8000)}
                  className="text-[10px] py-1"
                >
                  + Add ICT / Exam
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddItem("Miscellaneous / Material", 5000)}
                  className="text-[10px] py-1"
                >
                  + Custom Item
                </Button>
              </div>

              {/* Items List */}
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {formData.items.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-[#FAF7F2] p-2 rounded-lg border border-stone-200">
                    <div className="flex-1">
                      <Input
                        required
                        placeholder="Item name (e.g. Tuition)"
                        value={item.name}
                        onChange={(e) => handleItemChange(idx, "name", e.target.value)}
                        className="text-xs"
                      />
                    </div>
                    <div className="w-32">
                      <Input
                        type="number"
                        min="0"
                        step="100"
                        required
                        placeholder="₦ Amount"
                        value={item.amountNaira}
                        onChange={(e) => handleItemChange(idx, "amountNaira", e.target.value)}
                        className="text-xs font-semibold text-stone-900"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      disabled={formData.items.length <= 1}
                      className="p-1.5 text-stone-400 hover:text-rose-600 disabled:opacity-30"
                      title="Remove Item"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
              <Button
                variant="outline"
                type="button"
                onClick={() => setIsModalOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                disabled={isSubmitting}
                className="bg-[#800020] hover:bg-[#5B0612] text-white font-bold px-6"
              >
                {isSubmitting ? "Saving..." : editingId ? "Update Fee Structure" : "Save Fee Structure"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

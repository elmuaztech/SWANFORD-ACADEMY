"use client";

import React, { useState, useEffect } from "react";
import { UserCheck, Search, Plus, Trash2, CheckCircle, AlertCircle, RefreshCw, Sparkles } from "lucide-react";
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

interface StudentSpecialRate {
  id: string;
  studentId: string;
  programmeId: string;
  academicSessionId: string;
  academicTermId: string | null;
  feeStructureId: string | null;
  customAmountKobo: string | null;
  customAmountNaira: number | null;
  effectiveDate: string;
  endDate: string | null;
  notes: string | null;
  isActive: boolean;
  student: {
    id: string;
    firstName: string;
    lastName: string;
    admissionNumber: string | null;
    gender: string;
  };
  programme: {
    id: string;
    code: string;
    name: string;
  };
  academicSession: {
    id: string;
    name: string;
  };
  academicTerm: {
    id: string;
    name: string;
    termCode: string;
  } | null;
  feeStructure: {
    id: string;
    name: string;
  } | null;
  assignedByUser: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
}

interface StudentOption {
  id: string;
  firstName: string;
  lastName: string;
  admissionNumber: string | null;
  gender: string;
}

interface ProgrammeOption {
  id: string;
  code: string;
  name: string;
}

interface SessionOption {
  id: string;
  name: string;
  isCurrent: boolean;
  terms?: Array<{ id: string; name: string; termCode: string; isCurrent: boolean }>;
}

interface FeeStructureOption {
  id: string;
  name: string;
  programmeId: string;
}

export function SpecialRatesManagement() {
  const [loading, setLoading] = useState(true);
  const [specialRates, setSpecialRates] = useState<StudentSpecialRate[]>([]);
  const [programmes, setProgrammes] = useState<ProgrammeOption[]>([]);
  const [sessions, setSessions] = useState<SessionOption[]>([]);
  const [feeStructures, setFeeStructures] = useState<FeeStructureOption[]>([]);
  
  // Filtering
  const [selectedProgrammeFilter, setSelectedProgrammeFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Student list for assignment
  const [availableStudents, setAvailableStudents] = useState<StudentOption[]>([]);
  const [studentSearchQuery, setStudentSearchQuery] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);

  // Modal State
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Assignment Form State
  const [targetProgrammeId, setTargetProgrammeId] = useState("");
  const [targetSessionId, setTargetSessionId] = useState("");
  const [targetTermId, setTargetTermId] = useState("");
  const [rateType, setRateType] = useState<"AMOUNT" | "STRUCTURE">("AMOUNT");
  const [customAmountNaira, setCustomAmountNaira] = useState("");
  const [selectedFeeStructureId, setSelectedFeeStructureId] = useState("");
  const [notes, setNotes] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));

  const loadData = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const [ratesRes, progRes, sessRes, fsRes] = await Promise.all([
        fetch("/api/admin/finance/special-rates"),
        fetch("/api/admin/programmes"),
        fetch("/api/admin/academic/sessions"),
        fetch("/api/admin/finance/fee-structures"),
      ]);

      if (ratesRes.ok) {
        const ratesData = await ratesRes.json();
        setSpecialRates(Array.isArray(ratesData) ? ratesData : []);
      }

      if (progRes.ok) {
        const progData = await progRes.json();
        const progList = Array.isArray(progData)
          ? progData
          : (progData.items || progData.programmes || []);
        setProgrammes(progList);
        if (progList.length > 0) {
          setTargetProgrammeId((prev) => prev || progList[0].id);
        }
      }

      if (sessRes.ok) {
        const sessData = await sessRes.json();
        const sessList = Array.isArray(sessData) ? sessData : sessData.sessions || [];
        setSessions(sessList);
        const current = sessList.find((s: SessionOption) => s.isCurrent) || sessList[0];
        if (current) {
          setTargetSessionId((prev) => prev || current.id);
          const curTerm = current.terms?.find((t: any) => t.isCurrent) || current.terms?.[0];
          if (curTerm) {
            setTargetTermId((prev) => prev || curTerm.id);
          }
        }
      }

      if (fsRes.ok) {
        const fsData = await fsRes.json();
        setFeeStructures(fsData.feeStructures || []);
      }
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to load special fee rates data.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Fetch students when target programme changes or assignment modal opens
  const fetchStudents = async (programmeId: string, search: string = "") => {
    if (!programmeId) return;
    setIsLoadingStudents(true);
    try {
      const url = new URL("/api/admin/students", window.location.origin);
      url.searchParams.set("programmeId", programmeId);
      url.searchParams.set("status", "ACTIVE");
      if (search) url.searchParams.set("search", search);
      url.searchParams.set("limit", "100");

      const res = await fetch(url.toString());
      if (res.ok) {
        const data = await res.json();
        setAvailableStudents(data.students || []);
      }
    } catch {
      // Ignore network aborts
    } finally {
      setIsLoadingStudents(false);
    }
  };

  useEffect(() => {
    if (isAssignModalOpen && targetProgrammeId) {
      fetchStudents(targetProgrammeId, studentSearchQuery);
    }
  }, [isAssignModalOpen, targetProgrammeId, studentSearchQuery]);

  const handleToggleSelectStudent = (id: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(id) ? prev.filter((sId) => sId !== id) : [...prev, id]
    );
  };

  const handleSelectAllStudents = () => {
    if (selectedStudentIds.length === availableStudents.length) {
      setSelectedStudentIds([]);
    } else {
      setSelectedStudentIds(availableStudents.map((s) => s.id));
    }
  };

  const handleToggleRateStatus = async (rateId: string, currentStatus: boolean) => {
    try {
      const res = await fetch(`/api/admin/finance/special-rates/${rateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !currentStatus }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update special fee rate status.");
      }

      setFeedback({
        type: "success",
        message: `Special fee rate ${!currentStatus ? "activated" : "deactivated"} successfully.`,
      });
      loadData();
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Error updating status.",
      });
    }
  };

  const handleDeleteRate = async (rateId: string) => {
    if (!confirm("Are you sure you want to remove this assigned special rate? Future invoices will revert to general class rates.")) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/finance/special-rates/${rateId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete special fee rate.");
      }

      setFeedback({
        type: "success",
        message: "Special fee rate removed.",
      });
      loadData();
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Error deleting rate.",
      });
    }
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedStudentIds.length === 0) {
      setFeedback({ type: "error", message: "Please select at least one student." });
      return;
    }

    if (rateType === "AMOUNT" && (!customAmountNaira || Number(customAmountNaira) <= 0)) {
      setFeedback({ type: "error", message: "Please enter a valid special fee amount in Naira." });
      return;
    }

    if (rateType === "STRUCTURE" && !selectedFeeStructureId) {
      setFeedback({ type: "error", message: "Please select an applicable fee structure." });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/finance/special-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentIds: selectedStudentIds,
          programmeId: targetProgrammeId,
          academicSessionId: targetSessionId,
          academicTermId: targetTermId || null,
          customAmountNaira: rateType === "AMOUNT" ? customAmountNaira : null,
          feeStructureId: rateType === "STRUCTURE" ? selectedFeeStructureId : null,
          notes: notes.trim() || undefined,
          effectiveDate: new Date(effectiveDate),
          autoIssueInvoice: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to assign special fee rates.");
      }

      setIsAssignModalOpen(false);
      setSelectedStudentIds([]);
      setCustomAmountNaira("");
      setNotes("");
      setFeedback({
        type: "success",
        message: data.message || `Successfully assigned special rate to ${selectedStudentIds.length} student(s).`,
      });
      loadData();
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to assign special fee rate.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered special rates list
  const filteredRates = specialRates.filter((r) => {
    const matchesProg = selectedProgrammeFilter === "ALL" || r.programmeId === selectedProgrammeFilter;
    const studentFull = `${r.student?.firstName || ""} ${r.student?.lastName || ""} ${r.student?.admissionNumber || ""} ${r.notes || ""}`.toLowerCase();
    const matchesSearch = !searchQuery || studentFull.includes(searchQuery.toLowerCase());
    return matchesProg && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header & Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-stone-50 via-[#FAF7F2] to-amber-50/40 p-5 rounded-2xl border border-stone-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-[#800020]/10 text-[#800020] rounded-lg">
              <UserCheck className="w-5 h-5" />
            </span>
            <h3 className="text-lg font-bold text-stone-900">
              Old &amp; Continuing Student Special Fee Rates
            </h3>
          </div>
          <p className="text-xs text-stone-600 mt-1 max-w-2xl">
            Assign custom discounted or legacy fee rates to individual or multiple enrolled students by programme (Creche, Nursery, Primary, Tahfeez). Approved rates will strictly reflect in parent portals and automatically apply when invoices are issued.
          </p>
        </div>
        <Button
          variant="primary"
          size="md"
          onClick={() => {
            setIsAssignModalOpen(true);
            setSelectedStudentIds([]);
            if (programmes.length > 0 && !targetProgrammeId) {
              setTargetProgrammeId(programmes[0].id);
            }
          }}
          className="bg-[#800020] hover:bg-[#5B0612] text-white shrink-0 min-h-[44px]"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Assign Special Rate
        </Button>
      </div>

      {feedback && (
        <Alert
          variant={feedback.type === "success" ? "success" : "danger"}
          onClose={() => setFeedback(null)}
        >
          {feedback.message}
        </Alert>
      )}

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            placeholder="Search by student name, admission number, or notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 text-xs"
          />
        </div>
        <div className="w-full sm:w-64">
          <Select
            value={selectedProgrammeFilter}
            onChange={(e) => setSelectedProgrammeFilter(e.target.value)}
            className="text-xs"
          >
            <option value="ALL">All Programmes</option>
            {programmes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        <Button
          variant="outline"
          size="md"
          onClick={loadData}
          title="Refresh"
          className="shrink-0 text-xs px-3"
        >
          <RefreshCw className="w-4 h-4 text-stone-600" />
        </Button>
      </div>

      {/* Special Rates Table */}
      {loading ? (
        <LoadingState message="Loading special fee rates..." />
      ) : filteredRates.length === 0 ? (
        <EmptyState
          title="No Special Fee Rates Configured"
          description={
            searchQuery || selectedProgrammeFilter !== "ALL"
              ? "No student rates match the selected programme or search criteria."
              : "No grandfathered or custom fee rates have been assigned yet. Click 'Assign Special Rate' to grant special tuition rates to old students."
          }
          actionLabel="Assign Special Rate"
          onAction={() => setIsAssignModalOpen(true)}
        />
      ) : (
        <div>
          {/* Desktop Table View */}
          <div className="hidden md:block">
            <TableWrapper className="border border-[#EADBDA]/80">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell className="w-12 text-center font-semibold text-stone-700">S/N</TableHeaderCell>
                    <TableHeaderCell className="text-left font-semibold text-stone-700">Student</TableHeaderCell>
                    <TableHeaderCell className="w-36 text-left font-semibold text-stone-700">Programme</TableHeaderCell>
                    <TableHeaderCell className="w-32 text-left font-semibold text-stone-700">Assigned Rate</TableHeaderCell>
                    <TableHeaderCell className="w-40 text-left font-semibold text-stone-700">Notes / Reason</TableHeaderCell>
                    <TableHeaderCell className="w-28 text-left font-semibold text-stone-700">Effective Date</TableHeaderCell>
                    <TableHeaderCell className="w-24 text-center font-semibold text-stone-700">Status</TableHeaderCell>
                    <TableHeaderCell className="w-28 text-right font-semibold text-stone-700">Actions</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredRates.map((rate, index) => (
                    <TableRow key={rate.id}>
                      <TableCell className="w-12 text-center text-xs font-semibold text-stone-500">
                        {index + 1}
                      </TableCell>
                      <TableCell className="font-bold text-stone-900">
                        <div>
                          {rate.student?.firstName} {rate.student?.lastName}
                        </div>
                        {rate.student?.admissionNumber && (
                          <div className="text-[11px] font-mono text-stone-500">
                            {rate.student?.admissionNumber}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="w-36 text-xs font-semibold text-stone-700">
                        {rate.programme?.name}
                      </TableCell>
                      <TableCell className="w-32 text-xs font-bold text-[#800020]">
                        {rate.customAmountKobo
                          ? formatNaira(BigInt(rate.customAmountKobo))
                          : rate.feeStructure?.name || "Special Structure"}
                      </TableCell>
                      <TableCell className="w-40 text-xs text-stone-600">
                        {rate.notes || "Grandfathered rate"}
                      </TableCell>
                      <TableCell className="w-28 text-xs text-stone-500">
                        {new Date(rate.effectiveDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="w-24 text-center">
                        <Badge variant={rate.isActive ? "success" : "neutral"} size="sm">
                          {rate.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="w-28 text-right space-x-1">
                        <button
                          type="button"
                          onClick={() => handleToggleRateStatus(rate.id, rate.isActive)}
                          className="text-xs font-semibold text-stone-600 hover:text-stone-900 p-1 rounded hover:bg-stone-100"
                          title={rate.isActive ? "Deactivate rate" : "Activate rate"}
                        >
                          {rate.isActive ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteRate(rate.id)}
                          className="text-xs text-rose-600 hover:text-rose-800 p-1 rounded hover:bg-rose-50"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5 inline" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableWrapper>
          </div>

          {/* Mobile Cards View */}
          <div className="block md:hidden space-y-3">
            {filteredRates.map((rate, index) => (
              <TableMobileCard
                key={rate.id}
                title={
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-stone-100 text-stone-700 text-xs font-bold shrink-0">
                      {index + 1}
                    </span>
                    <span className="text-sm font-bold text-stone-900">
                      {rate.student?.firstName} {rate.student?.lastName}
                    </span>
                  </div>
                }
                subtitle={
                  <span className="text-xs font-mono text-stone-500 pl-8 block">
                    {rate.student?.admissionNumber || "No admission no."}
                  </span>
                }
                badge={
                  <Badge variant={rate.isActive ? "success" : "neutral"} size="sm">
                    {rate.isActive ? "Active" : "Inactive"}
                  </Badge>
                }
                fields={[
                  { label: "Programme", value: rate.programme?.name || "General" },
                  {
                    label: "Assigned Rate",
                    value: rate.customAmountKobo
                      ? formatNaira(BigInt(rate.customAmountKobo))
                      : rate.feeStructure?.name || "Special Structure",
                  },
                  { label: "Notes", value: rate.notes || "None" },
                  { label: "Effective Date", value: new Date(rate.effectiveDate).toLocaleDateString() },
                ]}
                actions={
                  <div className="flex gap-2 w-full pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleRateStatus(rate.id, rate.isActive)}
                      className="flex-1 min-h-[44px]"
                    >
                      {rate.isActive ? "Deactivate" : "Activate"}
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleDeleteRate(rate.id)}
                      className="px-3 min-h-[44px]"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* Assign Special Rate Modal */}
      {isAssignModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => !isSubmitting && setIsAssignModalOpen(false)}
          title="Assign Special Fee Rate to Students"
        >
          <form onSubmit={handleAssignSubmit} className="space-y-4 pt-2">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-1">
              <p className="font-bold text-amber-950 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-600" />
                Continuing &amp; Old Student Rate Protection
              </p>
              <p className="text-amber-900 leading-relaxed">
                Selected students will be billed at this approved rate rather than the standard programme tuition. Approved rates take precedence when issuing single or batch invoices, and display with an official verification badge in the parent portal.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <FormGroup label="Programme" required>
                <Select
                  value={targetProgrammeId}
                  onChange={(e) => {
                    setTargetProgrammeId(e.target.value);
                    setSelectedStudentIds([]);
                  }}
                  required
                >
                  {programmes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </FormGroup>

              <FormGroup label="Academic Session" required>
                <Select
                  value={targetSessionId}
                  onChange={(e) => {
                    const sId = e.target.value;
                    setTargetSessionId(sId);
                    const found = sessions.find((s) => s.id === sId);
                    const defTerm = found?.terms?.find((t) => t.isCurrent) || found?.terms?.[0];
                    if (defTerm) setTargetTermId(defTerm.id);
                  }}
                  required
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
                  value={targetTermId}
                  onChange={(e) => setTargetTermId(e.target.value)}
                  required
                >
                  {(sessions.find((s) => s.id === targetSessionId)?.terms || []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} {t.isCurrent ? "(Current)" : ""}
                    </option>
                  ))}
                </Select>
              </FormGroup>
            </div>

            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs flex items-start gap-2 text-emerald-900">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                <strong>Immediate Parent Invoice &amp; Paystack:</strong> An official invoice for this term will be automatically issued/updated for each selected student so their parent immediately sees the bill and can click &quot;Pay Now&quot;.
              </span>
            </div>

            {/* Student Selection Section */}
            <div className="space-y-2 border border-stone-200 p-3 rounded-xl bg-stone-50/50">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-stone-900">
                  Select Students ({selectedStudentIds.length} of {availableStudents.length} selected)
                </label>
                {availableStudents.length > 0 && (
                  <button
                    type="button"
                    onClick={handleSelectAllStudents}
                    className="text-xs font-semibold text-[#800020] hover:underline"
                  >
                    {selectedStudentIds.length === availableStudents.length
                      ? "Deselect All"
                      : "Select All"}
                  </button>
                )}
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <Input
                  placeholder="Filter student list..."
                  value={studentSearchQuery}
                  onChange={(e) => setStudentSearchQuery(e.target.value)}
                  className="pl-8 text-xs py-1.5"
                />
              </div>

              <div className="max-h-48 overflow-y-auto space-y-1.5 bg-white border border-stone-200 rounded-lg p-2 divide-y divide-stone-100">
                {isLoadingStudents ? (
                  <div className="py-4 text-center text-xs text-stone-500">Loading enrolled students...</div>
                ) : availableStudents.length === 0 ? (
                  <div className="py-4 text-center text-xs text-stone-500">
                    No active students found in this programme.
                  </div>
                ) : (
                  availableStudents.map((s) => {
                    const isChecked = selectedStudentIds.includes(s.id);
                    return (
                      <label
                        key={s.id}
                        className={`flex items-center justify-between p-1.5 rounded cursor-pointer transition-colors ${
                          isChecked ? "bg-rose-50/70" : "hover:bg-stone-50"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleSelectStudent(s.id)}
                            className="w-4 h-4 text-[#800020] rounded border-stone-300 focus:ring-[#800020]"
                          />
                          <div>
                            <span className="text-xs font-semibold text-stone-900">
                              {s.firstName} {s.lastName}
                            </span>
                            {s.admissionNumber && (
                              <span className="text-[10px] font-mono text-stone-500 ml-2">
                                ({s.admissionNumber})
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-[10px] text-stone-400 uppercase font-bold">
                          {s.gender}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            {/* Rate Definition */}
            <div className="space-y-3 pt-1">
              <div className="flex gap-3">
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="radio"
                    name="rateType"
                    checked={rateType === "AMOUNT"}
                    onChange={() => setRateType("AMOUNT")}
                    className="text-[#800020] focus:ring-[#800020]"
                  />
                  <span>Custom Fee Amount (₦)</span>
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="radio"
                    name="rateType"
                    checked={rateType === "STRUCTURE"}
                    onChange={() => setRateType("STRUCTURE")}
                    className="text-[#800020] focus:ring-[#800020]"
                  />
                  <span>Select Fee Plan / Structure</span>
                </label>
              </div>

              {rateType === "AMOUNT" ? (
                <FormGroup label="Special Fee Amount (₦)" required>
                  <Input
                    type="number"
                    min="1000"
                    step="500"
                    placeholder="e.g. 35000"
                    value={customAmountNaira}
                    onChange={(e) => setCustomAmountNaira(e.target.value)}
                    required
                    className="text-sm font-bold text-stone-900"
                  />
                </FormGroup>
              ) : (
                <FormGroup label="Assigned Fee Structure" required>
                  <Select
                    value={selectedFeeStructureId}
                    onChange={(e) => setSelectedFeeStructureId(e.target.value)}
                    required
                  >
                    <option value="">Select an applicable structure...</option>
                    {feeStructures.map((fs) => (
                      <option key={fs.id} value={fs.id}>
                        {fs.name}
                      </option>
                    ))}
                  </Select>
                </FormGroup>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormGroup label="Notes / Reason" helperText="E.g. 'Old 2024 student grandfathered tuition'">
                  <Input
                    placeholder="Grandfathered rate reason..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="text-xs"
                  />
                </FormGroup>

                <FormGroup label="Effective Date" required>
                  <Input
                    type="date"
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                    required
                    className="text-xs"
                  />
                </FormGroup>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
              <Button
                variant="outline"
                type="button"
                onClick={() => setIsAssignModalOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                disabled={isSubmitting || selectedStudentIds.length === 0}
                className="bg-[#800020] hover:bg-[#5B0612] text-white font-bold px-5 min-h-[44px]"
              >
                {isSubmitting ? "Assigning..." : `Assign to ${selectedStudentIds.length} Student(s)`}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

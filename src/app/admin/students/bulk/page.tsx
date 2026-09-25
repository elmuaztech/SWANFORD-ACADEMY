"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Button,
  Input,
  Select,
  Alert,
  Badge,
  LoadingState,
  TableWrapper,
  Table,
  TableHead,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
} from "@/components";

interface ProgrammeOption {
  id: string;
  name: string;
  code: string;
}

interface ClassOption {
  id: string;
  name: string;
  code: string;
  programmeId: string;
}

interface SessionOption {
  id: string;
  name: string;
  isCurrent: boolean;
  terms: Array<{ id: string; name: string; isCurrent: boolean }>;
}

interface BulkRowData {
  rowNumber: number;
  firstName: string;
  lastName: string;
  otherNames: string;
  gender: "MALE" | "FEMALE";
  dateOfBirth: string;
  schoolClassId: string;
  guardianFirstName: string;
  guardianLastName: string;
  guardianPhone: string;
  guardianEmail: string;
}

export default function AdminBulkStudentEnrollPage() {
  const [programmes, setProgrammes] = useState<ProgrammeOption[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [sessions, setSessions] = useState<SessionOption[]>([]);
  const [loadingRef, setLoadingRef] = useState(true);

  // Selected batch size: 1, 5, 10, 20, 30, 40, 50
  const rowCountOptions = [1, 5, 10, 20, 30, 40, 50];
  const [rowCount, setRowCount] = useState<number>(5);

  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [selectedTermId, setSelectedTermId] = useState("");

  const createEmptyRow = (num: number, defaultClassId = ""): BulkRowData => ({
    rowNumber: num,
    firstName: "",
    lastName: "",
    otherNames: "",
    gender: "MALE",
    dateOfBirth: "2018-01-01",
    schoolClassId: defaultClassId,
    guardianFirstName: "",
    guardianLastName: "",
    guardianPhone: "",
    guardianEmail: "",
  });

  const [rows, setRows] = useState<BulkRowData[]>([]);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [results, setResults] = useState<{
    batchNumber: string;
    totalSubmitted: number;
    totalSuccessful: number;
    totalFailed: number;
    successfulStudents: Array<{
      rowNumber: number;
      admissionNumber: string;
      studentName: string;
    }>;
    failedRows: Array<{
      rowNumber: number;
      errorMessage: string;
    }>;
  } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/programmes?includeInactive=false").then((r) => r.json()).catch(() => ({})),
      fetch("/api/admin/classes?includeInactive=false").then((r) => r.json()).catch(() => ({})),
      fetch("/api/admin/academic/sessions").then((r) => r.json()).catch(() => ({})),
    ])
      .then(([progsData, classesData, sessionsData]) => {
        const progsList = Array.isArray(progsData.items) ? progsData.items : [];
        const classesList = Array.isArray(classesData.items) ? classesData.items : [];
        const sessionsList: SessionOption[] = Array.isArray(sessionsData.sessions)
          ? sessionsData.sessions
          : Array.isArray(sessionsData.items)
          ? sessionsData.items
          : [];

        setProgrammes(progsList);
        setClasses(classesList);
        setSessions(sessionsList);

        const currentSession = sessionsList.find((s) => s.isCurrent) || sessionsList[0];
        const currentTerm = currentSession?.terms?.find((t) => t.isCurrent) || currentSession?.terms?.[0];

        setSelectedSessionId(currentSession?.id || "");
        setSelectedTermId(currentTerm?.id || "");

        const defaultClassId = classesList[0]?.id || "";
        const initialRows = Array.from({ length: 5 }, (_, i) => createEmptyRow(i + 1, defaultClassId));
        setRows(initialRows);

        setLoadingRef(false);
      })
      .catch(() => setLoadingRef(false));
  }, []);

  const handleRowCountChange = (newCount: number) => {
    setRowCount(newCount);
    setRows((prev) => {
      const defaultClassId = classes[0]?.id || "";
      if (newCount > prev.length) {
        const additional = Array.from({ length: newCount - prev.length }, (_, i) =>
          createEmptyRow(prev.length + i + 1, defaultClassId)
        );
        return [...prev, ...additional];
      } else {
        return prev.slice(0, newCount);
      }
    });
  };

  const handleRowChange = (index: number, field: keyof BulkRowData, value: any) => {
    setRows((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setResults(null);

    // Validate active rows (rows where at least firstName or lastName is entered)
    const filledRows = rows.filter(
      (r) => r.firstName.trim() || r.lastName.trim() || r.guardianEmail.trim()
    );

    if (filledRows.length === 0) {
      setErrorMsg("Please enter details for at least one pupil before submitting.");
      return;
    }

    // Validate required fields in filled rows
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const r of filledRows) {
      if (!r.firstName.trim() || !r.lastName.trim()) {
        setErrorMsg(`Row ${r.rowNumber}: First name and last name are required.`);
        return;
      }
      if (!r.schoolClassId) {
        setErrorMsg(`Row ${r.rowNumber}: Class selection is required.`);
        return;
      }
      if (!r.guardianFirstName.trim() || !r.guardianLastName.trim()) {
        setErrorMsg(`Row ${r.rowNumber}: Guardian name is required.`);
        return;
      }
      if (!r.guardianPhone.trim()) {
        setErrorMsg(`Row ${r.rowNumber}: Guardian phone number is mandatory.`);
        return;
      }
      if (!r.guardianEmail.trim()) {
        setErrorMsg(`Row ${r.rowNumber}: Guardian email address is mandatory.`);
        return;
      }
      if (!emailRegex.test(r.guardianEmail.trim())) {
        setErrorMsg(`Row ${r.rowNumber}: Guardian email address is invalid.`);
        return;
      }
    }

    setSubmitting(true);

    try {
      const payloadRows = filledRows.map((r) => {
        const cls = classes.find((c) => c.id === r.schoolClassId);
        return {
          rowNumber: r.rowNumber,
          firstName: r.firstName.trim(),
          lastName: r.lastName.trim(),
          otherNames: r.otherNames.trim() || undefined,
          gender: r.gender,
          dateOfBirth: r.dateOfBirth,
          schoolClassId: r.schoolClassId,
          programmeIds: cls ? [cls.programmeId] : [],
          guardianFirstName: r.guardianFirstName.trim(),
          guardianLastName: r.guardianLastName.trim(),
          guardianPhone: r.guardianPhone.trim(),
          guardianEmail: r.guardianEmail.trim(),
        };
      });

      const res = await fetch("/api/admin/students/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          academicSessionId: selectedSessionId,
          academicTermId: selectedTermId,
          rows: payloadRows,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Bulk enrollment execution failed.");
      }

      setResults(data.result);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Bulk enrollment failed.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingRef) {
    return (
      <div className="py-12">
        <LoadingState message="Loading bulk enrollment configuration..." />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight font-display">
            Bulk Student Enrollment
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 mt-0.5">
            Register multiple pupils simultaneously with atomic per-row transaction isolation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/students/enroll">
            <Button variant="outline" size="sm">
              Single Enrollment Form
            </Button>
          </Link>
          <Link href="/admin/students">
            <Button variant="outline" size="sm">
              &larr; Students Roster
            </Button>
          </Link>
        </div>
      </div>

      <Alert variant="info" className="bg-[#FAF4F5] border-[#EADBDA] text-[#5B0612]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <strong className="font-bold">Parent Email is Required:</strong> Each student&apos;s parent or guardian email address must be provided. The email is strictly required to automatically provision Parent Portal access credentials and deliver official school notifications, fee reminders, and academic term reports.
          </div>
        </div>
      </Alert>

      {errorMsg && <Alert variant="error">{errorMsg}</Alert>}

      {/* Results Card */}
      {results && (
        <Card className="border-2 border-emerald-300 bg-emerald-50/20">
          <CardHeader className="border-b border-emerald-100">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base text-emerald-900 font-bold">
                  Bulk Enrollment Complete — {results.batchNumber}
                </CardTitle>
                <CardDescription className="text-emerald-700">
                  {results.totalSuccessful} pupil(s) enrolled successfully. {results.totalFailed} failed.
                </CardDescription>
              </div>
              <Badge variant={results.totalFailed === 0 ? "success" : "warning"}>
                {results.totalFailed === 0 ? "100% Successful" : `${results.totalSuccessful} / ${results.totalSubmitted}`}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            {results.successfulStudents.length > 0 && (
              <div>
                <p className="text-xs font-bold text-stone-700 uppercase tracking-wider mb-2">
                  Enrolled Students (Assigned Permanent Admission Numbers):
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {results.successfulStudents.map((s) => (
                    <div
                      key={s.admissionNumber}
                      className="p-2.5 bg-white border border-stone-200 rounded-lg text-xs"
                    >
                      <p className="font-bold text-stone-900">{s.studentName}</p>
                      <p className="font-mono text-[#800020] font-semibold">{s.admissionNumber}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {results.failedRows.length > 0 && (
              <div className="pt-2 border-t border-red-200">
                <p className="text-xs font-bold text-red-700 uppercase tracking-wider mb-2">
                  Failed Rows:
                </p>
                <div className="space-y-1">
                  {results.failedRows.map((f) => (
                    <p key={f.rowNumber} className="text-xs text-red-600">
                      Row {f.rowNumber}: {f.errorMessage}
                    </p>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Link href="/admin/students">
                <Button variant="primary" size="sm">
                  View Students Directory &rarr;
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Row Count Selector & Placement Toolbar */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            {/* Row Selector (Requirement 14: 1, 5, 10, 20, 30, 40, 50) */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-stone-700">Rows to Enter:</span>
              <div className="inline-flex rounded-lg border border-stone-200 bg-stone-50 p-0.5">
                {rowCountOptions.map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => handleRowCountChange(cnt)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                      rowCount === cnt
                        ? "bg-[#800020] text-white shadow-xs"
                        : "text-stone-600 hover:text-stone-900"
                    }`}
                  >
                    {cnt}
                  </button>
                ))}
              </div>
            </div>

            {/* Academic Session */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-stone-500 font-medium">Academic Session:</span>
              <select
                className="h-8 px-2 rounded-lg border border-stone-200 bg-white text-stone-800 text-xs font-medium focus:ring-1 focus:ring-[#800020]"
                value={selectedSessionId}
                onChange={(e) => setSelectedSessionId(e.target.value)}
              >
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.isCurrent ? "(Current)" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Bulk Table */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <TableWrapper>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-stone-100 border-b border-stone-200 text-stone-700 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-2.5 px-2 w-10 text-center">#</th>
                  <th className="py-2.5 px-2 min-w-[130px]">Pupil First Name *</th>
                  <th className="py-2.5 px-2 min-w-[130px]">Pupil Surname *</th>
                  <th className="py-2.5 px-2 min-w-[90px]">Gender *</th>
                  <th className="py-2.5 px-2 min-w-[120px]">Date of Birth *</th>
                  <th className="py-2.5 px-2 min-w-[140px]">Class *</th>
                  <th className="py-2.5 px-2 min-w-[120px]">Parent First *</th>
                  <th className="py-2.5 px-2 min-w-[120px]">Parent Last *</th>
                  <th className="py-2.5 px-2 min-w-[120px]">Parent Phone *</th>
                  <th className="py-2.5 px-2 min-w-[160px]">Parent Email (MANDATORY) *</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 bg-white">
                {rows.map((row, idx) => (
                  <tr key={row.rowNumber} className="hover:bg-stone-50/60">
                    <td className="py-2 px-2 font-mono text-center font-bold text-stone-400">
                      {row.rowNumber}
                    </td>
                    <td className="py-2 px-2">
                      <input
                        className="w-full h-8 px-2 rounded border border-stone-200 text-xs focus:outline-none focus:border-[#800020]"
                        placeholder="First Name"
                        value={row.firstName}
                        onChange={(e) => handleRowChange(idx, "firstName", e.target.value)}
                      />
                    </td>
                    <td className="py-2 px-2">
                      <input
                        className="w-full h-8 px-2 rounded border border-stone-200 text-xs focus:outline-none focus:border-[#800020]"
                        placeholder="Surname"
                        value={row.lastName}
                        onChange={(e) => handleRowChange(idx, "lastName", e.target.value)}
                      />
                    </td>
                    <td className="py-2 px-2">
                      <select
                        className="w-full h-8 px-1.5 rounded border border-stone-200 text-xs focus:outline-none focus:border-[#800020]"
                        value={row.gender}
                        onChange={(e) => handleRowChange(idx, "gender", e.target.value)}
                      >
                        <option value="MALE">Male</option>
                        <option value="FEMALE">Female</option>
                      </select>
                    </td>
                    <td className="py-2 px-2">
                      <input
                        type="date"
                        className="w-full h-8 px-1.5 rounded border border-stone-200 text-xs focus:outline-none focus:border-[#800020]"
                        value={row.dateOfBirth}
                        onChange={(e) => handleRowChange(idx, "dateOfBirth", e.target.value)}
                      />
                    </td>
                    <td className="py-2 px-2">
                      <select
                        className="w-full h-8 px-1.5 rounded border border-stone-200 text-xs focus:outline-none focus:border-[#800020]"
                        value={row.schoolClassId}
                        onChange={(e) => handleRowChange(idx, "schoolClassId", e.target.value)}
                      >
                        {classes.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.code})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-2">
                      <input
                        className="w-full h-8 px-2 rounded border border-stone-200 text-xs focus:outline-none focus:border-[#800020]"
                        placeholder="Parent First"
                        value={row.guardianFirstName}
                        onChange={(e) => handleRowChange(idx, "guardianFirstName", e.target.value)}
                      />
                    </td>
                    <td className="py-2 px-2">
                      <input
                        className="w-full h-8 px-2 rounded border border-stone-200 text-xs focus:outline-none focus:border-[#800020]"
                        placeholder="Parent Last"
                        value={row.guardianLastName}
                        onChange={(e) => handleRowChange(idx, "guardianLastName", e.target.value)}
                      />
                    </td>
                    <td className="py-2 px-2">
                      <input
                        className="w-full h-8 px-2 rounded border border-stone-200 text-xs focus:outline-none focus:border-[#800020]"
                        placeholder="080..."
                        value={row.guardianPhone}
                        onChange={(e) => handleRowChange(idx, "guardianPhone", e.target.value)}
                      />
                    </td>
                    <td className="py-2 px-2">
                      <input
                        type="email"
                        className="w-full h-8 px-2 rounded border border-stone-200 text-xs font-mono focus:outline-none focus:border-[#800020]"
                        placeholder="parent@example.com"
                        value={row.guardianEmail}
                        onChange={(e) => handleRowChange(idx, "guardianEmail", e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TableWrapper>

        {/* Submit Bar */}
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-stone-500">
            * Empty rows will be skipped automatically. Only completed rows will be enrolled.
          </p>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="min-w-[180px]"
            disabled={submitting}
          >
            {submitting ? "Processing..." : `Enroll Entered Pupils`}
          </Button>
        </div>
      </form>
    </div>
  );
}

"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { parseFullName } from "@/lib/utils/name_parser";
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
  DatePicker,
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

export type RelationshipTypeOption = "FATHER" | "MOTHER" | "LEGAL_GUARDIAN" | "SPONSOR";

export interface BulkRowData {
  rowNumber: number;
  fullName: string;
  gender: "MALE" | "FEMALE";
  dateOfBirth: string;
  schoolClassId: string;
  profilePhotoId?: string;
  passportPhotoUrl?: string;
  relationshipType: RelationshipTypeOption;
  guardianFullName: string;
  guardianPhone: string;
  guardianEmail: string;
  residentialAddress?: string;
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
    fullName: "",
    gender: "MALE",
    dateOfBirth: "",
    schoolClassId: defaultClassId,
    profilePhotoId: "",
    passportPhotoUrl: "",
    relationshipType: "FATHER",
    guardianFullName: "",
    guardianPhone: "",
    guardianEmail: "",
    residentialAddress: "",
  });

  const [rows, setRows] = useState<BulkRowData[]>([]);

  // Per-row photo upload loading indicators
  const [uploadingPhotos, setUploadingPhotos] = useState<{ [rowIdx: number]: boolean }>({});

  // Batch Photo Matcher state
  const [showBatchPhotoModal, setShowBatchPhotoModal] = useState(false);
  const [batchPhotoProcessing, setBatchPhotoProcessing] = useState(false);
  const [batchPhotoMsg, setBatchPhotoMsg] = useState<string | null>(null);
  const batchFileInputRef = useRef<HTMLInputElement>(null);

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

  // Helper to copy parent from the previous row (sibling quick-link)
  const handleCopyParentFromAbove = (currentIndex: number) => {
    if (currentIndex <= 0) return;
    const parentRow = rows[currentIndex - 1];
    setRows((prev) => {
      const updated = [...prev];
      updated[currentIndex] = {
        ...updated[currentIndex],
        guardianFullName: parentRow.guardianFullName,
        relationshipType: parentRow.relationshipType,
        guardianPhone: parentRow.guardianPhone,
        guardianEmail: parentRow.guardianEmail,
        residentialAddress: parentRow.residentialAddress || "",
      };
      return updated;
    });
  };

  // Handle single photo upload for a row
  const handlePhotoUpload = async (index: number, file: File) => {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setErrorMsg(`File must be an image (JPEG, PNG, or WebP).`);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg(`Photo size must not exceed 5 MB.`);
      return;
    }

    setUploadingPhotos((prev) => ({ ...prev, [index]: true }));
    setErrorMsg(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/media/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to upload passport photo.");
      }

      setRows((prev) => {
        const updated = [...prev];
        updated[index] = {
          ...updated[index],
          profilePhotoId: data.assetId,
          passportPhotoUrl: data.url,
        };
        return updated;
      });
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to upload passport photograph.");
    } finally {
      setUploadingPhotos((prev) => ({ ...prev, [index]: false }));
    }
  };

  // Remove photo from a row
  const handleRemovePhoto = (index: number) => {
    setRows((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        profilePhotoId: "",
        passportPhotoUrl: "",
      };
      return updated;
    });
  };

  // Batch Photo Auto-Matcher: Matches dropped/selected files to rows
  const handleBatchPhotoFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setBatchPhotoProcessing(true);
    setBatchPhotoMsg(null);
    let matchedCount = 0;

    try {
      const fileArray = Array.from(files);

      for (const file of fileArray) {
        if (!file.type.startsWith("image/")) continue;

        const baseName = file.name.replace(/\.[^/.]+$/, "").trim().toLowerCase();

        // 1. Try matching by row number: e.g., "1.jpg", "row1.jpg", "row-1.png", "1_passport.jpg"
        let targetRowIndex = -1;
        const rowNumMatch = /^(?:row[-_]?)?(\d+)/i.exec(baseName);
        if (rowNumMatch) {
          const rowNum = parseInt(rowNumMatch[1], 10);
          const foundIdx = rows.findIndex((r) => r.rowNumber === rowNum);
          if (foundIdx !== -1) {
            targetRowIndex = foundIdx;
          }
        }

        // 2. If not matched by row number, try matching by student full name
        if (targetRowIndex === -1) {
          const nameWords = baseName.split(/[\s-_.]+/).filter((w) => w.length > 2);
          for (let idx = 0; idx < rows.length; idx++) {
            const studentName = rows[idx].fullName.trim().toLowerCase();
            if (!studentName) continue;
            // If student name contains key parts of the filename or vice versa
            if (nameWords.some((word) => studentName.includes(word))) {
              targetRowIndex = idx;
              break;
            }
          }
        }

        if (targetRowIndex !== -1) {
          // Upload and attach
          const formData = new FormData();
          formData.append("file", file);

          const res = await fetch("/api/media/upload", {
            method: "POST",
            body: formData,
          });

          if (res.ok) {
            const data = await res.json();
            setRows((prev) => {
              const updated = [...prev];
              updated[targetRowIndex] = {
                ...updated[targetRowIndex],
                profilePhotoId: data.assetId,
                passportPhotoUrl: data.url,
              };
              return updated;
            });
            matchedCount++;
          }
        }
      }

      setBatchPhotoMsg(`Successfully matched and attached ${matchedCount} passport photo(s).`);
    } catch {
      setBatchPhotoMsg(`Error processing some photos.`);
    } finally {
      setBatchPhotoProcessing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setResults(null);

    // Validate active rows (rows where at least pupil name or guardian name is entered)
    const filledRows = rows.filter(
      (r) => r.fullName.trim() || r.guardianFullName.trim() || r.guardianEmail.trim()
    );

    if (filledRows.length === 0) {
      setErrorMsg("Please enter details for at least one pupil before submitting.");
      return;
    }

    // Validate required fields in filled rows
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const r of filledRows) {
      if (!r.fullName.trim()) {
        setErrorMsg(`Row ${r.rowNumber}: Pupil Full Name is required.`);
        return;
      }
      if (!r.dateOfBirth?.trim()) {
        setErrorMsg(`Row ${r.rowNumber}: Date of Birth is required. Please type or pick a date.`);
        return;
      }
      if (!r.schoolClassId) {
        setErrorMsg(`Row ${r.rowNumber}: Class selection is required.`);
        return;
      }
      if (!r.guardianFullName.trim()) {
        setErrorMsg(`Row ${r.rowNumber}: Parent / Guardian Full Name is required.`);
        return;
      }
      if (!r.guardianPhone.trim()) {
        setErrorMsg(`Row ${r.rowNumber}: Guardian phone number is mandatory.`);
        return;
      }
      if (!r.guardianEmail.trim()) {
        setErrorMsg(`Row ${r.rowNumber}: Guardian email address is mandatory for parent account creation.`);
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
        const parsedPupil = parseFullName(r.fullName);
        const parsedGuardian = parseFullName(r.guardianFullName);
        return {
          rowNumber: r.rowNumber,
          fullName: r.fullName.trim(),
          firstName: parsedPupil.firstName,
          lastName: parsedPupil.lastName,
          otherNames: parsedPupil.otherNames,
          gender: r.gender,
          dateOfBirth: r.dateOfBirth.trim(),
          profilePhotoId: r.profilePhotoId || null,
          schoolClassId: r.schoolClassId,
          programmeIds: cls ? [cls.programmeId] : [],
          relationshipType: r.relationshipType || "FATHER",
          guardianFullName: r.guardianFullName.trim(),
          guardianFirstName: parsedGuardian.firstName,
          guardianLastName: parsedGuardian.lastName,
          guardianPhone: r.guardianPhone.trim(),
          guardianEmail: r.guardianEmail.trim(),
          residentialAddress: r.residentialAddress?.trim() || null,
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
            Register multiple pupils simultaneously with passport photographs, easy calendar DOB entry, and direct parent linking.
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
            <strong className="font-bold">Direct Parent Linking & Portals:</strong> Each child is directly linked to their parent or guardian. The parent&apos;s email address automatically provisions their secure Parent Portal account and links siblings under one family profile.
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

      {/* Row Count Selector & Toolbar */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
            {/* Row Selector (1, 5, 10, 20, 30, 40, 50) */}
            <div className="flex flex-wrap items-center gap-2">
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

            {/* Quick Actions & Session */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Batch Match Photos Helper Button */}
              <div>
                <input
                  ref={batchFileInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleBatchPhotoFiles(e.target.files)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => batchFileInputRef.current?.click()}
                  disabled={batchPhotoProcessing}
                  className="text-xs flex items-center gap-1.5"
                  title="Select multiple passport photos at once to auto-match rows by student name or row number (e.g. 1.jpg, 2.jpg)"
                >
                  <span>📷</span>
                  <span>{batchPhotoProcessing ? "Matching..." : "Batch Match Passport Photos"}</span>
                </Button>
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
          </div>

          {/* Batch Photo Match feedback */}
          {batchPhotoMsg && (
            <div className="mt-3 p-2 bg-stone-50 border border-stone-200 rounded-lg text-xs text-stone-700 flex items-center justify-between">
              <span>{batchPhotoMsg}</span>
              <button
                type="button"
                onClick={() => setBatchPhotoMsg(null)}
                className="text-stone-400 hover:text-stone-700 font-bold px-1"
              >
                &times;
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main Bulk Table */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <TableWrapper>
          <div className="overflow-x-auto min-h-[380px]">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-stone-100 border-b border-stone-200 text-stone-700 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-2.5 px-2 w-12 text-center">S/N</th>
                  <th className="py-2.5 px-2 min-w-[95px] text-center">Passport Photo</th>
                  <th className="py-2.5 px-3 min-w-[190px]">Pupil Full Name *</th>
                  <th className="py-2.5 px-2 min-w-[90px]">Gender *</th>
                  <th className="py-2.5 px-2 min-w-[160px]">
                    Date of Birth *
                    <span className="block text-[9px] font-normal text-stone-500 lowercase">
                      type or pick
                    </span>
                  </th>
                  <th className="py-2.5 px-2 min-w-[130px]">Class *</th>
                  <th className="py-2.5 px-2 min-w-[110px]">Relationship</th>
                  <th className="py-2.5 px-3 min-w-[170px]">Parent Full Name *</th>
                  <th className="py-2.5 px-2 min-w-[120px]">Parent Phone *</th>
                  <th className="py-2.5 px-2 min-w-[160px]">Parent Email (MANDATORY) *</th>
                  <th className="py-2.5 px-2 w-16 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 bg-white">
                {rows.map((row, idx) => {
                  const isUploadingThisPhoto = Boolean(uploadingPhotos[idx]);

                  return (
                    <tr key={row.rowNumber} className="hover:bg-stone-50/60 transition-colors">
                      {/* S/N */}
                      <td className="py-2 px-2 font-mono text-center font-bold text-stone-500">
                        {row.rowNumber}
                      </td>

                      {/* Passport Photograph Column */}
                      <td className="py-2 px-2 text-center">
                        <div className="flex items-center justify-center">
                          {row.passportPhotoUrl ? (
                            <div className="relative group inline-block">
                              <img
                                src={row.passportPhotoUrl}
                                alt={`Row ${row.rowNumber} Passport`}
                                className="w-8 h-8 rounded-full object-cover border-2 border-[#800020] shadow-2xs"
                              />
                              <button
                                type="button"
                                onClick={() => handleRemovePhoto(idx)}
                                title="Remove photo"
                                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-600 text-white text-[10px] flex items-center justify-center font-bold hover:bg-rose-700 shadow-xs"
                              >
                                &times;
                              </button>
                            </div>
                          ) : (
                            <label className="cursor-pointer">
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                disabled={isUploadingThisPhoto}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handlePhotoUpload(idx, file);
                                }}
                              />
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-1 rounded border border-dashed text-[11px] font-semibold transition-colors ${
                                  isUploadingThisPhoto
                                    ? "bg-stone-100 text-stone-400 border-stone-300 cursor-wait"
                                    : "border-[#800020]/40 text-[#800020] hover:bg-[#FAF4F5] hover:border-[#800020]"
                                }`}
                              >
                                {isUploadingThisPhoto ? "⏳ ..." : "📷 Photo"}
                              </span>
                            </label>
                          )}
                        </div>
                      </td>

                      {/* Pupil Full Name */}
                      <td className="py-2 px-2">
                        <input
                          className="w-full h-8 px-2 rounded border border-stone-200 text-xs focus:outline-none focus:border-[#800020]"
                          placeholder="e.g. Bilkisu Usman Muhammed"
                          value={row.fullName}
                          onChange={(e) => handleRowChange(idx, "fullName", e.target.value)}
                        />
                      </td>

                      {/* Gender */}
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

                      {/* Date of Birth: Reusable DatePicker with direct typing & calendar */}
                      <td className="py-2 px-2">
                        <DatePicker
                          size="sm"
                          value={row.dateOfBirth}
                          onChange={(val) => handleRowChange(idx, "dateOfBirth", val)}
                          placeholder="DD/MM/YYYY"
                        />
                      </td>

                      {/* Class */}
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

                      {/* Relationship Type */}
                      <td className="py-2 px-2">
                        <select
                          className="w-full h-8 px-1 rounded border border-stone-200 text-xs focus:outline-none focus:border-[#800020]"
                          value={row.relationshipType}
                          onChange={(e) => handleRowChange(idx, "relationshipType", e.target.value)}
                        >
                          <option value="FATHER">Father</option>
                          <option value="MOTHER">Mother</option>
                          <option value="LEGAL_GUARDIAN">Guardian</option>
                          <option value="SPONSOR">Sponsor</option>
                        </select>
                      </td>

                      {/* Parent Full Name */}
                      <td className="py-2 px-2">
                        <input
                          className="w-full h-8 px-2 rounded border border-stone-200 text-xs focus:outline-none focus:border-[#800020]"
                          placeholder="e.g. Usman Muhammed"
                          value={row.guardianFullName}
                          onChange={(e) => handleRowChange(idx, "guardianFullName", e.target.value)}
                        />
                      </td>

                      {/* Parent Phone */}
                      <td className="py-2 px-2">
                        <input
                          className="w-full h-8 px-2 rounded border border-stone-200 text-xs focus:outline-none focus:border-[#800020]"
                          placeholder="080..."
                          value={row.guardianPhone}
                          onChange={(e) => handleRowChange(idx, "guardianPhone", e.target.value)}
                        />
                      </td>

                      {/* Parent Email */}
                      <td className="py-2 px-2">
                        <input
                          type="email"
                          className="w-full h-8 px-2 rounded border border-stone-200 text-xs font-mono focus:outline-none focus:border-[#800020]"
                          placeholder="parent@example.com"
                          value={row.guardianEmail}
                          onChange={(e) => handleRowChange(idx, "guardianEmail", e.target.value)}
                        />
                      </td>

                      {/* Row Actions: Sibling Quick Copy from Above */}
                      <td className="py-2 px-1 text-center">
                        {idx > 0 && (
                          <button
                            type="button"
                            onClick={() => handleCopyParentFromAbove(idx)}
                            title="Same parent as row above (link siblings)"
                            className="p-1 text-[11px] text-stone-500 hover:text-[#800020] hover:bg-stone-100 rounded transition-colors"
                          >
                            <span className="font-bold">↓ Copy</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TableWrapper>

        {/* Submit Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2">
          <p className="text-xs text-stone-500">
            * Empty rows will be skipped automatically. Only completed pupil records will be matriculated and linked to parent accounts.
          </p>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="min-w-[190px]"
            disabled={submitting}
          >
            {submitting ? "Processing..." : `Enroll Entered Pupils`}
          </Button>
        </div>
      </form>
    </div>
  );
}

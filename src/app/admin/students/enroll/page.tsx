"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  Button,
  Input,
  Select,
  Textarea,
  FormGroup,
  Alert,
  LoadingState,
  Badge,
  PrintedApplicationForm,
  ApplicationFormData,
  DatePicker,
} from "@/components";
import { ImageUpload } from "@/components/ui/image-upload";
import { SCHOOL_PROFILE } from "@/lib/constants";
import { parseFullName } from "@/lib/utils/name_parser";

interface ProgrammeOption {
  id: string;
  name: string;
  code: string;
  isMainAcademic: boolean;
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
}

export default function AdminStudentEnrollPage() {
  const router = useRouter();

  // Reference Data
  const [programmes, setProgrammes] = useState<ProgrammeOption[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [sessions, setSessions] = useState<SessionOption[]>([]);
  const [loadingRefData, setLoadingRefData] = useState(true);

  // Workflow State: 'FILL' | 'REVIEW' | 'SUCCESS'
  const [step, setStep] = useState<"FILL" | "REVIEW" | "SUCCESS">("FILL");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [enrolledResult, setEnrolledResult] = useState<{
    admissionNumber: string;
    studentName: string;
    guardianEmail: string;
    className: string;
  } | null>(null);

  // Form State structured identically to the Official Physical Form (Image 2)
  const [formData, setFormData] = useState({
    // Section 1: Student's Details
    studentFullName: "",
    studentAddress: "",
    gender: "MALE" as "MALE" | "FEMALE",
    dateOfBirth: "",
    placeOfBirth: "",
    stateOfOrigin: "",
    lga: "",
    nationality: "Nigerian",
    specialAttention: "",
    additionalInformation: "",
    passportPhotoUrl: "",
    profilePhotoId: "",

    // Section 2: Guardian's Details
    guardianFullName: "",
    relationshipType: "FATHER" as "FATHER" | "MOTHER" | "LEGAL_GUARDIAN" | "SPONSOR",
    guardianOccupation: "",
    guardianAddress: "",
    guardianPhone: "",
    guardianEmail: "",

    // Section 3: For Office Use Only / Academic Placement
    academicSessionId: "",
    programmeId: "",
    schoolClassId: "",
    additionalProgrammeIds: [] as string[],
  });

  // Load Reference Data
  useEffect(() => {
    Promise.all([
      fetch("/api/admin/programmes?includeInactive=false").then((r) => r.json()).catch(() => ({})),
      fetch("/api/admin/classes?includeInactive=false").then((r) => r.json()).catch(() => ({})),
      fetch("/api/admin/academic/sessions").then((r) => r.json()).catch(() => ({})),
    ])
      .then(([progsData, classesData, sessionsData]) => {
        const progsList: ProgrammeOption[] = Array.isArray(progsData.items) ? progsData.items : [];
        const classesList: ClassOption[] = Array.isArray(classesData.items) ? classesData.items : [];
        const sessionsList: SessionOption[] = Array.isArray(sessionsData.sessions)
          ? sessionsData.sessions
          : Array.isArray(sessionsData.items)
          ? sessionsData.items
          : [];

        setProgrammes(progsList);
        setClasses(classesList);
        setSessions(sessionsList);

        const defaultProg = progsList[0];
        const defaultClass = classesList.find((c) => c.programmeId === defaultProg?.id) || classesList[0];
        const currentSession = sessionsList.find((s) => s.isCurrent) || sessionsList[0];

        setFormData((prev) => ({
          ...prev,
          programmeId: defaultProg?.id || "",
          schoolClassId: defaultClass?.id || "",
          academicSessionId: currentSession?.id || "",
        }));

        setLoadingRefData(false);
      })
      .catch(() => {
        setLoadingRefData(false);
      });
  }, []);

  const handleProceedToReview = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validation
    if (!formData.studentFullName.trim()) {
      setFormError("Pupil full name is required.");
      return;
    }

    if (!formData.dateOfBirth) {
      setFormError("Pupil date of birth is required.");
      return;
    }

    if (!formData.guardianFullName.trim()) {
      setFormError("Guardian full name is required.");
      return;
    }

    if (!formData.guardianPhone.trim()) {
      setFormError("Guardian phone number is mandatory.");
      return;
    }

    if (!formData.guardianEmail.trim()) {
      setFormError("Guardian email address is mandatory for parent account creation and official correspondence.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.guardianEmail.trim())) {
      setFormError("Please enter a valid guardian email address.");
      return;
    }

    if (!formData.programmeId || !formData.schoolClassId) {
      setFormError("Academic Programme and School Class are mandatory.");
      return;
    }

    setStep("REVIEW");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleConfirmSubmit = async () => {
    setSubmitting(true);
    setFormError(null);

    try {
      const studentParsed = parseFullName(formData.studentFullName);
      const guardianParsed = parseFullName(formData.guardianFullName);

      const payload = {
        fullName: formData.studentFullName.trim(),
        firstName: studentParsed.firstName,
        lastName: studentParsed.lastName,
        otherNames: studentParsed.otherNames,
        gender: formData.gender,
        dateOfBirth: formData.dateOfBirth,
        allergies: formData.specialAttention.trim() || undefined,
        medicalNotes: [formData.specialAttention, formData.additionalInformation].filter(Boolean).join(" | ") || undefined,
        passportPhoto: formData.passportPhotoUrl || undefined,
        profilePhotoId: formData.profilePhotoId || undefined,

        guardianFullName: formData.guardianFullName.trim(),
        guardianFirstName: guardianParsed.firstName,
        guardianLastName: guardianParsed.lastName,
        guardianOtherNames: guardianParsed.otherNames,
        relationshipType: formData.relationshipType,
        guardianPhone: formData.guardianPhone.trim(),
        guardianEmail: formData.guardianEmail.trim(),
        residentialAddress: (formData.guardianAddress || formData.studentAddress).trim() || undefined,
        occupation: formData.guardianOccupation.trim() || undefined,

        academicSessionId: formData.academicSessionId || undefined,
        programmeId: formData.programmeId,
        schoolClassId: formData.schoolClassId,
        additionalProgrammeIds: formData.additionalProgrammeIds,
      };

      const res = await fetch("/api/admin/students/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Enrollment submission failed.");
      }

      const assignedClass = classes.find((c) => c.id === formData.schoolClassId);

      setEnrolledResult({
        admissionNumber: json.data?.admissionNumber || "Pending",
        studentName: formData.studentFullName.trim(),
        guardianEmail: formData.guardianEmail.trim(),
        className: assignedClass ? `${assignedClass.name} (${assignedClass.code})` : "Assigned Class",
      });
      setStep("SUCCESS");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Enrollment submission failed.");
      setStep("REVIEW");
    } finally {
      setSubmitting(false);
    }
  };

  // Helper getters
  const selectedProgObj = programmes.find((p) => p.id === formData.programmeId);
  const selectedClassObj = classes.find((c) => c.id === formData.schoolClassId);
  const availableClasses = classes.filter((c) => !formData.programmeId || c.programmeId === formData.programmeId);
  const additionalProgs = programmes.filter((p) => p.id !== formData.programmeId);

  const previewFormData: ApplicationFormData = {
    applicationNumber: enrolledResult?.admissionNumber || "OFFICIAL SIS ENROLLMENT",
    submissionDate: new Date().toLocaleDateString("en-GB"),
    studentFullName: formData.studentFullName,
    studentAddress: formData.studentAddress,
    className: selectedClassObj ? `${selectedClassObj.name} (${selectedClassObj.code})` : selectedProgObj?.name || "Nursery / Primary",
    gender: formData.gender === "MALE" ? "MALE" : "FEMALE",
    dateOfBirth: formData.dateOfBirth,
    placeOfBirth: formData.placeOfBirth,
    stateOfOrigin: formData.stateOfOrigin,
    lga: formData.lga,
    nationality: formData.nationality,
    specialAttention: formData.specialAttention || "NONE",
    additionalInformation: formData.additionalInformation,
    passportPhotoUrl: formData.passportPhotoUrl,

    guardianFullName: formData.guardianFullName,
    guardianRelationship: formData.relationshipType,
    guardianOccupation: formData.guardianOccupation,
    guardianAddress: formData.guardianAddress || formData.studentAddress,
    guardianPhone: formData.guardianPhone,
    guardianEmail: formData.guardianEmail,

    dateReceived: new Date().toLocaleDateString("en-GB"),
    classAdmitted: selectedClassObj ? selectedClassObj.name : "",
    admissionNumber: enrolledResult?.admissionNumber || "Auto-assigned upon confirmation",
    headmasterSign: "Swanford Registry",
  };

  if (loadingRefData) {
    return (
      <div className="py-12">
        <LoadingState message="Loading enrollment configuration..." />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Official School Header Bar */}
      <div className="no-print bg-white border border-[#EADBDA] rounded-xl p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
          <div className="w-16 h-16 shrink-0 bg-[#FDF2F4] border border-[#EADBDA] rounded-xl flex items-center justify-center p-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/swanford-logo.jpg"
              alt="Swanford Academy Crest"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-extrabold text-[#6B0B1A] tracking-tight uppercase font-serif">
              {SCHOOL_PROFILE.name}
            </h1>
            <p className="text-xs text-[#800020] font-semibold tracking-wide uppercase">
              {SCHOOL_PROFILE.subtitle}
            </p>
            <p className="text-xs text-stone-500 mt-0.5">
              {SCHOOL_PROFILE.address} &bull; Call: 09068897489 / 08060413439
            </p>
          </div>
          <div className="hidden sm:block text-right border-l border-stone-200 pl-4">
            <Badge variant="neutral">Official Enrollment</Badge>
            <p className="text-[11px] text-stone-400 mt-1 font-mono">Form SIS-ENR-2026</p>
          </div>
        </div>
      </div>

      {formError && (
        <div className="no-print">
          <Alert variant="error">
            <div className="flex flex-col gap-1">
              <strong className="font-semibold">Enrollment Notice:</strong>
              <span>{formError}</span>
            </div>
          </Alert>
        </div>
      )}

      {/* STEP 1: FORM FILL — PATTERN MATCHING THE PHYSICAL APPLICATION FORM STEP BY STEP */}
      {step === "FILL" && (
        <form onSubmit={handleProceedToReview} className="space-y-6">
          {/* SECTION 1: STUDENT'S DETAILS (Matching Image 2 Section 1) */}
          <Card className="border-[#EADBDA] overflow-hidden">
            <div className="bg-[#6B0B1A] text-white px-5 py-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm sm:text-base font-extrabold uppercase tracking-wide">
                  STUDENT&apos;S DETAILS
                </h2>
                <p className="text-[11px] text-rose-200">
                  Section 1: Pupil legal particulars and identification
                </p>
              </div>
              <Badge variant="neutral" size="sm" className="bg-rose-900/60 text-white border-rose-700">
                Official Form Standard
              </Badge>
            </div>

            <CardContent className="p-5 sm:p-6 space-y-4">
              {/* Full Name Single Box */}
              <FormGroup
                label="Pupil Full Name"
                required
                hint="Write the pupil's complete full name (e.g. Bilkisu Usman Muhammed) in this single box."
              >
                <Input
                  required
                  placeholder="e.g. Bilkisu Usman Muhammed"
                  value={formData.studentFullName}
                  onChange={(e) => setFormData({ ...formData, studentFullName: e.target.value })}
                  className="text-base font-semibold"
                />
              </FormGroup>

              {/* Address */}
              <FormGroup label="Address" required hint="Home or street address of the pupil">
                <Input
                  required
                  placeholder="e.g. No 11 Kasarau Street, Dutse, Jigawa State"
                  value={formData.studentAddress}
                  onChange={(e) => setFormData({ ...formData, studentAddress: e.target.value })}
                />
              </FormGroup>

              {/* Class, Gender, Date of Birth */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormGroup label="Class *" required>
                  <select
                    className="w-full h-11 px-3 rounded-lg border border-stone-300 bg-white text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#800020]"
                    value={formData.schoolClassId}
                    onChange={(e) => setFormData({ ...formData, schoolClassId: e.target.value })}
                    required
                  >
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.code})
                      </option>
                    ))}
                  </select>
                </FormGroup>

                <FormGroup label="Gender *" required>
                  <select
                    className="w-full h-11 px-3 rounded-lg border border-stone-300 bg-white text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#800020]"
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value as "MALE" | "FEMALE" })}
                    required
                  >
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                  </select>
                </FormGroup>

                <FormGroup label="Date of Birth *" required hint="Type date (e.g. 15/04/2018) or click calendar to pick year, month and day">
                  <DatePicker
                    required
                    value={formData.dateOfBirth}
                    onChange={(val) => setFormData({ ...formData, dateOfBirth: val })}
                    placeholder="YYYY-MM-DD or DD/MM/YYYY"
                  />
                </FormGroup>
              </div>

              {/* Place of Birth & State of Origin */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormGroup label="Place of Birth">
                  <Input
                    placeholder="e.g. Dutse"
                    value={formData.placeOfBirth}
                    onChange={(e) => setFormData({ ...formData, placeOfBirth: e.target.value })}
                  />
                </FormGroup>

                <FormGroup label="State of Origin">
                  <Input
                    placeholder="e.g. Adamawa / Jigawa / Kano"
                    value={formData.stateOfOrigin}
                    onChange={(e) => setFormData({ ...formData, stateOfOrigin: e.target.value })}
                  />
                </FormGroup>
              </div>

              {/* LGA & Nationality */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormGroup label="Local Govt. (LGA)">
                  <Input
                    placeholder="e.g. Yola North / Dutse"
                    value={formData.lga}
                    onChange={(e) => setFormData({ ...formData, lga: e.target.value })}
                  />
                </FormGroup>

                <FormGroup label="Nationality (foreigners only)" hint="Default: Nigerian">
                  <Input
                    placeholder="Nigerian (or enter nationality)"
                    value={formData.nationality}
                    onChange={(e) => setFormData({ ...formData, nationality: e.target.value })}
                  />
                </FormGroup>
              </div>

              {/* Special Attention & Additional Information */}
              <FormGroup label="Special Attention (e.g: Illness)" hint="Optional — Allergies, asthma, or medical needs">
                <Input
                  placeholder="e.g. None / Asthma / Food allergy"
                  value={formData.specialAttention}
                  onChange={(e) => setFormData({ ...formData, specialAttention: e.target.value })}
                />
              </FormGroup>

              <FormGroup label="Additional Information" hint="Optional — Other particulars regarding the pupil">
                <Textarea
                  rows={2}
                  placeholder="Additional notes..."
                  value={formData.additionalInformation}
                  onChange={(e) => setFormData({ ...formData, additionalInformation: e.target.value })}
                />
              </FormGroup>

              {/* Passport Photo Upload */}
              <div className="pt-2">
                <ImageUpload
                  label="Pupil Passport Photograph"
                  helperText="Upload pupil portrait photo. This will appear in the top-right passport box of the official application record."
                  currentImageUrl={formData.passportPhotoUrl || undefined}
                  onUploadSuccess={(res) => {
                    setFormData((prev) => ({
                      ...prev,
                      passportPhotoUrl: res.url,
                      profilePhotoId: res.assetId,
                    }));
                  }}
                  onRemove={() => {
                    setFormData((prev) => ({
                      ...prev,
                      passportPhotoUrl: "",
                      profilePhotoId: "",
                    }));
                  }}
                />
              </div>
            </CardContent>
          </Card>

          {/* SECTION 2: GUARDIAN'S DETAILS (Matching Image 2 Section 2) */}
          <Card className="border-[#EADBDA] overflow-hidden">
            <div className="bg-[#6B0B1A] text-white px-5 py-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm sm:text-base font-extrabold uppercase tracking-wide">
                  GUARDIAN&apos;S DETAILS
                </h2>
                <p className="text-[11px] text-rose-200">
                  Section 2: Primary contact and parental credentials
                </p>
              </div>
            </div>

            <CardContent className="p-5 sm:p-6 space-y-4">
              {/* Guardian Full Name Single Box */}
              <FormGroup
                label="Guardian Full Name"
                required
                hint="Write the guardian's complete full name (e.g. Usman Muhammed) in this single box."
              >
                <Input
                  required
                  placeholder="e.g. Usman Muhammed"
                  value={formData.guardianFullName}
                  onChange={(e) => setFormData({ ...formData, guardianFullName: e.target.value })}
                  className="text-base font-semibold"
                />
              </FormGroup>

              {/* Relationship & Occupation */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormGroup label="Relationship *" required>
                  <select
                    className="w-full h-11 px-3 rounded-lg border border-stone-300 bg-white text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#800020]"
                    value={formData.relationshipType}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        relationshipType: e.target.value as "FATHER" | "MOTHER" | "LEGAL_GUARDIAN" | "SPONSOR",
                      })
                    }
                    required
                  >
                    <option value="FATHER">Father</option>
                    <option value="MOTHER">Mother</option>
                    <option value="LEGAL_GUARDIAN">Legal Guardian</option>
                    <option value="SPONSOR">Sponsor</option>
                  </select>
                </FormGroup>

                <FormGroup label="Occupation" hint="e.g. Civil Servant, Engineer, Trader">
                  <Input
                    placeholder="e.g. Civil Servant"
                    value={formData.guardianOccupation}
                    onChange={(e) => setFormData({ ...formData, guardianOccupation: e.target.value })}
                  />
                </FormGroup>
              </div>

              {/* Address */}
              <FormGroup label="Address" hint="Guardian's residential or workplace address">
                <Input
                  placeholder="e.g. Federal University Dutse, Faculty of Education"
                  value={formData.guardianAddress}
                  onChange={(e) => setFormData({ ...formData, guardianAddress: e.target.value })}
                />
              </FormGroup>

              {/* Phone & Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormGroup label="Phone No *" required hint="Primary emergency & SMS alerts number">
                  <Input
                    type="tel"
                    required
                    placeholder="e.g. 08035671947"
                    value={formData.guardianPhone}
                    onChange={(e) => setFormData({ ...formData, guardianPhone: e.target.value })}
                  />
                </FormGroup>

                <FormGroup label="Email Address *" required hint="Mandatory for parent account and official invoices">
                  <Input
                    type="email"
                    required
                    placeholder="e.g. usman.muhammed@example.com"
                    value={formData.guardianEmail}
                    onChange={(e) => setFormData({ ...formData, guardianEmail: e.target.value })}
                  />
                </FormGroup>
              </div>
            </CardContent>
          </Card>

          {/* SECTION 3: FOR OFFICE USE ONLY / ACADEMIC PLACEMENT (Matching Image 2 Section 3) */}
          <Card className="border-[#EADBDA] overflow-hidden">
            <div className="bg-[#6B0B1A] text-white px-5 py-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm sm:text-base font-extrabold uppercase tracking-wide">
                  FOR OFFICE USE ONLY &bull; ACADEMIC PLACEMENT
                </h2>
                <p className="text-[11px] text-rose-200">
                  Section 3: Academic session, main division, and simultaneous tracks
                </p>
              </div>
            </div>

            <CardContent className="p-5 sm:p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormGroup label="Academic Session *" required>
                  <select
                    className="w-full h-11 px-3 rounded-lg border border-stone-300 bg-white text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#800020]"
                    value={formData.academicSessionId}
                    onChange={(e) => setFormData({ ...formData, academicSessionId: e.target.value })}
                    required
                  >
                    {sessions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.isCurrent ? "(Current)" : ""}
                      </option>
                    ))}
                  </select>
                </FormGroup>

                <FormGroup label="Main Academic Programme *" required>
                  <select
                    className="w-full h-11 px-3 rounded-lg border border-stone-300 bg-white text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#800020]"
                    value={formData.programmeId}
                    onChange={(e) => {
                      const newProgId = e.target.value;
                      const validClass = classes.find((c) => c.programmeId === newProgId);
                      setFormData({
                        ...formData,
                        programmeId: newProgId,
                        schoolClassId: validClass?.id || "",
                        additionalProgrammeIds: formData.additionalProgrammeIds.filter((id) => id !== newProgId),
                      });
                    }}
                    required
                  >
                    {programmes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.code})
                      </option>
                    ))}
                  </select>
                </FormGroup>
              </div>

              {/* Concurrent Programmes (e.g. Tahfeez) */}
              {additionalProgs.length > 0 && (
                <div className="pt-3 border-t border-stone-100">
                  <p className="text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                    Concurrent Programme Enrollment (Optional)
                  </p>
                  <p className="text-xs text-stone-500 mb-3">
                    Check if the pupil is enrolled concurrently in another division (e.g. Standalone Tahfeez).
                  </p>
                  <div className="flex flex-wrap gap-4">
                    {additionalProgs.map((prog) => {
                      const isChecked = formData.additionalProgrammeIds.includes(prog.id);
                      return (
                        <label
                          key={prog.id}
                          className={`flex items-center gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${
                            isChecked
                              ? "bg-[#FDF2F4] border-[#800020] text-[#800020]"
                              : "bg-white border-stone-200 text-stone-800 hover:bg-stone-50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="w-4 h-4 text-[#800020] rounded border-stone-300 focus:ring-[#800020]"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData({
                                  ...formData,
                                  additionalProgrammeIds: [...formData.additionalProgrammeIds, prog.id],
                                });
                              } else {
                                setFormData({
                                  ...formData,
                                  additionalProgrammeIds: formData.additionalProgrammeIds.filter((id) => id !== prog.id),
                                });
                              }
                            }}
                          />
                          <span className="text-sm font-semibold">{prog.name}</span>
                          <span className="text-xs opacity-70">({prog.code})</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Action Footer */}
          <div className="flex items-center justify-between pt-2">
            <Link href="/admin/students">
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </Link>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="min-w-[200px] bg-[#6B0B1A] hover:bg-[#5B0612] text-white font-bold"
            >
              Review Official Form &rarr;
            </Button>
          </div>
        </form>
      )}

      {/* STEP 2: OFFICIAL FORM REVIEW — EXHIBITS EXACT DESIGN OF IMAGE 2 */}
      {step === "REVIEW" && (
        <div className="space-y-6">
          <div className="no-print bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs sm:text-sm text-amber-900 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <strong>Official Form Verification:</strong> Inspect the complete application record below.
              Confirming will create the permanent student record in PostgreSQL and generate the official admission number.
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button type="button" variant="outline" size="sm" onClick={() => setStep("FILL")} disabled={submitting}>
                Edit Particulars
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleConfirmSubmit}
                disabled={submitting}
                className="bg-[#6B0B1A] hover:bg-[#5B0612] text-white px-6 font-bold"
              >
                {submitting ? "Enrolling..." : "Confirm & Enroll Pupil"}
              </Button>
            </div>
          </div>

          {/* Render the Exact Replica of Image 2 */}
          <PrintedApplicationForm data={previewFormData} onPrint={() => window.print()} />

          {/* Bottom Actions */}
          <div className="no-print flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full sm:w-auto font-medium min-h-[44px]"
              onClick={() => setStep("FILL")}
              disabled={submitting}
            >
              &larr; Back to Edit Details
            </Button>
            <Button
              type="button"
              variant="primary"
              size="lg"
              className="w-full sm:w-auto sm:min-w-[240px] font-bold min-h-[44px] bg-[#6B0B1A] hover:bg-[#5B0612] text-white"
              onClick={handleConfirmSubmit}
              disabled={submitting}
            >
              {submitting ? "Enrolling Pupil in PostgreSQL..." : "Confirm & Submit Enrollment"}
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3: SUCCESS STATE WITH OFFICIAL FORM PRINTING CAPABILITY */}
      {step === "SUCCESS" && enrolledResult && (
        <div className="space-y-6">
          {/* Success Banner */}
          <Card className="no-print border-2 border-emerald-300 bg-emerald-50/40">
            <CardContent className="p-6 text-center space-y-4">
              <div className="w-14 h-14 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
                ✓
              </div>
              <div>
                <h2 className="text-2xl font-extrabold text-stone-900 font-serif">
                  Pupil Officially Enrolled
                </h2>
                <p className="text-xs sm:text-sm text-stone-600 mt-1">
                  Permanent student record created with official admission number{" "}
                  <strong className="font-mono text-[#6B0B1A] text-base">{enrolledResult.admissionNumber}</strong>.
                  Parent account provisioned for <strong>{enrolledResult.guardianEmail}</strong>.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  onClick={() => window.print()}
                  className="bg-[#6B0B1A] hover:bg-[#5B0612] text-white flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H7a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Print Official Form / Record
                </Button>

                <Button
                  variant="outline"
                  size="md"
                  onClick={() => {
                    setFormData((prev) => ({
                      ...prev,
                      studentFullName: "",
                      studentAddress: "",
                      dateOfBirth: "",
                      placeOfBirth: "",
                      stateOfOrigin: "",
                      lga: "",
                      nationality: "Nigerian",
                      specialAttention: "",
                      additionalInformation: "",
                      passportPhotoUrl: "",
                      profilePhotoId: "",
                      guardianFullName: "",
                      guardianOccupation: "",
                      guardianAddress: "",
                      guardianPhone: "",
                      guardianEmail: "",
                      additionalProgrammeIds: [],
                    }));
                    setEnrolledResult(null);
                    setStep("FILL");
                  }}
                >
                  Enroll Another Pupil
                </Button>

                <Link href="/admin/students">
                  <Button variant="outline" size="md">
                    View Students Directory &rarr;
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Render the Exact Replica of Image 2 with assigned Admission Number */}
          <PrintedApplicationForm
            data={{
              ...previewFormData,
              admissionNumber: enrolledResult.admissionNumber,
              classAdmitted: enrolledResult.className,
            }}
            onPrint={() => window.print()}
          />
        </div>
      )}
    </div>
  );
}

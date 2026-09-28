"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Button,
  Input,
  Select,
  FormGroup,
  Alert,
  LoadingState,
  Badge,
} from "@/components";
import { ImageUpload } from "@/components/ui/image-upload";
import { SCHOOL_PROFILE } from "@/lib/constants";

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
  } | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    // Student Information
    firstName: "",
    lastName: "",
    otherNames: "",
    gender: "MALE" as "MALE" | "FEMALE",
    dateOfBirth: "",
    allergies: "",
    medicalNotes: "",
    passportPhotoUrl: "",
    profilePhotoId: "",

    // Parent / Guardian Information
    guardianFirstName: "",
    guardianLastName: "",
    relationshipType: "LEGAL_GUARDIAN" as "FATHER" | "MOTHER" | "LEGAL_GUARDIAN" | "SPONSOR",
    guardianPhone: "",
    guardianEmail: "",
    residentialAddress: "",

    // Academic Information
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
    if (!formData.firstName.trim() || !formData.lastName.trim()) {
      setFormError("Pupil first name and last name are required.");
      return;
    }

    if (!formData.dateOfBirth) {
      setFormError("Pupil date of birth is required.");
      return;
    }

    if (!formData.guardianFirstName.trim() || !formData.guardianLastName.trim()) {
      setFormError("Guardian first name and last name are required.");
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
      const payload = {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        otherNames: formData.otherNames.trim() || undefined,
        gender: formData.gender,
        dateOfBirth: formData.dateOfBirth,
        allergies: formData.allergies.trim() || undefined,
        medicalNotes: formData.medicalNotes.trim() || undefined,
        passportPhoto: formData.passportPhotoUrl || undefined,
        profilePhotoId: formData.profilePhotoId || undefined,

        guardianFirstName: formData.guardianFirstName.trim(),
        guardianLastName: formData.guardianLastName.trim(),
        relationshipType: formData.relationshipType,
        guardianPhone: formData.guardianPhone.trim(),
        guardianEmail: formData.guardianEmail.trim(),
        residentialAddress: formData.residentialAddress.trim() || undefined,

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

      setEnrolledResult({
        admissionNumber: json.data?.admissionNumber || "Pending",
        studentName: `${formData.firstName} ${formData.lastName}`,
        guardianEmail: formData.guardianEmail.trim(),
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
      <div className="bg-white border border-[#EADBDA] rounded-xl p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
          <div className="w-16 h-16 shrink-0 bg-[#FDF2F4] border border-[#EADBDA] rounded-xl flex items-center justify-center p-1">
            <img
              src="/images/swanford-logo.jpg"
              alt="Swanford Academy Crest"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-extrabold text-stone-900 tracking-tight uppercase font-display">
              {SCHOOL_PROFILE.name}
            </h1>
            <p className="text-xs text-[#800020] font-semibold tracking-wide uppercase">
              {SCHOOL_PROFILE.subtitle}
            </p>
            <p className="text-xs text-stone-500 mt-0.5">
              {SCHOOL_PROFILE.address}
            </p>
          </div>
          <div className="hidden sm:block text-right border-l border-stone-200 pl-4">
            <Badge variant="neutral">Official Enrollment</Badge>
            <p className="text-[11px] text-stone-400 mt-1 font-mono">Form SIS-ENR-2026</p>
          </div>
        </div>
      </div>

      {formError && (
        <Alert variant="error">
          <div className="flex flex-col gap-1">
            <strong className="font-semibold">Enrollment Notice:</strong>
            <span>{formError}</span>
          </div>
        </Alert>
      )}

      {/* STEP 1: FORM FILL */}
      {step === "FILL" && (
        <form onSubmit={handleProceedToReview} className="space-y-6">
          {/* Section 1: Student Information */}
          <Card>
            <CardHeader className="border-b border-stone-100 bg-stone-50/50">
              <CardTitle className="text-base font-bold text-stone-900">
                1. Pupil Information
              </CardTitle>
              <CardDescription>
                Official identification, demographic, and medical particulars.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormGroup label="First Name" required>
                  <Input
                    required
                    placeholder="e.g. Ibrahim"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  />
                </FormGroup>

                <FormGroup label="Last Name (Surname)" required>
                  <Input
                    required
                    placeholder="e.g. Musa"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  />
                </FormGroup>

                <FormGroup label="Other Names">
                  <Input
                    placeholder="e.g. Al-Amin"
                    value={formData.otherNames}
                    onChange={(e) => setFormData({ ...formData, otherNames: e.target.value })}
                  />
                </FormGroup>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormGroup label="Gender" required>
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

                <FormGroup label="Date of Birth" required>
                  <Input
                    type="date"
                    required
                    value={formData.dateOfBirth}
                    onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                  />
                </FormGroup>
              </div>

              {/* Passport Photo Upload with Client-Side Compression */}
              <div className="pt-2">
                <ImageUpload
                  label="Pupil Passport Photograph"
                  helperText="Take photo with camera or choose from device gallery. Automatically compressed for high clarity and minimal storage."
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

              {/* Medical Information */}
              <div className="pt-2 border-t border-stone-100">
                <p className="text-xs font-bold text-stone-700 uppercase tracking-wider mb-3">
                  Medical &amp; Clinical Notes (Optional)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormGroup label="Known Allergies">
                    <Input
                      placeholder="e.g. Groundnuts, Penicillin, Dust (or None)"
                      value={formData.allergies}
                      onChange={(e) => setFormData({ ...formData, allergies: e.target.value })}
                    />
                  </FormGroup>

                  <FormGroup label="Special Clinical / Dietary Notes">
                    <Input
                      placeholder="e.g. Asthmatic inhaler required (or None)"
                      value={formData.medicalNotes}
                      onChange={(e) => setFormData({ ...formData, medicalNotes: e.target.value })}
                    />
                  </FormGroup>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 2: Parent / Guardian Information */}
          <Card>
            <CardHeader className="border-b border-stone-100 bg-stone-50/50">
              <CardTitle className="text-base font-bold text-stone-900">
                2. Parent / Guardian Information
              </CardTitle>
              <CardDescription>
                Primary legal contact. Required for the secure Parent Portal and official notices.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-lg text-xs text-amber-800">
                <strong className="font-semibold">Parent Email Policy:</strong> A unique email address is mandatory. If the parent already has an account for another sibling, this child will automatically link to the existing family account. If new, a welcome activation email will be dispatched.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormGroup label="Parent First Name" required>
                  <Input
                    required
                    placeholder="e.g. Usman"
                    value={formData.guardianFirstName}
                    onChange={(e) => setFormData({ ...formData, guardianFirstName: e.target.value })}
                  />
                </FormGroup>

                <FormGroup label="Parent Last Name" required>
                  <Input
                    required
                    placeholder="e.g. Musa"
                    value={formData.guardianLastName}
                    onChange={(e) => setFormData({ ...formData, guardianLastName: e.target.value })}
                  />
                </FormGroup>

                <FormGroup label="Relationship" required>
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
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormGroup label="Parent Email Address (MANDATORY)" required>
                  <Input
                    type="email"
                    required
                    placeholder="e.g. u.musa@example.com"
                    value={formData.guardianEmail}
                    onChange={(e) => setFormData({ ...formData, guardianEmail: e.target.value })}
                  />
                </FormGroup>

                <FormGroup label="Parent Phone Number" required>
                  <Input
                    type="tel"
                    required
                    placeholder="e.g. 08031234567"
                    value={formData.guardianPhone}
                    onChange={(e) => setFormData({ ...formData, guardianPhone: e.target.value })}
                  />
                </FormGroup>
              </div>

              <FormGroup label="Residential Address">
                <Input
                  placeholder="e.g. No. 12 Sardauna Crescent, Kaduna"
                  value={formData.residentialAddress}
                  onChange={(e) => setFormData({ ...formData, residentialAddress: e.target.value })}
                />
              </FormGroup>
            </CardContent>
          </Card>

          {/* Section 3: Academic Placement */}
          <Card>
            <CardHeader className="border-b border-stone-100 bg-stone-50/50">
              <CardTitle className="text-base font-bold text-stone-900">
                3. Academic Placement &amp; Programmes
              </CardTitle>
              <CardDescription>
                Assign the pupil to their main academic programme and class, with multi-programme support.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormGroup label="Academic Session" required>
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

                <FormGroup label="Main Programme" required>
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

                <FormGroup label="School Class" required>
                  <select
                    className="w-full h-11 px-3 rounded-lg border border-stone-300 bg-white text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#800020]"
                    value={formData.schoolClassId}
                    onChange={(e) => setFormData({ ...formData, schoolClassId: e.target.value })}
                    required
                  >
                    {availableClasses.length === 0 ? (
                      <option value="" disabled>No classes in this programme</option>
                    ) : (
                      availableClasses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.code})
                        </option>
                      ))
                    )}
                  </select>
                </FormGroup>
              </div>

              {/* Multi-Programme Enrollment (e.g. Primary + Tahfeez) */}
              {additionalProgs.length > 0 && (
                <div className="pt-3 border-t border-stone-100">
                  <p className="text-xs font-bold text-stone-700 uppercase tracking-wider mb-2">
                    Additional Simultaneous Programme(s)
                  </p>
                  <p className="text-xs text-stone-500 mb-3">
                    Select if the student is also enrolled concurrently in another division (e.g. Tahfeez). A single student record will be maintained.
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
          <div className="flex items-center justify-between pt-4">
            <Link href="/admin/students">
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </Link>
            <Button type="submit" variant="primary" size="lg" className="min-w-[180px]">
              Review Official Form &rarr;
            </Button>
          </div>
        </form>
      )}

      {/* STEP 2: OFFICIAL FORM REVIEW (Requirement 16) */}
      {step === "REVIEW" && (
        <div className="space-y-6">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 flex items-center justify-between">
            <p>
              <strong>Review Stage:</strong> Please inspect the details below carefully before final registration. Clicking <em>Confirm &amp; Submit</em> will permanently record the pupil in PostgreSQL and trigger parent account onboarding.
            </p>
          </div>

          {/* Official Document Sheet */}
          <div className="bg-white border-2 border-stone-300 rounded-xl p-6 sm:p-8 shadow-md space-y-6">
            {/* Sheet Header */}
            <div className="flex items-start justify-between border-b-2 border-stone-800 pb-5">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 bg-white border border-stone-300 rounded-lg p-1">
                  <img src="/images/swanford-logo.jpg" alt="Swanford Logo" className="w-full h-full object-contain" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-stone-900 uppercase tracking-tight font-display">
                    {SCHOOL_PROFILE.name}
                  </h2>
                  <p className="text-xs text-[#800020] font-bold uppercase">{SCHOOL_PROFILE.subtitle}</p>
                  <p className="text-[11px] text-stone-500 italic">&ldquo;{SCHOOL_PROFILE.motto}&rdquo;</p>
                </div>
              </div>

              {/* Passport Photo Area */}
              <div className="w-24 h-28 border-2 border-dashed border-stone-400 rounded-lg flex items-center justify-center bg-stone-50 text-center p-2">
                {formData.passportPhotoUrl ? (
                  <img
                    src={formData.passportPhotoUrl}
                    alt="Pupil Passport"
                    className="w-full h-full object-cover rounded"
                  />
                ) : (
                  <div className="text-[10px] text-stone-400 font-medium">
                    Passport Photo
                  </div>
                )}
              </div>
            </div>

            {/* Title */}
            <div className="text-center py-1 bg-stone-100 rounded text-xs font-bold uppercase tracking-wider text-stone-800">
              Official Pupil Enrollment Record — Admission Preview
            </div>

            {/* Review Sections */}
            <div className="space-y-5 text-sm">
              {/* 1. Pupil Details */}
              <div>
                <h3 className="text-xs font-bold text-[#800020] uppercase tracking-wider border-b border-stone-200 pb-1 mb-2">
                  1. Pupil Identity &amp; Health Particulars
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-stone-400 block font-medium">Full Name:</span>
                    <span className="font-bold text-stone-900 text-sm">
                      {formData.lastName}, {formData.firstName} {formData.otherNames}
                    </span>
                  </div>
                  <div>
                    <span className="text-stone-400 block font-medium">Gender:</span>
                    <span className="font-semibold text-stone-900">{formData.gender}</span>
                  </div>
                  <div>
                    <span className="text-stone-400 block font-medium">Date of Birth:</span>
                    <span className="font-semibold text-stone-900">{formData.dateOfBirth}</span>
                  </div>
                </div>
                {(formData.allergies || formData.medicalNotes) && (
                  <div className="mt-2 p-2 bg-stone-50 rounded text-xs text-stone-700">
                    <span className="font-medium">Allergies / Notes: </span>
                    {formData.allergies && <span className="text-amber-800 font-semibold">{formData.allergies}. </span>}
                    {formData.medicalNotes && <span>{formData.medicalNotes}</span>}
                  </div>
                )}
              </div>

              {/* 2. Guardian Details */}
              <div>
                <h3 className="text-xs font-bold text-[#800020] uppercase tracking-wider border-b border-stone-200 pb-1 mb-2">
                  2. Parent / Guardian Particulars
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-stone-400 block font-medium">Guardian Name:</span>
                    <span className="font-bold text-stone-900">
                      {formData.guardianFirstName} {formData.guardianLastName}
                    </span>
                  </div>
                  <div>
                    <span className="text-stone-400 block font-medium">Relationship:</span>
                    <span className="font-semibold text-stone-900">{formData.relationshipType}</span>
                  </div>
                  <div>
                    <span className="text-stone-400 block font-medium">Phone Number:</span>
                    <span className="font-semibold text-stone-900">{formData.guardianPhone}</span>
                  </div>
                  <div>
                    <span className="text-stone-400 block font-medium">Email (Mandatory):</span>
                    <span className="font-semibold text-[#800020] font-mono">{formData.guardianEmail}</span>
                  </div>
                </div>
                {formData.residentialAddress && (
                  <div className="mt-2 text-xs text-stone-600">
                    <span className="text-stone-400 font-medium">Address: </span>
                    {formData.residentialAddress}
                  </div>
                )}
              </div>

              {/* 3. Academic Placement */}
              <div>
                <h3 className="text-xs font-bold text-[#800020] uppercase tracking-wider border-b border-stone-200 pb-1 mb-2">
                  3. Academic Curriculum &amp; Placement
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-stone-400 block font-medium">Main Programme:</span>
                    <span className="font-bold text-stone-900">
                      {selectedProgObj?.name} ({selectedProgObj?.code})
                    </span>
                  </div>
                  <div>
                    <span className="text-stone-400 block font-medium">Assigned Class:</span>
                    <span className="font-bold text-stone-900 text-sm">
                      {selectedClassObj?.name} ({selectedClassObj?.code})
                    </span>
                  </div>
                  <div>
                    <span className="text-stone-400 block font-medium">Concurrent Programmes:</span>
                    <span className="font-semibold text-stone-700">
                      {formData.additionalProgrammeIds.length > 0
                        ? formData.additionalProgrammeIds
                            .map((id) => programmes.find((p) => p.id === id)?.name)
                            .filter(Boolean)
                            .join(", ")
                        : "None (Single Track)"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Official Certification Footer */}
            <div className="pt-4 border-t border-stone-200 flex flex-col sm:flex-row items-center justify-between text-[11px] text-stone-400">
              <p>Swanford Academy Student Information System &bull; Verified Institutional Record</p>
              <p>Date: {new Date().toLocaleDateString("en-GB")}</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full sm:w-auto font-medium min-h-[44px]"
              onClick={() => setStep("FILL")}
              disabled={submitting}
            >
              &larr; Back to Edit
            </Button>
            <Button
              type="button"
              variant="primary"
              size="lg"
              className="w-full sm:w-auto sm:min-w-[220px] font-bold min-h-[44px]"
              onClick={handleConfirmSubmit}
              disabled={submitting}
            >
              {submitting ? "Enrolling Pupil..." : "Confirm & Submit Enrollment"}
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3: SUCCESS STATE */}
      {step === "SUCCESS" && enrolledResult && (
        <Card className="border-2 border-emerald-200 bg-emerald-50/20">
          <CardContent className="p-8 text-center space-y-5">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
              ✓
            </div>
            <div>
              <h2 className="text-2xl font-extrabold text-stone-900 font-display">
                Pupil Officially Enrolled
              </h2>
              <p className="text-sm text-stone-600 mt-1">
                The student record and academic enrollments have been permanently recorded in PostgreSQL.
              </p>
            </div>

            <div className="max-w-md mx-auto bg-white p-4 rounded-xl border border-stone-200 shadow-xs text-left space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-stone-100">
                <span className="text-stone-500">Student Name:</span>
                <span className="font-bold text-stone-900">{enrolledResult.studentName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-100">
                <span className="text-stone-500">Admission Number:</span>
                <span className="font-mono font-bold text-[#800020] text-sm">
                  {enrolledResult.admissionNumber}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-stone-500">Parent Email (Account):</span>
                <span className="font-mono text-stone-800">{enrolledResult.guardianEmail}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
              <Button
                variant="outline"
                onClick={() => {
                  setFormData({
                    firstName: "",
                    lastName: "",
                    otherNames: "",
                    gender: "MALE",
                    dateOfBirth: "",
                    allergies: "",
                    medicalNotes: "",
                    passportPhotoUrl: "",
                    profilePhotoId: "",
                    guardianFirstName: "",
                    guardianLastName: "",
                    relationshipType: "LEGAL_GUARDIAN",
                    guardianPhone: "",
                    guardianEmail: "",
                    residentialAddress: "",
                    academicSessionId: sessions.find((s) => s.isCurrent)?.id || "",
                    programmeId: programmes[0]?.id || "",
                    schoolClassId: classes[0]?.id || "",
                    additionalProgrammeIds: [],
                  });
                  setEnrolledResult(null);
                  setStep("FILL");
                }}
              >
                Enroll Another Pupil
              </Button>
              <Link href="/admin/students">
                <Button variant="primary">
                  View Students Directory &rarr;
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

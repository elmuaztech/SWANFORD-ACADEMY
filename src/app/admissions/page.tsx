'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Navbar,
  PublicFooter,
  Card,
  CardContent,
  Button,
  Input,
  Select,
  Textarea,
  FormGroup,
  Alert,
  ImageUpload,
  Badge,
  LoadingState,
  PrintedApplicationForm,
  ApplicationFormData,
} from '@/components';
import { formatNaira } from '@/lib/money';
import { parseFullName } from '@/lib/utils/name_parser';

interface ProgrammeOption {
  id: string;
  name: string;
  code: string;
  isMainAcademic: boolean;
}

interface AdmissionCycleOption {
  id: string;
  name: string;
  code: string;
}

export default function PublicAdmissionPage() {
  // Step 1: Student's Details -> Step 2: Guardian's Details -> Step 3: Official Preview -> Step 4: Success / Print
  const [step, setStep] = useState<number>(1);
  const [cycles, setCycles] = useState<AdmissionCycleOption[]>([]);
  const [programmes, setProgrammes] = useState<ProgrammeOption[]>([]);
  const [formFeeKobo, setFormFeeKobo] = useState<string>('500000');
  const [isOpen, setIsOpen] = useState<boolean>(true);
  const [activeSessionName, setActiveSessionName] = useState<string>('');
  const [loadingOptions, setLoadingOptions] = useState(true);

  // Form State adhering to Official Physical Form (Image 2)
  const [formData, setFormData] = useState({
    admissionCycleId: '',
    selectedProgrammeIds: [] as string[],

    // Student's Details (Section 1)
    studentFullName: '',
    studentAddress: '',
    className: '',
    gender: 'MALE' as 'MALE' | 'FEMALE',
    dateOfBirth: '',
    placeOfBirth: '',
    stateOfOrigin: '',
    lga: '',
    nationality: 'Nigerian',
    specialAttention: '',
    additionalInformation: '',
    profilePhotoId: '',

    // Guardian's Details (Section 2)
    guardianFullName: '',
    guardianRelationship: 'FATHER',
    guardianOccupation: '',
    guardianAddress: '',
    guardianPhone: '',
    guardianEmail: '',
  });

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedApp, setSubmittedApp] = useState<{ id: string; applicationNumber: string } | null>(null);

  useEffect(() => {
    async function loadAdmissionOptions() {
      try {
        setLoadingOptions(true);
        const res = await fetch('/api/public/admission-options');
        if (res.ok) {
          const data = await res.json();
          setCycles(data.cycles || []);
          setProgrammes(data.programmes || []);
          setIsOpen(data.isOpen ?? (data.cycles && data.cycles.length > 0));
          setActiveSessionName(data.activeSessionName || '');
          if (data.formFeeKobo) setFormFeeKobo(data.formFeeKobo);
          if (data.cycles?.[0]?.id) {
            setFormData((prev) => ({ ...prev, admissionCycleId: data.cycles[0].id }));
          }
          if (data.programmes?.[0]?.id) {
            setFormData((prev) => ({
              ...prev,
              selectedProgrammeIds: [data.programmes[0].id],
              className: data.programmes[0].name,
            }));
          }
        }
      } catch {
        // Fallback quiet default
      } finally {
        setLoadingOptions(false);
      }
    }
    loadAdmissionOptions();
  }, []);

  const toggleProgramme = (progId: string) => {
    setFormData((prev) => {
      const exists = prev.selectedProgrammeIds.includes(progId);
      const updated = exists
        ? prev.selectedProgrammeIds.length === 1
          ? prev.selectedProgrammeIds
          : prev.selectedProgrammeIds.filter((id) => id !== progId)
        : [...prev.selectedProgrammeIds, progId];

      const firstSelectedProg = programmes.find((p) => updated.includes(p.id));
      return {
        ...prev,
        selectedProgrammeIds: updated,
        className: firstSelectedProg ? firstSelectedProg.name : prev.className,
      };
    });
  };

  const handleNextToGuardian = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSubmitError(null);

    if (!formData.studentFullName.trim()) {
      setSubmitError("Pupil full name is required.");
      return;
    }
    if (!formData.dateOfBirth) {
      setSubmitError("Pupil date of birth is required.");
      return;
    }
    if (formData.selectedProgrammeIds.length === 0) {
      setSubmitError("Please select at least one academic programme or class.");
      return;
    }

    setStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleNextToPreview = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSubmitError(null);

    if (!formData.guardianFullName.trim()) {
      setSubmitError("Parent / Guardian full name is required.");
      return;
    }
    if (!formData.guardianPhone.trim()) {
      setSubmitError("Parent / Guardian phone number is required.");
      return;
    }
    if (!formData.guardianEmail.trim()) {
      setSubmitError("Parent / Guardian email address is required for official communication.");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.guardianEmail.trim())) {
      setSubmitError("Please provide a valid email address.");
      return;
    }

    setStep(3);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleBack = () => {
    setSubmitError(null);
    setStep((prev) => Math.max(prev - 1, 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      if (!formData.admissionCycleId) {
        throw new Error('Please select an active admission cycle.');
      }

      const parsedStudent = parseFullName(formData.studentFullName);
      const parsedGuardian = parseFullName(formData.guardianFullName);

      const payload = {
        admissionCycleId: formData.admissionCycleId,
        applicantFullName: formData.studentFullName.trim(),
        applicantFirstName: parsedStudent.firstName,
        applicantLastName: parsedStudent.lastName,
        applicantOtherNames: parsedStudent.otherNames || null,
        applicantGender: formData.gender,
        applicantDob: formData.dateOfBirth,
        profilePhotoId: formData.profilePhotoId || null,

        // Physical Form Specific Fields
        applicantAddress: formData.studentAddress.trim() || null,
        placeOfBirth: formData.placeOfBirth.trim() || null,
        stateOfOrigin: formData.stateOfOrigin.trim() || null,
        lga: formData.lga.trim() || null,
        nationality: formData.nationality.trim() || null,
        specialAttention: formData.specialAttention.trim() || null,
        additionalInformation: formData.additionalInformation.trim() || null,

        guardianFullName: formData.guardianFullName.trim(),
        guardianFirstName: parsedGuardian.firstName,
        guardianLastName: parsedGuardian.lastName,
        guardianEmail: formData.guardianEmail.trim().toLowerCase(),
        guardianPhone: formData.guardianPhone.trim(),
        guardianRelationship: formData.guardianRelationship,
        guardianOccupation: formData.guardianOccupation.trim() || null,
        guardianAddress: formData.guardianAddress.trim() || formData.studentAddress.trim() || null,

        programmeSelections: formData.selectedProgrammeIds.map((pId) => ({
          programmeId: pId,
        })),
      };

      const res = await fetch('/api/admissions/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit admission application.');
      }

      setSubmittedApp({
        id: data.applicationId,
        applicationNumber: data.applicationNumber,
      });
      setStep(4);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Application submission failed.';
      setSubmitError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const previewFormData: ApplicationFormData = {
    applicationNumber: submittedApp?.applicationNumber || 'PENDING SUBMISSION',
    submissionDate: new Date().toLocaleDateString('en-GB'),
    studentFullName: formData.studentFullName,
    studentAddress: formData.studentAddress,
    className: formData.className || (programmes.find((p) => formData.selectedProgrammeIds.includes(p.id))?.name) || 'Nursery / Primary',
    gender: formData.gender === 'MALE' ? 'MALE' : 'FEMALE',
    dateOfBirth: formData.dateOfBirth,
    placeOfBirth: formData.placeOfBirth,
    stateOfOrigin: formData.stateOfOrigin,
    lga: formData.lga,
    nationality: formData.nationality,
    specialAttention: formData.specialAttention || 'NONE',
    additionalInformation: formData.additionalInformation,
    passportPhotoUrl: photoUrl,

    guardianFullName: formData.guardianFullName,
    guardianRelationship: formData.guardianRelationship,
    guardianOccupation: formData.guardianOccupation,
    guardianAddress: formData.guardianAddress || formData.studentAddress,
    guardianPhone: formData.guardianPhone,
    guardianEmail: formData.guardianEmail,

    dateReceived: submittedApp ? new Date().toLocaleDateString('en-GB') : '',
    classAdmitted: formData.className,
    admissionNumber: submittedApp ? `APP-${submittedApp.applicationNumber}` : '',
    headmasterSign: '',
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FDFBF7] text-[#1C1A1A] w-full max-w-full overflow-x-hidden">
      <div className="no-print">
        <Navbar currentPath="/admissions" />
      </div>

      <main className="flex-1 py-8 sm:py-12 w-full max-w-full overflow-x-hidden">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">

          {/* SUCCESS STATE — Shows the Exact Official Form with Print & Next Step Controls */}
          {step === 4 && submittedApp ? (
            <div className="space-y-6">
              {/* Success Notification Banner */}
              <div className="no-print bg-emerald-50 border-2 border-emerald-500 rounded-xl p-6 text-center space-y-3 shadow-xs">
                <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
                  ✓
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-[#5B0612]">
                  Application Successfully Registered!
                </h2>
                <p className="text-xs sm:text-sm text-stone-600 max-w-md mx-auto">
                  Your admission form has been received and given official registration reference{' '}
                  <strong className="font-mono text-[#5B0612] text-base">{submittedApp.applicationNumber}</strong>.
                  Please print or save your form copy below.
                </p>

                {/* Primary Action Buttons */}
                <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                  <Button
                    type="button"
                    variant="primary"
                    size="md"
                    onClick={() => window.print()}
                    className="bg-[#800020] hover:bg-[#5B0612] text-white flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H7a2 2 0 00-2 2v4h10z" />
                    </svg>
                    Print Application Form
                  </Button>

                  <Link href={`/admissions/pay?applicationId=${submittedApp.id}`}>
                    <Button variant="primary" size="md" className="bg-emerald-700 hover:bg-emerald-800 text-white">
                      Proceed to Application Fee Payment ({formatNaira(BigInt(formFeeKobo))})
                    </Button>
                  </Link>

                  <Link href="/admissions/status">
                    <Button variant="outline" size="md" className="border-stone-300">
                      Track Application Status
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Exact Paper Form View */}
              <PrintedApplicationForm data={previewFormData} onPrint={() => window.print()} />
            </div>
          ) : loadingOptions ? (
            <Card className="bg-white border-[#EADBDA] shadow-xs">
              <CardContent className="p-12">
                <LoadingState message="Loading Swanford Academy admission details..." />
              </CardContent>
            </Card>
          ) : !isOpen || cycles.length === 0 ? (
            /* CLOSED ADMISSIONS STATE */
            <Card className="bg-white border-[#EADBDA] shadow-xs">
              <CardContent className="p-8 sm:p-12 text-center space-y-6">
                <div className="w-16 h-16 bg-[#FDF2F4] text-[#800020] rounded-full flex items-center justify-center mx-auto shadow-inner">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div className="space-y-2 max-w-md mx-auto">
                  <Badge variant="neutral" size="md">Admissions Closed</Badge>
                  <h2 className="text-xl sm:text-2xl font-bold text-[#5B0612] mt-2">
                    Admissions for {activeSessionName || 'the Academic Session'} are currently closed.
                  </h2>
                  <p className="text-xs sm:text-sm text-[#524B46] leading-relaxed">
                    Online application submissions are not currently being accepted. Prospective parents may contact the school admissions office for information regarding upcoming enrollment sessions or scheduled campus visits.
                  </p>
                </div>
                <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                  <Link href="/contact" className="w-full sm:w-auto">
                    <Button variant="primary" size="md" className="w-full sm:w-auto bg-[#800020] hover:bg-[#5B0612] text-white">
                      Contact Admissions Office
                    </Button>
                  </Link>
                  <Link href="/admissions/status" className="w-full sm:w-auto">
                    <Button variant="outline" size="md" className="w-full sm:w-auto border-[#EADBDA]">
                      Track Existing Application
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ) : (
            /* ACTIVE APPLICATION WIZARD MATCHING OFFICIAL PHYSICAL FORM */
            <div className="space-y-6">
              {/* Portal Header Card */}
              <div className="no-print bg-white border border-[#EADBDA] rounded-xl p-5 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 bg-[#FDF2F4] border border-[#EADBDA] rounded-xl flex items-center justify-center p-1 shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/images/swanford-logo.jpg"
                      alt="Swanford Academy Logo"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div>
                    <h1 className="text-lg sm:text-xl font-extrabold text-[#6B0B1A] uppercase tracking-wide">
                      Swanford Nursery and Primary School
                    </h1>
                    <p className="text-xs text-stone-500">
                      Official Online Admission Application &bull; Academic Session {activeSessionName}
                    </p>
                  </div>
                </div>

                {/* Step Indicator */}
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${step === 1 ? 'bg-[#6B0B1A] text-white' : 'bg-stone-100 text-stone-600'}`}>
                    1. Student
                  </span>
                  <span className="text-stone-300">&rarr;</span>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${step === 2 ? 'bg-[#6B0B1A] text-white' : 'bg-stone-100 text-stone-600'}`}>
                    2. Guardian
                  </span>
                  <span className="text-stone-300">&rarr;</span>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${step === 3 ? 'bg-[#6B0B1A] text-white' : 'bg-stone-100 text-stone-600'}`}>
                    3. Official Form Preview
                  </span>
                </div>
              </div>

              {submitError && (
                <div className="no-print">
                  <Alert variant="error" title="Notice">
                    {submitError}
                  </Alert>
                </div>
              )}

              {/* STEP 1: STUDENT'S DETAILS */}
              {step === 1 && (
                <Card className="bg-white border-[#EADBDA] shadow-xs">
                  <div className="bg-[#6B0B1A] text-white px-5 py-3 rounded-t-xl flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-extrabold uppercase tracking-wide">
                        STUDENT&apos;S DETAILS
                      </h2>
                      <p className="text-[11px] text-rose-200">
                        Section 1 of the official admission application form
                      </p>
                    </div>
                    <Badge variant="neutral" size="sm" className="bg-rose-900/60 text-white border-rose-700">
                      Step 1 of 3
                    </Badge>
                  </div>

                  <CardContent className="p-6 space-y-5">
                    {/* Full Name (Single Box Supporting 3 names) */}
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
                        className="text-base font-medium"
                      />
                    </FormGroup>

                    {/* Address */}
                    <FormGroup label="Residential Address" required hint="Home or street address of the pupil">
                      <Input
                        required
                        placeholder="e.g. No 11 Kasarau Street, Dutse, Jigawa State"
                        value={formData.studentAddress}
                        onChange={(e) => setFormData({ ...formData, studentAddress: e.target.value })}
                      />
                    </FormGroup>

                    {/* Class, Gender, DOB */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <FormGroup label="Class Applying For" required>
                        <Select
                          value={formData.className}
                          onChange={(e) => {
                            const val = e.target.value;
                            const matchedProg = programmes.find((p) => p.name === val || p.id === val);
                            setFormData((prev) => ({
                              ...prev,
                              className: val,
                              selectedProgrammeIds: matchedProg ? [matchedProg.id] : prev.selectedProgrammeIds,
                            }));
                          }}
                        >
                          {programmes.map((p) => (
                            <option key={p.id} value={p.name}>
                              {p.name}
                            </option>
                          ))}
                        </Select>
                      </FormGroup>

                      <FormGroup label="Gender" required>
                        <Select
                          value={formData.gender}
                          onChange={(e) => setFormData({ ...formData, gender: e.target.value as 'MALE' | 'FEMALE' })}
                        >
                          <option value="MALE">Male</option>
                          <option value="FEMALE">Female</option>
                        </Select>
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

                    {/* Local Govt & Nationality */}
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

                    {/* Special Attention (e.g. Illness) & Additional Info */}
                    <FormGroup label="Special Attention (e.g: Illness)" hint="Optional - Note any allergies, asthma, or medical needs">
                      <Input
                        placeholder="e.g. None / Asthma / Food allergy"
                        value={formData.specialAttention}
                        onChange={(e) => setFormData({ ...formData, specialAttention: e.target.value })}
                      />
                    </FormGroup>

                    <FormGroup label="Additional Information" hint="Optional - Any other details the school should know">
                      <Textarea
                        rows={2}
                        placeholder="Any additional notes or instructions..."
                        value={formData.additionalInformation}
                        onChange={(e) => setFormData({ ...formData, additionalInformation: e.target.value })}
                      />
                    </FormGroup>

                    {/* Passport Photo Upload Box */}
                    <div className="border border-dashed border-[#EADBDA] rounded-xl p-4 bg-stone-50/50">
                      <ImageUpload
                        label="Student Passport Photo (Attaches to Official Application Form)"
                        extraFormData={{ targetType: 'STUDENT_PROFILE' }}
                        currentImageUrl={photoUrl || undefined}
                        onUploadSuccess={(res) => {
                          setFormData((prev) => ({ ...prev, profilePhotoId: res.assetId }));
                          setPhotoUrl(res.url);
                        }}
                        onRemove={() => {
                          setFormData((prev) => ({ ...prev, profilePhotoId: '' }));
                          setPhotoUrl(null);
                        }}
                      />
                    </div>

                    {/* Programme Multi-Selection (e.g. Add Tahfeez) */}
                    <div className="space-y-2 pt-2 border-t border-stone-200">
                      <label className="block text-xs font-bold uppercase text-stone-700">
                        Academic Programmes Selected:
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {programmes.map((p) => {
                          const isSelected = formData.selectedProgrammeIds.includes(p.id);
                          return (
                            <div
                              key={p.id}
                              onClick={() => toggleProgramme(p.id)}
                              className={`p-3 rounded-lg border cursor-pointer text-xs flex items-center justify-between transition-all ${
                                isSelected
                                  ? 'bg-[#FDF2F4] border-[#6B0B1A] font-bold text-[#6B0B1A]'
                                  : 'bg-white border-stone-200 text-stone-700 hover:border-stone-400'
                              }`}
                            >
                              <span>{p.name}</span>
                              <span>{isSelected ? '✓ Selected' : '+ Select'}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Step Navigation */}
                    <div className="flex justify-end pt-4 border-t border-stone-200">
                      <Button
                        type="button"
                        variant="primary"
                        size="md"
                        onClick={handleNextToGuardian}
                        className="bg-[#6B0B1A] hover:bg-[#5B0612] text-white px-8"
                      >
                        Continue to Guardian&apos;s Details &rarr;
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* STEP 2: GUARDIAN'S DETAILS */}
              {step === 2 && (
                <Card className="bg-white border-[#EADBDA] shadow-xs">
                  <div className="bg-[#6B0B1A] text-white px-5 py-3 rounded-t-xl flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-extrabold uppercase tracking-wide">
                        GUARDIAN&apos;S DETAILS
                      </h2>
                      <p className="text-[11px] text-rose-200">
                        Section 2 of the official admission application form
                      </p>
                    </div>
                    <Badge variant="neutral" size="sm" className="bg-rose-900/60 text-white border-rose-700">
                      Step 2 of 3
                    </Badge>
                  </div>

                  <CardContent className="p-6 space-y-5">
                    {/* Guardian Full Name (Single Box Supporting 3 names) */}
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
                        className="text-base font-medium"
                      />
                    </FormGroup>

                    {/* Relationship & Occupation */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormGroup label="Relationship to Pupil" required>
                        <Select
                          value={formData.guardianRelationship}
                          onChange={(e) => setFormData({ ...formData, guardianRelationship: e.target.value })}
                        >
                          <option value="FATHER">Father</option>
                          <option value="MOTHER">Mother</option>
                          <option value="LEGAL_GUARDIAN">Legal Guardian</option>
                          <option value="SPONSOR">Sponsor</option>
                          <option value="OTHER">Other Relative</option>
                        </Select>
                      </FormGroup>

                      <FormGroup label="Occupation" hint="e.g. Civil Servant, Engineer, Business Owner, Trader">
                        <Input
                          placeholder="e.g. Civil Servant"
                          value={formData.guardianOccupation}
                          onChange={(e) => setFormData({ ...formData, guardianOccupation: e.target.value })}
                        />
                      </FormGroup>
                    </div>

                    {/* Address */}
                    <FormGroup label="Guardian Residential / Work Address">
                      <Input
                        placeholder="e.g. Federal University Dutse, Faculty of Education"
                        value={formData.guardianAddress}
                        onChange={(e) => setFormData({ ...formData, guardianAddress: e.target.value })}
                      />
                    </FormGroup>

                    {/* Phone Number & Email Address */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormGroup label="Phone Number" required hint="Used for urgent school alerts and admission SMS">
                        <Input
                          type="tel"
                          required
                          placeholder="e.g. 08035671947"
                          value={formData.guardianPhone}
                          onChange={(e) => setFormData({ ...formData, guardianPhone: e.target.value })}
                        />
                      </FormGroup>

                      <FormGroup label="Email Address" required hint="Used for parent portal login and official receipts">
                        <Input
                          type="email"
                          required
                          placeholder="e.g. usman.muhammed@example.com"
                          value={formData.guardianEmail}
                          onChange={(e) => setFormData({ ...formData, guardianEmail: e.target.value })}
                        />
                      </FormGroup>
                    </div>

                    {/* Step Navigation */}
                    <div className="flex items-center justify-between pt-4 border-t border-stone-200">
                      <Button type="button" variant="outline" size="md" onClick={handleBack}>
                        &larr; Back to Student Details
                      </Button>

                      <Button
                        type="button"
                        variant="primary"
                        size="md"
                        onClick={handleNextToPreview}
                        className="bg-[#6B0B1A] hover:bg-[#5B0612] text-white px-8"
                      >
                        Preview Official Form &rarr;
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* STEP 3: OFFICIAL FORM PREVIEW & SUBMISSION */}
              {step === 3 && (
                <div className="space-y-6">
                  {/* Top Confirmation Guidance */}
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs sm:text-sm text-amber-900">
                    <div>
                      <strong className="font-bold block">Please Review Your Official Admission Form:</strong>
                      <span>Check that all particulars match the birth certificate and official records before final submission.</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button type="button" variant="outline" size="sm" onClick={handleBack}>
                        Edit Particulars
                      </Button>
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className="bg-[#6B0B1A] hover:bg-[#5B0612] text-white px-6 font-bold"
                      >
                        {isSubmitting ? 'Submitting Application...' : 'Confirm & Submit Application'}
                      </Button>
                    </div>
                  </div>

                  {/* Render the Exact Replica of Image 2 */}
                  <PrintedApplicationForm data={previewFormData} onPrint={() => window.print()} />

                  {/* Bottom Submission Bar */}
                  <div className="p-4 bg-white border border-[#EADBDA] rounded-xl flex items-center justify-between gap-4">
                    <Button type="button" variant="outline" size="md" onClick={handleBack} disabled={isSubmitting}>
                      &larr; Edit Details
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      size="md"
                      onClick={handleSubmit}
                      disabled={isSubmitting}
                      className="bg-[#6B0B1A] hover:bg-[#5B0612] text-white px-8 font-bold"
                    >
                      {isSubmitting ? 'Submitting Application...' : 'Confirm & Submit Application'}
                    </Button>
                  </div>
                </div>
              )}

            </div>
          )}

        </div>
      </main>

      <div className="no-print">
        <PublicFooter />
      </div>
    </div>
  );
}

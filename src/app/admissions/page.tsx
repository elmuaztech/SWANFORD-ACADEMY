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
  FormGroup,
  Alert,
  ImageUpload,
  Badge,
  LoadingState,
} from '@/components';
import { formatNaira } from '@/lib/money';

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
  const [step, setStep] = useState<number>(1);
  const [cycles, setCycles] = useState<AdmissionCycleOption[]>([]);
  const [programmes, setProgrammes] = useState<ProgrammeOption[]>([]);
  const [formFeeKobo, setFormFeeKobo] = useState<string>('500000');
  const [loadingOptions, setLoadingOptions] = useState(true);

  // Form State
  const [formData, setFormData] = useState({
    admissionCycleId: '',
    // Guardian details
    guardianFirstName: '',
    guardianLastName: '',
    guardianEmail: '',
    guardianPhone: '',
    guardianRelationship: 'FATHER',
    // Child details
    applicantFirstName: '',
    applicantLastName: '',
    applicantOtherNames: '',
    applicantGender: 'MALE',
    applicantDob: '',
    // Multi-programme selection
    selectedProgrammeIds: [] as string[],
    // Photo asset
    profilePhotoId: '',
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
          if (data.formFeeKobo) setFormFeeKobo(data.formFeeKobo);
          if (data.cycles?.[0]?.id) {
            setFormData((prev) => ({ ...prev, admissionCycleId: data.cycles[0].id }));
          }
          // Default selection to first available programme if none selected
          if (data.programmes?.[0]?.id) {
            setFormData((prev) => ({
              ...prev,
              selectedProgrammeIds: [data.programmes[0].id],
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
      if (exists) {
        // Don't allow deselecting all programmes
        if (prev.selectedProgrammeIds.length === 1) return prev;
        return {
          ...prev,
          selectedProgrammeIds: prev.selectedProgrammeIds.filter((id) => id !== progId),
        };
      } else {
        return {
          ...prev,
          selectedProgrammeIds: [...prev.selectedProgrammeIds, progId],
        };
      }
    });
  };

  const handleNext = () => {
    setSubmitError(null);
    if (step === 1) {
      if (!formData.guardianFirstName.trim() || !formData.guardianLastName.trim()) {
        setSubmitError('Guardian first name and last name are required.');
        return;
      }
      if (!formData.guardianEmail.trim() || !formData.guardianPhone.trim()) {
        setSubmitError('Guardian email and phone number are required.');
        return;
      }
    } else if (step === 2) {
      if (!formData.applicantFirstName.trim() || !formData.applicantLastName.trim()) {
        setSubmitError('Child first name and last name are required.');
        return;
      }
      if (!formData.applicantDob) {
        setSubmitError('Child date of birth is required.');
        return;
      }
    } else if (step === 3) {
      if (formData.selectedProgrammeIds.length === 0) {
        setSubmitError('Please select at least one programme.');
        return;
      }
    }
    setStep((prev) => Math.min(prev + 1, 5));
  };

  const handleBack = () => {
    setSubmitError(null);
    setStep((prev) => Math.max(prev - 1, 1));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      if (!formData.admissionCycleId) {
        throw new Error('Please select an active admission cycle.');
      }

      const payload = {
        admissionCycleId: formData.admissionCycleId,
        applicantFirstName: formData.applicantFirstName.trim(),
        applicantLastName: formData.applicantLastName.trim(),
        applicantOtherNames: formData.applicantOtherNames.trim() || null,
        applicantGender: formData.applicantGender,
        applicantDob: formData.applicantDob,
        profilePhotoId: formData.profilePhotoId || null,

        guardianFirstName: formData.guardianFirstName.trim(),
        guardianLastName: formData.guardianLastName.trim(),
        guardianEmail: formData.guardianEmail.trim().toLowerCase(),
        guardianPhone: formData.guardianPhone.trim(),
        guardianRelationship: formData.guardianRelationship,

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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Application submission failed.';
      setSubmitError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FFFFFF] text-[#1C1A1A]">
      <Navbar currentPath="/admissions" />

      <main className="flex-1 py-10 sm:py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Top Title */}
          <div className="text-center mb-8 sm:mb-10 space-y-2">
            <div className="inline-block px-3 py-1 bg-[#EADBDA] text-[#5B0612] rounded text-xs font-bold uppercase tracking-wider">
              Online Admissions Portal
            </div>
            <h1 className="text-2xl sm:text-4xl font-bold text-[#1C1A1A] tracking-tight">
              Application for Admission
            </h1>
            <p className="text-xs sm:text-sm text-[#524B46] max-w-lg mx-auto">
              Complete the guided steps below to apply for Nursery, Primary, or Standalone Tahfeez programmes.
            </p>
          </div>

          {/* SUCCESS STATE */}
          {submittedApp ? (
            <Card className="bg-white border-2 border-emerald-500 shadow-md">
              <CardContent className="p-8 sm:p-10 text-center space-y-6">
                <div className="w-16 h-16 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto text-3xl font-bold">
                  &#10003;
                </div>

                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-[#1C1A1A]">Application Submitted Successfully!</h2>
                  <p className="text-sm text-[#524B46]">
                    Your admission application has been registered with the Swanford Academy Admissions Office.
                  </p>
                </div>

                <div className="p-6 bg-[#FDFBF7] rounded-xl border border-[#EADBDA] space-y-2 text-left max-w-md mx-auto">
                  <span className="text-xs uppercase tracking-wider text-[#8C827A] font-bold block">
                    Your Official Application Reference
                  </span>
                  <p className="text-2xl font-mono font-bold text-[#5B0612]">
                    {submittedApp.applicationNumber}
                  </p>
                  <p className="text-xs text-[#524B46] pt-1">
                    Please save this reference number to track your admission status.
                  </p>
                </div>

                {photoUrl && (
                  <div className="flex flex-col items-center gap-2 pt-2">
                    <p className="text-xs text-[#524B46] font-medium">Uploaded Profile Photo:</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photoUrl}
                      alt="Applicant Photo"
                      className="w-20 h-20 rounded-full object-cover border-2 border-[#5B0612]"
                    />
                  </div>
                )}

                <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Link href={`/admissions/pay?applicationId=${submittedApp.id}`} className="w-full sm:w-auto">
                    <Button variant="primary" size="lg" className="w-full sm:w-auto">
                      Proceed to Application Fee Payment ({formatNaira(BigInt(formFeeKobo))}) &rarr;
                    </Button>
                  </Link>
                  <Link href="/admissions/status" className="w-full sm:w-auto">
                    <Button variant="outline" size="lg" className="w-full sm:w-auto">
                      Track Application Status
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ) : loadingOptions ? (
            <Card className="bg-[#FDFBF7] border-[#EADBDA] shadow-xs">
              <CardContent className="p-12">
                <LoadingState message="Loading admission options and academic cycles..." />
              </CardContent>
            </Card>
          ) : (
            /* WIZARD CARD */
            <Card className="bg-[#FDFBF7] border-[#EADBDA] shadow-xs">
              <CardContent className="p-6 sm:p-10 space-y-8">
                {/* Step Indicator */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-semibold text-[#524B46]">
                    <span>Step {step} of 5</span>
                    <span>
                      {step === 1 && 'Guardian Information'}
                      {step === 2 && 'Child Information'}
                      {step === 3 && 'Programme Selection'}
                      {step === 4 && 'Profile Photo'}
                      {step === 5 && 'Review & Submit'}
                    </span>
                  </div>
                  <div className="w-full bg-[#EADBDA] h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-[#5B0612] h-full transition-all duration-300"
                      style={{ width: `${(step / 5) * 100}%` }}
                    />
                  </div>
                </div>

                {submitError && (
                  <Alert variant="error" title="Please check your details">
                    {submitError}
                  </Alert>
                )}

                {/* STEP 1: GUARDIAN DETAILS */}
                {step === 1 && (
                  <div className="space-y-5">
                    <div>
                      <h2 className="text-xl font-bold text-[#1C1A1A]">Parent / Guardian Details</h2>
                      <p className="text-xs text-[#524B46] mt-0.5">
                        Please provide active contact information for application updates.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormGroup label="Guardian First Name" required>
                        <Input
                          placeholder="e.g. Ibrahim"
                          value={formData.guardianFirstName}
                          onChange={(e) =>
                            setFormData({ ...formData, guardianFirstName: e.target.value })
                          }
                          required
                        />
                      </FormGroup>
                      <FormGroup label="Guardian Last Name" required>
                        <Input
                          placeholder="e.g. Abdullahi"
                          value={formData.guardianLastName}
                          onChange={(e) =>
                            setFormData({ ...formData, guardianLastName: e.target.value })
                          }
                          required
                        />
                      </FormGroup>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormGroup label="Email Address" required>
                        <Input
                          type="email"
                          placeholder="guardian@example.com"
                          value={formData.guardianEmail}
                          onChange={(e) =>
                            setFormData({ ...formData, guardianEmail: e.target.value })
                          }
                          required
                        />
                      </FormGroup>
                      <FormGroup label="Phone Number" required>
                        <Input
                          type="tel"
                          placeholder="e.g. 0803 123 4567"
                          value={formData.guardianPhone}
                          onChange={(e) =>
                            setFormData({ ...formData, guardianPhone: e.target.value })
                          }
                          required
                        />
                      </FormGroup>
                    </div>

                    <FormGroup label="Relationship to Child" required>
                      <Select
                        value={formData.guardianRelationship}
                        onChange={(e) =>
                          setFormData({ ...formData, guardianRelationship: e.target.value })
                        }
                      >
                        <option value="FATHER">Father</option>
                        <option value="MOTHER">Mother</option>
                        <option value="GUARDIAN">Legal Guardian</option>
                        <option value="OTHER">Other Relative</option>
                      </Select>
                    </FormGroup>
                  </div>
                )}

                {/* STEP 2: CHILD DETAILS */}
                {step === 2 && (
                  <div className="space-y-5">
                    <div>
                      <h2 className="text-xl font-bold text-[#1C1A1A]">Child Information</h2>
                      <p className="text-xs text-[#524B46] mt-0.5">
                        Enter the applicant child&apos;s legal name and date of birth.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormGroup label="Child First Name" required>
                        <Input
                          placeholder="e.g. Fatima"
                          value={formData.applicantFirstName}
                          onChange={(e) =>
                            setFormData({ ...formData, applicantFirstName: e.target.value })
                          }
                          required
                        />
                      </FormGroup>
                      <FormGroup label="Child Last Name" required>
                        <Input
                          placeholder="e.g. Abdullahi"
                          value={formData.applicantLastName}
                          onChange={(e) =>
                            setFormData({ ...formData, applicantLastName: e.target.value })
                          }
                          required
                        />
                      </FormGroup>
                    </div>

                    <FormGroup label="Other Names (Middle / Traditional)">
                      <Input
                        placeholder="e.g. Zahra (Optional)"
                        value={formData.applicantOtherNames}
                        onChange={(e) =>
                          setFormData({ ...formData, applicantOtherNames: e.target.value })
                        }
                      />
                    </FormGroup>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormGroup label="Gender" required>
                        <Select
                          value={formData.applicantGender}
                          onChange={(e) =>
                            setFormData({ ...formData, applicantGender: e.target.value })
                          }
                        >
                          <option value="MALE">Male (Boy)</option>
                          <option value="FEMALE">Female (Girl)</option>
                        </Select>
                      </FormGroup>
                      <FormGroup label="Date of Birth" required>
                        <Input
                          type="date"
                          value={formData.applicantDob}
                          onChange={(e) =>
                            setFormData({ ...formData, applicantDob: e.target.value })
                          }
                          required
                        />
                      </FormGroup>
                    </div>
                  </div>
                )}

                {/* STEP 3: PROGRAMME SELECTION (MULTI-PROGRAMME) */}
                {step === 3 && (
                  <div className="space-y-5">
                    <div>
                      <h2 className="text-xl font-bold text-[#1C1A1A]">Programme Selection</h2>
                      <p className="text-xs text-[#524B46] mt-0.5">
                        Select one or more programmes (e.g. Primary Education combined with Tahfeez).
                      </p>
                    </div>

                    {cycles.length > 0 && (
                      <FormGroup label="Admission Cycle" required>
                        <Select
                          value={formData.admissionCycleId}
                          onChange={(e) =>
                            setFormData({ ...formData, admissionCycleId: e.target.value })
                          }
                        >
                          {cycles.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </Select>
                      </FormGroup>
                    )}

                    <div className="space-y-3">
                      <label className="block text-sm font-semibold text-[#1C1A1A]">
                        Select Programme(s) <span className="text-[#5B0612]">*</span>
                      </label>

                      <div className="grid grid-cols-1 gap-3">
                        {programmes.map((p) => {
                          const isSelected = formData.selectedProgrammeIds.includes(p.id);
                          return (
                            <div
                              key={p.id}
                              onClick={() => toggleProgramme(p.id)}
                              className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between min-h-[52px] ${
                                isSelected
                                  ? 'bg-white border-[#5B0612] shadow-xs ring-1 ring-[#5B0612]'
                                  : 'bg-white border-[#EADBDA] hover:border-[#8C827A]'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div
                                  className={`w-5 h-5 rounded flex items-center justify-center text-xs font-bold ${
                                    isSelected
                                      ? 'bg-[#5B0612] text-white'
                                      : 'border border-[#8C827A] bg-white'
                                  }`}
                                >
                                  {isSelected && '✓'}
                                </div>
                                <div>
                                  <span className="font-bold text-sm text-[#1C1A1A] block">
                                    {p.name}
                                  </span>
                                  <span className="text-[11px] text-[#8C827A] block">
                                    Code: {p.code}
                                  </span>
                                </div>
                              </div>
                              {p.code === 'TAHFEEZ' && (
                                <Badge variant="brand" size="sm">
                                  Standalone / Add-on
                                </Badge>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 4: CHILD PROFILE PHOTO */}
                {step === 4 && (
                  <div className="space-y-5">
                    <div>
                      <h2 className="text-xl font-bold text-[#1C1A1A]">Child Profile Photo</h2>
                      <p className="text-xs text-[#524B46] mt-0.5">
                        Upload a clear portrait photo of the child for admission identification.
                      </p>
                    </div>

                    <div className="bg-white p-6 rounded-xl border border-[#EADBDA]">
                      <ImageUpload
                        label="Upload Child Passport / Portrait Photo"
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
                  </div>
                )}

                {/* STEP 5: REVIEW & SUBMISSION */}
                {step === 5 && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-xl font-bold text-[#1C1A1A]">Review Application Summary</h2>
                      <p className="text-xs text-[#524B46] mt-0.5">
                        Please confirm the information below before final submission.
                      </p>
                    </div>

                    <div className="bg-white p-6 rounded-xl border border-[#EADBDA] space-y-4 text-xs sm:text-sm text-[#524B46]">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-b border-[#EADBDA] pb-4">
                        <div>
                          <span className="text-[#8C827A] block">Child Full Name:</span>
                          <strong className="text-[#1C1A1A] text-base">
                            {formData.applicantFirstName} {formData.applicantOtherNames} {formData.applicantLastName}
                          </strong>
                        </div>
                        <div>
                          <span className="text-[#8C827A] block">Gender &amp; Date of Birth:</span>
                          <strong className="text-[#1C1A1A]">
                            {formData.applicantGender === 'MALE' ? 'Male' : 'Female'} &bull; {formData.applicantDob}
                          </strong>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-b border-[#EADBDA] pb-4">
                        <div>
                          <span className="text-[#8C827A] block">Parent / Guardian:</span>
                          <strong className="text-[#1C1A1A]">
                            {formData.guardianFirstName} {formData.guardianLastName} ({formData.guardianRelationship})
                          </strong>
                        </div>
                        <div>
                          <span className="text-[#8C827A] block">Contact Info:</span>
                          <strong className="text-[#1C1A1A]">
                            {formData.guardianEmail} &bull; {formData.guardianPhone}
                          </strong>
                        </div>
                      </div>

                      <div>
                        <span className="text-[#8C827A] block mb-1">Selected Programme(s):</span>
                        <div className="flex flex-wrap gap-2">
                          {formData.selectedProgrammeIds.map((pId) => {
                            const prog = programmes.find((p) => p.id === pId);
                            return (
                              <Badge key={pId} variant="brand" size="sm">
                                {prog ? prog.name : pId}
                              </Badge>
                            );
                          })}
                        </div>
                      </div>

                      {photoUrl && (
                        <div className="pt-2 flex items-center gap-3 border-t border-[#EADBDA]">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={photoUrl}
                            alt="Child Photo"
                            className="w-12 h-12 rounded-full object-cover border border-[#5B0612]"
                          />
                          <span className="text-xs text-emerald-700 font-semibold">
                            &#10003; Passport Photo Attached &amp; Validated
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="p-4 bg-[#F5F0EB] rounded-xl border border-[#EADBDA] flex items-center justify-between">
                      <div>
                        <span className="text-xs uppercase tracking-wider text-[#8C827A] font-bold block">
                          Application Processing Fee
                        </span>
                        <p className="text-xs text-[#524B46]">Payable online or via bank transfer after submission.</p>
                      </div>
                      <span className="text-xl font-mono font-bold text-[#5B0612]">
                        {formatNaira(BigInt(formFeeKobo))}
                      </span>
                    </div>
                  </div>
                )}

                {/* Step Actions */}
                <div className="flex items-center justify-between pt-6 border-t border-[#EADBDA]">
                  {step > 1 ? (
                    <Button variant="outline" size="md" onClick={handleBack} disabled={isSubmitting}>
                      &larr; Back
                    </Button>
                  ) : (
                    <div />
                  )}

                  {step < 5 ? (
                    <Button variant="primary" size="md" onClick={handleNext}>
                      Continue &rarr;
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      size="md"
                      onClick={handleSubmit}
                      disabled={isSubmitting}
                      className="px-8"
                    >
                      {isSubmitting ? 'Submitting Application...' : 'Submit Application &rarr;'}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}

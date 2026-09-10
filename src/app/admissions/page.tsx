'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Navbar,
  PageHeader,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Button,
  Input,
  Select,
  FormGroup,
  Alert,
  ImageUpload,
} from '@/components';
import { SCHOOL_PROFILE } from '@/lib/constants';

interface ProgrammeOption {
  id: string;
  name: string;
  code: string;
}

export default function PublicAdmissionPage() {
  const [formData, setFormData] = useState({
    admissionCycleId: '',
    applicantFirstName: '',
    applicantLastName: '',
    applicantOtherNames: '',
    applicantGender: 'MALE',
    applicantDob: '',
    guardianFirstName: '',
    guardianLastName: '',
    guardianEmail: '',
    guardianPhone: '',
    guardianRelationship: 'FATHER',
    programmeId: '',
    profilePhotoId: '',
  });

  const [programmes, setProgrammes] = useState<ProgrammeOption[]>([]);
  const [activeCycles, setActiveCycles] = useState<{ id: string; name: string }[]>([]);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedApp, setSubmittedApp] = useState<{ id: string; applicationNumber: string } | null>(null);

  useEffect(() => {
    // Load active admission cycles & programmes for public selection
    async function loadData() {
      try {
        const res = await fetch('/api/public/admission-options');
        if (res.ok) {
          const data = await res.json();
          setProgrammes(data.programmes || []);
          setActiveCycles(data.cycles || []);
          if (data.cycles?.[0]?.id) {
            setFormData((prev) => ({ ...prev, admissionCycleId: data.cycles[0].id }));
          }
          if (data.programmes?.[0]?.id) {
            setFormData((prev) => ({ ...prev, programmeId: data.programmes[0].id }));
          }
        }
      } catch {
        // Fallback defaults if public options route is quiet
      }
    }
    loadData();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handlePhotoSuccess = (result: { assetId: string; url: string }) => {
    setFormData((prev) => ({ ...prev, profilePhotoId: result.assetId }));
    setPhotoUrl(result.url);
  };

  const handlePhotoRemove = () => {
    setFormData((prev) => ({ ...prev, profilePhotoId: '' }));
    setPhotoUrl(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      if (!formData.applicantFirstName || !formData.applicantLastName) {
        throw new Error('Applicant first name and last name are required.');
      }
      if (!formData.applicantDob) {
        throw new Error('Applicant date of birth is required.');
      }
      if (!formData.guardianFirstName || !formData.guardianLastName || !formData.guardianEmail || !formData.guardianPhone) {
        throw new Error('Guardian details (name, email, phone) are required.');
      }
      if (!formData.programmeId) {
        throw new Error('Please select an academic programme.');
      }

      const payload = {
        admissionCycleId: formData.admissionCycleId,
        applicantFirstName: formData.applicantFirstName,
        applicantLastName: formData.applicantLastName,
        applicantOtherNames: formData.applicantOtherNames || undefined,
        applicantGender: formData.applicantGender,
        applicantDob: formData.applicantDob,
        guardianFirstName: formData.guardianFirstName,
        guardianLastName: formData.guardianLastName,
        guardianEmail: formData.guardianEmail,
        guardianPhone: formData.guardianPhone,
        guardianRelationship: formData.guardianRelationship,
        programmeSelections: [{ programmeId: formData.programmeId }],
        profilePhotoId: formData.profilePhotoId || undefined,
      };

      const res = await fetch('/api/admissions/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || 'Application submission failed.');
      }

      setSubmittedApp({ id: result.applicationId, applicationNumber: result.applicationNumber });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Submission failed.';
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submittedApp) {
    return (
      <div className="min-h-screen bg-[#FDFBF7]">
        <Navbar currentPath="/admissions" />
        <main className="max-w-2xl mx-auto px-4 py-12">
          <Card className="text-center p-6 space-y-6">
            <div className="w-16 h-16 mx-auto rounded-full bg-green-100 flex items-center justify-center text-green-700">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-[#1C1A1A]">Application Submitted!</h2>
              <p className="text-sm text-[#524B46]">
                Your application for admission to {SCHOOL_PROFILE.name} has been received.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#F5F0EB] border border-[#EADBDA] space-y-1">
              <p className="text-xs uppercase tracking-wider text-[#524B46] font-medium">Application Reference</p>
              <p className="text-xl font-mono font-bold text-[#5B0612]">{submittedApp.applicationNumber}</p>
            </div>

            {photoUrl && (
              <div className="flex flex-col items-center gap-2">
                <p className="text-xs text-[#524B46]">Attached Child Profile Photo (Optimized):</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoUrl}
                  alt="Child Photo"
                  className="w-24 h-24 rounded-full object-cover border-2 border-[#5B0612]"
                />
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
              <Link href={`/admissions/pay?applicationId=${submittedApp.id}`}>
                <Button variant="primary" className="w-full sm:w-auto">
                  Proceed to Application Fee Payment &rarr;
                </Button>
              </Link>
              <Link href="/">
                <Button variant="outline" className="w-full sm:w-auto">
                  Return to Home
                </Button>
              </Link>
            </div>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFBF7]">
      <Navbar currentPath="/admissions" />

      <main className="max-w-3xl mx-auto px-4 py-8 sm:py-12 space-y-8">
        <PageHeader
          title="Apply for Admission"
          subtitle={`Submit an admission application for Nursery, Primary, or Tahfeez programmes at ${SCHOOL_PROFILE.name}.`}
        />

        <form onSubmit={handleSubmit} className="space-y-8">
          {submitError && (
            <Alert variant="error" title="Application Error">
              {submitError}
            </Alert>
          )}

          {/* Section 1: Child Demographic Information */}
          <Card>
            <CardHeader>
              <CardTitle>Child Information</CardTitle>
              <CardDescription>Enter the applicant student&apos;s personal details.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormGroup label="First Name" required>
                  <Input
                    name="applicantFirstName"
                    value={formData.applicantFirstName}
                    onChange={handleChange}
                    placeholder="e.g. Ibrahim"
                    required
                  />
                </FormGroup>

                <FormGroup label="Last Name" required>
                  <Input
                    name="applicantLastName"
                    value={formData.applicantLastName}
                    onChange={handleChange}
                    placeholder="e.g. Bello"
                    required
                  />
                </FormGroup>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormGroup label="Other Names">
                  <Input
                    name="applicantOtherNames"
                    value={formData.applicantOtherNames}
                    onChange={handleChange}
                    placeholder="e.g. Danladi"
                  />
                </FormGroup>

                <FormGroup label="Gender" required>
                  <Select name="applicantGender" value={formData.applicantGender} onChange={handleChange}>
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                  </Select>
                </FormGroup>

                <FormGroup label="Date of Birth" required>
                  <Input
                    type="date"
                    name="applicantDob"
                    value={formData.applicantDob}
                    onChange={handleChange}
                    required
                  />
                </FormGroup>
              </div>

              {/* Requirement 7 & 18: Child Profile Photo Upload */}
              <div className="pt-4 border-t border-[#EADBDA]">
                <ImageUpload
                  label="Child Profile Photo"
                  helperText="Upload a clear face photo. Formats: JPEG, PNG, or WebP. Max upload 5 MB (photo is automatically cropped and optimized for school identification)."
                  currentImageUrl={photoUrl}
                  onUploadSuccess={handlePhotoSuccess}
                  onRemove={handlePhotoRemove}
                />
              </div>
            </CardContent>
          </Card>

          {/* Section 2: Programme Selection */}
          <Card>
            <CardHeader>
              <CardTitle>Programme Selection</CardTitle>
              <CardDescription>Select the desired entry cycle and programme.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {activeCycles.length > 0 && (
                <FormGroup label="Admission Cycle" required>
                  <Select
                    name="admissionCycleId"
                    value={formData.admissionCycleId}
                    onChange={handleChange}
                    required
                  >
                    {activeCycles.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </FormGroup>
              )}

              <FormGroup label="Target Programme" required>
                <Select
                  name="programmeId"
                  value={formData.programmeId}
                  onChange={handleChange}
                  required
                >
                  {programmes.length > 0 ? (
                    programmes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.code})
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="primary-default">Primary School</option>
                      <option value="nursery-default">Nursery & Early Years</option>
                      <option value="tahfeez-default">Tahfeez Programme</option>
                    </>
                  )}
                </Select>
              </FormGroup>
            </CardContent>
          </Card>

          {/* Section 3: Parent / Guardian Details */}
          <Card>
            <CardHeader>
              <CardTitle>Parent / Guardian Details</CardTitle>
              <CardDescription>Primary contact for admission notifications and verification.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormGroup label="Guardian First Name" required>
                  <Input
                    name="guardianFirstName"
                    value={formData.guardianFirstName}
                    onChange={handleChange}
                    placeholder="e.g. Amina"
                    required
                  />
                </FormGroup>

                <FormGroup label="Guardian Last Name" required>
                  <Input
                    name="guardianLastName"
                    value={formData.guardianLastName}
                    onChange={handleChange}
                    placeholder="e.g. Bello"
                    required
                  />
                </FormGroup>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormGroup label="Guardian Email" required>
                  <Input
                    type="email"
                    name="guardianEmail"
                    value={formData.guardianEmail}
                    onChange={handleChange}
                    placeholder="e.g. amina.bello@example.com"
                    required
                  />
                </FormGroup>

                <FormGroup label="Guardian Phone Number" required>
                  <Input
                    type="tel"
                    name="guardianPhone"
                    value={formData.guardianPhone}
                    onChange={handleChange}
                    placeholder="e.g. 08031234567"
                    required
                  />
                </FormGroup>

                <FormGroup label="Relationship" required>
                  <Select
                    name="guardianRelationship"
                    value={formData.guardianRelationship}
                    onChange={handleChange}
                  >
                    <option value="FATHER">Father</option>
                    <option value="MOTHER">Mother</option>
                    <option value="LEGAL_GUARDIAN">Legal Guardian</option>
                    <option value="OTHER">Other</option>
                  </Select>
                </FormGroup>
              </div>
            </CardContent>
            <CardFooter className="flex justify-end gap-3 pt-6 border-t border-[#EADBDA]">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                disabled={isSubmitting}
                className="w-full sm:w-auto"
              >
                {isSubmitting ? 'Submitting Application...' : 'Submit Application &rarr;'}
              </Button>
            </CardFooter>
          </Card>
        </form>
      </main>
    </div>
  );
}

'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
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
  DatePicker,
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

function AdmissionContent() {
  const searchParams = useSearchParams();

  // Payment Verification Gate State
  const [isPaymentVerified, setIsPaymentVerified] = useState<boolean>(false);
  const [paymentReference, setPaymentReference] = useState<string>('');
  const [verifyingPayment, setVerifyingPayment] = useState<boolean>(false);
  const [initiatingPayment, setInitiatingPayment] = useState<boolean>(false);
  const [paymentGateError, setPaymentGateError] = useState<string | null>(null);
  const [paymentGateSuccess, setPaymentGateSuccess] = useState<string | null>(null);
  const [manualReferenceInput, setManualReferenceInput] = useState<string>('');

  // Initial Form Fee Payer State (Used at gate)
  const [payerInfo, setPayerInfo] = useState({
    guardianFullName: '',
    guardianEmail: '',
    guardianPhone: '',
    studentFullName: '',
    programmeId: '',
  });

  // Step 1: Student's Details -> Step 2: Guardian's Details -> Step 3: Official Preview -> Step 4: Success / Print
  const [step, setStep] = useState<number>(1);
  const [cycles, setCycles] = useState<AdmissionCycleOption[]>([]);
  const [programmes, setProgrammes] = useState<ProgrammeOption[]>([]);
  const [formFeeKobo, setFormFeeKobo] = useState<string>('500000');
  const [isOpen, setIsOpen] = useState<boolean>(true);
  const [activeSessionName, setActiveSessionName] = useState<string>('');
  const [loadingOptions, setLoadingOptions] = useState(true);

  // Form State adhering to Official Physical Form
  const [formData, setFormData] = useState({
    admissionCycleId: '',
    selectedProgrammeIds: [] as string[],

    // Student's Details (Section 1) - Compulsory: Full Name, DOB, Photo, State, LGA
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

    // Guardian's Details (Section 2) - Compulsory: Full Name, Phone, Email, Occupation
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

  // Load admission options and check URL for returning Paystack reference
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
            setPayerInfo((prev) => ({ ...prev, programmeId: data.programmes[0].id }));
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

  const verifyPaymentRef = async (ref: string) => {
    setVerifyingPayment(true);
    setPaymentGateError(null);
    try {
      const res = await fetch('/api/admissions/payment/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference: ref }),
      });
      const data = await res.json();
      if (!res.ok || !data.verified) {
        throw new Error(data.error || 'Payment verification failed. Please check reference.');
      }

      setIsPaymentVerified(true);
      setPaymentReference(ref);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('swanford_admission_verified_ref', ref);
      }
      setPaymentGateSuccess(`Payment verified successfully (${ref})! Application form unlocked.`);

      // Pre-fill form from payment metadata if available
      if (data.metadata) {
        setFormData((prev) => ({
          ...prev,
          studentFullName: data.metadata.studentFullName || prev.studentFullName,
          guardianFullName: data.metadata.guardianFullName || prev.guardianFullName,
          guardianEmail: data.metadata.guardianEmail || prev.guardianEmail,
          guardianPhone: data.metadata.guardianPhone || prev.guardianPhone,
          selectedProgrammeIds: data.metadata.programmeId ? [data.metadata.programmeId] : prev.selectedProgrammeIds,
          admissionCycleId: data.metadata.admissionCycleId || prev.admissionCycleId,
        }));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to verify payment reference.';
      setPaymentGateError(msg);
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('swanford_admission_verified_ref');
      }
    } finally {
      setVerifyingPayment(false);
    }
  };

  // Check URL parameters or session storage for payment reference
  useEffect(() => {
    const urlRef = searchParams.get('payment_reference') || searchParams.get('reference');
    const storedRef = typeof window !== 'undefined' ? sessionStorage.getItem('swanford_admission_verified_ref') : null;

    const refToVerify = urlRef || storedRef;

    if (refToVerify && !isPaymentVerified) {
      verifyPaymentRef(refToVerify);
    }
  }, [searchParams, isPaymentVerified]);

  const handleInitiateFormFeePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setPaymentGateError(null);

    if (!payerInfo.guardianFullName.trim()) {
      setPaymentGateError('Parent / Guardian full name is required.');
      return;
    }
    if (!payerInfo.guardianEmail.trim()) {
      setPaymentGateError('Parent / Guardian email address is required.');
      return;
    }
    if (!payerInfo.guardianPhone.trim()) {
      setPaymentGateError('Parent / Guardian phone number is required.');
      return;
    }
    if (!payerInfo.studentFullName.trim()) {
      setPaymentGateError('Pupil full name is required.');
      return;
    }

    const selectedCycleId = formData.admissionCycleId || cycles[0]?.id;
    if (!selectedCycleId) {
      setPaymentGateError('Admission cycle is currently unavailable.');
      return;
    }

    const selectedProgId = payerInfo.programmeId || programmes[0]?.id;
    if (!selectedProgId) {
      setPaymentGateError('Please select a programme.');
      return;
    }

    setInitiatingPayment(true);
    try {
      const res = await fetch('/api/admissions/payment/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guardianFullName: payerInfo.guardianFullName.trim(),
          guardianEmail: payerInfo.guardianEmail.trim().toLowerCase(),
          guardianPhone: payerInfo.guardianPhone.trim(),
          studentFullName: payerInfo.studentFullName.trim(),
          admissionCycleId: selectedCycleId,
          programmeId: selectedProgId,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.authorizationUrl) {
        throw new Error(data.error || 'Failed to initialize payment gateway.');
      }

      // Redirect to Paystack Checkout
      window.location.href = data.authorizationUrl;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Payment initialization failed.';
      setPaymentGateError(msg);
      setInitiatingPayment(false);
    }
  };

  const handleManualVerificationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualReferenceInput.trim()) {
      setPaymentGateError('Please enter your payment reference or receipt number.');
      return;
    }
    verifyPaymentRef(manualReferenceInput.trim());
  };

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
      setSubmitError('Pupil full name is required.');
      return;
    }
    if (!formData.dateOfBirth) {
      setSubmitError('Pupil date of birth is compulsory.');
      return;
    }
    if (!formData.profilePhotoId) {
      setSubmitError('Pupil passport photograph is compulsory. Please upload a clear passport photo.');
      return;
    }
    if (!formData.stateOfOrigin.trim()) {
      setSubmitError('State of origin is compulsory.');
      return;
    }
    if (!formData.lga.trim()) {
      setSubmitError('Local Government Area (LGA) is compulsory.');
      return;
    }
    if (formData.selectedProgrammeIds.length === 0) {
      setSubmitError('Please select at least one academic programme or class.');
      return;
    }

    setStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNextToPreview = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSubmitError(null);

    if (!formData.guardianFullName.trim()) {
      setSubmitError('Parent / Guardian full name is required.');
      return;
    }
    if (!formData.guardianOccupation.trim()) {
      setSubmitError('Parent / Guardian occupation is compulsory.');
      return;
    }
    if (!formData.guardianPhone.trim()) {
      setSubmitError('Parent / Guardian phone number is required.');
      return;
    }
    if (!formData.guardianEmail.trim()) {
      setSubmitError('Parent / Guardian email address is required.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.guardianEmail.trim())) {
      setSubmitError('Please provide a valid email address.');
      return;
    }

    setStep(3);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
    setSubmitError(null);
    setStep((prev) => Math.max(prev - 1, 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      if (!isPaymentVerified || !paymentReference) {
        throw new Error('Application form payment has not been verified. Please verify payment first.');
      }
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
        profilePhotoId: formData.profilePhotoId,

        // Physical Form Specific Fields (All Compulsory)
        applicantAddress: formData.studentAddress.trim() || null,
        placeOfBirth: formData.placeOfBirth.trim() || null,
        stateOfOrigin: formData.stateOfOrigin.trim(),
        lga: formData.lga.trim(),
        nationality: formData.nationality.trim() || null,
        specialAttention: formData.specialAttention.trim() || null,
        additionalInformation: formData.additionalInformation.trim() || null,

        guardianFullName: formData.guardianFullName.trim(),
        guardianFirstName: parsedGuardian.firstName,
        guardianLastName: parsedGuardian.lastName,
        guardianEmail: formData.guardianEmail.trim().toLowerCase(),
        guardianPhone: formData.guardianPhone.trim(),
        guardianRelationship: formData.guardianRelationship,
        guardianOccupation: formData.guardianOccupation.trim(),
        guardianAddress: formData.guardianAddress.trim() || formData.studentAddress.trim() || null,

        programmeSelections: formData.selectedProgrammeIds.map((pId) => ({
          programmeId: pId,
        })),

        paymentReference,
        isWebFormSubmission: true,
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
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('swanford_admission_verified_ref');
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
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

      <main className="flex-1 py-6 sm:py-10 w-full max-w-full overflow-x-hidden">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">

          {/* SUCCESS STATE */}
          {step === 4 && submittedApp ? (
            <div className="space-y-6">
              <div className="no-print bg-emerald-50 border-2 border-emerald-500 rounded-xl p-6 text-center space-y-3 shadow-xs">
                <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
                  ✓
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-emerald-950">
                  Admission Application Submitted Successfully!
                </h2>
                <p className="text-sm text-emerald-800 max-w-xl mx-auto">
                  Your application and form fee have been verified and submitted to the Admissions Board.
                  Your official Application Number is{' '}
                  <strong className="font-mono text-base font-extrabold text-[#5B0612] bg-white px-2 py-0.5 rounded border border-emerald-300">
                    {submittedApp.applicationNumber}
                  </strong>
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <Button
                    type="button"
                    variant="primary"
                    size="md"
                    onClick={() => window.print()}
                    className="bg-[#5B0612] hover:bg-[#43040D] text-white flex items-center gap-2 shadow-sm"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H7a2 2 0 00-2 2v4h10z" />
                    </svg>
                    <span>Print Application Slip (A4)</span>
                  </Button>
                  <Link href="/admissions/status">
                    <Button variant="outline" size="md">
                      Check Application Status
                    </Button>
                  </Link>
                </div>
              </div>

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
                      Check Status
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ) : !isPaymentVerified ? (
            /* PAYMENT & ACCESS GATE: Form remains LOCKED until payment is verified */
            <div className="space-y-6">
              {/* Institution Header */}
              <div className="bg-white border border-[#EADBDA] rounded-xl p-5 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
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
                      Swanford Nursery & Primary School
                    </h1>
                    <p className="text-xs text-stone-500">
                      Admission Application Form Access Portal &bull; {activeSessionName}
                    </p>
                  </div>
                </div>
                <div className="text-center sm:text-right shrink-0">
                  <span className="text-[11px] text-stone-500 block uppercase font-bold">Application Form Fee</span>
                  <span className="text-xl sm:text-2xl font-black text-[#5B0612]">
                    {formatNaira(Number(formFeeKobo) / 100)}
                  </span>
                </div>
              </div>

              {paymentGateError && (
                <Alert variant="error" title="Notice">
                  {paymentGateError}
                </Alert>
              )}

              {paymentGateSuccess && (
                <Alert variant="success" title="Success">
                  {paymentGateSuccess}
                </Alert>
              )}

              {/* Form Access Requirements & Gateway Options */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                {/* Option 1: Pay Online Now */}
                <div className="md:col-span-7">
                  <Card className="bg-white border-[#EADBDA] shadow-sm h-full flex flex-col">
                    <div className="bg-[#6B0B1A] text-white px-5 py-3 rounded-t-xl flex items-center justify-between">
                      <div>
                        <h2 className="text-sm font-extrabold uppercase tracking-wide">
                          Step 1: Obtain Form (Pay Online)
                        </h2>
                        <p className="text-[11px] text-rose-200">
                          Instant card, transfer, or USSD via Paystack
                        </p>
                      </div>
                      <Badge variant="neutral" size="sm" className="bg-rose-900/60 text-white border-rose-700">
                        Official Fee
                      </Badge>
                    </div>

                    <CardContent className="p-6 flex-1 flex flex-col justify-between space-y-4">
                      <form onSubmit={handleInitiateFormFeePayment} className="space-y-3.5">
                        <FormGroup label="Parent / Guardian Full Name" required>
                          <Input
                            required
                            placeholder="e.g. Alhaji Mustapha Bello"
                            value={payerInfo.guardianFullName}
                            onChange={(e) => setPayerInfo({ ...payerInfo, guardianFullName: e.target.value })}
                          />
                        </FormGroup>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <FormGroup label="Email Address" required>
                            <Input
                              type="email"
                              required
                              placeholder="e.g. mustapha@example.com"
                              value={payerInfo.guardianEmail}
                              onChange={(e) => setPayerInfo({ ...payerInfo, guardianEmail: e.target.value })}
                            />
                          </FormGroup>
                          <FormGroup label="Phone Number" required>
                            <Input
                              type="tel"
                              required
                              placeholder="e.g. 08035671947"
                              value={payerInfo.guardianPhone}
                              onChange={(e) => setPayerInfo({ ...payerInfo, guardianPhone: e.target.value })}
                            />
                          </FormGroup>
                        </div>

                        <FormGroup label="Pupil Full Name" required>
                          <Input
                            required
                            placeholder="e.g. Fatima Mustapha Bello"
                            value={payerInfo.studentFullName}
                            onChange={(e) => setPayerInfo({ ...payerInfo, studentFullName: e.target.value })}
                          />
                        </FormGroup>

                        <FormGroup label="Programme Track" required>
                          <Select
                            value={payerInfo.programmeId}
                            onChange={(e) => setPayerInfo({ ...payerInfo, programmeId: e.target.value })}
                          >
                            {programmes.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </Select>
                        </FormGroup>

                        <div className="pt-2">
                          <Button
                            type="submit"
                            variant="primary"
                            size="md"
                            disabled={initiatingPayment}
                            className="w-full bg-[#6B0B1A] hover:bg-[#5B0612] text-white py-3 font-bold flex items-center justify-center gap-2 shadow-sm"
                          >
                            {initiatingPayment ? (
                              <span>Connecting to Paystack...</span>
                            ) : (
                              <span>Pay Form Fee {formatNaira(Number(formFeeKobo) / 100)} &amp; Open Form</span>
                            )}
                          </Button>
                        </div>
                      </form>
                    </CardContent>
                  </Card>
                </div>

                {/* Option 2: Already Paid / Verify Reference */}
                <div className="md:col-span-5">
                  <Card className="bg-white border-[#EADBDA] shadow-sm h-full flex flex-col">
                    <div className="bg-[#1C1A1A] text-white px-5 py-3 rounded-t-xl flex items-center justify-between">
                      <div>
                        <h2 className="text-sm font-extrabold uppercase tracking-wide">
                          Already Paid?
                        </h2>
                        <p className="text-[11px] text-stone-300">
                          Verify receipt or transaction reference
                        </p>
                      </div>
                      <Badge variant="neutral" size="sm" className="bg-stone-800 text-stone-300 border-stone-700">
                        Unlock
                      </Badge>
                    </div>

                    <CardContent className="p-6 flex-1 flex flex-col justify-between space-y-4">
                      <div className="space-y-3 text-xs text-stone-600 leading-relaxed">
                        <p>
                          If you already completed your application fee payment via Paystack or direct bank transfer, enter your transaction reference below to verify and unlock the admission form immediately.
                        </p>
                        <div className="bg-[#FAF7F2] p-3 rounded-lg border border-[#EADBDA] space-y-1">
                          <span className="font-bold text-stone-900 block text-[11px]">Note for Applicants:</span>
                          <span className="text-[11px]">
                            Application form fields remain locked until payment verification is confirmed by the gateway.
                          </span>
                        </div>
                      </div>

                      <form onSubmit={handleManualVerificationSubmit} className="space-y-3 pt-2">
                        <FormGroup label="Payment Reference / Receipt ID" required>
                          <Input
                            required
                            placeholder="e.g. APP_FORM-172849... or T123456"
                            value={manualReferenceInput}
                            onChange={(e) => setManualReferenceInput(e.target.value)}
                            className="font-mono text-xs uppercase"
                          />
                        </FormGroup>

                        <Button
                          type="submit"
                          variant="outline"
                          size="md"
                          disabled={verifyingPayment}
                          className="w-full border-[#6B0B1A] text-[#6B0B1A] hover:bg-[#FDF2F4] font-bold py-2.5"
                        >
                          {verifyingPayment ? 'Verifying Reference...' : 'Verify & Unlock Application Form'}
                        </Button>
                      </form>

                      <div className="pt-2 text-center">
                        <Link href="/admissions/status" className="text-xs font-semibold text-[#6B0B1A] hover:underline">
                          Already submitted? Check Application Status
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          ) : (
            /* UNLOCKED APPLICATION FORM WIZARD */
            <div className="space-y-6">
              {/* Payment Verified Notification Banner */}
              <div className="no-print bg-emerald-50 border border-emerald-300 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-emerald-900 shadow-xs">
                <div className="flex items-center gap-2.5">
                  <span className="w-6 h-6 rounded-full bg-emerald-200 text-emerald-800 flex items-center justify-center font-bold text-xs shrink-0">
                    ✓
                  </span>
                  <div className="text-xs sm:text-sm">
                    <span className="font-bold block">Application Fee Payment Verified</span>
                    <span className="text-stone-600 font-mono text-xs">
                      Ref: {paymentReference} &bull; Form unlocked for official submission
                    </span>
                  </div>
                </div>
                <Badge variant="success" size="sm">
                  Paid &amp; Unlocked
                </Badge>
              </div>

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
                    {/* Full Name */}
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

                      <FormGroup label="Date of Birth *" required hint="Compulsory — Type date or select calendar">
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

                      <FormGroup label="State of Origin *" required hint="Compulsory">
                        <Input
                          required
                          placeholder="e.g. Jigawa / Kano / Adamawa"
                          value={formData.stateOfOrigin}
                          onChange={(e) => setFormData({ ...formData, stateOfOrigin: e.target.value })}
                        />
                      </FormGroup>
                    </div>

                    {/* Local Govt & Nationality */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormGroup label="Local Govt. (LGA) *" required hint="Compulsory">
                        <Input
                          required
                          placeholder="e.g. Dutse / Birnin Kudu / Yola North"
                          value={formData.lga}
                          onChange={(e) => setFormData({ ...formData, lga: e.target.value })}
                        />
                      </FormGroup>

                      <FormGroup label="Nationality" hint="Default: Nigerian">
                        <Input
                          placeholder="Nigerian (or enter nationality)"
                          value={formData.nationality}
                          onChange={(e) => setFormData({ ...formData, nationality: e.target.value })}
                        />
                      </FormGroup>
                    </div>

                    {/* Special Attention & Additional Info */}
                    <FormGroup label="Special Attention (e.g: Illness)" hint="Optional - Note any allergies or medical needs">
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

                    {/* Passport Photo Upload Box (COMPULSORY) */}
                    <div className="border-2 border-dashed border-[#5B0612]/30 rounded-xl p-4 bg-[#FAF7F2]">
                      <div className="mb-2">
                        <span className="text-xs font-bold uppercase text-[#5B0612] tracking-wide block">
                          Student Passport Photograph * (Compulsory)
                        </span>
                        <span className="text-[11px] text-stone-500">
                          Upload a clear, recent passport photo. This is printed on the official application dossier.
                        </span>
                      </div>
                      <ImageUpload
                        label="Upload Passport Photo"
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

                    {/* Programme Multi-Selection */}
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
                        Continue to Guardian Details
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
                    {/* Guardian Full Name */}
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

                    {/* Relationship & Occupation (Compulsory) */}
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

                      <FormGroup label="Parent / Guardian Occupation *" required hint="Compulsory (e.g. Civil Servant, Engineer, Trader)">
                        <Input
                          required
                          placeholder="e.g. Civil Servant / Business Owner"
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
                        Back to Student Details
                      </Button>

                      <Button
                        type="button"
                        variant="primary"
                        size="md"
                        onClick={handleNextToPreview}
                        className="bg-[#6B0B1A] hover:bg-[#5B0612] text-white px-8"
                      >
                        Preview Official Form
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* STEP 3: OFFICIAL FORM PREVIEW & SUBMISSION */}
              {step === 3 && (
                <div className="space-y-6">
                  {/* Top Confirmation Guidance */}
                  <div className="bg-[#FAF7F2] border border-[#EADBDA] rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs sm:text-sm text-stone-800">
                    <div>
                      <strong className="font-bold text-[#5B0612] block">Review Your Official Admission Form:</strong>
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

                  {/* Render the Exact Replica Form */}
                  <PrintedApplicationForm data={previewFormData} onPrint={() => window.print()} />

                  {/* Bottom Submission Bar */}
                  <div className="p-4 bg-white border border-[#EADBDA] rounded-xl flex items-center justify-between gap-4">
                    <Button type="button" variant="outline" size="md" onClick={handleBack} disabled={isSubmitting}>
                      Edit Details
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

export default function PublicAdmissionPage() {
  return (
    <Suspense fallback={<LoadingState message="Loading admissions portal..." />}>
      <AdmissionContent />
    </Suspense>
  );
}

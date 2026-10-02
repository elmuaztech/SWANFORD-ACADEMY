"use client";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Button,
  Input,
  Select,
  Textarea,
  Modal,
  Alert,
  FormGroup,
  PageHeader,
  LoadingState,
  ErrorState,
  Avatar,
} from "@/components";

interface ApplicationDetail {
  id: string;
  applicationNumber: string;
  applicantFirstName: string;
  applicantLastName: string;
  applicantMiddleName: string | null;
  applicantGender: string;
  applicantDob: string;
  status: string;
  paymentStatus: string;
  totalAmountKobo?: string | number | bigint;
  profilePhotoId: string | null;
  reviewNotes: string | null;
  createdAt: string;
  cycle: { id: string; name: string; code: string };
  programmeSelections: Array<{
    id: string;
    programme: { id: string; name: string; code: string; classes: Array<{ id: string; name: string }> };
  }>;
  parentGuardians: Array<{
    id: string;
    guardian: {
      firstName: string;
      lastName: string;
      relationshipType: string;
      phonePrimary: string;
      email: string | null;
      residentialAddress: string | null;
    };
  }>;
  documents: Array<{
    id: string;
    documentType: string;
    fileName: string;
    fileUrl: string;
  }>;
}

export default function ApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const applicationId = resolvedParams.id;
  const router = useRouter();

  const [application, setApplication] = useState<ApplicationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Review modal state
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewDecision, setReviewDecision] = useState<"APPROVED" | "REJECTED">("APPROVED");
  const [reviewNotes, setReviewNotes] = useState("");

  // Payment confirmation modal state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentRef, setPaymentRef] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");

  // Matriculation modal state
  const [showMatriculateModal, setShowMatriculateModal] = useState(false);
  const [selectedProgrammeId, setSelectedProgrammeId] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");

  const fetchApplication = () => {
    setLoading(true);
    setError(null);
    fetch(`/api/admin/admissions/${applicationId}`)
      .then(async (res) => {
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Failed to load application details.");
        }
        return res.json();
      })
      .then((json) => {
        setApplication(json);
        if (json.programmeSelections?.[0]?.programme) {
          setSelectedProgrammeId(json.programmeSelections[0].programme.id);
          if (json.programmeSelections[0].programme.classes?.[0]) {
            setSelectedClassId(json.programmeSelections[0].programme.classes[0].id);
          }
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Error retrieving application.");
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchApplication();
  }, [applicationId]);

  const handleReviewSubmit = async () => {
    if (!application?.programmeSelections?.[0]?.id) {
      setActionError("No programme selection found on application.");
      return;
    }
    setActionLoading(true);
    setActionMessage(null);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/admissions/${applicationId}/review`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectionId: application.programmeSelections[0].id,
          decision: reviewDecision,
          decisionNotes: reviewNotes || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to submit review decision.");
      setShowReviewModal(false);
      await fetchApplication();
      setActionMessage(`Application successfully ${reviewDecision === "APPROVED" ? "approved for admission" : "rejected"}.`);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Failed to record decision.");
    } finally {
      setActionLoading(false);
    }
  };

  const handlePaymentConfirm = async () => {
    setActionLoading(true);
    setActionMessage(null);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/admissions/${applicationId}/confirm-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentReference: paymentRef.trim() || `MANUAL-${Date.now()}`,
          amountPaidKobo: application?.totalAmountKobo ? Number(application.totalAmountKobo) : 500000,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to record manual payment.");
      setShowPaymentModal(false);
      await fetchApplication();
      setActionMessage("Application fee payment recorded successfully.");
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Failed to confirm payment.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleMatriculate = async () => {
    if (!selectedProgrammeId || !selectedClassId) {
      setActionError("Please select both programme and class for enrollment.");
      return;
    }
    setActionLoading(true);
    setActionMessage(null);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/admissions/${applicationId}/matriculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programmeClassAssignments: { [selectedProgrammeId]: selectedClassId },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to matriculate student.");
      setShowMatriculateModal(false);
      router.push(`/admin/students/${json.studentId || json.student?.id}`);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Matriculation failed.");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="py-12">
        <LoadingState message="Loading applicant details..." />
      </div>
    );
  }

  if (error || !application) {
    return (
      <div className="py-8">
        <ErrorState
          title="Application Not Found"
          message={error || "The requested application record could not be loaded."}
          actionLabel="Back to Admissions"
          onAction={() => router.push("/admin/admissions")}
        />
      </div>
    );
  }

  const selectedProgramme = application.programmeSelections.find(
    (p) => p.programme.id === selectedProgrammeId
  )?.programme;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <PageHeader
        title={`${application.applicantFirstName} ${application.applicantLastName}`}
        description={`Application #${application.applicationNumber} • Submitted ${new Date(application.createdAt).toLocaleDateString()}`}
        breadcrumbs={[
          { label: "Dashboard", href: "/admin" },
          { label: "Admissions", href: "/admin/admissions" },
          { label: application.applicationNumber },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            {application.paymentStatus !== "PAYMENT_CONFIRMED" && (
              <Button
                variant="outline"
                size="md"
                onClick={() => setShowPaymentModal(true)}
                className="font-semibold"
              >
                Confirm Fee Payment
              </Button>
            )}

            {application.status === "SUBMITTED" || application.status === "UNDER_REVIEW" ? (
              <Button
                variant="primary"
                size="md"
                onClick={() => setShowReviewModal(true)}
                className="font-bold"
              >
                Review & Decision
              </Button>
            ) : null}

            {application.status === "APPROVED" ? (
              <Button
                variant="primary"
                size="md"
                onClick={() => setShowMatriculateModal(true)}
                className="font-bold"
              >
                Matriculate Student
              </Button>
            ) : null}
          </div>
        }
      />

      {actionMessage && (
        <Alert variant="success" onClose={() => setActionMessage(null)}>
          {actionMessage}
        </Alert>
      )}

      {actionError && (
        <Alert variant="danger" onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}

      {/* Main Dossier Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Profile Card */}
        <Card className="md:col-span-1">
          <CardHeader className="text-center pb-2">
            <div className="flex justify-center mb-3">
              <Avatar
                src={application.profilePhotoId ? `/api/media/${application.profilePhotoId}` : undefined}
                name={`${application.applicantFirstName} ${application.applicantLastName}`}
                size="lg"
              />
            </div>
            <CardTitle className="text-lg font-bold text-stone-900">
              {application.applicantFirstName} {application.applicantLastName}
            </CardTitle>
            <span className="text-xs font-mono text-stone-500">{application.applicationNumber}</span>
          </CardHeader>
          <CardContent className="space-y-4 pt-2 text-xs">
            <div className="flex justify-between py-1.5 border-b border-stone-100">
              <span className="text-stone-500">Status</span>
              <Badge
                variant={
                  application.status === "APPROVED" || application.status === "ENROLLED"
                    ? "success"
                    : application.status === "PARTIALLY_APPROVED" || application.status === "UNDER_REVIEW"
                    ? "warning"
                    : application.status === "REJECTED"
                    ? "danger"
                    : "info"
                }
                size="sm"
              >
                {application.status}
              </Badge>
            </div>
            <div className="flex justify-between py-1.5 border-b border-stone-100">
              <span className="text-stone-500">Fee Status</span>
              <Badge variant={application.paymentStatus === "PAYMENT_CONFIRMED" ? "success" : "warning"} size="sm">
                {application.paymentStatus}
              </Badge>
            </div>
            <div className="flex justify-between py-1.5 border-b border-stone-100">
              <span className="text-stone-500">Gender</span>
              <span className="font-semibold text-stone-900">{application.applicantGender}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-stone-100">
              <span className="text-stone-500">Date of Birth</span>
              <span className="font-semibold text-stone-900">
                {new Date(application.applicantDob).toLocaleDateString()}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-stone-100">
              <span className="text-stone-500">Cycle</span>
              <span className="font-semibold text-stone-900">{application.cycle?.name}</span>
            </div>
          </CardContent>
        </Card>

        {/* Right Column: Programme Selections, Guardians, and Documents */}
        <div className="md:col-span-2 space-y-6">
          {/* Programme Selection */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold text-stone-900">Selected Programmes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(application.programmeSelections || []).map((ps) => (
                  <div
                    key={ps.id}
                    className="p-3 rounded-xl border border-stone-200 bg-stone-50 flex items-center justify-between"
                  >
                    <div>
                      <p className="font-bold text-sm text-stone-900">{ps.programme.name}</p>
                      <p className="text-xs text-stone-500">Code: {ps.programme.code}</p>
                    </div>
                    <Badge variant="brand" size="sm">
                      Applied
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Guardian Information */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold text-stone-900">Guardian Details</CardTitle>
            </CardHeader>
            <CardContent>
              {(!application.parentGuardians || application.parentGuardians.length === 0) ? (
                <p className="text-xs text-stone-500">No guardian contacts submitted.</p>
              ) : (
                <div className="space-y-3">
                  {application.parentGuardians.map((pg) => (
                    <div key={pg.id} className="p-3 rounded-xl border border-stone-200 bg-white space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-sm text-stone-900">
                          {pg.guardian.firstName} {pg.guardian.lastName}
                        </span>
                        <span className="text-xs font-semibold text-stone-500">
                          {pg.guardian.relationshipType}
                        </span>
                      </div>
                      <p className="text-xs text-stone-600">Phone: {pg.guardian.phonePrimary}</p>
                      {pg.guardian.email && (
                        <p className="text-xs text-stone-600">Email: {pg.guardian.email}</p>
                      )}
                      {pg.guardian.residentialAddress && (
                        <p className="text-xs text-stone-600">Address: {pg.guardian.residentialAddress}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Attached Documents */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold text-stone-900">Submitted Documents</CardTitle>
            </CardHeader>
            <CardContent>
              {(!application.documents || application.documents.length === 0) ? (
                <p className="text-xs text-stone-500">No verification documents attached.</p>
              ) : (
                <div className="space-y-2">
                  {(application.documents || []).map((doc) => (
                    <div
                      key={doc.id}
                      className="p-3 rounded-xl border border-stone-200 bg-white flex items-center justify-between"
                    >
                      <div>
                        <p className="font-bold text-xs text-stone-900">{doc.documentType.replace(/_/g, " ")}</p>
                        <p className="text-[11px] text-stone-500">{doc.fileName}</p>
                      </div>
                      <a
                        href={doc.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-bold text-[#5B0612] hover:underline"
                      >
                        View File ↗
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Review Modal */}
      <Modal
        isOpen={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        title="Application Review & Decision"
      >
        <div className="space-y-4 pt-2">
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">Decision</label>
            <div className="flex gap-4">
              <label className="inline-flex items-center gap-2 text-sm font-semibold cursor-pointer">
                <input
                  type="radio"
                  name="decision"
                  value="APPROVED"
                  checked={reviewDecision === "APPROVED"}
                  onChange={() => setReviewDecision("APPROVED")}
                />
                Approve Admission
              </label>
              <label className="inline-flex items-center gap-2 text-sm font-semibold cursor-pointer">
                <input
                  type="radio"
                  name="decision"
                  value="REJECTED"
                  checked={reviewDecision === "REJECTED"}
                  onChange={() => setReviewDecision("REJECTED")}
                />
                Decline Application
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">Review Notes</label>
            <Textarea
              rows={3}
              placeholder="Internal review justification or remarks..."
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowReviewModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={actionLoading}
              onClick={handleReviewSubmit}
              className="font-bold"
            >
              {actionLoading ? "Submitting..." : "Confirm Decision"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Payment Confirmation Modal */}
      <Modal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        title="Confirm Application Fee Payment"
      >
        <div className="space-y-4 pt-2">
          <p className="text-xs text-stone-600">
            Confirm manual bank deposit or cash receipt for the admission application fee.
          </p>
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">Bank Reference (Optional)</label>
            <Input
              placeholder="e.g. TXN-12345"
              value={paymentRef}
              onChange={(e) => setPaymentRef(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">Receipt Notes</label>
            <Textarea
              rows={2}
              placeholder="Teller number or verified payment details..."
              value={paymentNotes}
              onChange={(e) => setPaymentNotes(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowPaymentModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={actionLoading}
              onClick={handlePaymentConfirm}
              className="font-bold"
            >
              {actionLoading ? "Confirming..." : "Record Payment"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Matriculation Modal */}
      <Modal
        isOpen={showMatriculateModal}
        onClose={() => setShowMatriculateModal(false)}
        title="Matriculate Enrolled Student"
      >
        <div className="space-y-4 pt-2">
          <p className="text-xs text-stone-600">
            Assign the student to an academic programme and class. An authoritative Swanford Admission
            Number (e.g. SWN-YYYY-NNNNN) will be automatically generated.
          </p>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">Target Class</label>
            <Select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="w-full"
            >
              {selectedProgramme?.classes?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              )) || <option value="">No classes available</option>}
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowMatriculateModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={actionLoading || !selectedClassId}
              onClick={handleMatriculate}
              className="font-bold"
            >
              {actionLoading ? "Enrolling..." : "Matriculate & Create Student"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

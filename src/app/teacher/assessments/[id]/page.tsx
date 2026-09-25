"use client";

import React, { useEffect, useState, use } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/layout/page-header";
import { LoadingState, ErrorState } from "@/components/ui/states";

type AssessmentScoreStatus = "SCORED" | "ABSENT" | "EXEMPT";

interface RosterScoreItem {
  student: {
    id: string;
    admissionNumber: string;
    firstName: string;
    lastName: string;
    otherNames?: string | null;
    gender: string;
  };
  score: {
    id: string;
    rawScore: number | null;
    grade: string | null;
    points: number | null;
    remark: string | null;
    isPass: boolean | null;
    scoreStatus: AssessmentScoreStatus;
    teacherNotes: string | null;
  } | null;
}

interface AssessmentDetail {
  id: string;
  title: string;
  type: string;
  status: "DRAFT" | "SUBMITTED" | "RETURNED_FOR_CORRECTION" | "APPROVED" | "FINALIZED";
  maxScore: number;
  weightPercentage: number;
  programme: { name: string; code: string };
  schoolClass: { name: string; arm: string | null };
  subject?: { name: string; code: string } | null;
  session: { name: string };
  term: { name: string };
  createdAt: string;
  latestReview?: {
    comment: string;
    action: string;
    reviewerName: string;
    createdAt: string;
  } | null;
}

export default function AssessmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const assessmentId = resolvedParams.id;

  const [assessment, setAssessment] = useState<AssessmentDetail | null>(null);
  const [roster, setRoster] = useState<RosterScoreItem[]>([]);
  const [scores, setScores] = useState<Record<string, { rawScore: string; status: AssessmentScoreStatus; notes: string }>>({});

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Load assessment & roster
  useEffect(() => {
    fetch(`/api/teacher/assessments/${assessmentId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load assessment");
        return res.json();
      })
      .then((d) => {
        setAssessment(d.assessment);
        const rosterData: RosterScoreItem[] = d.roster || [];
        setRoster(rosterData);

        // Pre-fill score state
        const initialMap: Record<string, { rawScore: string; status: AssessmentScoreStatus; notes: string }> = {};
        for (const item of rosterData) {
          initialMap[item.student.id] = {
            rawScore: item.score?.rawScore !== null && item.score?.rawScore !== undefined ? String(item.score.rawScore) : "",
            status: item.score?.scoreStatus || "SCORED",
            notes: item.score?.teacherNotes || "",
          };
        }
        setScores(initialMap);
        setIsLoading(false);
      })
      .catch((err) => {
        setFeedback({ type: "error", message: err.message });
        setIsLoading(false);
      });
  }, [assessmentId]);

  const handleScoreChange = (studentId: string, val: string) => {
    setScores((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        rawScore: val,
      },
    }));
  };

  const handleStatusChange = (studentId: string, status: AssessmentScoreStatus) => {
    setScores((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        status,
        rawScore: status === "SCORED" ? prev[studentId]?.rawScore || "" : "",
      },
    }));
  };

  const handleNotesChange = (studentId: string, notes: string) => {
    setScores((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        notes,
      },
    }));
  };

  const handleSaveDraft = async () => {
    if (!assessment) return;
    setIsSaving(true);
    setFeedback(null);

    const payload = roster.map((item) => {
      const s = scores[item.student.id];
      const parsedScore = s?.rawScore && s.status === "SCORED" ? parseFloat(s.rawScore) : null;
      return {
        studentId: item.student.id,
        rawScore: parsedScore,
        scoreStatus: s?.status || "SCORED",
        teacherNotes: s?.notes || null,
      };
    });

    try {
      const res = await fetch(`/api/teacher/assessments/${assessmentId}/scores`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scores: payload }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update scores");
      }

      setFeedback({ type: "success", message: "Scores draft saved successfully." });
    } catch (err: unknown) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Error saving draft." });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmitForReview = async () => {
    if (!confirm("Are you sure you want to submit this assessment for administrative review? You will not be able to make further edits once submitted.")) {
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      // First save current values
      await handleSaveDraft();

      const res = await fetch(`/api/teacher/assessments/${assessmentId}/submit`, {
        method: "POST",
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit assessment");
      }

      setFeedback({ type: "success", message: "Assessment submitted for administrative review." });
      setAssessment((prev) => (prev ? { ...prev, status: "SUBMITTED" } : null));
    } catch (err: unknown) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Error submitting assessment." });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <LoadingState description="Loading assessment details and class roster..." />;
  }

  if (!assessment) {
    return (
      <ErrorState
        title="Assessment Not Found"
        message="The requested assessment could not be found or you do not have permission to access it."
      />
    );
  }

  const isEditable = assessment.status === "DRAFT" || assessment.status === "RETURNED_FOR_CORRECTION";

  return (
    <div className="space-y-6">
      <PageHeader
        title={assessment.title}
        subtitle={`${assessment.schoolClass.name} ${assessment.schoolClass.arm ? `(${assessment.schoolClass.arm})` : ""} · ${assessment.programme.name} · Max Score: ${assessment.maxScore} · Weight: ${assessment.weightPercentage}%`}
        breadcrumbs={[
          { label: "Teacher Portal", href: "/teacher" },
          { label: "Assessments", href: "/teacher/assessments" },
          { label: assessment.title },
        ]}
        badge={
          assessment.status === "FINALIZED" ? (
            <Badge variant="success">Finalized & Published</Badge>
          ) : assessment.status === "APPROVED" ? (
            <Badge variant="info">Approved (Pending Publication)</Badge>
          ) : assessment.status === "SUBMITTED" ? (
            <Badge variant="warning">Submitted for Review</Badge>
          ) : assessment.status === "RETURNED_FOR_CORRECTION" ? (
            <Badge variant="danger">Returned for Correction</Badge>
          ) : (
            <Badge variant="neutral">Draft (Editable)</Badge>
          )
        }
      />

      {feedback && (
        <Alert
          variant={feedback.type === "success" ? "success" : "error"}
          title={feedback.type === "success" ? "Action Successful" : "Action Failed"}
          onClose={() => setFeedback(null)}
        >
          {feedback.message}
        </Alert>
      )}

      {assessment.status === "RETURNED_FOR_CORRECTION" && (
        <Alert variant="danger" title="Returned for Correction">
          <p className="font-semibold text-stone-900 mb-1">
            Correction Instructions from {assessment.latestReview?.reviewerName || "Administrator"}:
          </p>
          <div className="bg-white/80 p-3 rounded-lg border border-red-200 text-stone-800 text-sm mb-2 whitespace-pre-wrap">
            {assessment.latestReview?.comment || "Please review the scores and re-submit for administrative review."}
          </div>
          <p className="text-xs text-stone-600">
            Please make the necessary score adjustments below and click &quot;Re-Submit for Review&quot;.
          </p>
        </Alert>
      )}

      {assessment.status === "APPROVED" && (
        <Alert variant="success" title="Approved">
          This assessment has been reviewed and approved by the administration. Scores are verified and ready for terminal report sheet compilation.
        </Alert>
      )}

      {!isEditable && (
        <Alert variant="info" title="Assessment Locked">
          This assessment is currently in <strong className="font-semibold">{assessment.status}</strong> status. Scores cannot be edited by teachers while pending review, approved, or finalized.
        </Alert>
      )}

      {/* Score Entry Roster */}
      <div className="space-y-4">
        {/* Mobile View: Cards */}
        <div className="md:hidden space-y-3">
          {roster.map((item, idx) => {
            const current = scores[item.student.id] || { rawScore: "", status: "SCORED", notes: "" };
            const isScored = current.status === "SCORED";

            return (
              <Card key={item.student.id} className="bg-white border-[#EFE9DF] shadow-xs">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-xs font-mono text-[#800020] font-semibold">
                        {item.student.admissionNumber}
                      </span>
                      <h4 className="text-base font-bold text-[#5B0612]">
                        {idx + 1}. {item.student.lastName}, {item.student.firstName}
                      </h4>
                    </div>
                    {item.score?.grade && (
                      <Badge variant="brand" className="bg-[#FAF2F3] text-[#800020] font-bold">
                        Grade {item.score.grade}
                      </Badge>
                    )}
                  </div>

                  {/* Status Toggle */}
                  {isEditable ? (
                    <div className="grid grid-cols-3 gap-1.5">
                      {(["SCORED", "ABSENT", "EXEMPT"] as AssessmentScoreStatus[]).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => handleStatusChange(item.student.id, st)}
                          className={`min-h-[44px] rounded-lg text-xs font-semibold select-none cursor-pointer transition-colors ${
                            current.status === st
                              ? "bg-[#800020] text-white"
                              : "bg-[#FAF7F2] text-stone-700 border border-[#EFE9DF]"
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-stone-500 font-medium">Status: {current.status}</div>
                  )}

                  {/* Score Input */}
                  {isScored && (
                    <div>
                      <label htmlFor={`score-mobile-${item.student.id}`} className="block text-xs font-semibold text-stone-700 uppercase mb-1">
                        Raw Score (Max: {assessment.maxScore})
                      </label>
                      <input
                        id={`score-mobile-${item.student.id}`}
                        type="number"
                        min="0"
                        max={assessment.maxScore}
                        step="0.5"
                        disabled={!isEditable}
                        placeholder={`0 - ${assessment.maxScore}`}
                        value={current.rawScore}
                        onChange={(e) => handleScoreChange(item.student.id, e.target.value)}
                        className="w-full bg-[#FAF7F2] border border-[#EFE9DF] rounded-lg px-3 py-2 text-sm font-bold text-stone-900 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#800020] disabled:bg-stone-100 disabled:text-stone-500"
                      />
                    </div>
                  )}

                  {/* Notes */}
                  {isEditable && (
                    <input
                      type="text"
                      placeholder="Teacher notes / remark"
                      value={current.notes}
                      onChange={(e) => handleNotesChange(item.student.id, e.target.value)}
                      className="w-full bg-[#FAF7F2] border border-[#EFE9DF] rounded-lg px-3 py-2 text-xs text-stone-800 placeholder:text-stone-400 min-h-[40px]"
                    />
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Desktop View: Table */}
        <div className="hidden md:block bg-white rounded-xl border border-[#EFE9DF] shadow-xs overflow-hidden">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-[#FAF7F2] border-b border-[#EFE9DF] text-xs font-semibold text-stone-600 uppercase tracking-wider">
                <th className="py-3.5 px-4 w-12">#</th>
                <th className="py-3.5 px-4">Admission No.</th>
                <th className="py-3.5 px-4">Student Name</th>
                <th className="py-3.5 px-4 text-center">Score Status</th>
                <th className="py-3.5 px-4 w-36">Score (Max: {assessment.maxScore})</th>
                <th className="py-3.5 px-4 text-center">Resolved Grade</th>
                <th className="py-3.5 px-4">Teacher Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFE9DF]">
              {roster.map((item, idx) => {
                const current = scores[item.student.id] || { rawScore: "", status: "SCORED", notes: "" };
                const isScored = current.status === "SCORED";

                return (
                  <tr key={item.student.id} className="hover:bg-[#FAF7F2]/60 transition-colors">
                    <td className="py-3 px-4 text-xs font-mono text-stone-400">{idx + 1}</td>
                    <td className="py-3 px-4 text-xs font-mono font-bold text-[#800020]">{item.student.admissionNumber}</td>
                    <td className="py-3 px-4 font-semibold text-stone-900">
                      {item.student.lastName}, {item.student.firstName}
                    </td>
                    <td className="py-3 px-4">
                      {isEditable ? (
                        <div className="flex justify-center gap-1">
                          {(["SCORED", "ABSENT", "EXEMPT"] as AssessmentScoreStatus[]).map((st) => (
                            <button
                              key={st}
                              type="button"
                              onClick={() => handleStatusChange(item.student.id, st)}
                              className={`px-2 py-1 rounded text-xs select-none cursor-pointer transition-colors ${
                                current.status === st
                                  ? "bg-[#800020] text-white font-bold"
                                  : "bg-[#FAF7F2] text-stone-600 hover:bg-stone-200"
                              }`}
                            >
                              {st}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className="text-center block text-xs font-medium text-stone-600">{current.status}</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {isScored ? (
                        <input
                          type="number"
                          min="0"
                          max={assessment.maxScore}
                          step="0.5"
                          disabled={!isEditable}
                          value={current.rawScore}
                          onChange={(e) => handleScoreChange(item.student.id, e.target.value)}
                          className="w-full bg-[#FAF7F2] border border-[#EFE9DF] rounded-md px-2.5 py-1.5 text-sm font-bold text-stone-900 text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#800020] disabled:bg-stone-100 disabled:text-stone-500"
                        />
                      ) : (
                        <span className="text-center block text-xs text-stone-400 italic">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {item.score?.grade ? (
                        <Badge variant="brand" className="bg-[#FAF2F3] text-[#800020] font-bold">
                          {item.score.grade} ({item.score.remark})
                        </Badge>
                      ) : (
                        <span className="text-xs text-stone-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {isEditable ? (
                        <input
                          type="text"
                          placeholder="Optional notes"
                          value={current.notes}
                          onChange={(e) => handleNotesChange(item.student.id, e.target.value)}
                          className="w-full bg-[#FAF7F2] border border-[#EFE9DF] rounded-md px-2.5 py-1.5 text-xs text-stone-800"
                        />
                      ) : (
                        <span className="text-xs text-stone-600">{current.notes || "—"}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Action Bar */}
        {isEditable && (
          <div className="sticky bottom-4 z-20 bg-white/95 backdrop-blur-md p-4 rounded-xl border border-[#EFE9DF] shadow-md flex items-center justify-between gap-4">
            <span className="text-xs sm:text-sm font-medium text-stone-600">
              Draft changes saved locally until submitted.
            </span>
            <div className="flex gap-2.5">
              <Button
                variant="outline"
                size="md"
                onClick={handleSaveDraft}
                isLoading={isSaving}
                className="min-h-[44px]"
              >
                Save Draft Scores
              </Button>
              <Button
                variant="primary"
                size="md"
                className="bg-[#800020] hover:bg-[#6b001a] text-white font-bold min-h-[44px]"
                onClick={handleSubmitForReview}
                isLoading={isSubmitting}
              >
                {assessment.status === "RETURNED_FOR_CORRECTION" ? "Re-Submit for Review" : "Submit Assessment"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import { Save, Send } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/layout/page-header";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { TableWrapper } from "@/components/ui/table";

type AssessmentScoreStatus = "SCORED" | "ABSENT" | "EXEMPT";

interface AssessmentComponent {
  name: string;
  shortCode: string;
  maxScore: number;
  weightPercentage?: number;
}

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
    componentScores?: Record<string, number> | null;
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
  components?: AssessmentComponent[];
  createdAt: string;
  gradingScale?: {
    id: string;
    name: string;
    code: string;
    bands?: Array<{
      id: string;
      grade?: string;
      name?: string;
      minScore: number | string;
      maxScore: number | string;
      remark: string;
      isPass: boolean;
    }>;
  } | null;
  latestReview?: {
    comment: string;
    action: string;
    reviewerName: string;
    createdAt: string;
  } | null;
}

interface StudentScoreState {
  components: Record<string, string>; // e.g. { CA: "10", EXAM: "50" }
  status: AssessmentScoreStatus;
  notes: string;
}

// Live Grade & Remark Resolver based on Swanford Academy Western Standard
function computeGradeAndRemark(
  total: number,
  bands?: Array<{
    grade?: string;
    name?: string;
    minScore: number | string;
    maxScore: number | string;
    remark?: string;
    isPass?: boolean;
  }>
): {
  grade: string;
  remark: string;
  badgeClass: string;
} {
  if (bands && bands.length > 0) {
    const matched = bands.find(
      (b) => total >= Number(b.minScore) && total <= Number(b.maxScore)
    );
    if (matched) {
      const gradeStr = (matched.grade || matched.name || "").trim();
      const upper = gradeStr.toUpperCase();
      let badgeClass = "bg-stone-50 text-stone-800 border-stone-300 font-bold";
      if (upper.startsWith("A") || upper.startsWith("MUMTAZ")) {
        badgeClass = "bg-emerald-50 text-emerald-800 border-emerald-300 font-bold";
      } else if (upper.startsWith("B") || upper.startsWith("JAYYID JIDDAN")) {
        badgeClass = "bg-blue-50 text-blue-800 border-blue-300 font-bold";
      } else if (upper.startsWith("C") || upper.startsWith("JAYYID")) {
        badgeClass = "bg-amber-50 text-amber-900 border-amber-300 font-bold";
      } else if (upper.startsWith("D") || upper.startsWith("MAQBOOL")) {
        badgeClass = "bg-orange-50 text-orange-900 border-orange-300 font-bold";
      } else if (matched.isPass === false || upper.startsWith("F") || upper.startsWith("RASIB")) {
        badgeClass = "bg-rose-50 text-rose-800 border-rose-300 font-bold";
      }
      return {
        grade: gradeStr || (total >= 40 ? "Pass" : "Fail"),
        remark: matched.remark || (matched.isPass ? "Satisfactory" : "Needs Improvement"),
        badgeClass,
      };
    }
  }

  // Western Standard Default Performance Scale for Swanford Academy
  if (total >= 70) {
    return {
      grade: "A (Excellent)",
      remark: "Excellent / Distinction",
      badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-300 font-bold",
    };
  }
  if (total >= 60) {
    return {
      grade: "B (Very Good)",
      remark: "Very Good",
      badgeClass: "bg-blue-50 text-blue-800 border-blue-300 font-bold",
    };
  }
  if (total >= 50) {
    return {
      grade: "C (Good)",
      remark: "Good / Credit",
      badgeClass: "bg-amber-50 text-amber-900 border-amber-300 font-bold",
    };
  }
  if (total >= 40) {
    return {
      grade: "D (Pass)",
      remark: "Pass / Satisfactory",
      badgeClass: "bg-orange-50 text-orange-900 border-orange-300 font-bold",
    };
  }
  return {
    grade: "F (Needs Improvement)",
    remark: "Needs Improvement",
    badgeClass: "bg-rose-50 text-rose-800 border-rose-300 font-bold",
  };
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
  const [scores, setScores] = useState<Record<string, StudentScoreState>>({});

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Default CA & Exam components
  const defaultComponents: AssessmentComponent[] = [
    { name: "Continuous Assessment", shortCode: "CA", maxScore: 30 },
    { name: "Term Examination", shortCode: "EXAM", maxScore: 70 },
  ];

  const activeComponents: AssessmentComponent[] =
    assessment?.components && assessment.components.length > 0
      ? assessment.components
      : defaultComponents;

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

        const comps = d.assessment?.components || defaultComponents;

        // Pre-fill score state
        const initialMap: Record<string, StudentScoreState> = {};
        for (const item of rosterData) {
          const compMap: Record<string, string> = {};
          const savedComp = item.score?.componentScores || {};

          for (const c of comps) {
            if (savedComp[c.shortCode] !== undefined && savedComp[c.shortCode] !== null) {
              compMap[c.shortCode] = String(savedComp[c.shortCode]);
            } else if (item.score?.rawScore !== null && item.score?.rawScore !== undefined && comps.length === 1) {
              compMap[c.shortCode] = String(item.score.rawScore);
            } else {
              compMap[c.shortCode] = "";
            }
          }

          initialMap[item.student.id] = {
            components: compMap,
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

  const handleComponentScoreChange = (studentId: string, shortCode: string, val: string) => {
    setScores((prev) => {
      const current = prev[studentId] || { components: {}, status: "SCORED", notes: "" };
      return {
        ...prev,
        [studentId]: {
          ...current,
          components: {
            ...current.components,
            [shortCode]: val,
          },
        },
      };
    });
  };

  const handleStatusChange = (studentId: string, status: AssessmentScoreStatus) => {
    setScores((prev) => {
      const current = prev[studentId] || { components: {}, status: "SCORED", notes: "" };
      return {
        ...prev,
        [studentId]: {
          ...current,
          status,
        },
      };
    });
  };

  const handleNotesChange = (studentId: string, notes: string) => {
    setScores((prev) => {
      const current = prev[studentId] || { components: {}, status: "SCORED", notes: "" };
      return {
        ...prev,
        [studentId]: {
          ...current,
          notes,
        },
      };
    });
  };

  // Helper to compute student total score
  const getStudentTotal = (studentId: string): number => {
    const s = scores[studentId];
    if (!s || s.status !== "SCORED") return 0;
    let sum = 0;
    for (const c of activeComponents) {
      const val = parseFloat(s.components[c.shortCode] || "0");
      if (!isNaN(val)) sum += val;
    }
    return Math.round(sum * 100) / 100;
  };

  const handleSaveDraft = async () => {
    if (!assessment) return;
    setIsSaving(true);
    setFeedback(null);

    const payload = roster.map((item) => {
      const s = scores[item.student.id];
      const compMap: Record<string, number> = {};
      let sum = 0;
      for (const c of activeComponents) {
        const val = parseFloat(s?.components[c.shortCode] || "0");
        const numeric = isNaN(val) ? 0 : val;
        compMap[c.shortCode] = numeric;
        sum += numeric;
      }
      return {
        studentId: item.student.id,
        componentScores: compMap,
        rawScore: s?.status === "SCORED" ? sum : null,
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

      setFeedback({ type: "success", message: "Scores draft saved successfully! You can continue editing or submit for review." });
    } catch (err: unknown) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Error saving draft." });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmitForReview = async () => {
    if (
      !confirm(
        "Are you sure you want to submit this assessment to Super Admin and Admin for review? You will be able to review status, and if returned for correction you will be notified."
      )
    ) {
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      // First save current scores
      await handleSaveDraft();

      const res = await fetch(`/api/teacher/assessments/${assessmentId}/submit`, {
        method: "POST",
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit assessment");
      }

      setFeedback({
        type: "success",
        message: "Assessment submitted to Super Admin and Admin for review! Status is now SUBMITTED.",
      });
      setAssessment((prev) => (prev ? { ...prev, status: "SUBMITTED" } : null));
    } catch (err: unknown) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Error submitting assessment." });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <LoadingState description="Loading assessment details and score sheet..." />;
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
        subtitle={`${assessment.schoolClass.name} ${assessment.schoolClass.arm ? `(${assessment.schoolClass.arm})` : ""} · ${assessment.programme.name} · ${assessment.subject?.name || "General Subject"} · Max Score: 100`}
        breadcrumbs={[
          { label: "Teacher Portal", href: "/teacher" },
          { label: "Assessments", href: "/teacher/assessments" },
          { label: assessment.title },
        ]}
        badge={
          assessment.status === "FINALIZED" ? (
            <Badge variant="success">Finalized &amp; Published</Badge>
          ) : assessment.status === "APPROVED" ? (
            <Badge variant="info">Approved by Administration</Badge>
          ) : assessment.status === "SUBMITTED" ? (
            <Badge variant="warning">Submitted for Admin Review</Badge>
          ) : assessment.status === "RETURNED_FOR_CORRECTION" ? (
            <Badge variant="danger">Returned for Correction</Badge>
          ) : (
            <Badge variant="neutral">Draft (Editable)</Badge>
          )
        }
        primaryAction={
          isEditable ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSaveDraft}
                disabled={isSaving || isSubmitting}
                className="font-bold border-stone-300 text-stone-800 hover:bg-stone-100 flex items-center gap-1.5"
              >
                {isSaving ? "Saving..." : <span className="flex items-center gap-1.5"><Save className="w-4 h-4" /> Save Draft</span>}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSubmitForReview}
                disabled={isSaving || isSubmitting}
                className="font-bold bg-[#800020] hover:bg-[#6b001a] text-white shadow-xs flex items-center gap-1.5"
              >
                {isSubmitting ? "Submitting..." : assessment.status === "RETURNED_FOR_CORRECTION" ? <span className="flex items-center gap-1.5"><Send className="w-4 h-4" /> Re-Submit for Review</span> : <span className="flex items-center gap-1.5"><Send className="w-4 h-4" /> Submit for Review</span>}
              </Button>
            </div>
          ) : (
            <Link href="/teacher/assessments">
              <Button variant="outline" size="sm">
                ← Back to Assessments
              </Button>
            </Link>
          )
        }
      />

      {feedback && (
        <Alert
          variant={feedback.type === "success" ? "success" : "error"}
          title={feedback.type === "success" ? "Operation Successful" : "Attention"}
          onClose={() => setFeedback(null)}
        >
          {feedback.message}
        </Alert>
      )}

      {/* Return for Correction Banner */}
      {assessment.status === "RETURNED_FOR_CORRECTION" && (
        <Alert variant="danger" title="Returned for Correction by Administrator">
          <p className="font-semibold text-stone-900 mb-1">
            Correction Directives from {assessment.latestReview?.reviewerName || "Super Admin / Admin"}:
          </p>
          <div className="bg-white/90 p-3.5 rounded-xl border border-red-200 text-stone-900 text-sm mb-2 font-mono whitespace-pre-wrap">
            {assessment.latestReview?.comment || "Please review the scores and re-submit for review."}
          </div>
          <p className="text-xs text-stone-700">
            Make the required score corrections in the table below, then click <strong>&quot;Re-Submit for Review&quot;</strong>.
          </p>
        </Alert>
      )}

      {assessment.status === "SUBMITTED" && (
        <Alert variant="info" title="Pending Administrative Review">
          This assessment is currently under review by the Super Admin and Admin. Once approved, the terminal results will be locked and compiled into term report cards.
        </Alert>
      )}

      {assessment.status === "APPROVED" && (
        <Alert variant="success" title="Approved by Administration">
          This assessment has been reviewed and approved by the Super Admin. Marks are officially verified and finalized.
        </Alert>
      )}

      {/* Assessment Structure Info Banner */}
      <div className="p-3 sm:p-4 rounded-xl bg-[#FAF7F2] border border-[#EFE9DF] flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 text-xs">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar whitespace-nowrap py-0.5">
          <span className="font-extrabold text-[#800020] uppercase tracking-wider shrink-0">Evaluation Structure:</span>
          {activeComponents.map((c) => (
            <span key={c.shortCode} className="px-2.5 py-1 rounded-md bg-white border border-[#E2D6C5] font-semibold text-stone-800 shrink-0">
              {c.shortCode}: <strong>Max {c.maxScore}</strong>
            </span>
          ))}
          <span className="px-2.5 py-1 rounded-md bg-[#800020] text-white font-bold shrink-0">
            Total Max: 100
          </span>
        </div>
        <div className="text-stone-600 font-medium overflow-x-auto no-scrollbar whitespace-nowrap py-0.5">
          Grading Scale: <strong className="text-stone-800 font-bold">{assessment.gradingScale?.bands?.length ? assessment.gradingScale.bands.map(b => `${b.grade || b.name || "Grade"} (${b.remark || b.grade || b.name || ""})`).join(", ") : "A (Distinction), B (Very Good), C (Credit), D (Pass), F (Needs Improvement)"}</strong>
        </div>
      </div>

      {/* Score Entry Roster: Desktop and Tablet Table */}
      <div className="space-y-4">
        {roster.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-stone-500">
              No students are currently enrolled in this class. Enroll students first to record continuous assessments.
            </CardContent>
          </Card>
        ) : (
          <div className="bg-white rounded-2xl border border-[#E2D6C5] shadow-xs overflow-hidden">
            <TableWrapper>
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-[#FAF7F2] border-b border-[#E2D6C5] text-xs font-bold text-stone-700 uppercase tracking-wider">
                    <th className="py-3.5 px-3 w-10 text-center">#</th>
                    <th className="py-3.5 px-3 w-32">Admission No.</th>
                    <th className="py-3.5 px-4 min-w-[160px]">Student Name</th>
                    <th className="py-3.5 px-2 text-center w-28">Status</th>
                    {activeComponents.map((c) => (
                      <th key={c.shortCode} className="py-3.5 px-3 text-center w-24">
                        {c.shortCode} ({c.maxScore})
                      </th>
                    ))}
                    <th className="py-3.5 px-3 text-center w-20 font-black text-stone-900">Total</th>
                    <th className="py-3.5 px-3 text-center w-36">Grade</th>
                    <th className="py-3.5 px-4 min-w-[180px]">Remark</th>
                    <th className="py-3.5 px-3 min-w-[140px]">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFE9DF]">
                  {roster.map((item, idx) => {
                    const current = scores[item.student.id] || { components: {}, status: "SCORED", notes: "" };
                    const isScored = current.status === "SCORED";
                    const totalScore = isScored ? getStudentTotal(item.student.id) : 0;
                    const gradeInfo = isScored ? computeGradeAndRemark(totalScore, assessment.gradingScale?.bands) : null;

                    return (
                      <tr key={item.student.id} className="hover:bg-[#FAF7F2]/50 transition-colors">
                        <td className="py-3 px-3 text-xs font-mono text-stone-400 text-center">{idx + 1}</td>
                        <td className="py-3 px-3 text-xs font-mono font-bold text-[#800020] whitespace-nowrap">
                          {item.student.admissionNumber}
                        </td>
                        <td className="py-3 px-4 font-bold text-stone-900 whitespace-nowrap">
                          {item.student.lastName}, {item.student.firstName}
                        </td>
                        <td className="py-3 px-2 text-center">
                          {isEditable ? (
                            <select
                              value={current.status}
                              onChange={(e) => handleStatusChange(item.student.id, e.target.value as AssessmentScoreStatus)}
                              className="text-xs font-semibold py-1 px-1.5 rounded-lg border border-stone-200 bg-white text-stone-800 focus:outline-none focus:ring-1 focus:ring-[#800020]"
                            >
                              <option value="SCORED">Scored</option>
                              <option value="ABSENT">Absent</option>
                              <option value="EXEMPT">Exempt</option>
                            </select>
                          ) : (
                            <span className="text-xs font-semibold text-stone-600">{current.status}</span>
                          )}
                        </td>

                        {/* Component Score Inputs (e.g. CA and EXAM) */}
                        {activeComponents.map((c) => (
                          <td key={c.shortCode} className="py-3 px-3 text-center">
                            {isScored ? (
                              <input
                                type="number"
                                min="0"
                                max={c.maxScore}
                                step="0.5"
                                disabled={!isEditable}
                                value={current.components[c.shortCode] ?? ""}
                                onChange={(e) => handleComponentScoreChange(item.student.id, c.shortCode, e.target.value)}
                                placeholder="0"
                                className="w-20 text-center bg-[#FAF7F2] border border-[#DFCBB5] rounded-lg px-2 py-1.5 text-sm font-extrabold text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#800020] focus:bg-white disabled:bg-stone-100 disabled:text-stone-400"
                              />
                            ) : (
                              <span className="text-xs text-stone-400 italic">—</span>
                            )}
                          </td>
                        ))}

                        {/* Total Score */}
                        <td className="py-3 px-3 text-center">
                          {isScored ? (
                            <span className="text-base font-black text-stone-950 tabular-nums">
                              {totalScore}
                            </span>
                          ) : (
                            <span className="text-xs text-stone-400 italic">—</span>
                          )}
                        </td>

                        {/* Grade Badge */}
                        <td className="py-3 px-3 text-center">
                          {isScored && gradeInfo ? (
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs border ${gradeInfo.badgeClass} whitespace-nowrap`}>
                              {gradeInfo.grade}
                            </span>
                          ) : (
                            <span className="text-xs text-stone-400 italic">{current.status}</span>
                          )}
                        </td>

                        {/* Remark */}
                        <td className="py-3 px-4 text-xs font-semibold text-stone-700 whitespace-nowrap">
                          {isScored && gradeInfo ? gradeInfo.remark : "—"}
                        </td>

                        {/* Teacher Notes */}
                        <td className="py-3 px-3">
                          {isEditable ? (
                            <input
                              type="text"
                              value={current.notes}
                              onChange={(e) => handleNotesChange(item.student.id, e.target.value)}
                              placeholder="Optional remark"
                              className="w-full text-xs bg-[#FAF7F2] border border-[#DFCBB5] rounded-lg px-2.5 py-1 text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-[#800020]"
                            />
                          ) : (
                            <span className="text-xs text-stone-500">{current.notes || "—"}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrapper>
          </div>
        )}
      </div>

      {/* Floating Save Actions Footer */}
      {isEditable && (
        <div className="p-4 rounded-2xl bg-white border border-[#E2D6C5] shadow-md flex flex-wrap items-center justify-between gap-3 sticky bottom-4 z-20">
          <div className="text-xs text-stone-600">
            Scores update live. Click <strong>Save Draft</strong> to store progress, or <strong>Submit for Review</strong> to send to Super Admin &amp; Admin.
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="md"
              onClick={handleSaveDraft}
              disabled={isSaving || isSubmitting}
              className="font-bold border-stone-300 text-stone-800 hover:bg-stone-100 flex items-center gap-1.5"
            >
              {isSaving ? "Saving..." : <span className="flex items-center gap-1.5"><Save className="w-4 h-4" /> Save Draft</span>}
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={handleSubmitForReview}
              disabled={isSaving || isSubmitting}
              className="font-bold bg-[#800020] hover:bg-[#6b001a] text-white shadow-xs flex items-center gap-1.5"
            >
              {isSubmitting ? "Submitting..." : assessment.status === "RETURNED_FOR_CORRECTION" ? <span className="flex items-center gap-1.5"><Send className="w-4 h-4" /> Re-Submit for Review</span> : <span className="flex items-center gap-1.5"><Send className="w-4 h-4" /> Submit for Review</span>}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

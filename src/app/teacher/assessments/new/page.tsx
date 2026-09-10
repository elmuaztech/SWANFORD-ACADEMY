"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/layout/page-header";
import { LoadingState } from "@/components/ui/states";

interface ScopeInfo {
  schoolClassId: string;
  className: string;
  arm: string | null;
  programmeId: string;
  programmeName: string;
  subjectId?: string | null;
  subjectName?: string | null;
}

export default function NewAssessmentPage() {
  const router = useRouter();

  const [classes, setClasses] = useState<ScopeInfo[]>([]);
  const [gradingScales, setGradingScales] = useState<Array<{ id: string; name: string }>>([]);

  const [title, setTitle] = useState("");
  const [type, setType] = useState("CONTINUOUS_ASSESSMENT");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedProgrammeId, setSelectedProgrammeId] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");
  const [selectedGradingScaleId, setSelectedGradingScaleId] = useState("");
  const [maxScore, setMaxScore] = useState("100");
  const [weightPercentage, setWeightPercentage] = useState("100");

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load teacher profile & classes
    fetch("/api/teacher/me")
      .then((res) => res.json())
      .then((d) => {
        const clsList: ScopeInfo[] = d.classes || [];
        setClasses(clsList);

        if (clsList.length > 0) {
          setSelectedClassId(clsList[0].schoolClassId);
          setSelectedProgrammeId(clsList[0].programmeId);
          if (clsList[0].subjectId) {
            setSelectedSubjectId(clsList[0].subjectId);
          }
        }
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setIsLoading(false);
      });
  }, []);

  // Fetch grading scale for selected programme
  useEffect(() => {
    if (!selectedProgrammeId) return;

    // Fetch active grading scales
    fetch(`/api/academic/grading-scales?programmeId=${selectedProgrammeId}`)
      .then((res) => (res.ok ? res.json() : { scales: [] }))
      .then((d) => {
        const scales = d.scales || [];
        setGradingScales(scales);
        if (scales.length > 0) {
          setSelectedGradingScaleId(scales[0].id);
        }
      })
      .catch(() => {
        // Fallback default
        setGradingScales([]);
      });
  }, [selectedProgrammeId]);

  const handleClassSelect = (classId: string) => {
    setSelectedClassId(classId);
    const found = classes.find((c) => c.schoolClassId === classId);
    if (found) {
      setSelectedProgrammeId(found.programmeId);
      if (found.subjectId) {
        setSelectedSubjectId(found.subjectId);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Please provide an assessment title.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/teacher/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          type,
          programmeId: selectedProgrammeId,
          schoolClassId: selectedClassId,
          subjectId: selectedSubjectId || null,
          gradingScaleId: selectedGradingScaleId || undefined,
          maxScore: parseFloat(maxScore),
          weightPercentage: parseFloat(weightPercentage),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create assessment");
      }

      router.push(`/teacher/assessments/${data.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error creating assessment.");
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <LoadingState description="Loading teacher class scopes and configuration..." />;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <PageHeader
        title="Create Assessment"
        subtitle="Set up an assessment component to enter continuous evaluation marks."
        breadcrumbs={[
          { label: "Teacher Portal", href: "/teacher" },
          { label: "Assessments", href: "/teacher/assessments" },
          { label: "New" },
        ]}
      />

      {error && (
        <Alert variant="error" title="Cannot Create Assessment" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card className="bg-white border-[#EFE9DF] shadow-xs">
        <CardContent className="p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="assessment-title" className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
                Assessment Title *
              </label>
              <input
                id="assessment-title"
                type="text"
                placeholder="e.g. Continuous Assessment 1 (Mid-Term)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full bg-[#FAF7F2] border border-[#EFE9DF] rounded-lg px-3.5 py-2.5 text-sm font-semibold text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#800020] min-h-[44px]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="assessment-type" className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
                  Evaluation Type *
                </label>
                <select
                  id="assessment-type"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full bg-[#FAF7F2] border border-[#EFE9DF] rounded-lg px-3 py-2 text-sm font-semibold text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#800020] min-h-[44px]"
                >
                  <option value="CONTINUOUS_ASSESSMENT">Continuous Assessment (CA)</option>
                  <option value="EXAMINATION">Terminal Examination</option>
                  <option value="TAHFEEZ_EVALUATION">Tahfeez Evaluation</option>
                  <option value="PROJECT">Class Project / Assignment</option>
                </select>
              </div>

              <div>
                <label htmlFor="class-target" className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
                  Target Class *
                </label>
                <select
                  id="class-target"
                  value={selectedClassId}
                  onChange={(e) => handleClassSelect(e.target.value)}
                  className="w-full bg-[#FAF7F2] border border-[#EFE9DF] rounded-lg px-3 py-2 text-sm font-semibold text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#800020] min-h-[44px]"
                >
                  {classes.map((c) => (
                    <option key={`${c.schoolClassId}_${c.programmeId}`} value={c.schoolClassId}>
                      {c.className} {c.arm ? `(${c.arm})` : ""} · {c.programmeName}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {gradingScales.length > 0 && (
              <div>
                <label htmlFor="grading-scale-select" className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
                  Grading Scale
                </label>
                <select
                  id="grading-scale-select"
                  value={selectedGradingScaleId}
                  onChange={(e) => setSelectedGradingScaleId(e.target.value)}
                  className="w-full bg-[#FAF7F2] border border-[#EFE9DF] rounded-lg px-3 py-2 text-sm font-semibold text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#800020] min-h-[44px]"
                >
                  {gradingScales.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="max-score" className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
                  Max Possible Score *
                </label>
                <input
                  id="max-score"
                  type="number"
                  min="1"
                  max="1000"
                  step="0.5"
                  value={maxScore}
                  onChange={(e) => setMaxScore(e.target.value)}
                  required
                  className="w-full bg-[#FAF7F2] border border-[#EFE9DF] rounded-lg px-3 py-2 text-sm font-semibold text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#800020] min-h-[44px]"
                />
              </div>

              <div>
                <label htmlFor="weight-pct" className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
                  Term Weight Percentage (%) *
                </label>
                <input
                  id="weight-pct"
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  value={weightPercentage}
                  onChange={(e) => setWeightPercentage(e.target.value)}
                  required
                  className="w-full bg-[#FAF7F2] border border-[#EFE9DF] rounded-lg px-3 py-2 text-sm font-semibold text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#800020] min-h-[44px]"
                />
              </div>
            </div>

            <div className="pt-4 flex items-center justify-end gap-3 border-t border-[#EFE9DF]">
              <Link href="/teacher/assessments">
                <Button variant="ghost" type="button" className="min-h-[44px]">
                  Cancel
                </Button>
              </Link>
              <Button
                variant="primary"
                type="submit"
                className="bg-[#800020] hover:bg-[#6b001a] text-white px-6 font-bold min-h-[44px]"
                isLoading={isSubmitting}
              >
                Create & Enter Scores
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

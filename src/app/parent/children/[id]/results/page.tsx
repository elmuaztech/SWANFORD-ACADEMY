"use client";

import React, { useEffect, useState, use } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/states";

interface AssessmentComponent {
  assessmentId: string;
  title: string;
  type: string;
  rawScore: number | null;
  maxScore: number;
  weightPercentage: number;
  grade: string | null;
  remark: string | null;
}

interface SubjectResult {
  subjectId: string | null;
  subjectName: string;
  totalWeightedScore: number;
  grade: string;
  remark: string;
  isPass: boolean;
  components: AssessmentComponent[];
}

export default function ParentChildResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const studentId = resolvedParams.id;

  const [results, setResults] = useState<SubjectResult[]>([]);
  const [assessmentsCount, setAssessmentsCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/parent/children/${studentId}/results`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load academic results");
        return res.json();
      })
      .then((d) => {
        setResults(d.subjectResults || []);
        setAssessmentsCount(d.assessmentsCount || 0);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setIsLoading(false);
      });
  }, [studentId]);

  if (isLoading) {
    return <LoadingState description="Loading finalized academic report card..." />;
  }

  if (error) {
    return (
      <ErrorState
        title="Results Unavailable"
        message={error}
        onRetry={() => window.location.reload()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Official Academic Report Card"
        subtitle={`Term Performance Summary (${assessmentsCount} Finalized Assessments Published).`}
        breadcrumbs={[
          { label: "Parent Portal", href: "/parent" },
          { label: "Children" },
          { label: "Academic Results" },
        ]}
      />

      {results.length === 0 ? (
        <EmptyState
          title="No Published Results Yet"
          description="There are no finalized academic results published for this term. Grades will appear here once teachers have submitted and administration has officially published the assessments."
        />
      ) : (
        <div className="space-y-6">
          {/* Subject Breakdown Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {results.map((subj) => (
              <Card key={subj.subjectName} className="bg-white border-[#EFE9DF] shadow-xs">
                <CardHeader className="pb-3 border-b border-[#EFE9DF] flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-lg font-bold text-stone-900">{subj.subjectName}</CardTitle>
                    <span className="text-xs text-stone-500 font-medium">Official Term Grade</span>
                  </div>
                  <div className="text-right">
                    <Badge variant="brand" className="bg-[#FAF2F3] text-[#800020] text-sm font-bold px-3 py-1">
                      {subj.grade}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Weighted Score</span>
                    <span className="text-2xl font-bold text-stone-900">{subj.totalWeightedScore}%</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-stone-500">Remark</span>
                    <span className="font-semibold text-stone-800">{subj.remark || "Satisfactory"}</span>
                  </div>

                  {/* Component Breakdown */}
                  <div className="border-t border-[#EFE9DF] pt-3 space-y-2">
                    <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider block">
                      Assessment Components
                    </span>
                    <div className="space-y-1.5">
                      {subj.components.map((comp, idx) => (
                        <div
                          key={idx}
                          className="bg-[#FAF7F2] p-2 rounded-md border border-[#EFE9DF] flex items-center justify-between text-xs"
                        >
                          <div>
                            <span className="font-medium text-stone-900 block">{comp.title}</span>
                            <span className="text-[10px] text-stone-500">{comp.type.replace(/_/g, " ")} ({comp.weightPercentage}%)</span>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-stone-900 block">
                              {comp.rawScore !== null ? `${comp.rawScore} / ${comp.maxScore}` : "Absent/Exempt"}
                            </span>
                            {comp.grade && (
                              <span className="text-[10px] text-[#800020] font-semibold">
                                Grade {comp.grade}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

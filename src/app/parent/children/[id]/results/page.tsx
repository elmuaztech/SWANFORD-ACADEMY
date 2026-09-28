"use client";

import React, { useEffect, useState, use } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 bg-white rounded-xl border border-stone-200/80 shadow-xs">
            <div>
              <h3 className="text-sm font-bold text-stone-900">Official Terminal Report Sheet</h3>
              <p className="text-xs text-stone-500">
                Institutional report card with principal signature, position, affective evaluation, and comments.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(`/api/parent/reports/${studentId}`, "_blank")}
                leftIcon={
                  <svg className="w-4 h-4 text-stone-600" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                  </svg>
                }
              >
                View Report Sheet
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => window.open(`/api/parent/reports/${studentId}?download=pdf`, "_blank")}
                leftIcon={
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                }
              >
                Download PDF
              </Button>
            </div>
          </div>

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

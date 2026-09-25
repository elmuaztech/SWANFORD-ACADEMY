"use client";

import React, { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/states";

interface LinkedChild {
  studentId: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
}

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

export default function ParentResultsPage() {
  const [children, setChildren] = useState<LinkedChild[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [results, setResults] = useState<SubjectResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1. Fetch linked children
  useEffect(() => {
    fetch("/api/parent/me")
      .then((res) => {
        if (res.status === 401) {
          window.location.href = "/auth/login?from=/parent/results";
          return;
        }
        if (!res.ok) throw new Error("Failed to load your children");
        return res.json();
      })
      .then((data) => {
        const childList = data?.children || [];
        setChildren(childList);
        if (childList.length > 0) {
          setSelectedChildId(childList[0].studentId);
        }
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load parent records");
        setIsLoading(false);
      });
  }, []);

  // 2. Fetch results for selected child
  useEffect(() => {
    if (!selectedChildId) return;

    setIsLoadingResults(true);
    fetch(`/api/parent/children/${selectedChildId}/results`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load academic results");
        return res.json();
      })
      .then((d) => {
        setResults(d.subjectResults || []);
        setIsLoadingResults(false);
      })
      .catch((err) => {
        setError(err.message);
        setIsLoadingResults(false);
      });
  }, [selectedChildId]);

  if (isLoading) {
    return <LoadingState message="Loading academic report records..." />;
  }

  if (error && children.length === 0) {
    return (
      <ErrorState
        title="Results Unavailable"
        message={error}
        onRetry={() => window.location.reload()}
      />
    );
  }

  if (children.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Results"
          description="View finalized termly results, Continuous Assessment (CA), and examination scores."
        />
        <EmptyState
          title="No children registered"
          description="No children are currently linked to your parent account. Please contact the school office to verify enrollment."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Results"
        description="View finalized termly results, Continuous Assessment (CA), and examination scores."
      />

      {/* Child selector tabs if more than 1 child */}
      {children.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 p-1.5 bg-stone-100 rounded-lg max-w-xl">
          {children.map((child) => (
            <button
              key={child.studentId}
              type="button"
              onClick={() => setSelectedChildId(child.studentId)}
              className={`px-4 py-2 text-xs font-semibold rounded-md transition-all min-h-[40px] ${
                selectedChildId === child.studentId
                  ? "bg-white text-stone-900 shadow-xs border border-stone-200"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              {child.firstName} {child.lastName}
            </button>
          ))}
        </div>
      )}

      {isLoadingResults ? (
        <LoadingState message="Loading child academic results..." />
      ) : results.length === 0 ? (
        <EmptyState
          title="No results published yet"
          description="No finalized terminal assessment scores have been released for this term yet. Results will appear here once approved by the academic committee."
        />
      ) : (
        <div className="space-y-4">
          <Card className="border-[#EADBDA] bg-white overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-200/80 text-stone-600 uppercase tracking-wider font-semibold">
                    <th className="py-3 px-4">Subject</th>
                    <th className="py-3 px-4 text-center">Score</th>
                    <th className="py-3 px-4 text-center">Grade</th>
                    <th className="py-3 px-4">Teacher Remark</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {results.map((r, i) => (
                    <tr key={i} className="hover:bg-stone-50/50">
                      <td className="py-3 px-4 font-semibold text-stone-900">
                        {r.subjectName}
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-medium text-stone-900">
                        {r.totalWeightedScore.toFixed(1)}%
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-block px-2 py-0.5 rounded font-bold font-mono bg-stone-100 text-stone-800">
                          {r.grade}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-stone-600">
                        {r.remark || "—"}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge
                          variant={r.isPass ? "success" : "danger"}
                          className="text-[11px]"
                        >
                          {r.isPass ? "Pass" : "Needs Support"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

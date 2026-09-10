"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/states";

interface AssessmentListItem {
  id: string;
  title: string;
  type: string;
  status: "DRAFT" | "SUBMITTED" | "FINALIZED";
  maxScore: string | number;
  weightPercentage: string | number;
  programme: { name: string; code: string };
  schoolClass: { name: string; arm: string | null };
  subject?: { name: string; code: string } | null;
  academicSession: { name: string };
  academicTerm: { name: string };
  _count: { scores: number };
}

export default function TeacherAssessmentsPage() {
  const router = useRouter();
  const [assessments, setAssessments] = useState<AssessmentListItem[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/teacher/assessments")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load assessments");
        return res.json();
      })
      .then((d) => {
        setAssessments(d.assessments || []);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setIsLoading(false);
      });
  }, []);

  const filtered = assessments.filter((a) => {
    if (filterStatus === "ALL") return true;
    return a.status === filterStatus;
  });

  if (isLoading) {
    return <LoadingState description="Loading academic assessments..." />;
  }

  if (error) {
    return (
      <ErrorState
        title="Assessments Unavailable"
        message={error}
        onRetry={() => window.location.reload()}
      />
    );
  }

  const statusBadgeVariant = (status: string) => {
    switch (status) {
      case "FINALIZED":
        return <Badge variant="success">Finalized & Published</Badge>;
      case "SUBMITTED":
        return <Badge variant="warning">Submitted for Review</Badge>;
      default:
        return <Badge variant="neutral">Draft (Editable)</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Academic Assessments"
        subtitle="Create continuous assessments, enter marks, and submit for administrative finalization."
        breadcrumbs={[
          { label: "Teacher Portal", href: "/teacher" },
          { label: "Assessments" },
        ]}
        primaryAction={
          <Link href="/teacher/assessments/new">
            <Button variant="primary" className="bg-[#800020] hover:bg-[#6b001a] text-white">
              + Create Assessment
            </Button>
          </Link>
        }
      />

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-[#EFE9DF] pb-3">
        {["ALL", "DRAFT", "SUBMITTED", "FINALIZED"].map((st) => (
          <button
            key={st}
            onClick={() => setFilterStatus(st)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer min-h-[36px] ${
              filterStatus === st
                ? "bg-[#800020] text-white font-bold"
                : "bg-[#FAF7F2] text-stone-600 hover:text-stone-900 border border-[#EFE9DF]"
            }`}
          >
            {st === "ALL" ? "All Statuses" : st}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No Assessments Found"
          description="No assessments match the selected filter. Click 'Create Assessment' to create a new evaluation."
          actionLabel="Create New Assessment"
          onAction={() => router.push("/teacher/assessments/new")}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {filtered.map((ass) => (
            <Card key={ass.id} className="bg-white border-[#EFE9DF] hover:border-[#800020]/40 transition-colors shadow-xs">
              <CardContent className="p-5 space-y-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold text-stone-900 line-clamp-1">{ass.title}</h3>
                    <p className="text-xs text-stone-500 font-medium mt-0.5">
                      {ass.schoolClass.name} {ass.schoolClass.arm ? `(${ass.schoolClass.arm})` : ""} · {ass.programme.name}
                    </p>
                  </div>
                  {statusBadgeVariant(ass.status)}
                </div>

                <div className="bg-[#FAF7F2] rounded-lg p-3 text-xs space-y-1 border border-[#EFE9DF]">
                  <div className="flex justify-between">
                    <span className="text-stone-500">Subject</span>
                    <span className="font-semibold text-stone-900">{ass.subject?.name || "General Evaluation"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Evaluation Type</span>
                    <span className="font-medium text-stone-700">{ass.type.replace(/_/g, " ")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Max Score / Weight</span>
                    <span className="font-semibold text-stone-900">{ass.maxScore} pts · {ass.weightPercentage}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Scores Entered</span>
                    <span className="font-bold text-[#800020]">{ass._count.scores} students</span>
                  </div>
                </div>

                <div className="pt-1">
                  <Link href={`/teacher/assessments/${ass.id}`}>
                    <Button
                      variant={ass.status === "DRAFT" ? "primary" : "outline"}
                      size="sm"
                      className={`w-full text-xs ${
                        ass.status === "DRAFT" ? "bg-[#800020] hover:bg-[#6b001a] text-white" : ""
                      }`}
                    >
                      {ass.status === "DRAFT" ? "Enter / Edit Scores" : "View Assessment"}
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

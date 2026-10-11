"use client";

import React from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/layout/page-header";

export default function NewAssessmentPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <PageHeader
        title="Assessment Configuration Policy"
        subtitle="Notice regarding academic assessment creation"
        breadcrumbs={[
          { label: "Teacher Portal", href: "/teacher" },
          { label: "Assessments", href: "/teacher/assessments" },
          { label: "New Assessment" },
        ]}
      />

      <Card>
        <CardContent className="p-6 sm:p-8 space-y-6">
          <Alert variant="info" title="Administrative Function">
            Under school academic policy, continuous assessments, test weightings, and examination structures are configured and scheduled centrally by school administrators. Teachers are authorized to record student marks and submit scores for scheduled assessments.
          </Alert>

          <div className="space-y-3 text-sm text-stone-700 leading-relaxed">
            <p>
              To record marks for an existing scheduled assessment:
            </p>
            <ol className="list-decimal list-inside space-y-1.5 pl-2 text-stone-600 font-medium">
              <li>Navigate to the <strong>Assessments</strong> tab in your portal.</li>
              <li>Select your assigned class and subject assessment.</li>
              <li>Click <strong>Enter Marks</strong> to record, update, and submit student scores.</li>
            </ol>
            <p className="text-xs text-stone-500 pt-2">
              If an assessment for your subject or class is not yet listed, please contact your school administrator or academic coordinator to schedule it.
            </p>
          </div>

          <div className="pt-4 border-t border-[#EFE9DF] flex justify-end">
            <Link href="/teacher/assessments">
              <Button variant="primary" className="bg-[#800020] hover:bg-[#6b001a] text-white min-h-[44px]">
                ← Back to Teacher Assessments
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

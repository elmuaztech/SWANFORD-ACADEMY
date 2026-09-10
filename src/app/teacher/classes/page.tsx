"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/states";

interface ClassItem {
  schoolClassId: string;
  className: string;
  classCode: string;
  arm: string | null;
  programmeId: string;
  programmeName: string;
  programmeCode: string;
  isFormTeacher: boolean;
  subjectName?: string | null;
  studentCount: number;
}

export default function TeacherClassesPage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/teacher/me")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load assigned classes");
        return res.json();
      })
      .then((d) => {
        setClasses(d.classes || []);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setIsLoading(false);
      });
  }, []);

  if (isLoading) {
    return <LoadingState description="Loading your assigned classes and rosters..." />;
  }

  if (error) {
    return (
      <ErrorState
        title="Unable to Load Classes"
        message={error}
        onRetry={() => window.location.reload()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Assigned Classes"
        subtitle="Manage student rosters, record daily attendance, and track academic continuous assessments."
        breadcrumbs={[
          { label: "Teacher Portal", href: "/teacher" },
          { label: "My Classes" },
        ]}
      />

      {classes.length === 0 ? (
        <EmptyState
          title="No Classes Assigned"
          description="You do not have any classes or subjects assigned to your TeacherScope. Please contact the administrator to configure your academic scope."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {classes.map((cls) => (
            <Card key={`${cls.schoolClassId}_${cls.programmeId}`} className="bg-white border-[#EFE9DF] shadow-xs">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-bold text-stone-900 tracking-tight">
                      {cls.className} {cls.arm ? `(${cls.arm})` : ""}
                    </h3>
                    <p className="text-xs font-semibold text-[#800020] uppercase tracking-wider mt-0.5">
                      {cls.programmeName}
                    </p>
                  </div>
                  <Badge variant={cls.isFormTeacher ? "brand" : "neutral"} className="text-[11px]">
                    {cls.isFormTeacher ? "Form Teacher" : "Subject Teacher"}
                  </Badge>
                </div>

                <div className="bg-[#FAF7F2] rounded-lg p-3 text-xs space-y-1.5 border border-[#EFE9DF]">
                  <div className="flex justify-between">
                    <span className="text-stone-500">Active Students</span>
                    <span className="font-bold text-stone-900">{cls.studentCount}</span>
                  </div>
                  {cls.subjectName && (
                    <div className="flex justify-between">
                      <span className="text-stone-500">Subject</span>
                      <span className="font-semibold text-stone-900">{cls.subjectName}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-stone-500">Class Code</span>
                    <span className="font-mono text-stone-700">{cls.classCode}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Link href={`/teacher/classes/${cls.schoolClassId}?programmeId=${cls.programmeId}`}>
                    <Button variant="primary" size="sm" className="w-full text-xs bg-[#800020] hover:bg-[#6b001a] text-white">
                      View Roster
                    </Button>
                  </Link>
                  <Link href={`/teacher/attendance?schoolClassId=${cls.schoolClassId}&programmeId=${cls.programmeId}`}>
                    <Button variant="outline" size="sm" className="w-full text-xs">
                      Attendance
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

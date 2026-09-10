"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/states";

interface TeacherDashboardData {
  teacher: {
    firstName: string;
    lastName: string;
    staffIdNumber: string;
    qualification?: string;
  };
  activeSession: { name: string } | null;
  activeTerm: { name: string } | null;
  classesCount: number;
  totalStudents: number;
  draftAssessmentsCount: number;
  submittedAssessmentsCount: number;
  hasRecordedAttendanceToday: boolean;
  classes: Array<{
    schoolClassId: string;
    className: string;
    arm: string | null;
    programmeName: string;
    programmeCode: string;
    isFormTeacher: boolean;
    subjectName?: string | null;
    studentCount: number;
  }>;
}

export default function TeacherDashboardPage() {
  const [data, setData] = useState<TeacherDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/teacher/me")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load dashboard data");
        return res.json();
      })
      .then((d) => {
        setData(d);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setIsLoading(false);
      });
  }, []);

  if (isLoading) {
    return <LoadingState description="Loading teacher dashboard and active scopes..." />;
  }

  if (error || !data) {
    return (
      <ErrorState
        title="Dashboard Unavailable"
        message={error || "Could not retrieve teacher dashboard information."}
        onRetry={() => window.location.reload()}
      />
    );
  }

  const { teacher, activeSession, activeTerm, classes } = data;

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Page Header */}
      <PageHeader
        title={`Welcome, ${teacher.firstName} ${teacher.lastName}`}
        subtitle={`Staff ID: ${teacher.staffIdNumber} · Active Session: ${activeSession?.name || "None"} (${activeTerm?.name || "No Active Term"})`}
        badge={
          <Badge variant="brand" className="bg-[#FAF2F3] text-[#800020] border-[#EFE9DF]">
            Academic Faculty
          </Badge>
        }
        primaryAction={
          <div className="flex flex-wrap gap-2.5">
            <Link href="/teacher/attendance">
              <Button variant="primary" className="bg-[#800020] hover:bg-[#6b001a] text-white">
                Take Today&apos;s Attendance
              </Button>
            </Link>
            <Link href="/teacher/assessments/new">
              <Button variant="outline">
                New Assessment
              </Button>
            </Link>
          </div>
        }
      />

      {/* KPI Overview Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <Card className="bg-white border-[#EFE9DF] shadow-xs">
          <CardContent className="p-5">
            <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Assigned Classes</span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl sm:text-3xl font-bold text-stone-900">{data.classesCount}</span>
              <span className="text-xs font-medium text-[#800020]">Active Scopes</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-[#EFE9DF] shadow-xs">
          <CardContent className="p-5">
            <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Total Students</span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl sm:text-3xl font-bold text-stone-900">{data.totalStudents}</span>
              <span className="text-xs font-medium text-emerald-700">Enrolled</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-[#EFE9DF] shadow-xs">
          <CardContent className="p-5">
            <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Today&apos;s Attendance</span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-sm sm:text-base font-bold text-stone-900">
                {data.hasRecordedAttendanceToday ? "Recorded ✅" : "Pending ⏳"}
              </span>
              <span className="text-xs font-medium text-stone-500">Africa/Lagos</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-[#EFE9DF] shadow-xs">
          <CardContent className="p-5">
            <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Draft Assessments</span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl sm:text-3xl font-bold text-stone-900">{data.draftAssessmentsCount}</span>
              <span className="text-xs font-medium text-amber-700">In Progress</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Assigned Classes Roster Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg sm:text-xl font-bold text-stone-900 tracking-tight">Your Assigned Classes</h2>
          <Link href="/teacher/classes" className="text-xs sm:text-sm font-semibold text-[#800020] hover:underline">
            View All Classes →
          </Link>
        </div>

        {classes.length === 0 ? (
          <EmptyState
            title="No Assigned Classes Found"
            description="You currently do not have any classes or subjects assigned to your TeacherScope for this academic session."
            actionLabel="Refresh Scopes"
            onAction={() => window.location.reload()}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {classes.map((cls) => (
              <Card key={`${cls.schoolClassId}_${cls.programmeCode}`} className="bg-white border-[#EFE9DF] hover:border-[#800020]/30 transition-colors shadow-xs">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base sm:text-lg font-bold text-stone-900">
                        {cls.className} {cls.arm ? `(${cls.arm})` : ""}
                      </CardTitle>
                      <span className="text-xs font-medium text-stone-500">{cls.programmeName}</span>
                    </div>
                    {cls.isFormTeacher && (
                      <Badge variant="brand" className="bg-[#FAF2F3] text-[#800020] text-[10px]">
                        Form Teacher
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <div className="flex items-center justify-between text-xs text-stone-600 border-t border-[#EFE9DF] pt-3">
                    <span>Enrolled Students</span>
                    <span className="font-bold text-stone-900">{cls.studentCount} Students</span>
                  </div>
                  {cls.subjectName && (
                    <div className="flex items-center justify-between text-xs text-stone-600">
                      <span>Assigned Subject</span>
                      <span className="font-semibold text-stone-900">{cls.subjectName}</span>
                    </div>
                  )}
                  <div className="pt-2 flex gap-2">
                    <Link
                      href={`/teacher/classes/${cls.schoolClassId}?programmeId=${cls.programmeCode}`}
                      className="flex-1"
                    >
                      <Button variant="outline" size="sm" className="w-full text-xs">
                        Class Roster
                      </Button>
                    </Link>
                    <Link
                      href={`/teacher/attendance?schoolClassId=${cls.schoolClassId}&programmeId=${cls.programmeCode}`}
                      className="flex-1"
                    >
                      <Button variant="secondary" size="sm" className="w-full text-xs bg-[#FAF7F2] text-[#800020] hover:bg-[#F2ECE1]">
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
    </div>
  );
}

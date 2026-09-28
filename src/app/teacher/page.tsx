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

interface RecentNotice {
  id: string;
  subject: string;
  body: string;
  senderName?: string;
  createdAt: string;
  isRead?: boolean;
}

export default function TeacherDashboardPage() {
  const [data, setData] = useState<TeacherDashboardData | null>(null);
  const [notices, setNotices] = useState<RecentNotice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/teacher/me").then((res) => {
        if (res.status === 401) {
          window.location.href = "/auth/login?from=/teacher";
          return null;
        }
        if (!res.ok) throw new Error("Failed to load dashboard data");
        return res.json();
      }),
      fetch("/api/messages?limit=3").then((res) => (res.ok ? res.json() : null)),
    ])
      .then(([dashboardData, messagesData]) => {
        if (dashboardData) {
          setData(dashboardData);
        }
        if (messagesData?.messages) {
          setNotices(messagesData.messages);
        }
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setIsLoading(false);
      });
  }, []);

  if (isLoading) {
    return <LoadingState description="Loading teacher dashboard, active scopes, and academic records..." />;
  }

  if (error || !data) {
    const isAuthRequired =
      error?.toLowerCase().includes("authentication") ||
      error?.toLowerCase().includes("sign in") ||
      error?.toLowerCase().includes("unauthorized");

    return (
      <div className="py-8 max-w-xl mx-auto">
        <ErrorState
          title={isAuthRequired ? "Teacher Sign-In Required" : "Dashboard Unavailable"}
          message={
            isAuthRequired
              ? "Please sign in with your teacher account to access assigned classes and record student assessments."
              : error || "Could not retrieve teacher dashboard information."
          }
          actionLabel={isAuthRequired ? "Sign In to Portal" : "Try Again"}
          onAction={() => {
            if (isAuthRequired) {
              window.location.href = "/auth/login?from=/teacher";
            } else {
              window.location.reload();
            }
          }}
        />
      </div>
    );
  }

  const { teacher, activeSession, activeTerm, classes } = data;
  const todayStr = new Date().toLocaleDateString("en-NG", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Welcome Hero Card */}
      <div className="bg-gradient-to-r from-[#5B0612] via-[#800020] to-[#3B020B] rounded-2xl p-6 sm:p-8 text-white shadow-md relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-white/15 text-amber-200 backdrop-blur-sm border border-white/10">
                <span>👨‍🏫</span> Staff ID: {teacher.staffIdNumber}
              </span>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-white/10 text-white/90 border border-white/10">
                {activeSession?.name || "Active Session"} &bull; {activeTerm?.name || "Term in Session"}
              </span>
            </div>
            
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight">
              Welcome back, {teacher.firstName} {teacher.lastName}
            </h1>
            <p className="text-sm sm:text-base text-stone-200 max-w-xl">
              Today is <span className="font-semibold text-white">{todayStr}</span>. Here is your daily teaching and class overview.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link href="/teacher/attendance">
              <Button
                variant="primary"
                size="md"
                className="bg-amber-400 hover:bg-amber-300 text-[#5B0612] font-extrabold shadow-sm min-h-[44px]"
              >
                📝 Record Attendance
              </Button>
            </Link>
            <Link href="/teacher/assessments/new">
              <Button
                variant="outline"
                size="md"
                className="border-white/40 text-white hover:bg-white/10 font-bold min-h-[44px]"
              >
                + New Assessment
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* Card 1: Assigned Classes */}
        <Card className="bg-white border-[#EADBDA]/80 shadow-xs hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-stone-500">
                Assigned Classes
              </span>
              <div className="w-10 h-10 rounded-xl bg-[#FAF2F4] text-[#800020] flex items-center justify-center font-bold text-lg">
                📚
              </div>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-3xl font-extrabold text-stone-900 tracking-tight">
                {data.classesCount}
              </span>
              <Badge variant="brand" size="sm" className="bg-[#FAF2F4] text-[#800020]">
                Active Scopes
              </Badge>
            </div>
            <p className="text-xs text-stone-500 mt-2">
              Classes under your academic supervision
            </p>
          </CardContent>
        </Card>

        {/* Card 2: Total Students */}
        <Card className="bg-white border-[#EADBDA]/80 shadow-xs hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-stone-500">
                Total Students
              </span>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-lg">
                👥
              </div>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-3xl font-extrabold text-stone-900 tracking-tight">
                {data.totalStudents}
              </span>
              <Badge variant="success" size="sm">
                Enrolled
              </Badge>
            </div>
            <p className="text-xs text-stone-500 mt-2">
              Across all assigned classrooms
            </p>
          </CardContent>
        </Card>

        {/* Card 3: Today's Attendance Register */}
        <Card className="bg-white border-[#EADBDA]/80 shadow-xs hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-stone-500">
                Today&apos;s Attendance
              </span>
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold text-lg">
                📋
              </div>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-lg sm:text-xl font-extrabold text-stone-900">
                {data.hasRecordedAttendanceToday ? "Marked Today" : "Pending Entry"}
              </span>
              <Badge
                variant={data.hasRecordedAttendanceToday ? "success" : "warning"}
                size="sm"
              >
                {data.hasRecordedAttendanceToday ? "Completed" : "Action Needed"}
              </Badge>
            </div>
            <p className="text-xs text-stone-500 mt-2">
              {data.hasRecordedAttendanceToday
                ? "Daily roll call recorded successfully"
                : "Remember to mark class roll call today"}
            </p>
          </CardContent>
        </Card>

        {/* Card 4: Assessment Progress */}
        <Card className="bg-white border-[#EADBDA]/80 shadow-xs hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-stone-500">
                Pending Assessments
              </span>
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-lg">
                ✍️
              </div>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-3xl font-extrabold text-stone-900 tracking-tight">
                {data.draftAssessmentsCount}
              </span>
              <Badge variant="brand" size="sm" className="bg-indigo-50 text-indigo-700 border-indigo-200">
                Drafts
              </Badge>
            </div>
            <p className="text-xs text-stone-500 mt-2">
              Continuous assessments awaiting finalization
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Layout: Assigned Classes (Left) + Announcements & Quick Links (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
        
        {/* Left Column: Assigned Classes Roster (2 Cols) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-[#5B0612] tracking-tight">
                Your Assigned Classes
              </h2>
              <p className="text-xs text-stone-500">
                Click into any class to take attendance, record assessment scores, or view student profiles.
              </p>
            </div>
            <Link
              href="/teacher/classes"
              className="text-xs sm:text-sm font-bold text-[#800020] hover:underline shrink-0"
            >
              All Classes &rarr;
            </Link>
          </div>

          {classes.length === 0 ? (
            <EmptyState
              title="No Classes Assigned Yet"
              description="Your account is active. Once the Super Admin assigns a class to your profile, it will appear here immediately."
              actionLabel="Refresh Scopes"
              onAction={() => window.location.reload()}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {classes.map((cls) => (
                <Card
                  key={`${cls.schoolClassId}_${cls.programmeCode}`}
                  className="bg-white border-[#EADBDA]/80 hover:border-[#800020]/40 transition-all shadow-xs hover:shadow-md flex flex-col justify-between"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base sm:text-lg font-extrabold text-stone-900">
                          {cls.className} {cls.arm ? `(${cls.arm})` : ""}
                        </CardTitle>
                        <span className="text-xs font-semibold text-stone-500 block mt-0.5">
                          {cls.programmeName}
                        </span>
                      </div>
                      {cls.isFormTeacher && (
                        <Badge variant="brand" size="sm" className="bg-[#FAF2F4] text-[#800020] border-[#EADBDA]">
                          Form Teacher
                        </Badge>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4 pt-0">
                    <div className="p-3 rounded-xl bg-stone-50 border border-stone-100 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-base">🎒</span>
                        <span className="font-medium text-stone-600">Students</span>
                      </div>
                      <span className="font-extrabold text-stone-900 text-sm">
                        {cls.studentCount} Active
                      </span>
                    </div>

                    {cls.subjectName && (
                      <div className="flex items-center justify-between text-xs text-stone-600">
                        <span className="font-medium">Assigned Subject:</span>
                        <span className="font-bold text-[#800020]">{cls.subjectName}</span>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <Link
                        href={`/teacher/attendance?schoolClassId=${cls.schoolClassId}&programmeId=${cls.programmeCode}`}
                        className="w-full"
                      >
                        <Button
                          variant="primary"
                          size="sm"
                          className="w-full text-xs font-bold bg-[#800020] hover:bg-[#5B0612] text-white min-h-[40px]"
                        >
                          Attendance
                        </Button>
                      </Link>
                      <Link
                        href={`/teacher/classes/${cls.schoolClassId}?programmeId=${cls.programmeCode}`}
                        className="w-full"
                      >
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full text-xs font-semibold min-h-[40px]"
                        >
                          Roster
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Announcements & Directives */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg sm:text-xl font-bold text-[#5B0612] tracking-tight flex items-center gap-2">
              <span>🔔</span> Announcements &amp; Notices
            </h2>
            <Link
              href="/teacher/messages"
              className="text-xs font-bold text-[#800020] hover:underline"
            >
              Inbox &rarr;
            </Link>
          </div>

          <Card className="bg-white border-[#EADBDA]/80 shadow-xs">
            <CardContent className="p-4 sm:p-5 space-y-3">
              {notices.length === 0 ? (
                <div className="text-center py-6 px-3">
                  <div className="w-12 h-12 rounded-full bg-stone-100 text-stone-400 flex items-center justify-center mx-auto mb-2 text-xl">
                    📭
                  </div>
                  <p className="text-xs font-bold text-stone-700">No New Announcements</p>
                  <p className="text-[11px] text-stone-500 mt-1">
                    Directives and messages from school management will appear here and in your announcement bell.
                  </p>
                </div>
              ) : (
                notices.map((msg) => (
                  <Link
                    key={msg.id}
                    href="/teacher/messages"
                    className="block p-3 rounded-xl hover:bg-[#FAF2F4]/60 transition-colors border border-stone-100 hover:border-[#EADBDA]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-bold text-xs sm:text-sm text-stone-900 line-clamp-1">
                        {msg.subject || "Notice from Administration"}
                      </span>
                      <span className="text-[10px] text-stone-400 shrink-0">
                        {new Date(msg.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-xs text-stone-600 line-clamp-2 mt-1">
                      {msg.body}
                    </p>
                    {msg.senderName && (
                      <span className="text-[10px] font-semibold text-[#800020] block mt-1.5">
                        By: {msg.senderName}
                      </span>
                    )}
                  </Link>
                ))
              )}

              <div className="pt-2 border-t border-stone-100">
                <Link href="/teacher/messages">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs font-bold text-stone-700 min-h-[40px]"
                  >
                    Open Messages &amp; Announcements
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Teacher Quick Guidance */}
          <Card className="bg-[#FAF2F4]/50 border border-[#EADBDA] shadow-xs">
            <CardContent className="p-4 space-y-2 text-xs text-stone-700">
              <p className="font-extrabold text-[#800020] flex items-center gap-1.5">
                <span>💡</span> Teacher Portal Guidelines
              </p>
              <ul className="space-y-1.5 list-disc list-inside text-stone-600">
                <li>Mark class attendance before 9:00 AM daily.</li>
                <li>Enter and save test scores promptly for terminal processing.</li>
                <li>Check your announcement bell regularly for circulars.</li>
              </ul>
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}

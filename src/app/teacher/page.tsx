"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/states";
import { StatCard } from "@/components/ui/stat-card";

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
      {/* Welcome Hero Card: Matches Public Website Hero Maroon Palette */}
      <div className="relative rounded-2xl sm:rounded-3xl overflow-hidden bg-gradient-to-r from-[#3B030A] via-[#4D0610] to-[#250105] border border-[#6B1420] text-white shadow-xl p-6 sm:p-8">
        {/* Subtle radial dot pattern matching hero */}
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#F5D061_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-[#F5EBDC] text-[#5B0612] border border-[#DFCBB5] shadow-xs">
                <span>👨‍🏫</span> Staff ID: {teacher.staffIdNumber}
              </span>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-white/10 text-white/90 border border-white/20">
                {activeSession?.name || "Active Session"} &bull; {activeTerm?.name || "Term in Session"}
              </span>
            </div>
            
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-white font-heading" style={{ color: '#FFFFFF' }}>
              Welcome back, {teacher.firstName} {teacher.lastName}
            </h1>
            <p className="text-sm sm:text-base text-stone-200 max-w-xl leading-relaxed">
              Today is <span className="font-semibold text-[#F5D061]">{todayStr}</span>. Here is your daily teaching and class overview.
            </p>
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5 flex-nowrap overflow-x-auto no-scrollbar py-0.5 shrink-0 w-full md:w-auto">
            <Link href="/teacher/attendance" className="shrink-0">
              <Button
                variant="primary"
                size="sm"
                className="bg-[#F59E0B] hover:bg-[#D97706] text-stone-950 font-bold shadow-md hover:shadow-lg transition-all min-h-[38px] sm:min-h-[40px] px-3.5 sm:px-4 text-xs sm:text-sm whitespace-nowrap cursor-pointer active:scale-95"
              >
                📝 Record Attendance
              </Button>
            </Link>
            <Link href="/teacher/assessments/new" className="shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="border-white/40 text-white hover:bg-white/15 active:bg-white/25 font-bold min-h-[38px] sm:min-h-[40px] px-3.5 sm:px-4 text-xs sm:text-sm whitespace-nowrap backdrop-blur-xs cursor-pointer active:scale-95"
              >
                + New Assessment
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid: Animated Multi-Color StatCards with Large Digit Support */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <StatCard
          title="Assigned Classes"
          value={data.classesCount}
          subtitle="Classes under your supervision"
          icon={<span className="text-xl">📚</span>}
          badge={<Badge variant="brand" size="sm" className="whitespace-nowrap">Active Scopes</Badge>}
          color="maroon"
          href="/teacher/classes"
        />

        <StatCard
          title="Total Students"
          value={data.totalStudents}
          subtitle="Across all assigned classrooms"
          icon={<span className="text-xl">👥</span>}
          badge={<Badge variant="success" size="sm" className="whitespace-nowrap">Enrolled</Badge>}
          color="emerald"
        />

        <StatCard
          title="Today's Attendance"
          value={data.hasRecordedAttendanceToday ? "Marked Today" : "Pending Entry"}
          subtitle={
            data.hasRecordedAttendanceToday
              ? "Daily roll call recorded"
              : "Remember to mark class roll call"
          }
          icon={<span className="text-xl">📋</span>}
          badge={
            <Badge
              variant={data.hasRecordedAttendanceToday ? "success" : "warning"}
              size="sm"
              className="whitespace-nowrap"
            >
              {data.hasRecordedAttendanceToday ? "Completed" : "Action Needed"}
            </Badge>
          }
          color="amber"
          href="/teacher/attendance"
        />

        <StatCard
          title="Pending Assessments"
          value={data.draftAssessmentsCount}
          subtitle="Continuous assessment drafts"
          icon={<span className="text-xl">✍️</span>}
          badge={<Badge variant="neutral" size="sm" className="whitespace-nowrap">Drafts</Badge>}
          color="purple"
          href="/teacher/assessments"
        />
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

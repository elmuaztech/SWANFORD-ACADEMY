"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/states";
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
  TableMobileCard,
} from "@/components/ui/table";

interface StudentItem {
  id: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  otherNames?: string | null;
  preferredName?: string | null;
  gender?: string;
  dateOfBirth?: string | null;
  profilePhotoId?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
}

interface AssignedClass {
  schoolClassId: string;
  className: string;
  classCode?: string;
  arm: string | null;
  programmeId: string;
  programmeName: string;
  programmeCode: string;
  isFormTeacher: boolean;
  subjectId?: string | null;
  subjectName?: string | null;
  studentCount: number;
  availableSubjects?: Array<{ id: string; name: string; code: string }>;
}

interface TeacherDashboardData {
  teacher: {
    firstName: string;
    lastName: string;
    staffIdNumber: string;
    qualification?: string;
  };
  activeSession: { name: string; id?: string } | null;
  activeTerm: { name: string; id?: string } | null;
  classesCount: number;
  totalStudents: number;
  draftAssessmentsCount: number;
  submittedAssessmentsCount: number;
  hasRecordedAttendanceToday: boolean;
  classes: AssignedClass[];
  classStudents?: StudentItem[];
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

  // Active class selection & student roster state
  const [selectedClassIndex, setSelectedClassIndex] = useState(0);
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [isStudentsLoading, setIsStudentsLoading] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");

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
          if (dashboardData.classStudents && dashboardData.classStudents.length > 0) {
            setStudents(dashboardData.classStudents);
          }
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

  const handleSelectClass = async (index: number) => {
    setSelectedClassIndex(index);
    if (!data || !data.classes[index]) return;
    const cls = data.classes[index];
    setIsStudentsLoading(true);
    try {
      const progParam = cls.programmeId ? `?programmeId=${encodeURIComponent(cls.programmeId)}` : "";
      const res = await fetch(`/api/teacher/classes/${cls.schoolClassId}/students${progParam}`);
      if (res.ok) {
        const json = await res.json();
        setStudents(json.students || []);
      }
    } catch {
      // Retain existing students if fetch fails
    } finally {
      setIsStudentsLoading(false);
    }
  };

  const activeClass = data?.classes[selectedClassIndex] || null;

  const filteredStudents = useMemo(() => {
    if (!studentSearch.trim()) return students;
    const q = studentSearch.toLowerCase();
    return students.filter(
      (s) =>
        s.firstName?.toLowerCase().includes(q) ||
        s.lastName?.toLowerCase().includes(q) ||
        s.admissionNumber?.toLowerCase().includes(q) ||
        s.otherNames?.toLowerCase().includes(q)
    );
  }, [students, studentSearch]);

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
      {/* Welcome Hero Card: Swanford Brand Palette */}
      <div className="relative rounded-2xl sm:rounded-3xl overflow-hidden bg-gradient-to-r from-[#3B030A] via-[#4D0610] to-[#250105] border border-[#6B1420] text-white shadow-xl p-6 sm:p-8">
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
            <Link
              href={
                activeClass
                  ? `/teacher/attendance?schoolClassId=${activeClass.schoolClassId}&programmeId=${activeClass.programmeId}`
                  : "/teacher/attendance"
              }
              className="shrink-0"
            >
              <Button
                variant="primary"
                size="sm"
                className="bg-[#F59E0B] hover:bg-[#D97706] text-stone-950 font-bold shadow-md hover:shadow-lg transition-all min-h-[38px] sm:min-h-[40px] px-3.5 sm:px-4 text-xs sm:text-sm whitespace-nowrap cursor-pointer active:scale-95"
              >
                📝 Record Attendance
              </Button>
            </Link>
            <Link
              href={
                activeClass
                  ? `/teacher/assessments/new?classId=${activeClass.schoolClassId}&programmeId=${activeClass.programmeId}`
                  : "/teacher/assessments/new"
              }
              className="shrink-0"
            >
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

      {/* KPI Cards Grid */}
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
          title="Assessments"
          value={data.draftAssessmentsCount + data.submittedAssessmentsCount}
          subtitle={`${data.draftAssessmentsCount} Draft, ${data.submittedAssessmentsCount} Submitted`}
          icon={<span className="text-xl">✍️</span>}
          badge={<Badge variant="neutral" size="sm" className="whitespace-nowrap">Continuous</Badge>}
          color="purple"
          href="/teacher/assessments"
        />
      </div>

      {/* Primary Section: Active Class & Student Roster Display */}
      {classes.length === 0 ? (
        <EmptyState
          title="No Classes Assigned Yet"
          description="Your account is active. Once the Super Admin assigns a class to your profile, your students, subjects, and assessment forms will appear here immediately."
          actionLabel="Refresh Scopes"
          onAction={() => window.location.reload()}
        />
      ) : (
        <div className="space-y-4">
          {/* Class Tabs Selector (if teacher has multiple classes) */}
          {classes.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
              <span className="text-xs font-bold text-stone-500 uppercase tracking-wider shrink-0 mr-1">
                Select Class:
              </span>
              {classes.map((cls, idx) => {
                const isSelected = idx === selectedClassIndex;
                return (
                  <button
                    key={`${cls.schoolClassId}_${cls.programmeId}_${idx}`}
                    onClick={() => handleSelectClass(idx)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-2 ${
                      isSelected
                        ? "bg-[#800020] text-white shadow-sm ring-2 ring-[#800020]/20"
                        : "bg-white text-stone-700 hover:bg-stone-50 border border-stone-200"
                    }`}
                  >
                    <span>🏫 {cls.className} {cls.arm ? `(${cls.arm})` : ""}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      isSelected ? "bg-white/20 text-white" : "bg-stone-100 text-stone-600"
                    }`}>
                      {cls.studentCount}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Active Class Header Card */}
          {activeClass && (
            <Card className="bg-white border-[#EADBDA]/80 shadow-xs overflow-hidden">
              <div className="bg-gradient-to-r from-[#FAF2F4] via-white to-stone-50 border-b border-[#EADBDA] p-4 sm:p-5">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-extrabold px-2.5 py-0.5 rounded-full bg-[#800020] text-white">
                        {activeClass.className} {activeClass.arm ? `(${activeClass.arm})` : ""}
                      </span>
                      <span className="text-xs font-medium text-stone-600">
                        {activeClass.programmeName}
                      </span>
                      {activeClass.isFormTeacher && (
                        <Badge variant="brand" size="sm" className="bg-[#FAF2F4] text-[#800020] border-[#EADBDA]">
                          Form Teacher
                        </Badge>
                      )}
                    </div>

                    <h2 className="text-lg sm:text-xl font-extrabold text-[#5B0612] tracking-tight mt-1">
                      Assigned Class Students &amp; Roster
                    </h2>
                    <p className="text-xs text-stone-500 mt-0.5">
                      Showing students currently enrolled in this class. You can initiate CA &amp; Exam assessments and track daily attendance.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/teacher/attendance?schoolClassId=${activeClass.schoolClassId}&programmeId=${activeClass.programmeId}`}
                    >
                      <Button
                        variant="primary"
                        size="sm"
                        className="bg-[#800020] hover:bg-[#5B0612] text-white text-xs font-bold min-h-[38px] px-3.5"
                      >
                        📝 Take Attendance
                      </Button>
                    </Link>
                    <Link
                      href={`/teacher/assessments/new?classId=${activeClass.schoolClassId}&programmeId=${activeClass.programmeId}`}
                    >
                      <Button
                        variant="primary"
                        size="sm"
                        className="bg-[#F59E0B] hover:bg-[#D97706] text-stone-950 text-xs font-bold min-h-[38px] px-3.5"
                      >
                        ✍️ Record Assessments
                      </Button>
                    </Link>
                    <Link
                      href={`/teacher/classes/${activeClass.schoolClassId}?programmeId=${activeClass.programmeId}`}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-stone-700 text-xs font-semibold min-h-[38px] px-3.5"
                      >
                        Full Profile Roster
                      </Button>
                    </Link>
                  </div>
                </div>

                {/* Available Subjects Bar */}
                <div className="mt-4 pt-3 border-t border-stone-200/60">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="text-xs font-medium text-stone-600 flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-[#800020]">Subject Access:</span>
                      {activeClass.subjectName ? (
                        <span className="font-semibold text-stone-900 bg-white px-2 py-0.5 rounded-md border border-stone-200">
                          {activeClass.subjectName}
                        </span>
                      ) : (
                        <span className="font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                          ✓ All Class Subjects ({activeClass.availableSubjects?.length || 0} Available)
                        </span>
                      )}
                    </div>

                    {/* Quick Assessment Launch per Subject */}
                    {activeClass.availableSubjects && activeClass.availableSubjects.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] text-stone-500 font-semibold">Start Score Entry:</span>
                        {activeClass.availableSubjects.slice(0, 4).map((sub) => (
                          <Link
                            key={sub.id}
                            href={`/teacher/assessments/new?classId=${activeClass.schoolClassId}&subjectId=${sub.id}&programmeId=${activeClass.programmeId}`}
                          >
                            <span className="inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-md bg-stone-100 hover:bg-[#800020] text-stone-700 hover:text-white transition-colors cursor-pointer border border-stone-200">
                              {sub.name}
                            </span>
                          </Link>
                        ))}
                        {activeClass.availableSubjects.length > 4 && (
                          <Link
                            href={`/teacher/assessments/new?classId=${activeClass.schoolClassId}&programmeId=${activeClass.programmeId}`}
                            className="text-[11px] font-bold text-[#800020] hover:underline"
                          >
                            +{activeClass.availableSubjects.length - 4} more
                          </Link>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Student Roster Table & Search */}
              <CardContent className="p-4 sm:p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="w-full sm:w-72">
                    <Input
                      placeholder="Search students by name or admission no..."
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      className="text-xs h-9"
                    />
                  </div>

                  <div className="text-xs font-semibold text-stone-500">
                    Showing <span className="text-stone-900 font-bold">{filteredStudents.length}</span> of {students.length} students
                  </div>
                </div>

                {isStudentsLoading ? (
                  <div className="py-8 text-center text-xs text-stone-500">
                    <LoadingState description="Loading class students roster..." />
                  </div>
                ) : filteredStudents.length === 0 ? (
                  <div className="text-center py-10 px-4 bg-stone-50 rounded-xl border border-stone-100">
                    <div className="w-12 h-12 rounded-full bg-white shadow-xs text-stone-400 flex items-center justify-center mx-auto mb-2 text-xl border border-stone-200">
                      🎒
                    </div>
                    <p className="text-sm font-bold text-stone-800">
                      {students.length === 0 ? "No Students Currently Enrolled" : "No Matching Students"}
                    </p>
                    <p className="text-xs text-stone-500 max-w-md mx-auto mt-1">
                      {students.length === 0
                        ? "Students enrolled in this class by the administration will appear here automatically."
                        : `No student matches "${studentSearch}". Try searching by another keyword.`}
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Desktop Table View */}
                    <div className="hidden md:block overflow-x-auto border border-stone-200 rounded-xl">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-stone-50/80">
                            <TableHead className="w-12 text-xs font-bold text-stone-600">#</TableHead>
                            <TableHead className="text-xs font-bold text-stone-600">Student Name</TableHead>
                            <TableHead className="text-xs font-bold text-stone-600">Admission No.</TableHead>
                            <TableHead className="text-xs font-bold text-stone-600">Gender</TableHead>
                            <TableHead className="text-xs font-bold text-stone-600 text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredStudents.map((student, idx) => (
                            <TableRow key={student.id} className="hover:bg-stone-50/50">
                              <TableCell className="text-xs font-semibold text-stone-400">
                                {idx + 1}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2.5">
                                  <Avatar
                                    name={`${student.firstName} ${student.lastName}`}
                                    src={student.profilePhotoId ? `/api/documents/${student.profilePhotoId}` : undefined}
                                    size="sm"
                                  />
                                  <div>
                                    <div className="text-xs font-bold text-stone-900">
                                      {student.lastName.toUpperCase()}, {student.firstName} {student.otherNames || ""}
                                    </div>
                                    {student.preferredName && (
                                      <div className="text-[11px] text-stone-500 italic">
                                        Known as: {student.preferredName}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-xs font-mono font-bold text-stone-800">
                                {student.admissionNumber}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={student.gender === "MALE" ? "info" : student.gender === "FEMALE" ? "brand" : "neutral"}
                                  size="sm"
                                  className="text-[10px] uppercase font-bold"
                                >
                                  {student.gender || "N/A"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <Link
                                    href={`/teacher/attendance?schoolClassId=${activeClass.schoolClassId}&programmeId=${activeClass.programmeId}`}
                                  >
                                    <span className="inline-flex items-center px-2 py-1 rounded text-[11px] font-bold text-[#800020] bg-[#FAF2F4] hover:bg-[#800020] hover:text-white transition-colors cursor-pointer">
                                      Roll Call
                                    </span>
                                  </Link>
                                  <Link
                                    href={`/teacher/assessments/new?classId=${activeClass.schoolClassId}&programmeId=${activeClass.programmeId}`}
                                  >
                                    <span className="inline-flex items-center px-2 py-1 rounded text-[11px] font-bold text-amber-900 bg-amber-50 hover:bg-amber-600 hover:text-white transition-colors cursor-pointer">
                                      Assessment
                                    </span>
                                  </Link>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Mobile Card View */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:hidden">
                      {filteredStudents.map((student, idx) => (
                        <TableMobileCard
                          key={student.id}
                          title={
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-stone-400">#{idx + 1}</span>
                              <span className="font-bold text-xs text-stone-900">
                                {student.lastName.toUpperCase()}, {student.firstName}
                              </span>
                            </div>
                          }
                          subtitle={`Admission: ${student.admissionNumber}`}
                          badge={
                            <Badge
                              variant={student.gender === "MALE" ? "info" : "brand"}
                              size="sm"
                              className="text-[10px]"
                            >
                              {student.gender || "N/A"}
                            </Badge>
                          }
                          fields={[
                            {
                              label: "Class",
                              value: `${activeClass.className} ${activeClass.arm ? `(${activeClass.arm})` : ""}`,
                            },
                          ]}
                          actions={
                            <div className="flex items-center gap-2 w-full">
                              <Link
                                href={`/teacher/attendance?schoolClassId=${activeClass.schoolClassId}&programmeId=${activeClass.programmeId}`}
                                className="flex-1"
                              >
                                <Button variant="outline" size="sm" className="w-full text-xs font-bold text-[#800020]">
                                  Roll Call
                                </Button>
                              </Link>
                              <Link
                                href={`/teacher/assessments/new?classId=${activeClass.schoolClassId}&programmeId=${activeClass.programmeId}`}
                                className="flex-1"
                              >
                                <Button variant="primary" size="sm" className="w-full text-xs font-bold bg-[#800020] text-white">
                                  Assessment
                                </Button>
                              </Link>
                            </div>
                          }
                        />
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Secondary Grid: Assigned Classes Summary & Announcements */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
        
        {/* Left Column: All Assigned Classes (2 Cols) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-[#5B0612] tracking-tight">
                All Assigned Classes
              </h2>
              <p className="text-xs text-stone-500">
                Summary of classes assigned to your account under the active academic session.
              </p>
            </div>
            <Link
              href="/teacher/classes"
              className="text-xs sm:text-sm font-bold text-[#800020] hover:underline shrink-0"
            >
              All Classes &rarr;
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {classes.map((cls, idx) => (
              <Card
                key={`${cls.schoolClassId}_${cls.programmeId}_${idx}`}
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

                  <div className="flex items-center justify-between text-xs text-stone-600">
                    <span className="font-medium">Subject Scope:</span>
                    <span className="font-bold text-[#800020]">
                      {cls.subjectName || "All Subjects"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <Link
                      href={`/teacher/attendance?schoolClassId=${cls.schoolClassId}&programmeId=${cls.programmeId || cls.programmeCode}`}
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
                      href={`/teacher/classes/${cls.schoolClassId}?programmeId=${cls.programmeId || cls.programmeCode}`}
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
                <li>Submit assessments to Admin for review when grades are ready.</li>
              </ul>
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}

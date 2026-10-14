"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/layout/page-header";
import { LoadingState } from "@/components/ui/states";

interface TeacherClassItem {
  schoolClassId: string;
  className: string;
  arm: string | null;
  programmeId: string;
  programmeName: string;
  programmeCode: string;
  subjectId?: string | null;
  subjectName?: string | null;
  availableSubjects?: Array<{ id: string; name: string; code: string }>;
  studentCount: number;
}

export default function NewAssessmentPage() {
  const router = useRouter();
  const [classes, setClasses] = useState<TeacherClassItem[]>([]);
  const [activeSession, setActiveSession] = useState<{ name: string } | null>(null);
  const [activeTerm, setActiveTerm] = useState<{ name: string } | null>(null);

  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [customTitle, setCustomTitle] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/teacher/me")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load teacher scopes");
        return res.json();
      })
      .then((d) => {
        const cl: TeacherClassItem[] = d.classes || [];
        setClasses(cl);
        setActiveSession(d.activeSession || null);
        setActiveTerm(d.activeTerm || null);

        if (cl.length > 0) {
          setSelectedClassId(cl[0].schoolClassId);
          if (cl[0].availableSubjects && cl[0].availableSubjects.length > 0) {
            setSelectedSubjectId(cl[0].availableSubjects[0].id);
          } else if (cl[0].subjectId) {
            setSelectedSubjectId(cl[0].subjectId);
          }
        }
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setIsLoading(false);
      });
  }, []);

  const selectedClass = classes.find((c) => c.schoolClassId === selectedClassId);
  const availableSubjects = selectedClass?.availableSubjects || [];

  const handleClassChange = (classId: string) => {
    setSelectedClassId(classId);
    const cls = classes.find((c) => c.schoolClassId === classId);
    if (cls?.availableSubjects && cls.availableSubjects.length > 0) {
      setSelectedSubjectId(cls.availableSubjects[0].id);
    } else {
      setSelectedSubjectId(cls?.subjectId || "");
    }
  };

  const handleStartAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClass) {
      setError("Please select an assigned class.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const subjectObj = availableSubjects.find((s) => s.id === selectedSubjectId);
    const defaultTitle = customTitle.trim() || (subjectObj
      ? `${selectedClass.className} — ${subjectObj.name} Assessment & Exam`
      : `${selectedClass.className} — Continuous Assessment & Exam`);

    try {
      const res = await fetch("/api/teacher/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schoolClassId: selectedClass.schoolClassId,
          programmeId: selectedClass.programmeId,
          subjectId: selectedSubjectId || null,
          title: defaultTitle,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to initialize assessment score sheet.");
      }

      router.push(`/teacher/assessments/${data.assessment.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error starting assessment.");
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <LoadingState description="Loading your assigned classes and academic subjects..." />;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <PageHeader
        title="Start Academic Assessment"
        subtitle="Select your assigned class and subject to open or create a continuous assessment and exam score sheet."
        breadcrumbs={[
          { label: "Teacher Portal", href: "/teacher" },
          { label: "Assessments", href: "/teacher/assessments" },
          { label: "Start Assessment" },
        ]}
      />

      {error && (
        <Alert variant="error" title="Error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {classes.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center mx-auto text-stone-500">
              <BookOpen className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-stone-900">No Assigned Classes Found</h3>
            <p className="text-xs text-stone-600 max-w-md mx-auto">
              Your teacher account does not currently have any assigned classes or programmes. Please contact your Super Admin to assign your academic scope.
            </p>
            <div className="pt-2">
              <Link href="/teacher">
                <Button variant="outline" size="sm">
                  Return to Dashboard
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <form onSubmit={handleStartAssessment}>
          <Card className="bg-white border-[#E2D6C5] shadow-sm">
            <CardContent className="p-6 sm:p-7 space-y-5">
              <div className="p-3.5 rounded-xl bg-[#FAF7F2] border border-[#EFE9DF] text-xs text-stone-700 flex items-center justify-between">
                <div>
                  <span className="font-bold text-[#800020] block">Active Academic Calendar:</span>
                  <span>{activeSession?.name || "Active Session"} &bull; {activeTerm?.name || "Active Term"}</span>
                </div>
                <div className="text-right">
                  <span className="font-semibold text-stone-500 block">Structure:</span>
                  <span className="font-bold text-stone-900">CA (30) + Exam (70) = 100</span>
                </div>
              </div>

              {/* Class Selection */}
              <div>
                <label className="block text-xs font-bold text-stone-800 uppercase tracking-wide mb-1.5">
                  Select Assigned Class *
                </label>
                <select
                  value={selectedClassId}
                  onChange={(e) => handleClassChange(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-stone-300 bg-white text-sm font-semibold text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#800020]"
                >
                  {classes.map((c) => (
                    <option key={c.schoolClassId} value={c.schoolClassId}>
                      {c.className} {c.arm ? `(${c.arm})` : ""} &bull; {c.programmeName} ({c.studentCount} Students)
                    </option>
                  ))}
                </select>
              </div>

              {/* Subject Selection */}
              <div>
                <label className="block text-xs font-bold text-stone-800 uppercase tracking-wide mb-1.5">
                  Select Subject *
                </label>
                {availableSubjects.length > 0 ? (
                  <select
                    value={selectedSubjectId}
                    onChange={(e) => setSelectedSubjectId(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl border border-stone-300 bg-white text-sm font-semibold text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#800020]"
                  >
                    {availableSubjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs text-stone-600">
                    {selectedClass?.subjectName ? (
                      <span>Assigned Subject: <strong>{selectedClass.subjectName}</strong></span>
                    ) : (
                      <span>General Class Evaluation (All Subjects)</span>
                    )}
                  </div>
                )}
              </div>

              {/* Custom Title (Optional) */}
              <div>
                <label className="block text-xs font-bold text-stone-800 uppercase tracking-wide mb-1.5">
                  Assessment Title (Optional)
                </label>
                <input
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="e.g. First Term Mathematics Continuous Assessment & Exam"
                  className="w-full h-11 px-3 rounded-xl border border-stone-300 bg-white text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#800020]"
                />
                <span className="text-[11px] text-stone-500 mt-1 block">
                  Leave blank to automatically use the standard class and subject assessment title.
                </span>
              </div>

              <div className="pt-4 border-t border-[#EFE9DF] flex items-center justify-between">
                <Link href="/teacher/assessments">
                  <Button variant="outline" size="md">
                    Cancel
                  </Button>
                </Link>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={isSubmitting}
                  className="bg-[#800020] hover:bg-[#6b001a] text-white font-bold min-h-[44px]"
                >
                  {isSubmitting ? "Opening Score Sheet..." : "Open Score Sheet →"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      )}
    </div>
  );
}

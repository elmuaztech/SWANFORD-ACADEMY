"use client";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { Avatar } from "@/components/ui/avatar";

interface TeacherDetail {
  id: string;
  staffId: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  phonePrimary: string;
  phoneSecondary: string | null;
  qualification: string | null;
  employmentStatus: string;
  user: { id: string; email: string; status: string };
  scopes: Array<{
    id: string;
    scopeType: string;
    isClassTeacher: boolean;
    academicSession: { name: string };
    programme: { id: string; name: string };
    schoolClass: { id: string; name: string } | null;
    subject: { id: string; name: string } | null;
  }>;
}

interface ConfigData {
  academicSessions: Array<{ id: string; name: string; isCurrent: boolean }>;
  programmes: Array<{
    id: string;
    name: string;
    classes: Array<{ id: string; name: string }>;
  }>;
}

export default function TeacherDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const teacherId = resolvedParams.id;
  const router = useRouter();

  const [teacher, setTeacher] = useState<TeacherDetail | null>(null);
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Scope Modal State
  const [showScopeModal, setShowScopeModal] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [selectedProgrammeId, setSelectedProgrammeId] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [isClassTeacher, setIsClassTeacher] = useState(false);
  const [scopeSubmitting, setScopeSubmitting] = useState(false);

  const fetchTeacher = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`/api/admin/teachers/${teacherId}`),
      fetch(`/api/super-admin/config`),
    ])
      .then(async ([tRes, cRes]) => {
        if (!tRes.ok) throw new Error("Failed to load teacher profile.");
        const tJson = await tRes.json();
        setTeacher(tJson);

        if (cRes.ok) {
          const cJson = await cRes.json();
          setConfig(cJson);
          const currentSession = cJson.academicSessions?.find((s: { isCurrent: boolean }) => s.isCurrent);
          if (currentSession) setSelectedSessionId(currentSession.id);
          if (cJson.programmes?.[0]) setSelectedProgrammeId(cJson.programmes[0].id);
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Error retrieving teacher.");
        setLoading(false);
      });
  };

  useEffect(() => {
    Promise.all([
      fetch(`/api/admin/teachers/${teacherId}`),
      fetch(`/api/super-admin/config`),
    ])
      .then(async ([tRes, cRes]) => {
        if (!tRes.ok) throw new Error("Failed to load teacher profile.");
        const tJson = await tRes.json();
        setTeacher(tJson);

        if (cRes.ok) {
          const cJson = await cRes.json();
          setConfig(cJson);
          const currentSession = cJson.academicSessions?.find((s: { isCurrent: boolean }) => s.isCurrent);
          if (currentSession) setSelectedSessionId(currentSession.id);
          if (cJson.programmes?.[0]) setSelectedProgrammeId(cJson.programmes[0].id);
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Error retrieving teacher.");
        setLoading(false);
      });
  }, [teacherId]);

  const handleAssignScope = async () => {
    if (!selectedSessionId || !selectedProgrammeId) {
      alert("Academic Session and Programme are required.");
      return;
    }
    setScopeSubmitting(true);
    try {
      const res = await fetch(`/api/admin/teachers/${teacherId}/scopes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          academicSessionId: selectedSessionId,
          programmeId: selectedProgrammeId,
          schoolClassId: selectedClassId || undefined,
          isClassTeacher,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to assign scope.");
      setShowScopeModal(false);
      await fetchTeacher();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Scope assignment failed.");
    } finally {
      setScopeSubmitting(false);
    }
  };

  const handleRevokeScope = async (scopeId: string) => {
    if (!confirm("Are you sure you want to revoke this pedagogical scope?")) return;
    try {
      const res = await fetch(`/api/admin/teachers/${teacherId}/scopes/${scopeId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to revoke scope.");
      await fetchTeacher();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Scope revocation failed.");
    }
  };

  if (loading) {
    return (
      <div className="py-12">
        <LoadingState message="Loading teacher profile and active scopes..." />
      </div>
    );
  }

  if (error || !teacher) {
    return (
      <div className="py-8">
        <ErrorState
          title="Teacher Unavailable"
          message={error || "Could not retrieve teacher."}
          actionLabel="Back to Teachers"
          onAction={() => router.push("/admin/teachers")}
        />
      </div>
    );
  }

  const selectedProgramme = config?.programmes?.find((p) => p.id === selectedProgrammeId);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-stone-500 mb-1">
            <Link href="/admin/teachers" className="hover:underline">
              ← Faculty Directory
            </Link>
            <span>/</span>
            <span className="font-mono">{teacher.staffId}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight">
            {teacher.firstName} {teacher.lastName}
          </h1>
        </div>

        <Button
          variant="primary"
          size="md"
          onClick={() => setShowScopeModal(true)}
          className="bg-[#5B0612] text-white font-bold"
        >
          + Assign Academic Scope
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Bio Card */}
        <Card className="md:col-span-1">
          <CardHeader className="text-center pb-2">
            <div className="flex justify-center mb-3">
              <Avatar
                size="lg"
                fallback={`${teacher.firstName[0]}${teacher.lastName[0]}`}
                alt={`${teacher.firstName} ${teacher.lastName}`}
              />
            </div>
            <CardTitle className="text-lg font-bold text-stone-900">
              {teacher.firstName} {teacher.lastName}
            </CardTitle>
            <span className="text-xs font-mono font-bold text-[#5B0612]">{teacher.staffId}</span>
          </CardHeader>
          <CardContent className="space-y-3 pt-2 text-xs">
            <div className="flex justify-between py-1.5 border-b border-stone-100">
              <span className="text-stone-500">Employment Status</span>
              <Badge variant={teacher.employmentStatus === "ACTIVE" ? "success" : "neutral"} size="sm">
                {teacher.employmentStatus}
              </Badge>
            </div>
            <div className="py-1.5 border-b border-stone-100">
              <span className="text-stone-500 block">Email Address</span>
              <span className="font-semibold text-stone-900">{teacher.user?.email}</span>
            </div>
            <div className="py-1.5 border-b border-stone-100">
              <span className="text-stone-500 block">Primary Phone</span>
              <span className="font-semibold text-stone-900">{teacher.phonePrimary}</span>
            </div>
            <div className="py-1.5">
              <span className="text-stone-500 block">Qualification</span>
              <span className="font-semibold text-stone-900">{teacher.qualification || "Unspecified"}</span>
            </div>
          </CardContent>
        </Card>

        {/* Right Scope Roster */}
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold text-stone-900">
                Authoritative Teaching Scopes ({teacher.scopes?.length || 0})
              </CardTitle>
              <p className="text-xs text-stone-500">
                Determines which classes and roll-call records this educator is authorized to manage.
              </p>
            </CardHeader>
            <CardContent>
              {teacher.scopes.length === 0 ? (
                <div className="p-6 text-center text-xs text-stone-500 bg-stone-50 rounded-xl border border-stone-200">
                  No academic scopes assigned. Click &quot;Assign Academic Scope&quot; above to grant permissions.
                </div>
              ) : (
                <div className="space-y-3">
                  {teacher.scopes.map((sc) => (
                    <div
                      key={sc.id}
                      className="p-4 rounded-xl border border-stone-200 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-stone-900">
                            {sc.programme.name} — {sc.schoolClass?.name || "All Classes"}
                          </span>
                          {sc.isClassTeacher && (
                            <Badge variant="brand" size="sm">
                              Class Teacher
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-stone-600 mt-1">
                          Session: {sc.academicSession.name}
                          {sc.subject && ` • Subject: ${sc.subject.name}`}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRevokeScope(sc.id)}
                        className="text-rose-700 hover:bg-rose-50 font-semibold"
                      >
                        Revoke
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Scope Assignment Modal */}
      <Modal
        isOpen={showScopeModal}
        onClose={() => setShowScopeModal(false)}
        title="Assign Educator Academic Scope"
      >
        <div className="space-y-4 pt-2">
          <p className="text-xs text-stone-600">
            Grants this educator authority to record attendance and enter assessment marks for the specified class.
          </p>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">Academic Session</label>
            <select
              value={selectedSessionId}
              onChange={(e) => setSelectedSessionId(e.target.value)}
              className="w-full h-11 px-3 rounded-lg border border-stone-300 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#5B0612]"
            >
              {config?.academicSessions?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.isCurrent ? "(Current)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">Programme</label>
            <select
              value={selectedProgrammeId}
              onChange={(e) => setSelectedProgrammeId(e.target.value)}
              className="w-full h-11 px-3 rounded-lg border border-stone-300 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#5B0612]"
            >
              {config?.programmes?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">Class</label>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="w-full h-11 px-3 rounded-lg border border-stone-300 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#5B0612]"
            >
              <option value="">Programme-wide (All Classes)</option>
              {selectedProgramme?.classes?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-stone-800 cursor-pointer">
              <input
                type="checkbox"
                checked={isClassTeacher}
                onChange={(e) => setIsClassTeacher(e.target.checked)}
                className="w-4 h-4 text-[#5B0612] rounded border-stone-300 focus:ring-[#5B0612]"
              />
              Designate as Class Teacher (Roll-call primary)
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowScopeModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={scopeSubmitting}
              onClick={handleAssignScope}
              className="bg-[#5B0612] text-white font-bold"
            >
              {scopeSubmitting ? "Assigning..." : "Assign Scope"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

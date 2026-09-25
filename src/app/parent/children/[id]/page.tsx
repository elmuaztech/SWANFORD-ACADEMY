"use client";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { PageHeader } from "@/components/layout/page-header";
import { LoadingState, ErrorState } from "@/components/ui/states";

interface ChildDetails {
  student: {
    id: string;
    admissionNumber: string;
    firstName: string;
    lastName: string;
    otherNames?: string | null;
    preferredName?: string | null;
    gender: string;
    dateOfBirth: string;
    admissionDate: string;
    currentStatus: string;
    profilePhotoId?: string | null;
    bloodGroup?: string | null;
    genotype?: string | null;
    allergies?: string | null;
    medicalConditions?: string | null;
    emergencyContactName?: string | null;
    emergencyContactPhone?: string | null;
    emergencyContactRelationship?: string | null;
  };
  relationship: {
    relationshipType: string;
    isPrimaryContact: boolean;
    canPickup: boolean;
    receivesInvoices: boolean;
  };
  enrollments: Array<{
    programmeName: string;
    programmeCode: string;
    className: string;
    arm: string | null;
    sessionName: string;
    termName: string;
  }>;
}

export default function ParentChildProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const studentId = resolvedParams.id;

  const [data, setData] = useState<ChildDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/parent/children/${studentId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load child details or access unauthorized");
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
  }, [studentId]);

  if (isLoading) {
    return <LoadingState description="Loading child profile details..." />;
  }

  if (error || !data) {
    return (
      <ErrorState
        title="Access Denied or Not Found"
        message={error || "You are not authorized to view this student profile."}
        onRetry={() => window.location.reload()}
      />
    );
  }

  const { student, relationship, enrollments } = data;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PageHeader
        title={`${student.firstName} ${student.lastName}`}
        subtitle={`Admission Number: ${student.admissionNumber} · Status: ${student.currentStatus}`}
        breadcrumbs={[
          { label: "Parent Portal", href: "/parent" },
          { label: "Children" },
          { label: `${student.firstName} ${student.lastName}` },
        ]}
        primaryAction={
          <div className="flex gap-2">
            <Link href={`/parent/children/${studentId}/results`}>
              <Button variant="outline" size="sm">
                Academic Results
              </Button>
            </Link>
            {relationship.receivesInvoices && (
              <Link href={`/parent/children/${studentId}/finance`}>
                <Button variant="primary" size="sm" className="bg-[#800020] hover:bg-[#6b001a] text-white">
                  Finance & Invoices
                </Button>
              </Link>
            )}
          </div>
        }
      />

      {/* Demographics Card */}
      <Card className="bg-white border-[#EFE9DF] shadow-xs">
        <CardHeader>
          <CardTitle className="text-base sm:text-lg font-bold text-stone-900">
            Student Demographics & Academy Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 pb-4 border-b border-[#EFE9DF]">
            <Avatar
              src={student.profilePhotoId ? `/api/media/${student.profilePhotoId}` : null}
              name={`${student.firstName} ${student.lastName}`}
              size="xl"
            />
            <div>
              <h3 className="text-xl font-bold text-[#5B0612]">
                {student.firstName} {student.lastName}
              </h3>
              <p className="font-mono text-sm font-semibold text-[#800020]">{student.admissionNumber}</p>
              <p className="text-xs text-stone-500 mt-0.5">Status: {student.currentStatus}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider block">Full Name</span>
              <span className="font-bold text-stone-900 mt-1 block">
                {student.lastName}, {student.firstName} {student.otherNames || ""}
              </span>
            </div>
            <div>
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider block">Admission Number</span>
              <span className="font-mono font-bold text-[#800020] mt-1 block">{student.admissionNumber}</span>
            </div>
            <div>
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider block">Gender</span>
              <span className="text-stone-800 mt-1 block">{student.gender}</span>
            </div>
            <div>
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider block">Date of Birth</span>
              <span className="text-stone-800 mt-1 block">
                {new Date(student.dateOfBirth).toLocaleDateString("en-NG", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </div>
            <div>
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider block">Admission Date</span>
              <span className="text-stone-800 mt-1 block">
                {new Date(student.admissionDate).toLocaleDateString("en-NG", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
            <div>
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider block">Your Relationship</span>
              <span className="text-stone-800 mt-1 block font-semibold">
                {relationship.relationshipType.replace(/_/g, " ")}{" "}
                {relationship.isPrimaryContact && "· Primary Contact"}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Multi-Programme Enrollments */}
      <Card className="bg-white border-[#EFE9DF] shadow-xs">
        <CardHeader>
          <CardTitle className="text-base sm:text-lg font-bold text-stone-900">
            Active Programme Enrollments
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {enrollments.map((enr, i) => (
              <div
                key={i}
                className="p-3.5 bg-[#FAF7F2] rounded-lg border border-[#EFE9DF] flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div>
                  <span className="font-bold text-stone-900 text-sm block">
                    {enr.programmeName}: {enr.className} {enr.arm ? `(${enr.arm})` : ""}
                  </span>
                  <span className="text-stone-600">
                    Session: {enr.sessionName} · Term: {enr.termName}
                  </span>
                </div>
                <Badge variant="brand" className="bg-[#FAF2F3] text-[#800020] font-semibold">
                  Active Enrollment
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Medical & Health Records (Accessible to parent for their own child) */}
      <Card className="bg-white border-[#EFE9DF] shadow-xs">
        <CardHeader>
          <CardTitle className="text-base sm:text-lg font-bold text-stone-900">
            Health & Emergency Contact
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider block">Blood Group / Genotype</span>
              <span className="text-stone-800 mt-1 block">
                {student.bloodGroup || "Not recorded"} / {student.genotype || "Not recorded"}
              </span>
            </div>
            <div>
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider block">Known Allergies</span>
              <span className="text-stone-800 mt-1 block">{student.allergies || "None recorded"}</span>
            </div>
            <div className="sm:col-span-2">
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider block">Medical Conditions</span>
              <span className="text-stone-800 mt-1 block">{student.medicalConditions || "None recorded"}</span>
            </div>
            <div className="sm:col-span-2 bg-[#FAF7F2] p-3 rounded-lg border border-[#EFE9DF] text-xs space-y-1">
              <span className="font-semibold text-stone-700 block">Designated Emergency Contact</span>
              <p className="text-stone-900">
                {student.emergencyContactName || "Guardian on file"} · {student.emergencyContactPhone || "—"} ({student.emergencyContactRelationship || "Parent/Guardian"})
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

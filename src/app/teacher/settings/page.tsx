"use client";

import React, { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ImageUpload } from "@/components/ui/image-upload";
import { PageHeader } from "@/components/layout/page-header";
import { LoadingState, ErrorState } from "@/components/ui/states";

interface TeacherProfileData {
  teacher: {
    firstName: string;
    lastName: string;
    staffIdNumber: string;
    qualification: string | null;
    status: string;
    user: {
      email: string;
      phoneNumber: string | null;
      profilePhotoId?: string | null;
    };
    scopes: Array<{
      id: string;
      isFormTeacher: boolean;
      programme: { name: string; code: string };
      schoolClass?: { name: string; arm: string | null } | null;
      subject?: { name: string; code: string } | null;
      academicSession: { name: string };
    }>;
  };
  activeSession: { name: string } | null;
  activeTerm: { name: string } | null;
}

export default function TeacherSettingsPage() {
  const [data, setData] = useState<TeacherProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/teacher/me")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load profile");
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
    return <LoadingState description="Loading teacher profile and assigned scopes..." />;
  }

  if (error || !data) {
    return (
      <ErrorState
        title="Profile Unavailable"
        message={error || "Failed to load teacher profile."}
        onRetry={() => window.location.reload()}
      />
    );
  }

  const { teacher } = data;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="Teacher Profile & Scopes"
        subtitle="Manage your staff profile details and review active assigned academic scopes."
        breadcrumbs={[
          { label: "Teacher Portal", href: "/teacher" },
          { label: "Profile & Scopes" },
        ]}
      />

      <Card className="bg-white border-[#EFE9DF] shadow-xs">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-stone-900">Personal Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider block">Full Name</span>
              <span className="font-bold text-stone-900 mt-1 block">
                {teacher.firstName} {teacher.lastName}
              </span>
            </div>
            <div>
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider block">Staff ID Number</span>
              <span className="font-mono font-bold text-[#800020] mt-1 block">
                {teacher.staffIdNumber}
              </span>
            </div>
            <div>
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider block">Email Address</span>
              <span className="text-stone-800 mt-1 block">{teacher.user.email}</span>
            </div>
            <div>
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider block">Phone Number</span>
              <span className="text-stone-800 mt-1 block">{teacher.user.phoneNumber || "Not provided"}</span>
            </div>
            <div>
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider block">Qualification</span>
              <span className="text-stone-800 mt-1 block">{teacher.qualification || "Certified Teacher"}</span>
            </div>
            <div>
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider block">Status</span>
              <Badge variant="success" className="mt-1">
                {teacher.status}
              </Badge>
            </div>
          </div>

          <div className="pt-4 border-t border-[#EFE9DF]">
            <ImageUpload
              label="Staff Profile Photo"
              helperText="Upload your staff profile photo. JPEG, PNG, or WebP. Max 5 MB (automatically optimized)."
              currentImageUrl={teacher.user.profilePhotoId ? `/api/media/${teacher.user.profilePhotoId}` : null}
              uploadEndpoint="/api/teacher/me/photo"
              onUploadSuccess={(result) => {
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        teacher: {
                          ...prev.teacher,
                          user: { ...prev.teacher.user, profilePhotoId: result.assetId },
                        },
                      }
                    : null
                );
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white border-[#EFE9DF] shadow-xs">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-stone-900">Assigned Teacher Scopes (TeacherScope)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-stone-600 mb-4">
            TeacherScopes define the exact academic sessions, programmes, classes, and subjects you are authorized to manage in accordance with Section 8 authorization rules.
          </p>

          {teacher.scopes.length === 0 ? (
            <p className="text-sm text-stone-500 italic">No scopes currently assigned.</p>
          ) : (
            <div className="space-y-3">
              {teacher.scopes.map((sc) => (
                <div
                  key={sc.id}
                  className="p-3.5 bg-[#FAF7F2] rounded-lg border border-[#EFE9DF] flex flex-wrap items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-0.5">
                    <span className="font-bold text-stone-900 block text-sm">
                      {sc.schoolClass ? `${sc.schoolClass.name}${sc.schoolClass.arm ? ` (${sc.schoolClass.arm})` : ""}` : "All Classes (Programme-Wide)"}
                    </span>
                    <span className="text-stone-600">
                      Programme: <strong className="text-stone-800">{sc.programme.name}</strong> · Session: {sc.academicSession.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {sc.subject ? (
                      <Badge variant="neutral" className="text-xs">
                        Subject: {sc.subject.name}
                      </Badge>
                    ) : (
                      <Badge variant="brand" className="bg-[#FAF2F3] text-[#800020] text-xs">
                        All Subjects
                      </Badge>
                    )}
                    {sc.isFormTeacher && (
                      <Badge variant="brand" className="bg-[#FAF2F3] text-[#800020] text-xs font-bold">
                        Form Teacher
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

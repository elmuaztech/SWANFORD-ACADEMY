"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/states";

interface LinkedChild {
  studentId: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  otherNames?: string | null;
  gender: string;
  relationshipType: string;
  receivesInvoices: boolean;
  enrollments: Array<{
    programmeId: string;
    programmeName: string;
    programmeCode: string;
    schoolClassId: string;
    className: string;
    arm: string | null;
  }>;
}

interface ParentProfileResponse {
  guardian: {
    fullName: string;
    email: string;
    phonePrimary: string;
  };
  children: LinkedChild[];
}

export default function ParentChildrenPage() {
  const [children, setChildren] = useState<LinkedChild[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/parent/me")
      .then((res) => {
        if (res.status === 401) {
          window.location.href = "/auth/login?from=/parent/children";
          return;
        }
        if (!res.ok) throw new Error("Failed to load your children");
        return res.json();
      })
      .then((data: ParentProfileResponse) => {
        if (data && Array.isArray(data.children)) {
          setChildren(data.children);
        } else {
          setChildren([]);
        }
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load children");
        setIsLoading(false);
      });
  }, []);

  if (isLoading) {
    return <LoadingState message="Loading your children's profiles..." />;
  }

  if (error) {
    return (
      <ErrorState
        title="Could not load children"
        message={error}
        onRetry={() => window.location.reload()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Children"
        description="View your registered children at Swanford Academy, their classes, attendance and academic progress."
      />

      {children.length === 0 ? (
        <EmptyState
          title="No children linked yet"
          description="No children are currently linked to your parent account. If your child is enrolled at Swanford Academy, please contact the school administration to link your email address."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {children.map((child) => {
            const fullName = `${child.firstName} ${child.lastName}${
              child.otherNames ? ` ${child.otherNames}` : ""
            }`;

            return (
              <Card
                key={child.studentId}
                className="border-[#EADBDA] bg-white shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between"
              >
                <CardHeader className="border-b border-stone-100 pb-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-[#800020]/10 text-[#800020] font-bold text-lg flex items-center justify-center border border-[#800020]/20">
                        {child.firstName[0]}
                        {child.lastName[0]}
                      </div>
                      <div>
                        <CardTitle className="text-base font-bold text-stone-900">
                          {fullName}
                        </CardTitle>
                        <p className="text-xs font-mono text-stone-500 mt-0.5">
                          Adm No: {child.admissionNumber}
                        </p>
                      </div>
                    </div>
                    <Badge variant="neutral" className="text-xs font-medium capitalize">
                      {child.relationshipType.toLowerCase()}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="pt-4 space-y-4 flex-1">
                  <div>
                    <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider block mb-1.5">
                      Class & Programme Enrolment
                    </span>
                    {child.enrollments && child.enrollments.length > 0 ? (
                      <div className="space-y-2">
                        {child.enrollments.map((enr, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between bg-stone-50 border border-stone-200/60 p-2.5 rounded-lg text-xs"
                          >
                            <span className="font-semibold text-stone-800">
                              {enr.className} {enr.arm ? `(${enr.arm})` : ""}
                            </span>
                            <Badge className="bg-[#800020] text-white text-[11px]">
                              {enr.programmeName}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-stone-400 italic">No active class placement</p>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-xs text-stone-600 pt-2 border-t border-stone-100">
                    <div>
                      <span className="text-stone-400">Gender: </span>
                      <span className="font-medium capitalize">{child.gender.toLowerCase()}</span>
                    </div>
                    <div>
                      <span className="text-stone-400">Fee Invoices: </span>
                      <span className="font-medium">
                        {child.receivesInvoices ? "Yes" : "No"}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2">
                    <Link href={`/parent/children/${child.studentId}`}>
                      <Button variant="outline" size="sm" className="w-full text-xs min-h-[38px]">
                        Full Profile
                      </Button>
                    </Link>
                    <Link href={`/parent/children/${child.studentId}/attendance`}>
                      <Button variant="outline" size="sm" className="w-full text-xs min-h-[38px]">
                        Attendance
                      </Button>
                    </Link>
                    <Link href={`/parent/children/${child.studentId}/results`}>
                      <Button variant="outline" size="sm" className="w-full text-xs min-h-[38px]">
                        Results
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

interface AdmissionApplication {
  id: string;
  applicationNumber: string;
  studentName: string;
  programmeName: string;
  targetClassName?: string;
  status: "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "SHORTLISTED" | "ACCEPTED" | "REJECTED" | "ENROLLED";
  submittedAt?: string;
  acceptanceLetterUrl?: string;
  enrollmentDeadline?: string;
}

export default function ParentAdmissionsPage() {
  const router = useRouter();
  const [applications, setApplications] = useState<AdmissionApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadApplications() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/parent/admissions");
        if (res.status === 401) {
          router.push("/auth/login?from=/parent/admissions");
          return;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Failed to load admission applications");
        }
        const data = await res.json();
        setApplications(data.applications || []);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load applications");
      } finally {
        setLoading(false);
      }
    }

    loadApplications();
  }, [router]);

  const getStatusBadge = (status: AdmissionApplication["status"]) => {
    switch (status) {
      case "ACCEPTED":
      case "ENROLLED":
        return <Badge variant="success">Accepted</Badge>;
      case "SHORTLISTED":
        return <Badge variant="brand">Shortlisted</Badge>;
      case "UNDER_REVIEW":
        return <Badge variant="info">Under Review</Badge>;
      case "SUBMITTED":
        return <Badge variant="warning">Submitted</Badge>;
      case "REJECTED":
        return <Badge variant="danger">Unsuccessful</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-stone-200 animate-pulse rounded" />
        <div className="space-y-4">
          <div className="h-28 bg-stone-200 animate-pulse rounded-lg" />
          <div className="h-28 bg-stone-200 animate-pulse rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight">Admissions & Applications</h1>
          <p className="text-sm text-stone-600 mt-1">
            Track verified entrance applications and enrollment progress for your children
          </p>
        </div>
        <Link href="/admissions">
          <Button className="bg-[#800020] hover:bg-[#600018] text-white min-h-[44px] min-w-[44px] touch-manipulation">
            Apply for New Admission
          </Button>
        </Link>
      </div>

      {error && (
        <Alert variant="error" title="Error Loading Applications">
          {error}
        </Alert>
      )}

      {/* Security Note regarding email vs verified relationship */}
      <Alert variant="info" title="Verified Relationship Policy">
        For your child’s privacy, only applications linked directly to your verified guardian account are displayed. If an application submitted under your email address is missing, please contact Admissions with your application number for account verification.
      </Alert>

      {/* Applications List */}
      <div className="space-y-4">
        {applications.length === 0 ? (
          <Card className="bg-white border-stone-200">
            <CardContent className="p-8 text-center">
              <p className="text-base font-semibold text-stone-800">No Applications on File</p>
              <p className="text-sm text-stone-500 mt-1 max-w-md mx-auto">
                You do not have any active or previous admission applications linked to your verified guardian account.
              </p>
              <Link href="/admissions" className="inline-block mt-4">
                <Button variant="outline" className="border-stone-300 min-h-[44px] min-w-[44px] touch-manipulation">
                  Start New Application
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {applications.map((app) => (
              <Card key={app.id} className="bg-white border-stone-200 shadow-sm hover:border-stone-300 transition-colors">
                <div className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-stone-800">{app.applicationNumber}</span>
                      {getStatusBadge(app.status)}
                    </div>
                    <h3 className="text-lg font-bold text-stone-900">{app.studentName}</h3>
                    <p className="text-sm text-stone-600">
                      Programme: <span className="font-medium text-stone-800">{app.programmeName}</span>
                      {app.targetClassName && (
                        <span> • Class: <span className="font-medium text-stone-800">{app.targetClassName}</span></span>
                      )}
                    </p>
                    {app.submittedAt && (
                      <p className="text-xs text-stone-500">
                        Submitted on {new Date(app.submittedAt).toLocaleDateString("en-NG", { dateStyle: "medium" })}
                      </p>
                    )}
                  </div>

                  <div className="flex sm:flex-col sm:items-end justify-between items-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-stone-100">
                    {app.status === "ACCEPTED" && (
                      <div className="text-right">
                        <Badge variant="success">Offer Extended</Badge>
                        {app.enrollmentDeadline && (
                          <p className="text-xs text-stone-500 mt-1">
                            Accept by: {new Date(app.enrollmentDeadline).toLocaleDateString("en-NG", { dateStyle: "medium" })}
                          </p>
                        )}
                      </div>
                    )}
                    {app.status === "ENROLLED" && (
                      <Badge variant="neutral">Active Student</Badge>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

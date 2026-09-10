"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { ApplicationStatus } from "@prisma/client";

interface ApplicationItem {
  id: string;
  applicationNumber: string;
  applicantFirstName: string;
  applicantLastName: string;
  applicantGender: string;
  status: ApplicationStatus;
  paymentStatus: string;
  createdAt: string;
  cycle: { id: string; name: string; code: string };
  programmeSelections: Array<{
    programme: { id: string; name: string; code: string };
  }>;
}

export default function AdminAdmissionsPage() {
  const [applications, setApplications] = useState<ApplicationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const fetchApplications = () => {
    setLoading(true);
    setError(null);
    let url = "/api/admin/admissions";
    const params = new URLSearchParams();
    if (statusFilter) params.append("status", statusFilter);
    if (params.toString()) url += `?${params.toString()}`;

    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Failed to load admissions applications.");
        }
        return res.json();
      })
      .then((json) => {
        setApplications(json);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load admissions.");
        setLoading(false);
      });
  };

  useEffect(() => {
    let url = "/api/admin/admissions";
    const params = new URLSearchParams();
    if (statusFilter) params.append("status", statusFilter);
    if (params.toString()) url += `?${params.toString()}`;

    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Failed to load admissions applications.");
        }
        return res.json();
      })
      .then((json) => {
        setApplications(json);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load admissions.");
        setLoading(false);
      });
  }, [statusFilter]);

  const filtered = applications.filter((app) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      app.applicantFirstName.toLowerCase().includes(q) ||
      app.applicantLastName.toLowerCase().includes(q) ||
      app.applicationNumber.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight">
            Admissions Management
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Review applicant submissions, verify documents, record fee payments, and matriculate students.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="w-full sm:w-72">
            <Input
              placeholder="Search applicant name or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full sm:w-48"
            >
              <option value="">All Application Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="UNDER_REVIEW">Under Review</option>
              <option value="APPROVED">Approved</option>
              <option value="ENROLLED">Enrolled</option>
              <option value="REJECTED">Rejected</option>
            </Select>

            <Button variant="outline" onClick={fetchApplications} size="md">
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Content Table or States */}
      {loading ? (
        <div className="py-12">
          <LoadingState message="Loading admissions records..." />
        </div>
      ) : error ? (
        <ErrorState
          title="Unable to Load Admissions"
          message={error}
          actionLabel="Try Again"
          onAction={fetchApplications}
        />
      ) : filtered.length === 0 ? (
        <Card className="py-12 text-center">
          <CardContent>
            <p className="text-base font-semibold text-stone-700">No applications matched your criteria.</p>
            <p className="text-xs text-stone-500 mt-1">Try clearing filters or search keywords.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Application #</TableHead>
                  <TableHead>Applicant Name</TableHead>
                  <TableHead>Gender</TableHead>
                  <TableHead>Programme</TableHead>
                  <TableHead>Cycle</TableHead>
                  <TableHead>Fee Status</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((app) => (
                  <TableRow key={app.id}>
                    <TableCell className="font-mono text-xs font-semibold text-stone-900">
                      {app.applicationNumber}
                    </TableCell>
                    <TableCell className="font-bold text-stone-900">
                      {app.applicantFirstName} {app.applicantLastName}
                    </TableCell>
                    <TableCell className="text-xs text-stone-600">
                      {app.applicantGender}
                    </TableCell>
                    <TableCell className="text-xs text-stone-700">
                      {app.programmeSelections[0]?.programme?.name || "General"}
                    </TableCell>
                    <TableCell className="text-xs text-stone-500">
                      {app.cycle?.name || "Standard"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={app.paymentStatus === "PAID" ? "success" : "warning"}
                        size="sm"
                      >
                        {app.paymentStatus}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          app.status === "APPROVED" || app.status === "ENROLLED"
                            ? "success"
                            : app.status === "SUBMITTED" || app.status === "UNDER_REVIEW"
                            ? "info"
                            : app.status === "REJECTED"
                            ? "danger"
                            : "neutral"
                        }
                        size="sm"
                      >
                        {app.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/admin/admissions/${app.id}`}>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="bg-[#FDF2F4] text-[#5B0612] hover:bg-[#F9E2E6] font-semibold"
                        >
                          Review & Decision
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}

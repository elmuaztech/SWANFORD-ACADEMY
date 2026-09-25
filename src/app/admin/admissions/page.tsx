"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Button,
  Input,
  Select,
  Alert,
  LoadingState,
  ErrorState,
  EmptyState,
  PageHeader,
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableHeaderCell,
  TableBody,
  TableCell,
  TableWrapper,
  TableMobileCard,
} from "@/components";
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

interface AdmissionsStatusData {
  currentSession: { id: string; name: string } | null;
  activeCycle: { id: string; code: string; name: string; status: string } | null;
  isOpen: boolean;
  announcement: string;
  allSessions: Array<{ id: string; name: string; isCurrent: boolean }>;
  activeSessionId?: string | null;
  activeSessionName?: string | null;
}

export default function AdminAdmissionsPage() {
  const [applications, setApplications] = useState<ApplicationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  // Admissions Open/Close Control State
  const [statusData, setStatusData] = useState<AdmissionsStatusData | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);
  const [statusSuccessMessage, setStatusSuccessMessage] = useState<string | null>(null);

  const fetchAdmissionsStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/admissions/status");
      if (res.ok) {
        const json = await res.json();
        setStatusData(json);
        const targetId = json.activeSessionId || json.currentSession?.id;
        if (targetId) {
          setSelectedSessionId((prev) => prev || targetId);
        }
      }
    } catch {
      // Quiet fallback
    }
  }, []);

  const fetchApplications = useCallback(() => {
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
  }, [statusFilter]);

  useEffect(() => {
    fetchApplications();
    fetchAdmissionsStatus();
  }, [fetchApplications, fetchAdmissionsStatus]);

  const handleToggleAdmissions = async (open: boolean) => {
    setIsTogglingStatus(true);
    setStatusSuccessMessage(null);

    try {
      const targetSessionId = selectedSessionId || statusData?.activeSessionId || statusData?.currentSession?.id;
      const res = await fetch("/api/admin/admissions/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: targetSessionId,
          academicSessionId: targetSessionId,
          action: open ? "OPEN" : "CLOSE",
          isOpen: open,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update admissions status.");
      }

      setStatusSuccessMessage(
        open
          ? "Admissions have been opened. The public website is now accepting applications."
          : "Admissions have been closed. The public website now displays the closed announcement."
      );
      await fetchAdmissionsStatus();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to toggle admissions status.");
    } finally {
      setIsTogglingStatus(false);
    }
  };

  const filtered = applications.filter((app) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      app.applicantFirstName.toLowerCase().includes(q) ||
      app.applicantLastName.toLowerCase().includes(q) ||
      app.applicationNumber.toLowerCase().includes(q)
    );
  });

  const sessionName = statusData?.activeSessionName || statusData?.currentSession?.name || "Active Session";
  const isAdmissionsOpen = statusData?.isOpen ?? false;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admissions Management"
        description="Review applicant submissions, manage admissions cycle status, and record decisions."
        breadcrumbs={[
          { label: "Dashboard", href: "/admin" },
          { label: "Admissions" },
        ]}
      />

      {statusSuccessMessage && (
        <Alert variant="success" onClose={() => setStatusSuccessMessage(null)}>
          {statusSuccessMessage}
        </Alert>
      )}

      {/* ADMISSIONS CYCLE CONTROL CARD */}
      <Card className="border border-[#EADBDA] bg-white shadow-xs overflow-hidden">
        <CardHeader className="bg-[#FAF9F6] pb-3 border-b border-[#EADBDA]/60">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-base font-bold text-stone-900">
                Admissions Cycle Control
              </CardTitle>
              <p className="text-xs text-stone-500">
                Open or close public admissions in PostgreSQL and update the website dynamically
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-stone-500">Current Status:</span>
              <Badge variant={isAdmissionsOpen ? "success" : "neutral"} size="md">
                {isAdmissionsOpen ? "Admissions Open" : "Admissions Closed"}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            <div className="md:col-span-6 space-y-1.5">
              <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider">
                Target Academic Session
              </label>
              <Select
                value={selectedSessionId}
                onChange={(e) => setSelectedSessionId(e.target.value)}
                disabled={!statusData?.allSessions || statusData.allSessions.length === 0}
                className="w-full bg-white font-medium"
              >
                {!statusData?.allSessions || statusData.allSessions.length === 0 ? (
                  <option value="">No academic sessions created yet</option>
                ) : (
                  statusData.allSessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.isCurrent ? "(Active Session)" : ""}
                    </option>
                  ))
                )}
              </Select>
            </div>

            <div className="md:col-span-6 flex items-center gap-2">
              {isAdmissionsOpen ? (
                <Button
                  variant="outline"
                  size="md"
                  disabled={isTogglingStatus}
                  onClick={() => handleToggleAdmissions(false)}
                  className="w-full text-rose-800 border-rose-200 hover:bg-rose-50 font-bold min-h-[44px]"
                >
                  {isTogglingStatus ? "Updating..." : "Close Admissions"}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="md"
                  disabled={isTogglingStatus || !selectedSessionId}
                  onClick={() => handleToggleAdmissions(true)}
                  className="w-full font-bold min-h-[44px]"
                >
                  {isTogglingStatus
                    ? "Updating..."
                    : selectedSessionId
                    ? `Open Admissions for ${sessionName}`
                    : "Create Academic Session First"}
                </Button>
              )}
            </div>
          </div>

          <div className="p-3 bg-[#FDFCF9] rounded-xl border border-stone-200 text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-stone-500">Public Announcement Preview:</span>
              <span className="font-medium text-stone-900">
                {isAdmissionsOpen
                  ? `“Admissions for ${sessionName} are now open. Apply today.”`
                  : sessionName
                  ? `“Admissions for ${sessionName} are currently closed.”`
                  : `“Admissions are currently closed.”`}
              </span>
            </div>
            <Link
              href="/"
              target="_blank"
              className="text-[#800020] hover:underline font-bold shrink-0"
            >
              View Public Website &rarr;
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Filter and Search Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 w-full">
            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder="Search applicant name or ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full md:w-56 shrink-0"
            >
              <option value="">All Application Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="UNDER_REVIEW">Under Review</option>
              <option value="APPROVED">Approved</option>
              <option value="ENROLLED">Enrolled</option>
              <option value="REJECTED">Rejected</option>
            </Select>

            <Button variant="outline" onClick={fetchApplications} size="md" className="shrink-0 whitespace-nowrap">
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
        applications.length === 0 ? (
          <EmptyState
            title="No Admissions Applications"
            description="No student admission applications have been submitted yet. When applicants submit forms through the admissions portal, they will appear here for review."
            actionLabel={isAdmissionsOpen ? undefined : "Open Admissions"}
            onAction={isAdmissionsOpen ? undefined : () => handleToggleAdmissions(true)}
          />
        ) : (
          <EmptyState
            title="No Applications Match Filters"
            description="No applications found matching your search keyword or selected status."
            actionLabel="Clear Filters"
            onAction={() => {
              setSearch("");
              setStatusFilter("");
            }}
          />
        )
      ) : (
        <div>
          {/* Desktop Semantic Table View (>= 768px) */}
          <div className="hidden md:block">
            <TableWrapper className="border border-[#EADBDA]/80">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell className="w-14 text-center font-semibold text-stone-700">S/N</TableHeaderCell>
                    <TableHeaderCell className="w-44 text-left font-semibold text-stone-700">Application Number</TableHeaderCell>
                    <TableHeaderCell className="min-w-[200px] text-left font-semibold text-stone-700">Applicant Name</TableHeaderCell>
                    <TableHeaderCell className="w-24 text-left font-semibold text-stone-700">Gender</TableHeaderCell>
                    <TableHeaderCell className="min-w-[150px] text-left font-semibold text-stone-700">Programme</TableHeaderCell>
                    <TableHeaderCell className="w-28 text-left font-semibold text-stone-700">Cycle</TableHeaderCell>
                    <TableHeaderCell className="w-28 text-left font-semibold text-stone-700">Fee Status</TableHeaderCell>
                    <TableHeaderCell className="w-32 text-left font-semibold text-stone-700">Status</TableHeaderCell>
                    <TableHeaderCell className="w-32 text-right font-semibold text-stone-700">Action</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtered.map((app, index) => (
                    <TableRow key={app.id}>
                      <TableCell className="w-14 text-center text-xs font-semibold text-stone-500">
                        {index + 1}
                      </TableCell>
                      <TableCell className="w-44 font-mono text-xs font-bold text-stone-900">
                        {app.applicationNumber}
                      </TableCell>
                      <TableCell className="min-w-[200px] font-bold text-stone-900 break-words">
                        {app.applicantFirstName} {app.applicantLastName}
                      </TableCell>
                      <TableCell className="w-24 text-xs text-stone-600">
                        {app.applicantGender || "—"}
                      </TableCell>
                      <TableCell className="min-w-[150px] text-xs text-stone-700 break-words">
                        {app.programmeSelections[0]?.programme?.name || "—"}
                      </TableCell>
                      <TableCell className="w-28 text-xs text-stone-500">
                        {app.cycle?.name || "—"}
                      </TableCell>
                      <TableCell className="w-28">
                        <Badge
                          variant={app.paymentStatus === "PAID" ? "success" : "warning"}
                          size="sm"
                        >
                          {app.paymentStatus || "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="w-32">
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
                          {app.status || "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="w-32 text-right">
                        <Link href={`/admin/admissions/${app.id}`}>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="bg-[#FDF2F4] text-[#5B0612] hover:bg-[#F9E2E6] font-semibold whitespace-nowrap min-h-[36px]"
                          >
                            View Profile
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableWrapper>
          </div>

          {/* Mobile Responsive Cards (< 768px) */}
          <div className="block md:hidden space-y-3">
            {filtered.map((app, index) => (
              <TableMobileCard
                key={app.id}
                title={
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-stone-100 text-stone-700 text-xs font-bold shrink-0">
                      {index + 1}
                    </span>
                    <span className="font-mono text-xs font-bold text-stone-900 break-all">
                      {app.applicationNumber}
                    </span>
                  </div>
                }
                subtitle={
                  <div className="text-sm font-bold text-stone-900 mt-1 break-words">
                    {app.applicantFirstName} {app.applicantLastName}
                  </div>
                }
                badge={
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
                    {app.status || "—"}
                  </Badge>
                }
                fields={[
                  { label: "Gender", value: app.applicantGender || "—" },
                  { label: "Programme", value: app.programmeSelections[0]?.programme?.name || "—" },
                  { label: "Cycle", value: app.cycle?.name || "—" },
                  {
                    label: "Fee Status",
                    value: (
                      <Badge
                        variant={app.paymentStatus === "PAID" ? "success" : "warning"}
                        size="sm"
                      >
                        {app.paymentStatus || "—"}
                      </Badge>
                    ),
                  },
                ]}
                actions={
                  <Link href={`/admin/admissions/${app.id}`} className="w-full">
                    <Button
                      variant="secondary"
                      size="md"
                      className="w-full bg-[#FDF2F4] text-[#5B0612] hover:bg-[#F9E2E6] font-semibold min-h-[44px]"
                    >
                      View Profile
                    </Button>
                  </Link>
                }
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

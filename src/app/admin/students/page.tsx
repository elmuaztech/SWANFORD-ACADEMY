"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  Badge,
  Button,
  Input,
  Select,
  LoadingState,
  ErrorState,
  EmptyState,
  PageHeader,
  Table,
  TableHead,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
  TableWrapper,
  TableMobileCard,
} from "@/components";
import { StudentStatus } from "@prisma/client";

interface StudentListItem {
  id: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  gender: string;
  status: StudentStatus;
  primaryClass: { id: string; name: string } | null;
  tahfeezClass: { id: string; name: string } | null;
  guardians: Array<{
    guardian: { firstName: string; lastName: string; phonePrimary: string };
  }>;
}

export default function AdminStudentsPage() {
  const [students, setStudents] = useState<StudentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const fetchStudents = () => {
    setLoading(true);
    setError(null);
    let url = "/api/admin/students";
    const params = new URLSearchParams();
    if (statusFilter) params.append("status", statusFilter);
    if (search) params.append("search", search);
    if (params.toString()) url += `?${params.toString()}`;

    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Failed to load students directory.");
        }
        return res.json();
      })
      .then((json) => {
        setStudents(json.students || json);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load students.");
        setLoading(false);
      });
  };

  useEffect(() => {
    let url = "/api/admin/students";
    const params = new URLSearchParams();
    if (statusFilter) params.append("status", statusFilter);
    if (params.toString()) url += `?${params.toString()}`;

    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Failed to load students directory.");
        }
        return res.json();
      })
      .then((json) => {
        setStudents(json.students || json);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load students.");
        setLoading(false);
      });
  }, [statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchStudents();
  };

  const handleClearFilters = () => {
    setSearch("");
    setStatusFilter("");
    setLoading(true);
    fetch("/api/admin/students")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to reload students.");
        return res.json();
      })
      .then((json) => {
        setStudents(json.students || json);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load students.");
        setLoading(false);
      });
  };

  const isFiltered = Boolean(search || statusFilter);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Students Directory"
        description="Active and archived student enrollments, academic records, and linked guardians."
        breadcrumbs={[
          { label: "Dashboard", href: "/admin" },
          { label: "Students" },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/admin/students/bulk">
              <Button variant="outline" size="md">
                Bulk Enrollment
              </Button>
            </Link>
            <Link href="/admin/students/enroll">
              <Button variant="primary" size="md">
                + Enroll Pupil
              </Button>
            </Link>
          </div>
        }
      />

      {/* Filter and Search Bar */}
      <Card className="border border-[#EADBDA]/80">
        <CardContent className="p-4">
          <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row items-stretch md:items-center gap-3 w-full">
            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder="Search name or admission number..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full"
              />
            </div>

            <div className="w-full md:w-56 shrink-0">
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full"
              >
                <option value="">All Enrollment Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="SUSPENDED">Suspended</option>
                <option value="EXPELLED">Expelled</option>
                <option value="WITHDRAWN">Withdrawn</option>
                <option value="GRADUATED">Graduated</option>
              </Select>
            </div>

            <Button type="submit" variant="primary" size="md" className="font-bold whitespace-nowrap shrink-0">
              Search
            </Button>
            {isFiltered && (
              <Button type="button" variant="outline" size="md" onClick={handleClearFilters} className="whitespace-nowrap shrink-0">
                Clear
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Table or States */}
      {loading ? (
        <div className="py-12">
          <LoadingState message="Loading students roster..." />
        </div>
      ) : error ? (
        <ErrorState
          title="Students Unavailable"
          message={error}
          actionLabel="Retry"
          onAction={fetchStudents}
        />
      ) : students.length === 0 ? (
        isFiltered ? (
          <EmptyState
            title="No Students Found"
            description="No students match the specified enrollment status or search query."
            actionLabel="Clear Search Filters"
            onAction={handleClearFilters}
          />
        ) : (
          <EmptyState
            title="No Students Enrolled"
            description="There are currently no active or enrolled students in the directory. Matriculated applicants from the admissions portal will automatically appear here."
            actionLabel="Review Admissions"
            actionHref="/admin/admissions"
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
                    <TableHeaderCell className="w-44 text-left font-semibold text-stone-700">Admission Number</TableHeaderCell>
                    <TableHeaderCell className="min-w-[200px] text-left font-semibold text-stone-700">Student Name</TableHeaderCell>
                    <TableHeaderCell className="w-24 text-left font-semibold text-stone-700">Gender</TableHeaderCell>
                    <TableHeaderCell className="min-w-[140px] text-left font-semibold text-stone-700">Primary Class</TableHeaderCell>
                    <TableHeaderCell className="min-w-[140px] text-left font-semibold text-stone-700">Tahfeez Class</TableHeaderCell>
                    <TableHeaderCell className="min-w-[180px] text-left font-semibold text-stone-700">Guardian Contact</TableHeaderCell>
                    <TableHeaderCell className="w-28 text-left font-semibold text-stone-700">Status</TableHeaderCell>
                    <TableHeaderCell className="w-32 text-right font-semibold text-stone-700">Action</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {students.map((st, index) => (
                    <TableRow key={st.id}>
                      <TableCell className="w-14 text-center text-xs font-semibold text-stone-500">
                        {index + 1}
                      </TableCell>
                      <TableCell className="w-44 font-mono text-xs font-bold text-stone-900">
                        {st.admissionNumber}
                      </TableCell>
                      <TableCell className="min-w-[200px] font-bold text-stone-900 break-words">
                        {st.firstName} {st.middleName ? `${st.middleName} ` : ""}{st.lastName}
                      </TableCell>
                      <TableCell className="w-24 text-xs text-stone-600">
                        {st.gender}
                      </TableCell>
                      <TableCell className="min-w-[140px] text-xs text-stone-800 font-semibold">
                        {st.primaryClass?.name || "—"}
                      </TableCell>
                      <TableCell className="min-w-[140px] text-xs text-stone-800 font-semibold">
                        {st.tahfeezClass?.name || "—"}
                      </TableCell>
                      <TableCell className="min-w-[180px] text-xs text-stone-600 break-words">
                        {st.guardians?.[0]
                          ? `${st.guardians[0].guardian.firstName} ${st.guardians[0].guardian.lastName} (${st.guardians[0].guardian.phonePrimary})`
                          : "—"}
                      </TableCell>
                      <TableCell className="w-28">
                        <Badge
                          variant={
                            st.status === "ACTIVE"
                              ? "success"
                              : st.status === "SUSPENDED"
                              ? "warning"
                              : st.status === "GRADUATED"
                              ? "info"
                              : "danger"
                          }
                          size="sm"
                        >
                          {st.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="w-32 text-right">
                        <Link href={`/admin/students/${st.id}`}>
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
            {students.map((st, index) => (
              <TableMobileCard
                key={st.id}
                title={
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-stone-100 text-stone-700 text-xs font-bold shrink-0">
                      {index + 1}
                    </span>
                    <span className="font-mono text-xs font-bold text-stone-900 break-all">
                      {st.admissionNumber}
                    </span>
                  </div>
                }
                subtitle={
                  <div className="text-sm font-bold text-stone-900 mt-1 break-words">
                    {st.firstName} {st.middleName ? `${st.middleName} ` : ""}{st.lastName}
                  </div>
                }
                badge={
                  <Badge
                    variant={
                      st.status === "ACTIVE"
                        ? "success"
                        : st.status === "SUSPENDED"
                        ? "warning"
                        : st.status === "GRADUATED"
                        ? "info"
                        : "danger"
                    }
                    size="sm"
                  >
                    {st.status}
                  </Badge>
                }
                fields={[
                  { label: "Gender", value: st.gender || "—" },
                  { label: "Primary Class", value: st.primaryClass?.name || "—" },
                  { label: "Tahfeez Class", value: st.tahfeezClass?.name || "—" },
                  {
                    label: "Guardian",
                    value: st.guardians?.[0]
                      ? `${st.guardians[0].guardian.firstName} ${st.guardians[0].guardian.lastName} (${st.guardians[0].guardian.phonePrimary})`
                      : "—",
                  },
                ]}
                actions={
                  <Link href={`/admin/students/${st.id}`} className="w-full">
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

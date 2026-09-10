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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight">
            Students Directory
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Active and archived student enrollments, academic records, and linked guardians.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <Card>
        <CardContent className="p-4">
          <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="w-full sm:w-80">
              <Input
                placeholder="Search name or admission number..."
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
                <option value="">All Enrollment Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="SUSPENDED">Suspended</option>
                <option value="EXPELLED">Expelled</option>
                <option value="WITHDRAWN">Withdrawn</option>
                <option value="GRADUATED">Graduated</option>
              </Select>

              <Button type="submit" variant="primary" size="md" className="bg-[#5B0612] text-white font-bold">
                Search
              </Button>
            </div>
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
        <Card className="py-12 text-center">
          <CardContent>
            <p className="text-base font-semibold text-stone-700">No student records found.</p>
            <p className="text-xs text-stone-500 mt-1">Try modifying your search or filter parameters.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Admission #</TableHead>
                  <TableHead>Student Name</TableHead>
                  <TableHead>Gender</TableHead>
                  <TableHead>Primary Class</TableHead>
                  <TableHead>Tahfeez Class</TableHead>
                  <TableHead>Guardian Contact</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((st) => (
                  <TableRow key={st.id}>
                    <TableCell className="font-mono text-xs font-bold text-stone-900">
                      {st.admissionNumber}
                    </TableCell>
                    <TableCell className="font-bold text-stone-900">
                      {st.firstName} {st.lastName}
                    </TableCell>
                    <TableCell className="text-xs text-stone-600">
                      {st.gender}
                    </TableCell>
                    <TableCell className="text-xs text-stone-800 font-semibold">
                      {st.primaryClass?.name || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-stone-800 font-semibold">
                      {st.tahfeezClass?.name || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-stone-600">
                      {st.guardians?.[0]
                        ? `${st.guardians[0].guardian.firstName} (${st.guardians[0].guardian.phonePrimary})`
                        : "—"}
                    </TableCell>
                    <TableCell>
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
                    <TableCell className="text-right">
                      <Link href={`/admin/students/${st.id}`}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-[#5B0612] hover:bg-[#FDF2F4] font-semibold"
                        >
                          View Profile
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

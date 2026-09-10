"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";

interface TeacherItem {
  id: string;
  staffId: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  phonePrimary: string;
  qualification: string | null;
  employmentStatus: string;
  user: { id: string; email: string; status: string };
  scopes: Array<{
    id: string;
    scopeType: string;
    isClassTeacher: boolean;
    programme: { name: string };
    schoolClass: { name: string } | null;
    subject: { name: string } | null;
  }>;
}

export default function AdminTeachersPage() {
  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const fetchTeachers = () => {
    setLoading(true);
    setError(null);
    let url = "/api/admin/teachers";
    if (search) url += `?search=${encodeURIComponent(search)}`;
    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Failed to load teachers roster.");
        }
        return res.json();
      })
      .then((json) => {
        setTeachers(json.teachers || json);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load teachers.");
        setLoading(false);
      });
  };

  useEffect(() => {
    fetch("/api/admin/teachers")
      .then(async (res) => {
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Failed to load teachers roster.");
        }
        return res.json();
      })
      .then((json) => {
        setTeachers(json.teachers || json);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load teachers.");
        setLoading(false);
      });
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTeachers();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight">
            Teaching Faculty
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Registered educators, staff identifiers, and class/subject pedagogical scopes.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="w-full sm:w-80">
              <Input
                placeholder="Search staff name, ID, or qualification..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" variant="primary" size="md" className="bg-[#5B0612] text-white font-bold">
                Search
              </Button>
              <Button type="button" variant="outline" size="md" onClick={() => { setSearch(""); fetchTeachers(); }}>
                Clear
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {loading ? (
        <div className="py-12">
          <LoadingState message="Loading teaching faculty..." />
        </div>
      ) : error ? (
        <ErrorState
          title="Faculty Roster Unavailable"
          message={error}
          actionLabel="Try Again"
          onAction={fetchTeachers}
        />
      ) : teachers.length === 0 ? (
        <Card className="py-12 text-center">
          <CardContent>
            <p className="text-base font-semibold text-stone-700">No teachers found.</p>
            <p className="text-xs text-stone-500 mt-1">Try modifying your search criteria.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff ID</TableHead>
                  <TableHead>Teacher Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Qualification</TableHead>
                  <TableHead>Active Scopes</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teachers.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs font-bold text-stone-900">
                      {t.staffId}
                    </TableCell>
                    <TableCell className="font-bold text-stone-900">
                      {t.firstName} {t.lastName}
                    </TableCell>
                    <TableCell className="text-xs text-stone-600">
                      <div>{t.phonePrimary}</div>
                      <span className="text-[11px] text-stone-400">{t.user?.email}</span>
                    </TableCell>
                    <TableCell className="text-xs text-stone-700">
                      {t.qualification || "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {t.scopes?.length ? (
                        <span className="font-bold text-[#5B0612] bg-[#FDF2F4] px-2 py-0.5 rounded-full">
                          {t.scopes.length} Scope{t.scopes.length > 1 ? "s" : ""}
                        </span>
                      ) : (
                        <span className="text-stone-400">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={t.employmentStatus === "ACTIVE" ? "success" : "neutral"} size="sm">
                        {t.employmentStatus}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/admin/teachers/${t.id}`}>
                        <Button variant="ghost" size="sm" className="text-[#5B0612] hover:bg-[#FDF2F4] font-semibold">
                          Manage Scopes
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

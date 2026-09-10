"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";

interface GuardianItem {
  id: string;
  firstName: string;
  lastName: string;
  relationshipType: string;
  phonePrimary: string;
  email: string | null;
  occupation: string | null;
  relationships: Array<{
    student: { id: string; firstName: string; lastName: string; admissionNumber: string | null };
  }>;
}

export default function AdminGuardiansPage() {
  const [guardians, setGuardians] = useState<GuardianItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const fetchGuardians = () => {
    setLoading(true);
    setError(null);
    let url = "/api/admin/guardians";
    if (search) url += `?search=${encodeURIComponent(search)}`;
    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Failed to load guardians list.");
        }
        return res.json();
      })
      .then((json) => {
        setGuardians(json.guardians || json);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load guardians.");
        setLoading(false);
      });
  };

  useEffect(() => {
    fetch("/api/admin/guardians")
      .then(async (res) => {
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Failed to load guardians list.");
        }
        return res.json();
      })
      .then((json) => {
        setGuardians(json.guardians || json);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load guardians.");
        setLoading(false);
      });
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchGuardians();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight">
            Guardians Directory
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Parents, sponsors, and legal guardians linked to enrolled Swanford Academy students.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="w-full sm:w-80">
              <Input
                placeholder="Search guardian name, phone, or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" variant="primary" size="md" className="bg-[#5B0612] text-white font-bold">
                Search
              </Button>
              <Button type="button" variant="outline" size="md" onClick={() => { setSearch(""); fetchGuardians(); }}>
                Clear
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {loading ? (
        <div className="py-12">
          <LoadingState message="Loading guardians directory..." />
        </div>
      ) : error ? (
        <ErrorState
          title="Guardians Unavailable"
          message={error}
          actionLabel="Try Again"
          onAction={fetchGuardians}
        />
      ) : guardians.length === 0 ? (
        <Card className="py-12 text-center">
          <CardContent>
            <p className="text-base font-semibold text-stone-700">No guardian records found.</p>
            <p className="text-xs text-stone-500 mt-1">Try modifying your search criteria.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Guardian Name</TableHead>
                  <TableHead>Relationship</TableHead>
                  <TableHead>Phone Number</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Linked Students</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {guardians.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="font-bold text-stone-900">
                      {g.firstName} {g.lastName}
                    </TableCell>
                    <TableCell className="text-xs text-stone-600">
                      <Badge variant="neutral" size="sm">
                        {g.relationshipType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-stone-800">
                      {g.phonePrimary}
                    </TableCell>
                    <TableCell className="text-xs text-stone-600">
                      {g.email || "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {g.relationships && g.relationships.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {g.relationships.map((r) => (
                            <Link
                              key={r.student.id}
                              href={`/admin/students/${r.student.id}`}
                              className="text-[#5B0612] font-semibold hover:underline"
                            >
                              {r.student.firstName} {r.student.lastName} ({r.student.admissionNumber || "Pending"})
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <span className="text-stone-400">None linked</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/admin/guardians/${g.id}`}>
                        <Button variant="ghost" size="sm" className="text-[#5B0612] hover:bg-[#FDF2F4] font-semibold">
                          View Details
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

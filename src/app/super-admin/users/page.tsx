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
import { UserStatus } from "@prisma/client";

interface UserItem {
  id: string;
  email: string;
  phoneNumber: string | null;
  status: UserStatus;
  createdAt: string;
  lastLoginAt: string | null;
  roles: Array<{ role: { id: string; name: string; code: string } }>;
  teacher: { firstName: string; lastName: string; staffId: string } | null;
  guardian: { firstName: string; lastName: string } | null;
  student: { firstName: string; lastName: string; admissionNumber: string | null } | null;
}

export default function SuperAdminUsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");

  const fetchUsers = () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    if (statusFilter) params.append("status", statusFilter);
    if (roleFilter) params.append("role", roleFilter);

    let url = "/api/super-admin/users";
    if (params.toString()) url += `?${params.toString()}`;

    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Failed to load user directory.");
        }
        return res.json();
      })
      .then((json) => {
        setUsers(json.users || json);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Error retrieving users.");
        setLoading(false);
      });
  };

  useEffect(() => {
    const params = new URLSearchParams();
    if (statusFilter) params.append("status", statusFilter);
    if (roleFilter) params.append("role", roleFilter);

    let url = "/api/super-admin/users";
    if (params.toString()) url += `?${params.toString()}`;

    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Failed to load user directory.");
        }
        return res.json();
      })
      .then((json) => {
        setUsers(json.users || json);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Error retrieving users.");
        setLoading(false);
      });
  }, [statusFilter, roleFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchUsers();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight">
            User Directory &amp; Access Control
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Authoritative registry of all system accounts, security states, and role assignments.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="w-full sm:w-80">
              <Input
                placeholder="Search email, phone, or name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              <Select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="w-full sm:w-44"
              >
                <option value="">All Roles</option>
                <option value="SUPER_ADMIN">Super Admin</option>
                <option value="ADMIN">Admin</option>
                <option value="TEACHER">Teacher</option>
                <option value="PARENT">Parent</option>
                <option value="ACCOUNTANT">Accountant</option>
              </Select>

              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full sm:w-40"
              >
                <option value="">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="PENDING_VERIFICATION">Pending Verification</option>
                <option value="SUSPENDED">Suspended</option>
                <option value="DEACTIVATED">Deactivated</option>
              </Select>

              <Button type="submit" variant="primary" size="md" className="bg-stone-900 text-white font-bold hover:bg-stone-800">
                Search
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {loading ? (
        <div className="py-12">
          <LoadingState message="Querying global identity directory..." />
        </div>
      ) : error ? (
        <ErrorState
          title="User Directory Unavailable"
          message={error}
          actionLabel="Retry"
          onAction={fetchUsers}
        />
      ) : users.length === 0 ? (
        <Card className="py-12 text-center">
          <CardContent>
            <p className="text-base font-semibold text-stone-700">No users found.</p>
            <p className="text-xs text-stone-500 mt-1">Try modifying your search or filter parameters.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email / Identity</TableHead>
                  <TableHead>Linked Profile</TableHead>
                  <TableHead>Assigned Roles</TableHead>
                  <TableHead>Account Status</TableHead>
                  <TableHead>Last Active</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => {
                  const profileName = u.teacher
                    ? `${u.teacher.firstName} ${u.teacher.lastName} (Staff)`
                    : u.guardian
                    ? `${u.guardian.firstName} ${u.guardian.lastName} (Guardian)`
                    : u.student
                    ? `${u.student.firstName} ${u.student.lastName} (Student)`
                    : "System User";

                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium text-stone-900">
                        <div>{u.email}</div>
                        {u.phoneNumber && (
                          <span className="text-[11px] font-mono text-stone-500">{u.phoneNumber}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-stone-700">
                        {profileName}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="flex flex-wrap gap-1">
                          {u.roles.map((r) => (
                            <Badge
                              key={r.role.id}
                              variant={r.role.code === "SUPER_ADMIN" ? "brand" : "neutral"}
                              size="sm"
                            >
                              {r.role.name}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            u.status === "ACTIVE"
                              ? "success"
                              : u.status === "DEACTIVATED"
                              ? "danger"
                              : "warning"
                          }
                          size="sm"
                        >
                          {u.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-stone-500">
                        {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "Never"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/super-admin/users/${u.id}`}>
                          <Button variant="ghost" size="sm" className="text-[#5B0612] hover:bg-[#FDF2F4] font-semibold">
                            Manage Access
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}

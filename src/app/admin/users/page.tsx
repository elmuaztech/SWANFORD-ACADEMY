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
  Modal,
  Alert,
  FormGroup,
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
import { UserStatus, RoleCode } from "@prisma/client";

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

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");

  // Create User Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createRole, setCreateRole] = useState<RoleCode>(RoleCode.ADMIN);
  const [createStatus, setCreateStatus] = useState<UserStatus>(UserStatus.ACTIVE);
  const [createFirstName, setCreateFirstName] = useState("");
  const [createLastName, setCreateLastName] = useState("");
  const [createSchoolClassId, setCreateSchoolClassId] = useState("");
  const [availableClasses, setAvailableClasses] = useState<{ id: string; name: string; programme?: { name: string } }[]>([]);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [bannerNotice, setBannerNotice] = useState<string | null>(null);

  useEffect(() => {
    if (showCreateModal && availableClasses.length === 0) {
      fetch("/api/admin/classes")
        .then((res) => res.json())
        .then((data) => {
          if (data.items && Array.isArray(data.items)) {
            setAvailableClasses(data.items);
          }
        })
        .catch(() => {});
    }
  }, [showCreateModal, availableClasses.length]);

  const handleCreateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (!createFirstName.trim() || !createLastName.trim()) {
      setCreateError("Full Name (both First Name and Last Name) is mandatory.");
      return;
    }

    if (!createEmail.trim()) {
      setCreateError("Email address is mandatory.");
      return;
    }

    if (!createPhone.trim()) {
      setCreateError("Phone number is mandatory.");
      return;
    }

    setCreateSubmitting(true);
    try {
      const res = await fetch("/api/super-admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: createEmail.trim().toLowerCase(),
          phoneNumber: createPhone.trim(),
          roles: [createRole],
          status: createStatus,
          firstName: createFirstName.trim(),
          lastName: createLastName.trim(),
          schoolClassId: createRole === RoleCode.TEACHER && createSchoolClassId ? createSchoolClassId : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create user.");
      }

      setShowCreateModal(false);
      setCreateEmail("");
      setCreatePhone("");
      setCreateFirstName("");
      setCreateLastName("");
      setCreateSchoolClassId("");
      setCreateRole(RoleCode.ADMIN);
      setCreateStatus(UserStatus.ACTIVE);
      setBannerNotice(data.message || "User created successfully with welcome email dispatched.");
      fetchUsers();
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Failed to create user.");
    } finally {
      setCreateSubmitting(false);
    }
  };

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
        if (res.status === 403) throw new Error("ACCESS_RESTRICTED");
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
    fetchUsers();
  }, [statusFilter, roleFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchUsers();
  };

  const handleClearFilters = () => {
    setSearch("");
    setStatusFilter("");
    setRoleFilter("");
    setLoading(true);
    fetch("/api/super-admin/users")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to reload users.");
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

  const isFiltered = Boolean(search || statusFilter || roleFilter);

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Directory & Access Control"
        description="Authoritative registry of all system accounts, security states, and role assignments."
        badge={<Badge variant="brand" size="sm">Super Admin Governance</Badge>}
        breadcrumbs={[
          { label: "Dashboard", href: "/admin" },
          { label: "Users" },
        ]}
        actions={
          <Button
            variant="primary"
            size="md"
            onClick={() => {
              setCreateError(null);
              setShowCreateModal(true);
            }}
            className="font-bold inline-flex items-center gap-2"
          >
            <span>+ Add New User</span>
          </Button>
        }
      />

      {bannerNotice && (
        <Alert variant="success" onClose={() => setBannerNotice(null)}>
          {bannerNotice}
        </Alert>
      )}

      {/* Filter and Search Bar */}
      <Card className="border border-[#EADBDA]/80">
        <CardContent className="p-4">
          <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row items-stretch md:items-center gap-3 w-full">
            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder="Search email, phone, or name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full"
              />
            </div>

            <div className="w-full md:w-44 shrink-0">
              <Select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="w-full"
              >
                <option value="">All Roles</option>
                <option value="SUPER_ADMIN">Super Admin</option>
                <option value="ADMIN">Admin</option>
                <option value="TEACHER">Teacher</option>
                <option value="PARENT">Parent</option>
              </Select>
            </div>

            <div className="w-full md:w-40 shrink-0">
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full"
              >
                <option value="">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="PENDING_VERIFICATION">Pending Verification</option>
                <option value="SUSPENDED">Suspended</option>
                <option value="DEACTIVATED">Deactivated</option>
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

      {loading ? (
        <div className="py-12">
          <LoadingState message="Querying global identity directory..." />
        </div>
      ) : error ? (
        <ErrorState
          title={error === "ACCESS_RESTRICTED" ? "Access Restricted" : "User Directory Unavailable"}
          message={
            error === "ACCESS_RESTRICTED"
              ? "User account provisioning, security roles, and credential management are restricted exclusively to Super Administrators."
              : error
          }
          actionLabel={error === "ACCESS_RESTRICTED" ? "Return to Operations Dashboard" : "Retry"}
          onAction={
            error === "ACCESS_RESTRICTED"
              ? () => {
                  window.location.href = "/admin";
                }
              : fetchUsers
          }
        />
      ) : users.length === 0 ? (
        isFiltered ? (
          <EmptyState
            title="No Users Match Filters"
            description="No accounts match the selected role, status, or search query."
            actionLabel="Clear Filters"
            onAction={handleClearFilters}
          />
        ) : (
          <EmptyState
            title="No Users Registered"
            description="No system user accounts found. Create your first administrative or teacher account to get started."
            actionLabel="+ Add New User"
            onAction={() => setShowCreateModal(true)}
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
                    <TableHeaderCell className="min-w-[200px] text-left font-semibold text-stone-700">Account / Identity</TableHeaderCell>
                    <TableHeaderCell className="min-w-[160px] text-left font-semibold text-stone-700">Linked Profile</TableHeaderCell>
                    <TableHeaderCell className="min-w-[150px] text-left font-semibold text-stone-700">Assigned Roles</TableHeaderCell>
                    <TableHeaderCell className="w-32 text-left font-semibold text-stone-700">Status</TableHeaderCell>
                    <TableHeaderCell className="w-36 text-left font-semibold text-stone-700">Last Sign In</TableHeaderCell>
                    <TableHeaderCell className="w-32 text-right font-semibold text-stone-700">Action</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {users.map((u, index) => {
                    const profileName =
                      u.teacher
                        ? `${u.teacher.firstName} ${u.teacher.lastName} (Teacher ${u.teacher.staffId})`
                        : u.guardian
                        ? `${u.guardian.firstName} ${u.guardian.lastName} (Guardian)`
                        : u.student
                        ? `${u.student.firstName} ${u.student.lastName} (Student)`
                        : "Administrator";

                    return (
                      <TableRow key={u.id}>
                        <TableCell className="w-14 text-center text-xs font-semibold text-stone-500">
                          {index + 1}
                        </TableCell>
                        <TableCell className="min-w-[200px]">
                          <div className="font-bold text-stone-900 break-words">{u.email}</div>
                          {u.phoneNumber && (
                            <span className="text-xs font-mono text-stone-500">{u.phoneNumber}</span>
                          )}
                        </TableCell>
                        <TableCell className="min-w-[160px] text-xs text-stone-700 break-words">
                          {profileName}
                        </TableCell>
                        <TableCell className="min-w-[150px]">
                          <div className="flex flex-wrap gap-1">
                            {u.roles.map((r) => (
                              <Badge key={r.role.id} variant="neutral" size="sm">
                                {r.role.name}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="w-32">
                          <Badge
                            variant={
                              u.status === "ACTIVE"
                                ? "success"
                                : u.status === "PENDING_VERIFICATION"
                                ? "warning"
                                : "danger"
                            }
                            size="sm"
                          >
                            {u.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="w-36 text-xs text-stone-500">
                          {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "Never"}
                        </TableCell>
                        <TableCell className="w-32 text-right">
                          <Link href={`/admin/users/${u.id}`}>
                            <Button variant="secondary" size="sm" className="bg-[#FDF2F4] text-[#5B0612] hover:bg-[#F9E2E6] font-semibold whitespace-nowrap min-h-[36px]">
                              Governance
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableWrapper>
          </div>

          {/* Mobile Responsive Cards (< 768px) */}
          <div className="block md:hidden space-y-3">
            {users.map((u, index) => {
              const profileName =
                u.teacher
                  ? `${u.teacher.firstName} ${u.teacher.lastName} (Teacher)`
                  : u.guardian
                  ? `${u.guardian.firstName} ${u.guardian.lastName} (Guardian)`
                  : u.student
                  ? `${u.student.firstName} ${u.student.lastName} (Student)`
                  : "Administrator";

              return (
                <TableMobileCard
                  key={u.id}
                  title={
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-stone-100 text-stone-700 text-xs font-bold shrink-0">
                        {index + 1}
                      </span>
                      <span className="font-bold text-sm text-stone-900 break-all">
                        {u.email}
                      </span>
                    </div>
                  }
                  subtitle={
                    <div className="text-xs text-stone-600 mt-1">
                      {profileName}
                    </div>
                  }
                  badge={
                    <Badge
                      variant={
                        u.status === "ACTIVE"
                          ? "success"
                          : u.status === "PENDING_VERIFICATION"
                          ? "warning"
                          : "danger"
                      }
                      size="sm"
                    >
                      {u.status}
                    </Badge>
                  }
                  fields={[
                    { label: "Phone", value: u.phoneNumber || "—" },
                    {
                      label: "Roles",
                      value: u.roles.map((r) => r.role.name).join(", ") || "None",
                    },
                    {
                      label: "Last Sign In",
                      value: u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "Never",
                    },
                  ]}
                  actions={
                    <Link href={`/admin/users/${u.id}`} className="w-full">
                      <Button
                        variant="secondary"
                        size="md"
                        className="w-full bg-[#FDF2F4] text-[#5B0612] hover:bg-[#F9E2E6] font-semibold min-h-[44px]"
                      >
                        Governance & Permissions
                      </Button>
                    </Link>
                  }
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Create User Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create New System User"
      >
        <form onSubmit={handleCreateUserSubmit} className="space-y-4 pt-2">
          {createError && (
            <Alert variant="danger" onClose={() => setCreateError(null)}>
              {createError}
            </Alert>
          )}

          <div className="p-3 rounded-xl bg-[#FAF2F4] border border-[#EADBDA] text-xs text-stone-700">
            <p className="font-bold text-[#800020] mb-0.5">🔒 Official Provisioning &amp; Security Policy</p>
            <p>
              The user account will be created with an initial temporary credential, and an official Swanford Academy welcome email will be dispatched. Upon their first login, the user will be required to change their password to their own confidential password.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormGroup label="First Name" required>
              <Input
                type="text"
                required
                placeholder="e.g. Amina"
                value={createFirstName}
                onChange={(e) => setCreateFirstName(e.target.value)}
              />
            </FormGroup>
            <FormGroup label="Last Name" required>
              <Input
                type="text"
                required
                placeholder="e.g. Bello"
                value={createLastName}
                onChange={(e) => setCreateLastName(e.target.value)}
              />
            </FormGroup>
          </div>

          <FormGroup label="Email Address" required>
            <Input
              type="email"
              required
              placeholder="e.g. amina.bello@swanfordacademy.edu.ng"
              value={createEmail}
              onChange={(e) => setCreateEmail(e.target.value)}
            />
          </FormGroup>

          <FormGroup label="Phone Number" required>
            <Input
              type="tel"
              required
              placeholder="e.g. 08031234567"
              value={createPhone}
              onChange={(e) => setCreatePhone(e.target.value)}
            />
          </FormGroup>

          <div className="grid grid-cols-2 gap-3">
            <FormGroup label="Role Assignment" required>
              <Select
                value={createRole}
                onChange={(e) => setCreateRole(e.target.value as RoleCode)}
              >
                <option value="ADMIN">Admin</option>
                <option value="TEACHER">Teacher</option>
                <option value="PARENT">Parent</option>
              </Select>
            </FormGroup>

            <FormGroup label="Account Status" required>
              <Select
                value={createStatus}
                onChange={(e) => setCreateStatus(e.target.value as UserStatus)}
              >
                <option value="ACTIVE">Active</option>
                <option value="PENDING_VERIFICATION">Pending Verification</option>
                <option value="SUSPENDED">Suspended</option>
              </Select>
            </FormGroup>
          </div>

          {createRole === RoleCode.TEACHER && (
            <FormGroup
              label="Assign Initial Class (Immediate Scoping)"
              helperText="Assign the teacher to their class right from account opening so they see it immediately upon login."
            >
              <Select
                value={createSchoolClassId}
                onChange={(e) => setCreateSchoolClassId(e.target.value)}
              >
                <option value="">-- Select Class to Assign (Optional) --</option>
                {availableClasses.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name} {cls.programme?.name ? `(${cls.programme.name})` : ""}
                  </option>
                ))}
              </Select>
            </FormGroup>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCreateModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={createSubmitting || !createEmail.trim() || !createFirstName.trim() || !createLastName.trim() || !createPhone.trim()}
              className="font-bold"
            >
              {createSubmitting ? "Provisioning..." : "Create User & Dispatch Email"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

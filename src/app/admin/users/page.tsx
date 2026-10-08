"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { parseFullName } from "@/lib/utils/name_parser";
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
import { ImpersonateModal } from "@/components/auth/impersonate-modal";

interface UserItem {
  id: string;
  email: string;
  phoneNumber: string | null;
  status: UserStatus;
  createdAt: string;
  lastLoginAt: string | null;
  firstName?: string | null;
  lastName?: string | null;
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

  // Authenticated User
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string; roles?: string[] } | null>(null);
  const isSuperAdmin = Boolean(currentUser?.roles?.includes("SUPER_ADMIN"));

  // Create User Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createRole, setCreateRole] = useState<RoleCode>(RoleCode.ADMIN);
  const [createStatus, setCreateStatus] = useState<UserStatus>(UserStatus.ACTIVE);
  const [createFullName, setCreateFullName] = useState("");
  const [createSchoolClassId, setCreateSchoolClassId] = useState("");
  const [availableClasses, setAvailableClasses] = useState<{ id: string; name: string; programme?: { name: string } }[]>([]);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [bannerNotice, setBannerNotice] = useState<string | null>(null);

  // Edit User Modal State (Super Admin Exclusive)
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editStatus, setEditStatus] = useState<UserStatus>(UserStatus.ACTIVE);
  const [editRoles, setEditRoles] = useState<RoleCode[]>([]);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete User Modal State (Super Admin Exclusive)
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingUser, setDeletingUser] = useState<UserItem | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Impersonate Portal Modal State (Super Admin Exclusive)
  const [showImpersonateModal, setShowImpersonateModal] = useState(false);
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);

  const handleImpersonateUser = async (user: UserItem) => {
    try {
      setImpersonatingId(user.id);
      setError(null);
      const res = await fetch("/api/super-admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: user.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to impersonate account");
      }
      window.location.href = data.redirectUrl || "/admin";
    } catch (err: any) {
      setError(err?.message || "Failed to impersonate user.");
      setImpersonatingId(null);
    }
  };

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user) setCurrentUser(d.user);
      })
      .catch(() => {});
  }, []);

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

  const fetchUsers = () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    if (statusFilter) params.append("status", statusFilter);
    if (roleFilter) params.append("role", roleFilter);

    fetch(`/api/super-admin/users?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Failed to load user accounts.");
        }
        return res.json();
      })
      .then((data) => {
        setUsers(data.users || []);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load user accounts.");
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
      .then((data) => {
        setUsers(data.users || []);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to reload users.");
        setLoading(false);
      });
  };

  const handleCreateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (!createFullName.trim()) {
      setCreateError("Full Name is mandatory.");
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

    const parsed = parseFullName(createFullName);

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
          fullName: createFullName.trim(),
          firstName: parsed.firstName,
          lastName: parsed.lastName,
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
      setCreateFullName("");
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

  const renderRoleBadges = (u: UserItem) => {
    const roleBadges: React.ReactNode[] = [];

    const getRoleBadgeProps = (code?: string, name?: string) => {
      const normalized = (code || name || "").toUpperCase().replace(/[\s\-_]/g, "");
      if (normalized.includes("SUPERADMIN")) {
        return {
          variant: "brand" as const,
          label: name || "Super Administrator",
          className: "bg-[#5B0612] text-white border border-[#5B0612] font-semibold shadow-xs",
        };
      }
      if (normalized.includes("ADMIN")) {
        return {
          variant: "brand" as const,
          label: name || "School Administrator",
          className: "bg-burgundy-50 text-burgundy-900 border border-burgundy-200 font-semibold",
        };
      }
      if (normalized.includes("TEACHER")) {
        return {
          variant: "success" as const,
          label: name || "Teacher",
          className: "bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold",
        };
      }
      if (normalized.includes("PARENT") || normalized.includes("GUARDIAN")) {
        return {
          variant: "info" as const,
          label: name || "Parent / Guardian",
          className: "bg-sky-50 text-sky-800 border border-sky-200 font-semibold",
        };
      }
      if (normalized.includes("ACCOUNTANT") || normalized.includes("FINANCE")) {
        return {
          variant: "warning" as const,
          label: name || "Accountant",
          className: "bg-amber-50 text-amber-800 border border-amber-200 font-semibold",
        };
      }
      return {
        variant: "neutral" as const,
        label: name || "User",
        className: "bg-stone-100 text-stone-700 border border-stone-200 font-medium",
      };
    };

    if (u.roles && u.roles.length > 0) {
      u.roles.forEach((r, idx) => {
        const { variant, label, className } = getRoleBadgeProps(r.role?.code, r.role?.name);
        roleBadges.push(
          <Badge key={r.role?.id || idx} variant={variant} size="sm" className={className}>
            {label}
          </Badge>
        );
      });
    } else {
      if (u.teacher) {
        roleBadges.push(
          <Badge key="teacher-fallback" variant="success" size="sm" className="bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">
            Teacher
          </Badge>
        );
      }
      if (u.guardian) {
        roleBadges.push(
          <Badge key="guardian-fallback" variant="info" size="sm" className="bg-sky-50 text-sky-800 border border-sky-200 font-semibold">
            Parent / Guardian
          </Badge>
        );
      }
    }

    if (roleBadges.length === 0) {
      roleBadges.push(
        <span
          key="no-role"
          className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-stone-100 text-stone-500 border border-dashed border-stone-300"
        >
          No Role Assigned
        </span>
      );
    }

    return <div className="flex flex-wrap gap-1 items-center">{roleBadges}</div>;
  };

  const handleOpenEditModal = (u: UserItem) => {
    setEditingUserId(u.id);
    const firstName = u.firstName || u.teacher?.firstName || u.guardian?.firstName || u.student?.firstName || "";
    const lastName = u.lastName || u.teacher?.lastName || u.guardian?.lastName || u.student?.lastName || "";
    const fullName = [firstName, lastName].filter(Boolean).join(" ");
    setEditFullName(fullName);
    setEditEmail(u.email);
    setEditPhone(u.phoneNumber || "");
    setEditStatus(u.status);

    let initialRoles = u.roles.map((r) => r.role.code as RoleCode);
    if (initialRoles.length === 0) {
      if (u.teacher) initialRoles = [RoleCode.TEACHER];
      else if (u.guardian) initialRoles = [RoleCode.PARENT];
    }
    setEditRoles(initialRoles);
    setEditError(null);
    setShowEditModal(true);
  };

  const handleEditUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUserId) return;

    if (!editFullName.trim()) {
      setEditError("Full name is required.");
      return;
    }

    if (!editEmail.trim()) {
      setEditError("Email address is required.");
      return;
    }

    if (editRoles.length === 0) {
      setEditError("At least one system role must remain assigned to this user.");
      return;
    }

    const parsed = parseFullName(editFullName);

    setEditSubmitting(true);
    setEditError(null);

    try {
      const res = await fetch(`/api/super-admin/users/${editingUserId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: editFullName.trim(),
          firstName: parsed.firstName,
          lastName: parsed.lastName,
          email: editEmail.trim().toLowerCase(),
          phoneNumber: editPhone.trim() || null,
          status: editStatus,
          roles: editRoles,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update user profile.");

      setShowEditModal(false);
      setBannerNotice(`Account details updated successfully for ${data.user?.email || editEmail}.`);
      fetchUsers();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Failed to update user.");
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleOpenDeleteModal = (u: UserItem) => {
    setDeletingUser(u);
    setDeleteConfirmation("");
    setDeleteError(null);
    setShowDeleteModal(true);
  };

  const handleDeleteUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deletingUser) return;

    if (deleteConfirmation.trim().toLowerCase() !== deletingUser.email.toLowerCase()) {
      setDeleteError(`Please type "${deletingUser.email}" exactly to confirm permanent deletion.`);
      return;
    }

    setDeleteSubmitting(true);
    setDeleteError(null);

    try {
      const res = await fetch(`/api/super-admin/users/${deletingUser.id}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete user account.");

      setShowDeleteModal(false);
      setBannerNotice(`User account ${deletingUser.email} has been permanently deleted.`);
      fetchUsers();
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete user account.");
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const isFiltered = Boolean(search || statusFilter || roleFilter);

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Accounts & Governance"
        description="Enterprise identity management, RBAC assignments, credential recovery, and account audits."
        breadcrumbs={[
          { label: "Dashboard", href: "/admin" },
          { label: "User Accounts" },
        ]}
        actions={
          isSuperAdmin ? (
            <div className="flex items-center gap-2.5 flex-wrap">
              <Button
                variant="outline"
                size="md"
                onClick={() => setShowImpersonateModal(true)}
                className="font-bold border-amber-300 text-amber-900 bg-amber-50 hover:bg-amber-100 min-h-[44px]"
              >
                🎭 Impersonate Portal
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={() => setShowCreateModal(true)}
                className="font-bold min-h-[44px]"
              >
                + Create New User
              </Button>
            </div>
          ) : (
            <Badge variant="neutral" size="sm" className="py-1 px-2.5 text-xs text-stone-500">
              Super Admin Privilege Required for User Provisioning
            </Badge>
          )
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
                placeholder="Search email, name, or phone number..."
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

            <div className="w-full md:w-44 shrink-0">
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

            <Button type="submit" variant="primary" size="md" className="font-bold whitespace-nowrap shrink-0 min-h-[44px]">
              Search
            </Button>
            {isFiltered && (
              <Button type="button" variant="outline" size="md" onClick={handleClearFilters} className="whitespace-nowrap shrink-0 min-h-[44px]">
                Clear
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Main Table or States */}
      {loading ? (
        <div className="py-12">
          <LoadingState message="Loading registered accounts and role assignments..." />
        </div>
      ) : error ? (
        <ErrorState
          title="User Accounts Unavailable"
          message={error}
          actionLabel="Retry"
          onAction={fetchUsers}
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
                    <TableHeaderCell className="w-12 text-center font-semibold text-stone-700">S/N</TableHeaderCell>
                    <TableHeaderCell className="min-w-[180px] text-left font-semibold text-stone-700">Account / Identity</TableHeaderCell>
                    <TableHeaderCell className="min-w-[150px] text-left font-semibold text-stone-700">Linked Profile</TableHeaderCell>
                    <TableHeaderCell className="min-w-[140px] text-left font-semibold text-stone-700">Assigned Roles</TableHeaderCell>
                    <TableHeaderCell className="w-28 text-left font-semibold text-stone-700">Status</TableHeaderCell>
                    <TableHeaderCell className="w-32 text-left font-semibold text-stone-700">Last Sign In</TableHeaderCell>
                    <TableHeaderCell className="min-w-[180px] text-right font-semibold text-stone-700">Actions</TableHeaderCell>
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
                        : u.firstName && u.lastName
                        ? `${u.firstName} ${u.lastName}`
                        : "Administrator";

                    const isSelf = currentUser?.id === u.id;

                    return (
                      <TableRow key={u.id}>
                        <TableCell className="w-12 text-center text-xs font-semibold text-stone-500">
                          {index + 1}
                        </TableCell>
                        <TableCell className="min-w-[180px]">
                          <div className="font-bold text-stone-900 break-words">{u.email}</div>
                          {u.phoneNumber && (
                            <span className="text-xs font-mono text-stone-500">{u.phoneNumber}</span>
                          )}
                        </TableCell>
                        <TableCell className="min-w-[150px] text-xs text-stone-700 break-words">
                          {profileName}
                        </TableCell>
                        <TableCell className="min-w-[140px]">
                          {renderRoleBadges(u)}
                        </TableCell>
                        <TableCell className="w-28">
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
                        <TableCell className="w-32 text-xs text-stone-500">
                          {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "Never"}
                        </TableCell>
                        <TableCell className="min-w-[180px] text-right">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            <Link href={`/admin/users/${u.id}`}>
                              <Button variant="secondary" size="sm" className="bg-[#FDF2F4] text-[#5B0612] hover:bg-[#F9E2E6] font-semibold whitespace-nowrap min-h-[36px]">
                                Governance
                              </Button>
                            </Link>
                            {isSuperAdmin && (
                              <>
                                {!isSelf && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleImpersonateUser(u)}
                                    isLoading={impersonatingId === u.id}
                                    disabled={Boolean(impersonatingId)}
                                    className="whitespace-nowrap min-h-[36px] border-amber-300 text-amber-900 bg-amber-50/60 hover:bg-amber-100 font-semibold"
                                    title="Impersonate into this user's portal dashboard directly"
                                  >
                                    🎭 Impersonate
                                  </Button>
                                )}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleOpenEditModal(u)}
                                  className="whitespace-nowrap min-h-[36px]"
                                >
                                  Edit
                                </Button>
                                <Button
                                  variant="danger"
                                  size="sm"
                                  disabled={isSelf}
                                  onClick={() => handleOpenDeleteModal(u)}
                                  className="whitespace-nowrap min-h-[36px]"
                                  title={isSelf ? "Cannot delete own active account" : "Delete user"}
                                >
                                  Delete
                                </Button>
                              </>
                            )}
                          </div>
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
                  : u.firstName && u.lastName
                  ? `${u.firstName} ${u.lastName}`
                  : "Administrator";

              const isSelf = currentUser?.id === u.id;

              return (
                <TableMobileCard
                  key={u.id}
                  title={
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-stone-100 text-stone-700 text-xs font-bold shrink-0">
                        {index + 1}
                      </span>
                      <span className="font-bold text-sm text-stone-900 truncate">
                        {profileName}
                      </span>
                    </div>
                  }
                  subtitle={
                    <span className="text-xs text-stone-500 pl-8 block truncate" title={u.email}>
                      {u.email}
                    </span>
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
                      value: renderRoleBadges(u),
                    },
                    {
                      label: "Last Sign In",
                      value: u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "Never",
                    },
                  ]}
                  actions={
                    <div className="flex items-center gap-2 pt-2 border-t border-stone-100 w-full justify-end flex-wrap">
                      <Link href={`/admin/users/${u.id}`} className="flex-1 sm:flex-none">
                        <Button variant="secondary" size="sm" className="w-full bg-[#FDF2F4] text-[#5B0612] hover:bg-[#F9E2E6] font-semibold min-h-[44px]">
                          Governance
                        </Button>
                      </Link>
                      {isSuperAdmin && (
                        <>
                          {!isSelf && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleImpersonateUser(u)}
                              isLoading={impersonatingId === u.id}
                              disabled={Boolean(impersonatingId)}
                              className="min-h-[44px] border-amber-300 text-amber-900 bg-amber-50/60 font-semibold"
                            >
                              🎭 Impersonate
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenEditModal(u)}
                            className="min-h-[44px]"
                          >
                            Edit
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={isSelf}
                            onClick={() => handleOpenDeleteModal(u)}
                            className="min-h-[44px]"
                          >
                            Delete
                          </Button>
                        </>
                      )}
                    </div>
                  }
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Edit User Modal (Super Admin Exclusive) */}
      {showEditModal && (
        <Modal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          title="Edit User Account Details"
        >
          <form onSubmit={handleEditUserSubmit} className="space-y-4 pt-2">
            {editError && (
              <Alert variant="danger" onClose={() => setEditError(null)}>
                {editError}
              </Alert>
            )}

            <FormGroup label="Full Name" required>
              <Input
                value={editFullName}
                onChange={(e) => setEditFullName(e.target.value)}
                placeholder="e.g. Muhammad Bello Haruna"
                required
              />
            </FormGroup>

            <FormGroup label="Email Address" required>
              <Input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                required
              />
            </FormGroup>

            <FormGroup label="Phone Number">
              <Input
                type="tel"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="e.g. 08031234567"
              />
            </FormGroup>

            <FormGroup label="Account Status" required>
              <Select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as UserStatus)}
              >
                <option value="ACTIVE">Active</option>
                <option value="PENDING_VERIFICATION">Pending Verification</option>
                <option value="SUSPENDED">Suspended</option>
                <option value="DEACTIVATED">Deactivated</option>
              </Select>
            </FormGroup>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-2">Assigned Roles</label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.ACCOUNTANT, RoleCode.TEACHER, RoleCode.PARENT].map((role) => (
                  <label
                    key={role}
                    className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                      editRoles.includes(role)
                        ? "border-[#800020] bg-[#FAF7F2] font-semibold text-[#5B0612]"
                        : "border-stone-200 hover:bg-stone-50 text-stone-700"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={editRoles.includes(role)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setEditRoles([...editRoles, role]);
                        } else {
                          setEditRoles(editRoles.filter((r) => r !== role));
                        }
                      }}
                      className="rounded border-stone-300 text-[#800020] focus:ring-[#800020]"
                    />
                    <span>{role.replace("_", " ")}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowEditModal(false)}
                className="min-h-[44px]"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={editSubmitting}
                className="font-bold min-h-[44px]"
              >
                {editSubmitting ? "Saving..." : "Save Account Details"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete User Modal (Super Admin Exclusive) */}
      {showDeleteModal && deletingUser && (
        <Modal
          isOpen={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          title="Permanently Delete User Account"
        >
          <form onSubmit={handleDeleteUserSubmit} className="space-y-4 pt-2">
            <Alert variant="danger">
              <p className="font-bold text-sm">Permanent Action Warning</p>
              <p className="text-xs mt-1">
                Permanently deleting this user account removes all active login sessions, security tokens,
                RBAC permissions, and unlinks associated profiles.
              </p>
            </Alert>

            {deleteError && (
              <Alert variant="danger" onClose={() => setDeleteError(null)}>
                {deleteError}
              </Alert>
            )}

            <div>
              <p className="text-xs text-stone-700 mb-2">
                To confirm permanent deletion of account{" "}
                <span className="font-mono font-bold text-[#800020] bg-stone-100 px-1 py-0.5 rounded">
                  {deletingUser.email}
                </span>
                , please enter their email address below:
              </p>
              <Input
                placeholder={`Type "${deletingUser.email}" to confirm`}
                value={deleteConfirmation}
                onChange={(e) => setDeleteConfirmation(e.target.value)}
                required
                className="font-mono text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-stone-200">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowDeleteModal(false)}
                className="min-h-[44px]"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="danger"
                disabled={deleteSubmitting || deleteConfirmation.trim().toLowerCase() !== deletingUser.email.toLowerCase()}
                className="font-bold min-h-[44px]"
              >
                {deleteSubmitting ? "Deleting Account..." : "Confirm Permanent Deletion"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Create User Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Provision User Account"
      >
        <form onSubmit={handleCreateUserSubmit} className="space-y-4 pt-2">
          {createError && (
            <Alert variant="danger" onClose={() => setCreateError(null)}>
              {createError}
            </Alert>
          )}

          <FormGroup label="Full Name" required>
            <Input
              type="text"
              required
              placeholder="e.g. Muhammad Bello Haruna"
              value={createFullName}
              onChange={(e) => setCreateFullName(e.target.value)}
            />
          </FormGroup>

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
                <option value="ACCOUNTANT">Accountant</option>
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
              className="min-h-[44px]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={createSubmitting || !createEmail.trim() || !createFullName.trim() || !createPhone.trim()}
              className="font-bold min-h-[44px]"
            >
              {createSubmitting ? "Provisioning..." : "Create User & Dispatch Email"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Super Admin Direct Impersonate Modal */}
      {isSuperAdmin && (
        <ImpersonateModal
          isOpen={showImpersonateModal}
          onClose={() => setShowImpersonateModal(false)}
        />
      )}
    </div>
  );
}

"use client";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { parseFullName } from "@/lib/utils/name_parser";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { FormGroup } from "@/components/ui/form-group";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { Table, TableHeader, TableRow, TableHeaderCell, TableBody, TableCell } from "@/components/ui/table";
import { UserStatus, RoleCode } from "@prisma/client";

interface UserDetail {
  id: string;
  email: string;
  phoneNumber: string | null;
  status: UserStatus;
  firstName?: string | null;
  lastName?: string | null;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  roles: Array<{ role: { id: string; name: string; code: string } }>;
  sessions: Array<{
    id: string;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: string;
    expiresAt: string;
  }>;
  auditLogs: Array<{
    id: string;
    action: string;
    createdAt: string;
    newValues: unknown;
  }>;
  guardianProfile?: {
    id: string;
    firstName: string;
    lastName: string;
    phonePrimary?: string;
    relationships?: Array<{
      student: { id: string; firstName: string; lastName: string; admissionNumber: string };
    }>;
  } | null;
  teacherProfile?: {
    id: string;
    staffIdNumber?: string;
    firstName: string;
    lastName: string;
    scopes?: Array<{
      programme?: { name: string; code: string } | null;
      schoolClass?: { name: string; code: string } | null;
    }>;
  } | null;
}

const ALL_ROLES: RoleCode[] = [
  RoleCode.SUPER_ADMIN,
  RoleCode.ADMIN,
  RoleCode.ACCOUNTANT,
  RoleCode.TEACHER,
  RoleCode.PARENT,
];

export default function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const userId = resolvedParams.id;
  const router = useRouter();

  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Authentication Context (Super Admin Guard)
  const [currentUser, setCurrentUser] = useState<{ id: string; isSuperAdmin: boolean } | null>(null);

  // Super Admin Edit User Profile Modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFullName, setEditFullName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editStatus, setEditStatus] = useState<UserStatus>("ACTIVE");
  const [editRoles, setEditRoles] = useState<RoleCode[]>([]);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Super Admin Delete User Account Modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Status Modal
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState<UserStatus>("ACTIVE");
  const [statusReason, setStatusReason] = useState("");
  const [statusSubmitting, setStatusSubmitting] = useState(false);

  // Role Assignment Modal
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<RoleCode[]>([]);
  const [roleReason, setRoleReason] = useState("");
  const [roleSubmitting, setRoleSubmitting] = useState(false);

  // Support Modals
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetSubmitting, setResetSubmitting] = useState(false);

  const [showEmailModal, setShowEmailModal] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailReason, setEmailReason] = useState("");
  const [identityVerified, setIdentityVerified] = useState(false);
  const [emailSubmitting, setEmailSubmitting] = useState(false);

  const [unlockSubmitting, setUnlockSubmitting] = useState(false);
  const [actionNotice, setActionNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data?.user) {
          const hasSuperAdmin = (data.user.roles || []).some((r: unknown) => {
            if (typeof r === "string") return r === "SUPER_ADMIN";
            if (typeof r === "object" && r !== null) {
              const roleObj = r as { code?: string; role?: { code?: string } };
              return roleObj.code === "SUPER_ADMIN" || roleObj.role?.code === "SUPER_ADMIN";
            }
            return false;
          });
          setCurrentUser({ id: data.user.id, isSuperAdmin: hasSuperAdmin });
        }
      })
      .catch(() => {});
  }, []);

  const fetchUser = () => {
    return fetch(`/api/super-admin/users/${userId}`)
      .then(async (res) => {
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Failed to load user account.");
        }
        return res.json();
      })
      .then((json) => {
        const userRoles = json.roles || json.userRoles || [];
        const normalized: UserDetail = {
          ...json,
          roles: userRoles,
          sessions: json.sessions || [],
          auditLogs: json.auditLogs || [],
        };
        setUser(normalized);
        setNewStatus(json.status);
        setSelectedRoles(
          userRoles.map((r: { role?: { code: string }; code?: string } | string) =>
            ((typeof r === "string" ? r : r.role?.code || r.code) || "") as RoleCode
          )
        );
      });
  };

  useEffect(() => {
    fetchUser()
      .then(() => setLoading(false))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Error retrieving user.");
        setLoading(false);
      });
  }, [userId]);

  // Edit User Handler
  const handleOpenEditModal = () => {
    if (!user) return;
    const firstName = user.firstName || user.teacherProfile?.firstName || user.guardianProfile?.firstName || "";
    const lastName = user.lastName || user.teacherProfile?.lastName || user.guardianProfile?.lastName || "";
    const fullName = [firstName, lastName].filter(Boolean).join(" ");
    setEditFullName(fullName);
    setEditEmail(user.email);
    setEditPhone(user.phoneNumber || "");
    setEditStatus(user.status);
    setEditRoles(
      user.roles.map((r) => (r.role?.code || r.role || "") as RoleCode)
    );
    setEditError(null);
    setShowEditModal(true);
  };

  const handleEditRoleToggle = (role: RoleCode) => {
    if (editRoles.includes(role)) {
      if (editRoles.length === 1) {
        setEditError("A user must have at least one system role assigned.");
        return;
      }
      setEditRoles(editRoles.filter((r) => r !== role));
    } else {
      setEditRoles([...editRoles, role]);
    }
  };

  const handleEditUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editFullName.trim()) {
      setEditError("Full name is required.");
      return;
    }
    if (!editEmail.trim()) {
      setEditError("Valid email address is required.");
      return;
    }
    if (editRoles.length === 0) {
      setEditError("At least one system role must remain assigned.");
      return;
    }

    const parsed = parseFullName(editFullName);

    setEditSubmitting(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/super-admin/users/${userId}`, {
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
      setActionNotice({
        type: "success",
        message: `Account details updated successfully for ${data.user?.email || editEmail}.`,
      });
      await fetchUser();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Failed to update user.");
    } finally {
      setEditSubmitting(false);
    }
  };

  // Delete User Handler
  const handleOpenDeleteModal = () => {
    setDeleteConfirmation("");
    setDeleteError(null);
    setShowDeleteModal(true);
  };

  const handleDeleteUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (deleteConfirmation.trim().toLowerCase() !== user.email.toLowerCase()) {
      setDeleteError(`Please type "${user.email}" exactly to confirm permanent deletion.`);
      return;
    }

    setDeleteSubmitting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/super-admin/users/${userId}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete user account.");

      setShowDeleteModal(false);
      router.push("/admin/users?actionNotice=user_deleted");
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete user account.");
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const handleInitiatePasswordReset = async () => {
    setResetSubmitting(true);
    setActionNotice(null);
    try {
      const res = await fetch(`/api/super-admin/users/${userId}/support`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "RESET_PASSWORD" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to initiate password reset.");
      setShowResetModal(false);
      setActionNotice({ type: "success", message: json.message || "Password reset link sent to user email." });
      await fetchUser();
    } catch (err: unknown) {
      setActionNotice({ type: "error", message: err instanceof Error ? err.message : "Action failed." });
    } finally {
      setResetSubmitting(false);
    }
  };

  const handleEmailChangeSubmit = async () => {
    if (!newEmail.trim()) {
      alert("Please provide the new email address.");
      return;
    }
    if (!identityVerified) {
      alert("You must confirm that you have verified the account holder identity.");
      return;
    }
    if (!emailReason.trim() || emailReason.trim().length < 5) {
      alert("Please provide a detailed administrative reason (minimum 5 characters).");
      return;
    }

    setEmailSubmitting(true);
    setActionNotice(null);
    try {
      const res = await fetch(`/api/super-admin/users/${userId}/support`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CHANGE_EMAIL",
          newEmail: newEmail.trim(),
          reason: emailReason.trim(),
          identityVerified: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to change email.");
      setShowEmailModal(false);
      setNewEmail("");
      setEmailReason("");
      setIdentityVerified(false);
      setActionNotice({ type: "success", message: json.message || "Email changed and verification dispatched." });
      await fetchUser();
    } catch (err: unknown) {
      setActionNotice({ type: "error", message: err instanceof Error ? err.message : "Failed to change email." });
    } finally {
      setEmailSubmitting(false);
    }
  };

  const handleEmergencyUnlock = async () => {
    const reason = prompt("Enter administrative reason to unlock this account:");
    if (!reason || reason.trim().length < 5) {
      alert("Administrative reason (min 5 chars) is required.");
      return;
    }

    setUnlockSubmitting(true);
    setActionNotice(null);
    try {
      const res = await fetch(`/api/super-admin/users/${userId}/support`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "EMERGENCY_RECOVERY",
          reason: reason.trim(),
          unlockAccount: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to unlock account.");
      setActionNotice({ type: "success", message: "Account unlocked successfully." });
      await fetchUser();
    } catch (err: unknown) {
      setActionNotice({ type: "error", message: err instanceof Error ? err.message : "Failed to unlock." });
    } finally {
      setUnlockSubmitting(false);
    }
  };

  const handleStatusSubmit = async () => {
    if (!statusReason.trim()) {
      alert("Please provide an administrative reason for this status change.");
      return;
    }
    setStatusSubmitting(true);
    try {
      const res = await fetch(`/api/super-admin/users/${userId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, reason: statusReason.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update account status.");
      setShowStatusModal(false);
      setStatusReason("");
      await fetchUser();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Status update failed.");
    } finally {
      setStatusSubmitting(false);
    }
  };

  const handleRoleToggle = (role: RoleCode) => {
    if (selectedRoles.includes(role)) {
      setSelectedRoles(selectedRoles.filter((r) => r !== role));
    } else {
      setSelectedRoles([...selectedRoles, role]);
    }
  };

  const handleRoleSubmit = async () => {
    if (selectedRoles.length === 0) {
      alert("A user must have at least one assigned role.");
      return;
    }
    if (!roleReason.trim()) {
      alert("Please provide an administrative reason for this role assignment.");
      return;
    }
    setRoleSubmitting(true);
    try {
      const res = await fetch(`/api/super-admin/users/${userId}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleCodes: selectedRoles, reason: roleReason.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to assign roles.");
      setShowRoleModal(false);
      setRoleReason("");
      await fetchUser();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Role assignment failed.");
    } finally {
      setRoleSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="py-12">
        <LoadingState message="Retrieving security credentials and audit records..." />
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="py-8">
        <ErrorState
          title="Account Not Found"
          message={error || "Could not retrieve user account."}
          actionLabel="Back to Users"
          onAction={() => router.push("/admin/users")}
        />
      </div>
    );
  }

  const fullName =
    user.firstName || user.lastName
      ? `${user.firstName || ""} ${user.lastName || ""}`.trim()
      : user.teacherProfile?.firstName || user.guardianProfile?.firstName
      ? `${user.teacherProfile?.firstName || user.guardianProfile?.firstName || ""} ${
          user.teacherProfile?.lastName || user.guardianProfile?.lastName || ""
        }`.trim()
      : null;

  const isSelf = currentUser?.id === user.id;

  return (
    <div className="space-y-6 max-w-5xl mx-auto px-2 sm:px-4">
      {/* Top Breadcrumb & Actions Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-stone-500 mb-1">
            <Link href="/admin/users" className="hover:underline flex items-center gap-1 font-semibold text-[#800020]">
              ← User Directory
            </Link>
            <span>/</span>
            <span>Account Control</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#5B0612] tracking-tight">
              {fullName || user.email}
            </h1>
            {fullName && (
              <span className="text-xs sm:text-sm font-medium text-stone-500 bg-stone-100 px-2.5 py-0.5 rounded-full">
                {user.email}
              </span>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {currentUser?.isSuperAdmin && (
            <>
              <Button
                variant="primary"
                size="md"
                onClick={handleOpenEditModal}
                className="bg-[#800020] hover:bg-[#5B0612] text-white font-bold min-h-[44px]"
              >
                Edit Account Profile
              </Button>
              <Button
                variant="outline"
                size="md"
                onClick={handleOpenDeleteModal}
                disabled={isSelf}
                title={isSelf ? "You cannot delete your own logged-in account" : "Permanently delete user"}
                className={`font-bold min-h-[44px] ${
                  isSelf
                    ? "opacity-50 cursor-not-allowed border-stone-200 text-stone-400"
                    : "border-rose-300 text-rose-800 bg-rose-50 hover:bg-rose-100"
                }`}
              >
                Delete User
              </Button>
            </>
          )}

          <Button
            variant="outline"
            size="md"
            onClick={() => setShowResetModal(true)}
            className="font-bold border-amber-300 text-amber-900 bg-amber-50 hover:bg-amber-100 min-h-[44px]"
          >
            Reset Password
          </Button>

          <Button
            variant="outline"
            size="md"
            onClick={() => {
              setNewEmail("");
              setEmailReason("");
              setIdentityVerified(false);
              setShowEmailModal(true);
            }}
            className="font-bold border-blue-300 text-blue-900 bg-blue-50 hover:bg-blue-100 min-h-[44px]"
          >
            Change Email
          </Button>

          {(user.failedLoginAttempts > 0 || user.lockedUntil) && (
            <Button
              variant="outline"
              size="md"
              disabled={unlockSubmitting}
              onClick={handleEmergencyUnlock}
              className="font-bold border-rose-300 text-rose-900 bg-rose-50 hover:bg-rose-100 min-h-[44px]"
            >
              {unlockSubmitting ? "Unlocking..." : "Unlock"}
            </Button>
          )}

          <Button
            variant="outline"
            size="md"
            onClick={() => setShowStatusModal(true)}
            className="font-bold border-stone-300 min-h-[44px]"
          >
            Status ({user.status})
          </Button>

          <Button
            variant="outline"
            size="md"
            onClick={() => setShowRoleModal(true)}
            className="border-stone-300 text-stone-900 font-bold min-h-[44px]"
          >
            Roles ({user.roles.length})
          </Button>
        </div>
      </div>

      {actionNotice && (
        <Alert
          variant={actionNotice.type === "success" ? "success" : "danger"}
          title={actionNotice.type === "success" ? "Action Completed" : "Action Failed"}
        >
          <div className="flex items-center justify-between">
            <span>{actionNotice.message}</span>
            <button
              onClick={() => setActionNotice(null)}
              className="text-xs font-bold underline ml-4 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </Alert>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Security Profile & Linked Identities */}
        <div className="md:col-span-1 space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-bold text-stone-900">Security Profile</CardTitle>
              <span className="text-xs font-mono text-stone-500">ID: {user.id.slice(0, 8)}...</span>
            </CardHeader>
            <CardContent className="space-y-3 pt-2 text-xs">
              <div className="flex justify-between py-1.5 border-b border-stone-100">
                <span className="text-stone-500">Account Status</span>
                <Badge
                  variant={
                    user.status === "ACTIVE"
                      ? "success"
                      : user.status === "DEACTIVATED"
                      ? "danger"
                      : "warning"
                  }
                  size="sm"
                >
                  {user.status}
                </Badge>
              </div>

              <div className="flex justify-between py-1.5 border-b border-stone-100">
                <span className="text-stone-500">Full Name</span>
                <span className="font-semibold text-stone-900">{fullName || "Not provided"}</span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-stone-100">
                <span className="text-stone-500">Email</span>
                <span className="font-semibold text-stone-900 truncate max-w-[160px]" title={user.email}>
                  {user.email}
                </span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-stone-100">
                <span className="text-stone-500">Phone Number</span>
                <span className="font-semibold text-stone-900">{user.phoneNumber || "None"}</span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-stone-100">
                <span className="text-stone-500">Failed Attempts</span>
                <span className="font-mono font-semibold text-stone-900">{user.failedLoginAttempts}</span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-stone-100">
                <span className="text-stone-500">Last Login</span>
                <span className="font-semibold text-stone-900">
                  {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Never"}
                </span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-stone-100">
                <span className="text-stone-500">Created On</span>
                <span className="font-semibold text-stone-900">
                  {new Date(user.createdAt).toLocaleDateString()}
                </span>
              </div>

              <div className="py-1.5">
                <span className="text-stone-500 block mb-1">Active Roles</span>
                <div className="flex flex-wrap gap-1">
                  {user.roles.length > 0 ? (
                    user.roles.map((r, idx) => {
                      const code = r.role.code || "";
                      const name = r.role.name || "";
                      const normalized = (code || name).toUpperCase().replace(/[\s\-_]/g, "");

                      let variant: "brand" | "success" | "info" | "warning" | "neutral" | "danger" = "neutral";
                      let className = "bg-stone-100 text-stone-700 border border-stone-200 font-medium";

                      if (normalized.includes("SUPERADMIN")) {
                        variant = "brand";
                        className = "bg-[#5B0612] text-white border border-[#5B0612] font-semibold shadow-xs";
                      } else if (normalized.includes("ADMIN")) {
                        variant = "brand";
                        className = "bg-burgundy-50 text-burgundy-900 border border-burgundy-200 font-semibold";
                      } else if (normalized.includes("TEACHER")) {
                        variant = "success";
                        className = "bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold";
                      } else if (normalized.includes("PARENT") || normalized.includes("GUARDIAN")) {
                        variant = "info";
                        className = "bg-sky-50 text-sky-800 border border-sky-200 font-semibold";
                      } else if (normalized.includes("ACCOUNTANT") || normalized.includes("FINANCE")) {
                        variant = "warning";
                        className = "bg-amber-50 text-amber-800 border border-amber-200 font-semibold";
                      }

                      return (
                        <Badge key={r.role.id || idx} variant={variant} size="sm" className={className}>
                          {name}
                        </Badge>
                      );
                    })
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-stone-100 text-stone-500 border border-dashed border-stone-300">
                      No Role Assigned
                    </span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Linked Teacher Profile if present */}
          {user.teacherProfile && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-bold text-stone-900">Faculty Association</CardTitle>
                <span className="text-xs text-stone-500">
                  Staff ID: {user.teacherProfile.staffIdNumber || "Not assigned"}
                </span>
              </CardHeader>
              <CardContent className="space-y-3 pt-2 text-xs">
                <div>
                  <span className="text-stone-500 block mb-1">Class &amp; Programme Scopes</span>
                  {!user.teacherProfile.scopes || user.teacherProfile.scopes.length === 0 ? (
                    <p className="text-stone-400 italic">No academic scopes assigned.</p>
                  ) : (
                    <div className="space-y-1">
                      {user.teacherProfile.scopes.map((s, idx) => (
                        <div key={idx} className="p-2 rounded bg-stone-50 border border-stone-200">
                          <p className="font-bold text-stone-800">
                            {s.schoolClass?.name || s.programme?.name || "General"}
                          </p>
                          <p className="text-[11px] text-stone-500">
                            {s.programme?.name ? `Programme: ${s.programme.name}` : ""}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Linked Guardian Profile if present */}
          {user.guardianProfile && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-bold text-stone-900">Parent / Guardian Record</CardTitle>
                <span className="text-xs text-stone-500">
                  Contact: {user.guardianProfile.phonePrimary || user.phoneNumber || "None"}
                </span>
              </CardHeader>
              <CardContent className="space-y-3 pt-2 text-xs">
                <div>
                  <span className="text-stone-500 block mb-1">Enrolled Wards</span>
                  {!user.guardianProfile.relationships || user.guardianProfile.relationships.length === 0 ? (
                    <p className="text-stone-400 italic">No linked students found.</p>
                  ) : (
                    <div className="space-y-1">
                      {user.guardianProfile.relationships.map((rel, idx) => (
                        <Link
                          key={idx}
                          href={`/admin/students/${rel.student.id}`}
                          className="block p-2 rounded bg-stone-50 border border-stone-200 hover:border-[#800020] transition-colors"
                        >
                          <p className="font-bold text-[#800020]">
                            {rel.student.firstName} {rel.student.lastName}
                          </p>
                          <p className="text-[11px] text-stone-500 font-mono">
                            Adm: {rel.student.admissionNumber}
                          </p>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column: Sessions & Audit History */}
        <div className="md:col-span-2 space-y-6">
          {/* Active Sessions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold text-stone-900">Recent Login Sessions</CardTitle>
              <p className="text-xs text-stone-500">IP address and client device security fingerprints</p>
            </CardHeader>
            <CardContent className="p-0">
              {user.sessions.length === 0 ? (
                <p className="p-6 text-center text-xs text-stone-500">No active login sessions recorded.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHeaderCell>Client IP</TableHeaderCell>
                        <TableHeaderCell>Created At</TableHeaderCell>
                        <TableHeaderCell>Expires</TableHeaderCell>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {user.sessions.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-mono text-xs text-stone-900">
                            {s.ipAddress || "Unknown IP"}
                          </TableCell>
                          <TableCell className="text-xs text-stone-600">
                            {new Date(s.createdAt).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-xs text-stone-500">
                            {new Date(s.expiresAt).toLocaleDateString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Account Audit History */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold text-stone-900">Account Audit Trail</CardTitle>
              <p className="text-xs text-stone-500">Security modifications logged for this account</p>
            </CardHeader>
            <CardContent className="p-0">
              {user.auditLogs.length === 0 ? (
                <p className="p-6 text-center text-xs text-stone-500">No audit logs recorded for this account.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHeaderCell>Action</TableHeaderCell>
                        <TableHeaderCell className="text-right">Timestamp</TableHeaderCell>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {user.auditLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="font-mono text-xs font-semibold text-stone-900">
                            {log.action}
                          </TableCell>
                          <TableCell className="text-right text-xs text-stone-500">
                            {new Date(log.createdAt).toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* SUPER ADMIN MODAL: Edit Account Profile */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit User Account & Security Permissions"
      >
        <form onSubmit={handleEditUserSubmit} className="space-y-4 pt-2">
          {editError && (
            <Alert variant="danger" title="Validation Error">
              {editError}
            </Alert>
          )}

          <FormGroup label="Full Name" required>
            <Input
              type="text"
              required
              value={editFullName}
              onChange={(e) => setEditFullName(e.target.value)}
              placeholder="e.g. Muhammad Bello Haruna"
            />
          </FormGroup>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormGroup label="Email Address" required>
              <Input
                type="email"
                required
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="user@example.com"
              />
            </FormGroup>
            <FormGroup label="Phone Number">
              <Input
                type="tel"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="+234..."
              />
            </FormGroup>
          </div>

          <FormGroup label="Account Security Status" required>
            <Select
              value={editStatus}
              onChange={(e) => setEditStatus(e.target.value as UserStatus)}
            >
              <option value="ACTIVE">ACTIVE (Authorized Full Access)</option>
              <option value="PENDING_VERIFICATION">PENDING VERIFICATION (Awaiting Setup)</option>
              <option value="SUSPENDED">SUSPENDED (Access Blocked)</option>
              <option value="DEACTIVATED">DEACTIVATED (Account Archived)</option>
            </Select>
          </FormGroup>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-2">
              System Roles &amp; Permissions (Super Admin Access)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ALL_ROLES.map((role) => {
                const checked = editRoles.includes(role);
                return (
                  <label
                    key={role}
                    className={`flex items-center gap-2.5 p-3 rounded-lg border cursor-pointer text-xs font-semibold transition-colors ${
                      checked
                        ? "border-[#800020] bg-rose-50 text-[#800020]"
                        : "border-stone-200 hover:bg-stone-50 text-stone-700"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => handleEditRoleToggle(role)}
                      className="w-4 h-4 text-[#800020] rounded border-stone-300 focus:ring-[#800020]"
                    />
                    <span>{role.replace(/_/g, " ")}</span>
                  </label>
                );
              })}
            </div>
            <p className="text-[11px] text-stone-500 mt-1">
              Changes to roles will immediately update access boundaries across portals.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-stone-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowEditModal(false)}
              disabled={editSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={editSubmitting}
              className="bg-[#800020] hover:bg-[#5B0612] text-white font-bold"
            >
              {editSubmitting ? "Saving Changes..." : "Save User Details"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* SUPER ADMIN MODAL: Delete User Account */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Permanently Delete User Account"
      >
        <form onSubmit={handleDeleteUserSubmit} className="space-y-4 pt-2">
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 space-y-2">
            <p className="font-bold flex items-center gap-1 text-rose-800">
              ⚠️ Irreversible Administrative Action
            </p>
            <p>
              Deleting <strong>{user.email}</strong> will permanently remove all portal credentials, active sessions, and direct authentication records.
            </p>
            <p>
              If this user is a Teacher, teaching scopes and attendance author records will be unlinked safely. If this user is a Guardian, the family records will be preserved while revoking parent portal login access.
            </p>
          </div>

          {deleteError && (
            <Alert variant="danger" title="Cannot Delete Account">
              {deleteError}
            </Alert>
          )}

          <FormGroup
            label={`Type "${user.email}" to confirm deletion`}
            required
            helperText="This ensures critical user accounts are not erased by accident."
          >
            <Input
              type="text"
              required
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              placeholder={user.email}
              autoComplete="off"
            />
          </FormGroup>

          <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowDeleteModal(false)}
              disabled={deleteSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={deleteSubmitting || deleteConfirmation.trim().toLowerCase() !== user.email.toLowerCase()}
              className="bg-rose-700 hover:bg-rose-800 text-white font-bold"
            >
              {deleteSubmitting ? "Deleting Account..." : "Permanently Delete User"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Status Modal */}
      <Modal
        isOpen={showStatusModal}
        onClose={() => setShowStatusModal(false)}
        title="Change Account Security Status"
      >
        <div className="space-y-4 pt-2">
          <p className="text-xs text-stone-600">
            Deactivating or suspending an account immediately revokes all active login sessions.
          </p>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">Status</label>
            <Select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value as UserStatus)}
            >
              <option value="ACTIVE">Active</option>
              <option value="PENDING_VERIFICATION">Pending Verification</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="DEACTIVATED">Deactivated</option>
            </Select>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">Administrative Reason (Required)</label>
            <Textarea
              rows={3}
              placeholder="Reason for changing status (required for audit trail)..."
              value={statusReason}
              onChange={(e) => setStatusReason(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowStatusModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={statusSubmitting || !statusReason.trim()}
              onClick={handleStatusSubmit}
              className="bg-stone-900 text-white font-bold hover:bg-stone-800"
            >
              {statusSubmitting ? "Updating..." : "Update Status"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Role Assignment Modal */}
      <Modal
        isOpen={showRoleModal}
        onClose={() => setShowRoleModal(false)}
        title="Modify Assigned Roles"
      >
        <div className="space-y-4 pt-2">
          <p className="text-xs text-stone-600">
            Select the system roles to assign to this user. Anti-privilege escalation is strictly enforced.
          </p>

          <div className="space-y-2">
            {ALL_ROLES.map((role) => (
              <label
                key={role}
                className="flex items-center gap-2.5 p-3 rounded-lg border border-stone-200 hover:bg-stone-50 cursor-pointer text-sm font-semibold"
              >
                <input
                  type="checkbox"
                  checked={selectedRoles.includes(role)}
                  onChange={() => handleRoleToggle(role)}
                  className="w-4 h-4 text-[#5B0612] rounded border-stone-300 focus:ring-[#5B0612]"
                />
                <span>{role.replace(/_/g, " ")}</span>
              </label>
            ))}
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">
              Reason for Role Modification (Required)
            </label>
            <Textarea
              rows={2}
              placeholder="State reason for role changes..."
              value={roleReason}
              onChange={(e) => setRoleReason(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowRoleModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={roleSubmitting || !roleReason.trim() || selectedRoles.length === 0}
              onClick={handleRoleSubmit}
              className="bg-stone-900 text-white font-bold hover:bg-stone-800"
            >
              {roleSubmitting ? "Saving..." : "Save Roles"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Administrative Password Reset Modal */}
      <Modal
        isOpen={showResetModal}
        onClose={() => setShowResetModal(false)}
        title="Initiate Administrative Password Reset"
      >
        <div className="space-y-4 pt-2">
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
            <p className="font-bold">🔒 Zero Plaintext Password Policy</p>
            <p>
              Administrators cannot view or set user passwords. A single-use 24-hour reset link will be sent to the user’s registered email address (<strong>{user.email}</strong>).
            </p>
            <p>
              Executing this action immediately invalidates all active sessions for this account across all devices.
            </p>
          </div>

          <p className="text-xs text-stone-600">
            Confirm that you wish to dispatch an official password reset invitation to this account.
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowResetModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={resetSubmitting}
              onClick={handleInitiatePasswordReset}
              className="bg-[#800020] text-white font-bold hover:bg-[#5B0612]"
            >
              {resetSubmitting ? "Dispatching..." : "Send Reset Link"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Administrative Email Change Modal */}
      <Modal
        isOpen={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        title="Account Recovery: Change Registered Email"
      >
        <div className="space-y-4 pt-2">
          <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900 space-y-1">
            <p className="font-bold">🛡️ Recovery Protocol &amp; Multi-Party Notification</p>
            <p>
              Changing a user’s primary email is an auditable security event. A notification will be dispatched to the existing address (<strong>{user.email}</strong>), and an ownership verification token will be sent to the new email address.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">New Email Address</label>
            <Input
              type="email"
              required
              placeholder="e.g. parent.new@example.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">
              Administrative Justification (Required for Audit Log)
            </label>
            <Textarea
              rows={2}
              placeholder="State verified parental request, lost access documentation, or administrative rationale..."
              value={emailReason}
              onChange={(e) => setEmailReason(e.target.value)}
            />
          </div>

          <label className="flex items-start gap-2.5 p-3 rounded-lg border border-stone-200 bg-stone-50 cursor-pointer text-xs">
            <input
              type="checkbox"
              checked={identityVerified}
              onChange={(e) => setIdentityVerified(e.target.checked)}
              className="w-4 h-4 text-[#800020] rounded border-stone-300 focus:ring-[#800020] mt-0.5"
            />
            <span className="font-medium text-stone-800">
              I certify that I have verified the account holder&apos;s identity through official records or valid government identification.
            </span>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowEmailModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={emailSubmitting || !identityVerified || !newEmail.trim() || emailReason.trim().length < 5}
              onClick={handleEmailChangeSubmit}
              className="bg-[#800020] text-white font-bold hover:bg-[#5B0612]"
            >
              {emailSubmitting ? "Updating..." : "Update Email & Notify"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

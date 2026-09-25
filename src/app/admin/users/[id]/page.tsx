"use client";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { Table, TableHeader, TableRow, TableHeaderCell, TableBody, TableCell } from "@/components/ui/table";
import { UserStatus, RoleCode } from "@prisma/client";

interface UserDetail {
  id: string;
  email: string;
  phoneNumber: string | null;
  status: UserStatus;
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
}

const ALL_ROLES: RoleCode[] = [
  RoleCode.SUPER_ADMIN,
  RoleCode.ADMIN,
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
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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
      setActionNotice({ type: 'success', message: json.message || 'Password reset link sent to user email.' });
      await fetchUser();
    } catch (err: unknown) {
      setActionNotice({ type: 'error', message: err instanceof Error ? err.message : 'Action failed.' });
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
      setActionNotice({ type: 'success', message: json.message || 'Email changed and verification dispatched.' });
      await fetchUser();
    } catch (err: unknown) {
      setActionNotice({ type: 'error', message: err instanceof Error ? err.message : 'Failed to change email.' });
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
      setActionNotice({ type: 'success', message: 'Account unlocked successfully.' });
      await fetchUser();
    } catch (err: unknown) {
      setActionNotice({ type: 'error', message: err instanceof Error ? err.message : 'Failed to unlock.' });
    } finally {
      setUnlockSubmitting(false);
    }
  };

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
        const normalized = {
          ...json,
          roles: userRoles,
          sessions: json.sessions || [],
          auditLogs: json.auditLogs || [],
        };
        setUser(normalized);
        setNewStatus(json.status);
        setSelectedRoles(userRoles.map((r: { role?: { code: RoleCode }; code?: RoleCode }) => r.role?.code || r.code || (r as unknown as RoleCode)));
      });
  };

  useEffect(() => {
    fetch(`/api/super-admin/users/${userId}`)
      .then(async (res) => {
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Failed to load user account.");
        }
        return res.json();
      })
      .then((json) => {
        const userRoles = json.roles || json.userRoles || [];
        const normalized = {
          ...json,
          roles: userRoles,
          sessions: json.sessions || [],
          auditLogs: json.auditLogs || [],
        };
        setUser(normalized);
        setNewStatus(json.status);
        setSelectedRoles(userRoles.map((r: { role?: { code: RoleCode }; code?: RoleCode }) => r.role?.code || r.code || (r as unknown as RoleCode)));
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Error retrieving user.");
        setLoading(false);
      });
  }, [userId]);

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

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-stone-500 mb-1">
            <Link href="/admin/users" className="hover:underline">
              ← User Directory
            </Link>
            <span>/</span>
            <span>Account Control</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#5B0612] tracking-tight">
            {user.email}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="outline"
            size="md"
            onClick={() => setShowResetModal(true)}
            className="font-bold border-amber-300 text-amber-900 bg-amber-50 hover:bg-amber-100"
          >
            Reset Password Link
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
            className="font-bold border-blue-300 text-blue-900 bg-blue-50 hover:bg-blue-100"
          >
            Change Registered Email
          </Button>
          {(user.failedLoginAttempts > 0 || user.lockedUntil) && (
            <Button
              variant="outline"
              size="md"
              disabled={unlockSubmitting}
              onClick={handleEmergencyUnlock}
              className="font-bold border-rose-300 text-rose-900 bg-rose-50 hover:bg-rose-100"
            >
              {unlockSubmitting ? "Unlocking..." : "Unlock Account"}
            </Button>
          )}
          <Button
            variant="outline"
            size="md"
            onClick={() => setShowStatusModal(true)}
            className="font-bold border-stone-300"
          >
            Change Status ({user.status})
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => setShowRoleModal(true)}
            className="bg-stone-900 hover:bg-stone-800 text-white font-bold"
          >
            Modify Assigned Roles
          </Button>
        </div>
      </div>

      {actionNotice && (
        <div
          className={`p-4 rounded-xl border text-sm font-medium flex items-center justify-between ${
            actionNotice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <span>{actionNotice.message}</span>
          <button
            onClick={() => setActionNotice(null)}
            className="text-xs font-bold underline ml-4 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Account Details */}
        <Card className="md:col-span-1">
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
            <div className="py-1.5">
              <span className="text-stone-500 block mb-1">Active Roles</span>
              <div className="flex flex-wrap gap-1">
                {user.roles.map((r) => (
                  <Badge key={r.role.id} variant="brand" size="sm">
                    {r.role.name}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right Column: Sessions & Audit History */}
        <div className="md:col-span-2 space-y-6">
          {/* Active Sessions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold text-stone-900">Recent Login Sessions</CardTitle>
              <p className="text-xs text-stone-500">IP address and client fingerprint records</p>
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
            <label className="block text-xs font-bold text-stone-700 mb-1">Reason for Role Modification (Required)</label>
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
            <input
              type="email"
              required
              placeholder="e.g. parent.new@example.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-[#800020] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">Administrative Justification (Required for Audit Log)</label>
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

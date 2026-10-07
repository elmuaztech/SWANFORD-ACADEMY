"use client";

import React, { useState, useEffect } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";

interface ImpersonateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface UserOption {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  roles: Array<{ role: { code: string; name: string } }>;
  teacher?: { staffId: string } | null;
  guardian?: any | null;
}

export function ImpersonateModal({ isOpen, onClose }: ImpersonateModalProps) {
  const [loadingDirect, setLoadingDirect] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Search specific user state
  const [searchQuery, setSearchQuery] = useState("");
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setSelectedUser(null);
      setSearchQuery("");
      fetchUserList();
    }
  }, [isOpen]);

  const fetchUserList = async () => {
    try {
      setLoadingUsers(true);
      const res = await fetch("/api/admin/users?limit=50");
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data?.users) ? data.users : Array.isArray(data) ? data : [];
        setUsers(list);
      }
    } catch {
      // Ignore
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleDirectRoleImpersonate = async (role: "PARENT" | "TEACHER" | "ADMIN") => {
    try {
      setLoadingDirect(role);
      setError(null);

      const res = await fetch("/api/super-admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetRole: role }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Failed to impersonate ${role}`);
      }

      // Hard redirect to clear router cache and load target portal immediately
      window.location.href = data.redirectUrl || (role === "PARENT" ? "/parent" : role === "TEACHER" ? "/teacher" : "/admin");
    } catch (err: any) {
      setError(err?.message || "Failed to switch account.");
      setLoadingDirect(null);
    }
  };

  const handleUserImpersonate = async (user: UserOption) => {
    try {
      setLoadingDirect(user.id);
      setError(null);

      const res = await fetch("/api/super-admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: user.id }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to impersonate user");
      }

      window.location.href = data.redirectUrl || "/admin";
    } catch (err: any) {
      setError(err?.message || "Failed to switch account.");
      setLoadingDirect(null);
    }
  };

  const filteredUsers = users.filter((u) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const fullName = `${u.firstName || ""} ${u.lastName || ""}`.toLowerCase();
    return (
      u.email.toLowerCase().includes(q) ||
      fullName.includes(q) ||
      u.roles?.some((r) => r.role.name.toLowerCase().includes(q) || r.role.code.toLowerCase().includes(q))
    );
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="🎭 Super Admin Portal Impersonation"
      description="Directly switch sessions to preview, verify, and operate as Parents, Teachers, or Administrators."
      size="lg"
    >
      <div className="space-y-6 py-2">
        {error && (
          <Alert variant="danger" title="Impersonation Failed">
            {error}
          </Alert>
        )}

        {/* Section 1: Direct Portal Jump */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-3">
            1. Direct Portal Access
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Parent Portal */}
            <div className="bg-[#FAF7F2] border border-[#EADBDA] rounded-xl p-4 flex flex-col justify-between hover:border-amber-600 transition-colors">
              <div>
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center text-xl mb-2.5">
                  👨‍👩‍👧
                </div>
                <h5 className="font-bold text-stone-900 text-sm">Parent Portal</h5>
                <p className="text-xs text-stone-500 mt-1">
                  View child academic reports, attendance, invoices, and online fee payments.
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                className="mt-4 w-full bg-amber-700 hover:bg-amber-800 text-white font-bold"
                onClick={() => handleDirectRoleImpersonate("PARENT")}
                isLoading={loadingDirect === "PARENT"}
                disabled={Boolean(loadingDirect)}
              >
                Launch Parent &rarr;
              </Button>
            </div>

            {/* Teacher Portal */}
            <div className="bg-[#FAF7F2] border border-[#EADBDA] rounded-xl p-4 flex flex-col justify-between hover:border-emerald-600 transition-colors">
              <div>
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center text-xl mb-2.5">
                  👩‍🏫
                </div>
                <h5 className="font-bold text-stone-900 text-sm">Teacher Portal</h5>
                <p className="text-xs text-stone-500 mt-1">
                  Take class roll-call, grade continuous assessments, and review assigned classes.
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                className="mt-4 w-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold"
                onClick={() => handleDirectRoleImpersonate("TEACHER")}
                isLoading={loadingDirect === "TEACHER"}
                disabled={Boolean(loadingDirect)}
              >
                Launch Teacher &rarr;
              </Button>
            </div>

            {/* Admin Portal */}
            <div className="bg-[#FAF7F2] border border-[#EADBDA] rounded-xl p-4 flex flex-col justify-between hover:border-rose-600 transition-colors">
              <div>
                <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-800 flex items-center justify-center text-xl mb-2.5">
                  🛡️
                </div>
                <h5 className="font-bold text-stone-900 text-sm">Admin Dashboard</h5>
                <p className="text-xs text-stone-500 mt-1">
                  Operate administrative functions as a School Administrator.
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                className="mt-4 w-full bg-[#800020] hover:bg-[#6b001a] text-white font-bold"
                onClick={() => handleDirectRoleImpersonate("ADMIN")}
                isLoading={loadingDirect === "ADMIN"}
                disabled={Boolean(loadingDirect)}
              >
                Launch Admin &rarr;
              </Button>
            </div>
          </div>
        </div>

        {/* Section 2: Specific User Selection */}
        <div className="border-t border-stone-200 pt-5">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">
              2. Impersonate Specific User Account
            </h4>
            <span className="text-xs text-stone-400">
              {filteredUsers.length} available accounts
            </span>
          </div>

          <Input
            placeholder="Search by name, email, or role..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="mb-3"
          />

          <div className="max-h-60 overflow-y-auto divide-y divide-stone-100 border border-stone-200 rounded-xl bg-white">
            {loadingUsers ? (
              <div className="p-4 text-center text-xs text-stone-500">Loading user accounts...</div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-4 text-center text-xs text-stone-500">No accounts match search query.</div>
            ) : (
              filteredUsers.map((u) => {
                const name = u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : null;
                const roleCode = u.roles?.[0]?.role.code || "USER";

                return (
                  <div
                    key={u.id}
                    className="p-3 flex items-center justify-between gap-3 hover:bg-stone-50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-stone-900 truncate">
                          {name || u.email}
                        </span>
                        <Badge
                          size="sm"
                          variant={
                            roleCode === "PARENT"
                              ? "warning"
                              : roleCode === "TEACHER"
                              ? "success"
                              : "brand"
                          }
                        >
                          {roleCode}
                        </Badge>
                      </div>
                      {name && <div className="text-[11px] text-stone-500 truncate">{u.email}</div>}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUserImpersonate(u)}
                      isLoading={loadingDirect === u.id}
                      disabled={Boolean(loadingDirect)}
                      className="shrink-0 text-xs font-semibold hover:border-amber-700 hover:text-amber-800"
                    >
                      Impersonate 🎭
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <Button variant="outline" size="md" onClick={onClose} disabled={Boolean(loadingDirect)}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}

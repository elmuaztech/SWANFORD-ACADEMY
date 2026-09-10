"use client";

import React, { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { RoleCode } from "@prisma/client";
import { type PermissionCodeType } from "@/lib/auth/permissions";

interface PermissionDef {
  code: PermissionCodeType;
  name: string;
  category: string;
  description: string;
}

interface ConfigResponse {
  permissions: PermissionDef[];
  rolePermissions: Record<RoleCode, PermissionCodeType[]>;
}

export default function SuperAdminRolesPage() {
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<RoleCode>(RoleCode.ADMIN);

  const fetchConfig = () => {
    setLoading(true);
    setError(null);
    fetch("/api/super-admin/config")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load security configuration.");
        return res.json();
      })
      .then((json) => {
        setConfig(json);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Error loading roles matrix.");
        setLoading(false);
      });
  };

  useEffect(() => {
    fetch("/api/super-admin/config")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load security configuration.");
        return res.json();
      })
      .then((json) => {
        setConfig(json);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Error loading roles matrix.");
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="py-12">
        <LoadingState message="Loading system roles &amp; permissions matrix..." />
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className="py-8">
        <ErrorState
          title="Security Matrix Unavailable"
          message={error || "Could not retrieve roles & permissions matrix."}
          actionLabel="Retry"
          onAction={fetchConfig}
        />
      </div>
    );
  }

  const roleCodes: RoleCode[] = [
    RoleCode.SUPER_ADMIN,
    RoleCode.ADMIN,
    RoleCode.TEACHER,
    RoleCode.PARENT,
    RoleCode.ACCOUNTANT,
  ];

  const assignedPermissions = config.rolePermissions[selectedRole] || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight">
          Roles &amp; Permissions Matrix
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Canonical access control matrix adhering strictly to Swanford&apos;s <span className="font-semibold text-stone-700">ROLE != PERMISSION != SCOPE</span> architecture.
        </p>
      </div>

      {/* Role Selection Tabs */}
      <div className="flex flex-wrap gap-2">
        {roleCodes.map((code) => (
          <button
            key={code}
            onClick={() => setSelectedRole(code)}
            className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-xl transition-colors ${
              selectedRole === code
                ? "bg-stone-900 text-white shadow-xs"
                : "bg-white border border-stone-200 text-stone-600 hover:bg-stone-50"
            }`}
          >
            {code.replace(/_/g, " ")} ({config.rolePermissions[code]?.length || 0})
          </button>
        ))}
      </div>

      {/* Permissions Table for Selected Role */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-3 bg-stone-50 border-b border-stone-200">
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-base font-bold text-stone-900">
                Permissions Granted to {selectedRole.replace(/_/g, " ")}
              </CardTitle>
              <p className="text-xs text-stone-500 mt-0.5">
                Total {assignedPermissions.length} granted of {config.permissions.length} total system permissions
              </p>
            </div>
            <Badge variant="brand" size="md">
              {selectedRole}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Permission Code</TableHead>
                  <TableHead>Friendly Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Granted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {config.permissions.map((perm) => {
                  const isGranted = assignedPermissions.includes(perm.code);
                  return (
                    <TableRow key={perm.code} className={isGranted ? "bg-emerald-50/20" : ""}>
                      <TableCell className="font-mono text-xs font-bold text-stone-900">
                        {perm.code}
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-stone-800">
                        {perm.name}
                      </TableCell>
                      <TableCell className="text-xs text-stone-600">
                        <Badge variant="neutral" size="sm">
                          {perm.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-stone-500 max-w-md">
                        {perm.description}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={isGranted ? "success" : "neutral"} size="sm">
                          {isGranted ? "ACTIVE" : "NO ACCESS"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

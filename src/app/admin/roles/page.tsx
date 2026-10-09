"use client";

import React, { useEffect, useState } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Button,
  LoadingState,
  ErrorState,
  PageHeader,
  Table,
  TableHead,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
  TableWrapper,
} from "@/components";
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

export default function AdminRolesPage() {
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
    fetchConfig();
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
  ];

  const assignedPermissions = config.rolePermissions[selectedRole] || [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles & Permissions Matrix"
        description="Canonical access control matrix adhering strictly to Swanford's Role != Permission != Scope security architecture."
        badge={<Badge variant="brand" size="sm">Super Admin Governance</Badge>}
        breadcrumbs={[
          { label: "Dashboard", href: "/admin" },
          { label: "Roles & Permissions" },
        ]}
        actions={
          <Button variant="outline" size="md" onClick={fetchConfig}>
            Refresh Matrix
          </Button>
        }
      />

      {/* Role Selection Tabs */}
      <div className="flex flex-wrap gap-2">
        {roleCodes.map((code) => {
          const isSelected = selectedRole === code;
          return (
            <button
              key={code}
              type="button"
              onClick={() => setSelectedRole(code)}
              className={`px-4 py-2.5 text-xs sm:text-sm font-bold rounded-xl transition-all cursor-pointer min-h-[44px] ${
                isSelected
                  ? "bg-[#800020] text-white shadow-xs"
                  : "bg-white border border-[#EADBDA] text-stone-700 hover:bg-[#FAF7F2]"
              }`}
            >
              {code.replace(/_/g, " ")} ({config.rolePermissions[code]?.length || 0})
            </button>
          );
        })}
      </div>

      {/* Permissions Table for Selected Role */}
      <Card className="border border-[#EADBDA]/80 overflow-hidden">
        <CardHeader className="pb-3 bg-[#FAF7F2] border-b border-[#EADBDA]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
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
          <TableWrapper>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell className="w-14 text-center font-semibold text-stone-700">S/N</TableHeaderCell>
                  <TableHeaderCell className="min-w-[200px] text-left font-semibold text-stone-700">Permission Code</TableHeaderCell>
                  <TableHeaderCell className="min-w-[180px] text-left font-semibold text-stone-700">Friendly Name</TableHeaderCell>
                  <TableHeaderCell className="w-32 text-left font-semibold text-stone-700">Category</TableHeaderCell>
                  <TableHeaderCell className="min-w-[240px] text-left font-semibold text-stone-700">Description</TableHeaderCell>
                  <TableHeaderCell className="w-32 text-right font-semibold text-stone-700">Granted</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {config.permissions.map((perm, index) => {
                  const isGranted = assignedPermissions.includes(perm.code);
                  return (
                    <TableRow key={perm.code} className={isGranted ? "bg-[#FAF7F2]/40" : ""}>
                      <TableCell className="w-14 text-center text-xs font-semibold text-stone-500">
                        {index + 1}
                      </TableCell>
                      <TableCell className="min-w-[200px] font-mono text-xs font-bold text-stone-900">
                        {perm.code}
                      </TableCell>
                      <TableCell className="min-w-[180px] text-xs font-semibold text-stone-800">
                        {perm.name}
                      </TableCell>
                      <TableCell className="w-32">
                        <Badge variant="neutral" size="sm">
                          {perm.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="min-w-[240px] text-xs text-stone-500 break-words">
                        {perm.description}
                      </TableCell>
                      <TableCell className="w-32 text-right">
                        <Badge variant={isGranted ? "success" : "neutral"} size="sm">
                          {isGranted ? "ACTIVE" : "NO ACCESS"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableWrapper>
        </CardContent>
      </Card>
    </div>
  );
}

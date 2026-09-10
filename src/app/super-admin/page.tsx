"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";

interface SuperAdminDashboardData {
  userStatus: {
    total: number;
    active: number;
    suspended: number;
    locked: number;
    deactivated: number;
  };
  roleDistribution: Record<string, number>;
  notificationHealth: {
    pending: number;
    sent: number;
    failed: number;
  };
  totalAuditLogs: number;
  recentSecurityEvents: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    createdAt: string;
    user: { email: string } | null;
  }>;
}

export default function SuperAdminDashboardPage() {
  const [data, setData] = useState<SuperAdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = () => {
    setLoading(true);
    setError(null);
    fetch("/api/super-admin/dashboard")
      .then(async (res) => {
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Failed to load governance dashboard.");
        }
        return res.json();
      })
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Error loading system metrics.");
        setLoading(false);
      });
  };

  useEffect(() => {
    fetch("/api/super-admin/dashboard")
      .then(async (res) => {
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Failed to load governance dashboard.");
        }
        return res.json();
      })
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Error loading system metrics.");
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="py-12">
        <LoadingState message="Connecting to governance core and verifying security telemetry..." />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="py-8">
        <ErrorState
          title="Governance Dashboard Unavailable"
          message={error || "Could not retrieve system telemetry."}
          actionLabel="Retry"
          onAction={fetchMetrics}
        />
      </div>
    );
  }

  const { userStatus, roleDistribution, notificationHealth, totalAuditLogs, recentSecurityEvents } = data;

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Governance Banner */}
      <div className="bg-gradient-to-r from-stone-900 via-stone-800 to-[#5B0612] rounded-2xl p-6 sm:p-8 text-white shadow-md flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-xs text-xs font-semibold tracking-wide uppercase mb-3">
            <span>Enterprise Security &amp; Control</span>
            <span>•</span>
            <span className="text-[#D4AF37]">Zero Trust Enforced</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Super Admin Governance</h1>
          <p className="mt-1 text-sm text-stone-300 max-w-xl">
            System-wide identity directory, role assignment governance, outbox health, and immutable audit logs.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Link href="/super-admin/users">
            <Button variant="secondary" size="md" className="bg-[#FDFBF7] text-stone-900 font-bold hover:bg-stone-100">
              Manage Users ({userStatus.total})
            </Button>
          </Link>
          <Link href="/super-admin/audit">
            <Button variant="outline" size="md" className="border-white/40 text-white hover:bg-white/10">
              Audit Logs ({totalAuditLogs.toLocaleString()})
            </Button>
          </Link>
        </div>
      </div>

      {/* 4 Stat Overview Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <Card className="border-l-4 border-l-stone-900">
          <CardHeader className="pb-2">
            <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Total User Accounts</span>
            <CardTitle className="text-2xl sm:text-3xl font-extrabold text-stone-900 mt-1">
              {userStatus.total.toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-stone-500">
              {userStatus.active} active • {userStatus.suspended} suspended • {userStatus.locked} locked
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-[#5B0612]">
          <CardHeader className="pb-2">
            <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Super Admins</span>
            <CardTitle className="text-2xl sm:text-3xl font-extrabold text-stone-900 mt-1">
              {roleDistribution["SUPER_ADMIN"] || 1}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-stone-500">Highest authority tier in system</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-600">
          <CardHeader className="pb-2">
            <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Notification Delivery</span>
            <CardTitle className="text-2xl sm:text-3xl font-extrabold text-stone-900 mt-1">
              {notificationHealth.sent.toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-stone-500">
              {notificationHealth.pending} pending in queue • {notificationHealth.failed} failed
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-[#D4AF37]">
          <CardHeader className="pb-2">
            <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Audit Trail Events</span>
            <CardTitle className="text-2xl sm:text-3xl font-extrabold text-stone-900 mt-1">
              {totalAuditLogs.toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-stone-500">Immutable ledger operations</p>
          </CardContent>
        </Card>
      </div>

      {/* Roles Matrix & Security Audit */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Role Distribution Card */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold text-stone-900">Assigned Roles Distribution</CardTitle>
              <p className="text-xs text-stone-500">Count of active accounts by role assignment</p>
            </div>
            <Link href="/super-admin/roles">
              <Button variant="outline" size="sm">
                View Matrix
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Object.entries(roleDistribution).map(([role, count]) => (
                <div key={role} className="p-3 bg-stone-50 rounded-xl border border-stone-200">
                  <span className="text-[11px] font-mono font-semibold text-stone-600 truncate block">
                    {role.replace(/_/g, " ")}
                  </span>
                  <p className="text-xl font-bold text-stone-900 mt-1">{count}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Security Logs */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold text-stone-900">Recent Security Events</CardTitle>
              <p className="text-xs text-stone-500">Elevated privilege changes &amp; access modifications</p>
            </div>
            <Link href="/super-admin/audit" className="text-xs text-[#5B0612] font-semibold hover:underline">
              Full Log →
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {recentSecurityEvents.length === 0 ? (
              <p className="p-6 text-center text-sm text-stone-500">No elevated security events logged yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event</TableHead>
                      <TableHead>Actor</TableHead>
                      <TableHead className="text-right">Timestamp</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentSecurityEvents.map((evt) => (
                      <TableRow key={evt.id}>
                        <TableCell className="font-mono text-xs font-semibold text-stone-900">
                          <div>{evt.action}</div>
                          <span className="text-[11px] text-stone-500">
                            {evt.entityType}: {evt.entityId}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-stone-700">
                          {evt.user?.email || "System Service"}
                        </TableCell>
                        <TableCell className="text-right text-xs text-stone-500">
                          {new Date(evt.createdAt).toLocaleString()}
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
  );
}

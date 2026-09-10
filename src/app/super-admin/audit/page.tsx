"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";

interface AuditItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  oldValues: unknown;
  newValues: unknown;
  user: { email: string } | null;
}

interface AuditResponse {
  items: AuditItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export default function SuperAdminAuditPage() {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");

  // Inspector Modal
  const [inspectingItem, setInspectingItem] = useState<AuditItem | null>(null);

  const fetchAuditLogs = (targetPage = page) => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.append("page", targetPage.toString());
    params.append("pageSize", "20");
    if (actionFilter) params.append("action", actionFilter);
    if (entityFilter) params.append("entityType", entityFilter);

    fetch(`/api/super-admin/audit?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Failed to load audit logs.");
        }
        return res.json();
      })
      .then((json) => {
        setData(json);
        setPage(targetPage);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Error retrieving audit records.");
        setLoading(false);
      });
  };

  useEffect(() => {
    const params = new URLSearchParams();
    params.append("page", "1");
    params.append("pageSize", "20");
    if (actionFilter) params.append("action", actionFilter);
    if (entityFilter) params.append("entityType", entityFilter);

    fetch(`/api/super-admin/audit?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Failed to load audit logs.");
        }
        return res.json();
      })
      .then((json) => {
        setData(json);
        setPage(1);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Error retrieving audit records.");
        setLoading(false);
      });
  }, [actionFilter, entityFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight">
            Immutable Audit Trail
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Cryptographically chronological records of security actions, role updates, and administrative overrides.
          </p>
        </div>
        <Button variant="outline" size="md" onClick={() => fetchAuditLogs(page)}>
          Refresh Log
        </Button>
      </div>

      {/* Filter Card */}
      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="w-full sm:w-72">
            <Input
              placeholder="Filter action (e.g. USER_ROLE_ASSIGNED)..."
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-60">
            <Input
              placeholder="Filter entity (e.g. User, Student)..."
              value={entityFilter}
              onChange={(e) => setEntityFilter(e.target.value)}
            />
          </div>
          <Button
            variant="outline"
            size="md"
            onClick={() => {
              setActionFilter("");
              setEntityFilter("");
            }}
          >
            Clear Filters
          </Button>
        </CardContent>
      </Card>

      {/* Audit Log Table */}
      {loading ? (
        <div className="py-12">
          <LoadingState message="Fetching immutable audit records..." />
        </div>
      ) : error ? (
        <ErrorState
          title="Audit Trail Unavailable"
          message={error}
          actionLabel="Retry"
          onAction={() => fetchAuditLogs(page)}
        />
      ) : !data || data.items.length === 0 ? (
        <Card className="py-12 text-center">
          <CardContent>
            <p className="text-base font-semibold text-stone-700">No audit records found matching criteria.</p>
            <p className="text-xs text-stone-500 mt-1">Try relaxing filters.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead className="text-right">Payload</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-xs text-stone-500 whitespace-nowrap">
                      {new Date(item.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-semibold text-xs text-stone-900">
                      {item.user?.email || "SYSTEM"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="brand" size="sm" className="font-mono text-[11px]">
                        {item.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-stone-700">
                      <span className="font-semibold">{item.entityType}</span>
                      <span className="font-mono text-[11px] text-stone-400 block truncate max-w-[120px]">
                        {item.entityId}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-stone-500">
                      {item.ipAddress || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setInspectingItem(item)}
                        className="text-[#5B0612] hover:bg-[#FDF2F4] text-xs font-semibold"
                      >
                        Inspect Payload
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="p-4 border-t border-stone-200 flex justify-center">
              <Pagination
                currentPage={page}
                totalPages={data.totalPages}
                onPageChange={(p) => fetchAuditLogs(p)}
              />
            </div>
          )}
        </Card>
      )}

      {/* Inspect Modal */}
      {inspectingItem && (
        <Modal
          isOpen={true}
          onClose={() => setInspectingItem(null)}
          title={`Audit Payload: ${inspectingItem.action}`}
        >
          <div className="space-y-4 pt-2">
            <div className="text-xs space-y-1 bg-stone-50 p-3 rounded-lg border border-stone-200">
              <p><span className="font-bold">Actor:</span> {inspectingItem.user?.email || "SYSTEM"}</p>
              <p><span className="font-bold">Entity:</span> {inspectingItem.entityType} ({inspectingItem.entityId})</p>
              <p><span className="font-bold">Timestamp:</span> {new Date(inspectingItem.createdAt).toLocaleString()}</p>
              {inspectingItem.ipAddress && <p><span className="font-bold">IP:</span> {inspectingItem.ipAddress}</p>}
            </div>

            {inspectingItem.oldValues ? (
              <div>
                <span className="text-xs font-bold text-stone-700 block mb-1">Previous Values (Before Action)</span>
                <pre className="p-3 bg-stone-900 text-stone-100 rounded-lg text-xs overflow-x-auto font-mono">
                  {JSON.stringify(inspectingItem.oldValues, null, 2)}
                </pre>
              </div>
            ) : null}

            {inspectingItem.newValues ? (
              <div>
                <span className="text-xs font-bold text-stone-700 block mb-1">New Values (After Action)</span>
                <pre className="p-3 bg-stone-900 text-stone-100 rounded-lg text-xs overflow-x-auto font-mono">
                  {JSON.stringify(inspectingItem.newValues, null, 2)}
                </pre>
              </div>
            ) : null}

            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => setInspectingItem(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

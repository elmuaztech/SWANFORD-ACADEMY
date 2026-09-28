"use client";

import React, { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  Badge,
  Button,
  Input,
  Modal,
  LoadingState,
  ErrorState,
  EmptyState,
  PageHeader,
  Pagination,
  Table,
  TableHead,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
  TableWrapper,
  TableMobileCard,
} from "@/components";

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

export default function AdminAuditPage() {
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
        if (res.status === 403) throw new Error("ACCESS_RESTRICTED");
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
        if (res.status === 403) throw new Error("ACCESS_RESTRICTED");
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

  const isFiltered = Boolean(actionFilter || entityFilter);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Immutable Audit Trail"
        description="Cryptographically chronological records of security actions, role updates, and administrative overrides."
        badge={<Badge variant="brand" size="sm">Super Admin Governance</Badge>}
        breadcrumbs={[
          { label: "Dashboard", href: "/admin" },
          { label: "Audit Trail" },
        ]}
        actions={
          <Button variant="outline" size="md" onClick={() => fetchAuditLogs(page)}>
            Refresh Log
          </Button>
        }
      />

      {/* Filter Card */}
      <Card className="border border-[#EADBDA]/80">
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
          {isFiltered && (
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
          )}
        </CardContent>
      </Card>

      {/* Audit Log Table */}
      {loading ? (
        <div className="py-12">
          <LoadingState message="Fetching immutable audit records..." />
        </div>
      ) : error ? (
        <ErrorState
          title={error === "ACCESS_RESTRICTED" ? "Access Restricted" : "Audit Trail Unavailable"}
          message={
            error === "ACCESS_RESTRICTED"
              ? "System audit records and modification histories are restricted exclusively to Super Administrators."
              : error
          }
          actionLabel={error === "ACCESS_RESTRICTED" ? "Return to Operations Dashboard" : "Retry"}
          onAction={
            error === "ACCESS_RESTRICTED"
              ? () => {
                  window.location.href = "/admin";
                }
              : () => fetchAuditLogs(page)
          }
        />
      ) : !data || (data.items || (data as any).logs || []).length === 0 ? (
        <EmptyState
          title="No Audit Records Found"
          description={
            isFiltered
              ? "No audit events match your active filters. Try clearing action or entity filters."
              : "No system modification events have been logged yet. Administrative operations will automatically create immutable audit records here."
          }
          actionLabel={isFiltered ? "Clear Filters" : undefined}
          onAction={
            isFiltered
              ? () => {
                  setActionFilter("");
                  setEntityFilter("");
                }
              : undefined
          }
        />
      ) : (
        <div>
          {/* Desktop Semantic Table View (>= 768px) */}
          <div className="hidden md:block">
            <TableWrapper className="border border-[#EADBDA]/80">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell className="w-14 text-center font-semibold text-stone-700">S/N</TableHeaderCell>
                    <TableHeaderCell className="w-44 text-left font-semibold text-stone-700">Timestamp</TableHeaderCell>
                    <TableHeaderCell className="min-w-[180px] text-left font-semibold text-stone-700">Actor</TableHeaderCell>
                    <TableHeaderCell className="min-w-[200px] text-left font-semibold text-stone-700">Action</TableHeaderCell>
                    <TableHeaderCell className="min-w-[160px] text-left font-semibold text-stone-700">Entity</TableHeaderCell>
                    <TableHeaderCell className="w-32 text-left font-semibold text-stone-700">IP Address</TableHeaderCell>
                    <TableHeaderCell className="w-36 text-right font-semibold text-stone-700">Payload</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(data.items || (data as any).logs || []).map((item, index) => (
                    <TableRow key={item.id}>
                      <TableCell className="w-14 text-center text-xs font-semibold text-stone-500">
                        {(page - 1) * (data.pageSize || 20) + index + 1}
                      </TableCell>
                      <TableCell className="w-44 text-xs text-stone-500 whitespace-nowrap font-mono">
                        {new Date(item.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="min-w-[180px] font-semibold text-xs text-stone-900 break-words">
                        {item.user?.email || "SYSTEM"}
                      </TableCell>
                      <TableCell className="min-w-[200px]">
                        <Badge variant="brand" size="sm" className="font-mono text-[11px]">
                          {item.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="min-w-[160px] text-xs text-stone-700">
                        <span className="font-semibold">{item.entityType}</span>
                        <span className="font-mono text-[11px] text-stone-400 block truncate max-w-[140px]">
                          {item.entityId}
                        </span>
                      </TableCell>
                      <TableCell className="w-32 text-xs font-mono text-stone-500">
                        {item.ipAddress || "—"}
                      </TableCell>
                      <TableCell className="w-36 text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setInspectingItem(item)}
                          className="bg-[#FDF2F4] text-[#5B0612] hover:bg-[#F9E2E6] text-xs font-semibold whitespace-nowrap min-h-[36px]"
                        >
                          Inspect Payload
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {data.totalPages > 1 && (
                <div className="p-4 border-t border-stone-200 flex justify-center bg-[#FAF7F2]/30">
                  <Pagination
                    currentPage={page}
                    totalPages={data.totalPages}
                    onPageChange={(p) => fetchAuditLogs(p)}
                  />
                </div>
              )}
            </TableWrapper>
          </div>

          {/* Mobile Responsive Cards (< 768px) */}
          <div className="block md:hidden space-y-3">
            {(data.items || (data as any).logs || []).map((item, index) => (
              <TableMobileCard
                key={item.id}
                title={
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-stone-100 text-stone-700 text-xs font-bold shrink-0">
                      {(page - 1) * (data.pageSize || 20) + index + 1}
                    </span>
                    <Badge variant="brand" size="sm" className="font-mono text-[11px]">
                      {item.action}
                    </Badge>
                  </div>
                }
                subtitle={
                  <div className="text-xs text-stone-600 mt-1">
                    Actor: <span className="font-semibold text-stone-900">{item.user?.email || "SYSTEM"}</span>
                  </div>
                }
                fields={[
                  { label: "Entity", value: `${item.entityType} (${item.entityId.slice(0, 8)}...)` },
                  { label: "Time", value: new Date(item.createdAt).toLocaleString() },
                  { label: "IP", value: item.ipAddress || "—" },
                ]}
                actions={
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => setInspectingItem(item)}
                    className="w-full bg-[#FDF2F4] text-[#5B0612] hover:bg-[#F9E2E6] font-semibold min-h-[44px]"
                  >
                    Inspect Payload
                  </Button>
                }
              />
            ))}

            {data.totalPages > 1 && (
              <div className="py-4 flex justify-center">
                <Pagination
                  currentPage={page}
                  totalPages={data.totalPages}
                  onPageChange={(p) => fetchAuditLogs(p)}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Inspect Modal */}
      {inspectingItem && (
        <Modal
          isOpen={true}
          onClose={() => setInspectingItem(null)}
          title={`Audit Payload: ${inspectingItem.action}`}
        >
          <div className="space-y-4 pt-2">
            <div className="text-xs space-y-1 bg-[#FAF7F2] p-3 rounded-xl border border-[#EADBDA]">
              <p><span className="font-bold text-stone-900">Actor:</span> {inspectingItem.user?.email || "SYSTEM"}</p>
              <p><span className="font-bold text-stone-900">Entity:</span> {inspectingItem.entityType} ({inspectingItem.entityId})</p>
              <p><span className="font-bold text-stone-900">Timestamp:</span> {new Date(inspectingItem.createdAt).toLocaleString()}</p>
              {inspectingItem.ipAddress && <p><span className="font-bold text-stone-900">IP Address:</span> {inspectingItem.ipAddress}</p>}
            </div>

            {inspectingItem.oldValues ? (
              <div>
                <span className="text-xs font-bold text-stone-700 block mb-1">Previous Values (Before Action)</span>
                <pre className="p-3 bg-stone-900 text-stone-100 rounded-xl text-xs overflow-x-auto font-mono">
                  {JSON.stringify(inspectingItem.oldValues, null, 2)}
                </pre>
              </div>
            ) : null}

            {inspectingItem.newValues ? (
              <div>
                <span className="text-xs font-bold text-stone-700 block mb-1">New Values (After Action)</span>
                <pre className="p-3 bg-stone-900 text-stone-100 rounded-xl text-xs overflow-x-auto font-mono">
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

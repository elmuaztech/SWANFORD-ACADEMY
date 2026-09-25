"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Button,
  Badge,
  Card,
  Input,
  Select,
  Alert,
  Modal,
  Table,
  TableBody,
  TableRow,
  TableHead,
  TableHeaderCell,
  TableCell,
  Pagination,
  EmptyState,
  LoadingState,
  PageHeader,
} from "@/components";

interface NotificationItem {
  id: string;
  idempotencyKey: string;
  recipientEmail: string;
  recipientPhone: string | null;
  channel: string;
  category: string;
  status: string;
  templateName: string;
  subject: string;
  bodyText: string;
  retryCount: number;
  maxRetries: number;
  nextRetryAt: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  lastError: string | null;
  createdAt: string;
}

export default function AdminNotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");

  // Modals & Actions
  const [selectedNotification, setSelectedNotification] = useState<NotificationItem | null>(null);
  const [retryTarget, setRetryTarget] = useState<NotificationItem | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);



  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "15",
      });
      if (statusFilter) params.set("status", statusFilter);
      if (categoryFilter) params.set("category", categoryFilter);
      if (searchQuery.trim()) params.set("search", searchQuery.trim());

      const res = await fetch(`/api/admin/notifications?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load notifications");
      }
      const data = await res.json();
      setNotifications(data.data || []);
      setTotalPages(data.pagination?.totalPages || 1);
      setTotalCount(data.pagination?.total || 0);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load notifications.");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, categoryFilter, searchQuery]);

  useEffect(() => {
    let isCancelled = false;

    async function load() {
      try {
        const params = new URLSearchParams({
          page: page.toString(),
          limit: "15",
        });
        if (statusFilter) params.set("status", statusFilter);
        if (categoryFilter) params.set("category", categoryFilter);
        if (searchQuery.trim()) params.set("search", searchQuery.trim());

        const res = await fetch(`/api/admin/notifications?${params.toString()}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to load notifications");
        }
        const data = await res.json();
        if (!isCancelled) {
          setNotifications(data.data || []);
          setTotalPages(data.pagination?.totalPages || 1);
          setTotalCount(data.pagination?.total || 0);
          setError(null);
        }
      } catch (err: unknown) {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : "Failed to load notifications.");
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      isCancelled = true;
    };
  }, [page, statusFilter, categoryFilter, searchQuery]);

  const handleRetryConfirm = async () => {
    if (!retryTarget) return;
    setIsRetrying(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(`/api/admin/notifications/${retryTarget.id}/retry`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to retry notification");
      }

      setSuccessMessage("Notification has been reset and queued for immediate delivery.");
      setRetryTarget(null);
      await fetchNotifications();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to retry notification");
    } finally {
      setIsRetrying(false);
    }
  };


  const getStatusBadge = (status: string) => {
    switch (status) {
      case "SENT":
      case "DELIVERED":
        return <Badge variant="success">{status}</Badge>;
      case "PENDING":
        return <Badge variant="info">{status}</Badge>;
      case "PROCESSING":
        return <Badge variant="warning">{status}</Badge>;
      case "RETRYABLE":
        return <Badge variant="warning">{status}</Badge>;
      case "FAILED":
      case "FAILED_PERMANENT":
        return <Badge variant="danger">{status}</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const getCategoryBadge = (cat: string) => {
    switch (cat) {
      case "SECURITY":
        return <Badge variant="danger">{cat}</Badge>;
      case "FINANCE":
        return <Badge variant="brand">{cat}</Badge>;
      case "ADMISSION_DECISION":
        return <Badge variant="success">{cat}</Badge>;
      default:
        return <Badge variant="neutral">{cat}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Email History & Notifications"
        subtitle="Review sent school emails, delivery status, and retry failed messages."
        breadcrumbs={[
          { label: "Dashboard", href: "/admin" },
          { label: "Notifications" },
        ]}
        secondaryAction={
          <Button
            variant="outline"
            onClick={() => fetchNotifications()}
            disabled={loading}
          >
            Refresh
          </Button>
        }
      />

        {successMessage && (
          <Alert variant="success" onClose={() => setSuccessMessage(null)}>
            {successMessage}
          </Alert>
        )}

        {error && (
          <Alert variant="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}


        {/* Filter Controls */}
        <Card className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Search
              </label>
              <Input
                type="text"
                placeholder="Recipient email, subject, or key..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Delivery Status
              </label>
              <Select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All Statuses</option>
                <option value="PENDING">PENDING</option>
                <option value="PROCESSING">PROCESSING</option>
                <option value="SENT">SENT</option>
                <option value="DELIVERED">DELIVERED</option>
                <option value="RETRYABLE">RETRYABLE</option>
                <option value="FAILED">FAILED</option>
                <option value="FAILED_PERMANENT">FAILED_PERMANENT</option>
              </Select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Notification Category
              </label>
              <Select
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All Categories</option>
                <option value="SECURITY">SECURITY (Mandatory)</option>
                <option value="FINANCE">FINANCE (Mandatory)</option>
                <option value="ADMISSION_DECISION">ADMISSION_DECISION (Mandatory)</option>
                <option value="ADMISSION_GENERAL">ADMISSION_GENERAL (Optional)</option>
                <option value="ACADEMIC">ACADEMIC (Optional)</option>
                <option value="GENERAL">GENERAL (Optional)</option>
              </Select>
            </div>

            <div className="flex items-end">
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setStatusFilter("");
                  setCategoryFilter("");
                  setSearchQuery("");
                  setPage(1);
                }}
              >
                Clear Filters
              </Button>
            </div>
          </div>
        </Card>

        {/* Content Section */}
        {loading ? (
          <Card className="p-8">
            <LoadingState description="Loading notification queue..." />
          </Card>
        ) : notifications.length === 0 ? (
          <Card className="p-8">
            <EmptyState
              title="No notifications found"
              description="No outbox records matched your active filter criteria."
            />
          </Card>
        ) : (
          <Card className="overflow-hidden">
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Category</TableHeaderCell>
                    <TableHeaderCell>Recipient</TableHeaderCell>
                    <TableHeaderCell>Subject</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    <TableHeaderCell>Retries</TableHeaderCell>
                    <TableHeaderCell>Created</TableHeaderCell>
                    <TableHeaderCell className="text-right">Actions</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {notifications.map((item) => {
                    const isRetryable =
                      item.status === "FAILED" ||
                      item.status === "RETRYABLE" ||
                      item.status === "FAILED_PERMANENT";

                    return (
                      <TableRow key={item.id}>
                        <TableCell>{getCategoryBadge(item.category)}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {item.recipientEmail}
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-sm text-slate-800">
                          {item.subject}
                        </TableCell>
                        <TableCell>{getStatusBadge(item.status)}</TableCell>
                        <TableCell className="text-xs text-slate-600">
                          {item.retryCount} / {item.maxRetries}
                        </TableCell>
                        <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                          {new Date(item.createdAt).toLocaleString("en-GB", {
                            timeZone: "Africa/Lagos",
                            hour: "2-digit",
                            minute: "2-digit",
                            day: "2-digit",
                            month: "short",
                          })}
                        </TableCell>
                        <TableCell className="text-right space-x-2 whitespace-nowrap">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSelectedNotification(item)}
                          >
                            Details
                          </Button>
                          {isRetryable && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setRetryTarget(item)}
                            >
                              Retry
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Card View (<= 768px) */}
            <div className="block md:hidden divide-y divide-slate-200">
              {notifications.map((item) => {
                const isRetryable =
                  item.status === "FAILED" ||
                  item.status === "RETRYABLE" ||
                  item.status === "FAILED_PERMANENT";

                return (
                  <div key={item.id} className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      {getCategoryBadge(item.category)}
                      {getStatusBadge(item.status)}
                    </div>
                    <div className="text-sm font-semibold text-slate-900">
                      {item.subject}
                    </div>
                    <div className="text-xs text-slate-600 font-mono break-all">
                      {item.recipientEmail}
                    </div>
                    <div className="flex justify-between items-center text-xs text-slate-500">
                      <span>Retries: {item.retryCount}/{item.maxRetries}</span>
                      <span>
                        {new Date(item.createdAt).toLocaleDateString("en-GB", {
                          timeZone: "Africa/Lagos",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                    <div className="flex justify-end space-x-2 pt-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedNotification(item)}
                      >
                        Details
                      </Button>
                      {isRetryable && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setRetryTarget(item)}
                        >
                          Retry
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="p-4 border-t border-slate-200 flex items-center justify-between">
                <span className="text-xs text-slate-600">
                  Showing page {page} of {totalPages} ({totalCount} total)
                </span>
                <Pagination
                  currentPage={page}
                  totalPages={totalPages}
                  onPageChange={(p) => setPage(p)}
                />
              </div>
            )}
          </Card>
        )}

        {/* Notification Details Modal */}
        {selectedNotification && (
          <Modal
            isOpen={true}
            onClose={() => setSelectedNotification(null)}
            title="Notification Outbox Record"
          >
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-500 block">Category:</span>
                  <span className="font-semibold">{selectedNotification.category}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Status:</span>
                  <span>{getStatusBadge(selectedNotification.status)}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Recipient:</span>
                  <span className="font-mono">{selectedNotification.recipientEmail}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Template:</span>
                  <span>{selectedNotification.templateName}</span>
                </div>
              </div>

              <div>
                <span className="text-slate-500 text-xs block mb-1">Idempotency Key:</span>
                <code className="block p-2 bg-slate-100 rounded text-xs font-mono break-all text-slate-800">
                  {selectedNotification.idempotencyKey}
                </code>
              </div>

              {selectedNotification.lastError && (
                <div>
                  <span className="text-red-600 text-xs block mb-1 font-semibold">
                    Last Delivery Error:
                  </span>
                  <pre className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-800 whitespace-pre-wrap font-mono">
                    {selectedNotification.lastError}
                  </pre>
                </div>
              )}

              <div>
                <span className="text-slate-500 text-xs block mb-1">Message Content:</span>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded text-xs text-slate-700 whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {selectedNotification.bodyText}
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button variant="outline" onClick={() => setSelectedNotification(null)}>
                  Close
                </Button>
              </div>
            </div>
          </Modal>
        )}

        {/* Retry Confirmation Modal */}
        {retryTarget && (
          <Modal
            isOpen={true}
            onClose={() => setRetryTarget(null)}
            title="Confirm Manual Notification Retry"
          >
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Are you sure you want to reset this notification for delivery to{" "}
                <span className="font-semibold font-mono text-slate-800">{retryTarget.recipientEmail}</span>?
              </p>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded text-xs space-y-1">
                <div><span className="text-slate-500">Subject:</span> {retryTarget.subject}</div>
                <div><span className="text-slate-500">Current Status:</span> {retryTarget.status}</div>
                <div><span className="text-slate-500">Previous Retries:</span> {retryTarget.retryCount}</div>
              </div>
              <p className="text-xs text-slate-500">
                This action resets retry count, clears previous delivery errors, increments the lease version, and logs an immutable audit event.
              </p>

              <div className="flex justify-end space-x-3 pt-2">
                <Button variant="ghost" onClick={() => setRetryTarget(null)} disabled={isRetrying}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={handleRetryConfirm} disabled={isRetrying}>
                  {isRetrying ? "Queuing..." : "Confirm & Retry"}
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    );
  }

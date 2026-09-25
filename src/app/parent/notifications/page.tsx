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
  EmptyState,
  ErrorState,
  PageHeader,
} from "@/components";

interface NotificationItem {
  id: string;
  subject: string;
  bodyText: string;
  htmlBody: string | null;
  category: string;
  status: string;
  sentAt: string | null;
  createdAt: string;
}

export default function ParentNotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNotifications = () => {
    setLoading(true);
    setError(null);
    fetch("/api/parent/notifications")
      .then((res) => {
        if (!res.ok) throw new Error("Could not retrieve notifications.");
        return res.json();
      })
      .then((data) => {
        setNotifications(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load notifications.");
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  if (loading) {
    return (
      <div className="py-12">
        <LoadingState message="Loading your school notices and reminders..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8">
        <ErrorState
          title="Notices Unavailable"
          message={error}
          actionLabel="Retry"
          onAction={fetchNotifications}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="School Notices & Reminders"
        description="Official school announcements, fee reminders, and important updates from Swanford Academy."
        breadcrumbs={[
          { label: "Dashboard", href: "/parent" },
          { label: "Notifications" },
        ]}
        actions={
          <Button variant="outline" size="sm" onClick={fetchNotifications}>
            Refresh
          </Button>
        }
      />

      {notifications.length === 0 ? (
        <EmptyState
          title="No records yet."
          description="You do not have any new notices or payment reminders at this time. All official messages sent to you will appear here."
          actionLabel="Refresh"
          onAction={fetchNotifications}
        />
      ) : (
        <div className="space-y-4">
          {notifications.map((item) => (
            <Card
              key={item.id}
              className="border border-[#EADBDA]/80 bg-white shadow-xs hover:border-[#800020]/40 transition-colors"
            >
              <CardHeader className="pb-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={item.category === "FINANCE" ? "warning" : "brand"} size="sm">
                      {item.category === "FINANCE" ? "Payment Notice" : "Announcement"}
                    </Badge>
                    <span className="text-xs text-stone-500">
                      {new Date(item.sentAt || item.createdAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <CardTitle className="text-base sm:text-lg font-bold text-stone-900">
                    {item.subject}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="bg-[#FAF8F5] p-3 sm:p-4 rounded-xl border border-stone-200/70 text-sm text-stone-800 leading-relaxed whitespace-pre-line font-sans">
                  {item.bodyText}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

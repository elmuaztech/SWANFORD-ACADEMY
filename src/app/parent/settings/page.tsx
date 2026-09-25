"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { ImageUpload } from "@/components/ui/image-upload";

interface GuardianProfile {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  relationshipType: string;
  childrenCount: number;
  profilePhotoId?: string | null;
}

export default function ParentSettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<GuardianProfile | null>(null);
  const [preferences, setPreferences] = useState({
    security: true,
    finance: true,
    academic: true,
    general: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const res = await fetch("/api/parent/me");
        if (res.status === 401) {
          router.push("/auth/login?from=/parent/settings");
          return;
        }
        if (!res.ok) {
          throw new Error("Failed to load profile");
        }
        const data = await res.json();
        setProfile(data.guardian);
      } catch (err: unknown) {
        setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to load settings" });
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [router]);

  const handleToggle = (category: keyof typeof preferences) => {
    if (category === "security") {
      // Security alerts are mandatory and cannot be disabled
      return;
    }
    setPreferences((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  const handleSavePreferences = async () => {
    try {
      setSaving(true);
      setMessage(null);

      const res = await fetch("/api/parent/settings/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update preferences");
      }

      setMessage({ type: "success", text: "Notification preferences updated successfully." });
    } catch (err: unknown) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Unable to save preferences" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-stone-200 animate-pulse rounded" />
        <div className="h-48 bg-stone-200 animate-pulse rounded-lg" />
        <div className="h-64 bg-stone-200 animate-pulse rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-[#5B0612] tracking-tight">Account & Preferences</h1>
        <p className="text-sm text-stone-600 mt-1">
          Manage your verified guardian profile and customize school notification channels
        </p>
      </div>

      {message && (
        <Alert variant={message.type === "success" ? "success" : "error"} title={message.type === "success" ? "Preferences Saved" : "Action Required"}>
          {message.text}
        </Alert>
      )}

      {/* Profile Overview */}
      <Card className="bg-white border-stone-200 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg text-stone-900">Guardian Profile</CardTitle>
          </div>
          <CardDescription>
            Official records verified by Swanford Academy administration
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3 bg-stone-50 rounded border border-stone-200">
              <span className="text-xs text-stone-500 font-semibold uppercase tracking-wider block">Full Name</span>
              <span className="text-sm font-bold text-stone-900 mt-0.5 block">{profile?.fullName || "—"}</span>
            </div>
            <div className="p-3 bg-stone-50 rounded border border-stone-200">
              <span className="text-xs text-stone-500 font-semibold uppercase tracking-wider block">Email Address</span>
              <span className="text-sm font-medium text-stone-900 mt-0.5 block font-mono">{profile?.email || "—"}</span>
            </div>
            <div className="p-3 bg-stone-50 rounded border border-stone-200">
              <span className="text-xs text-stone-500 font-semibold uppercase tracking-wider block">Phone Number</span>
              <span className="text-sm font-medium text-stone-900 mt-0.5 block font-mono">{profile?.phone || "—"}</span>
            </div>
            <div className="p-3 bg-stone-50 rounded border border-stone-200">
              <span className="text-xs text-stone-500 font-semibold uppercase tracking-wider block">Active Linked Children</span>
              <span className="text-sm font-bold text-stone-900 mt-0.5 block">{profile?.childrenCount ?? 0} Student(s)</span>
            </div>
          </div>
          <div className="pt-2 pb-2 border-b border-stone-200">
            <ImageUpload
              label="Profile Photo"
              helperText="Upload your guardian profile photo. JPEG, PNG, or WebP. Max 5 MB (automatically optimized)."
              currentImageUrl={profile?.profilePhotoId ? `/api/media/${profile.profilePhotoId}` : null}
              uploadEndpoint="/api/parent/me/photo"
              onUploadSuccess={(result) => {
                setProfile((prev) => prev ? { ...prev, profilePhotoId: result.assetId } : null);
                setMessage({ type: "success", text: "Profile photo updated successfully." });
              }}
            />
          </div>

          <p className="text-xs text-stone-500 italic">
            To update your primary contact details or emergency information, please submit an official request to the school administrative desk.
          </p>
        </CardContent>
      </Card>

      {/* Notification Preferences */}
      <Card className="bg-white border-stone-200 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg text-stone-900">Communication & Notifications</CardTitle>
          </div>
          <CardDescription>
            Configure communication alerts dispatched via email and portal notifications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="divide-y divide-stone-100 border border-stone-100 rounded-lg overflow-hidden">
            {/* Security Alerts */}
            <div className="p-4 flex items-center justify-between bg-stone-50/50">
              <div className="space-y-0.5 pr-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-stone-900">Security & Account Alerts</span>
                  <Badge variant="neutral" className="bg-stone-200 text-stone-700 text-[10px] uppercase tracking-wider">Mandatory</Badge>
                </div>
                <p className="text-xs text-stone-500">
                  Password resets, login notifications, and critical safety alerts cannot be disabled.
                </p>
              </div>
              <input
                type="checkbox"
                checked={preferences.security}
                disabled
                className="w-5 h-5 rounded border-stone-300 text-[#800020] opacity-60 cursor-not-allowed"
              />
            </div>

            {/* Academic Results & Reports */}
            <div className="p-4 flex items-center justify-between hover:bg-stone-50 transition-colors">
              <div className="space-y-0.5 pr-4">
                <span className="text-sm font-semibold text-stone-900 block">Academic & Published Results</span>
                <p className="text-xs text-stone-500">
                  Receive notifications immediately when term report cards and finalized scores are published.
                </p>
              </div>
              <input
                type="checkbox"
                checked={preferences.academic}
                onChange={() => handleToggle("academic")}
                className="w-5 h-5 rounded border-stone-300 text-[#800020] focus:ring-[#800020] cursor-pointer"
              />
            </div>

            {/* Finance & Invoices */}
            <div className="p-4 flex items-center justify-between hover:bg-stone-50 transition-colors">
              <div className="space-y-0.5 pr-4">
                <span className="text-sm font-semibold text-stone-900 block">Finance, Fees & Payment Receipts</span>
                <p className="text-xs text-stone-500">
                  Receive electronic notifications for fee invoices, payment receipts, and due date reminders.
                </p>
              </div>
              <input
                type="checkbox"
                checked={preferences.finance}
                onChange={() => handleToggle("finance")}
                className="w-5 h-5 rounded border-stone-300 text-[#800020] focus:ring-[#800020] cursor-pointer"
              />
            </div>

            {/* General Announcements */}
            <div className="p-4 flex items-center justify-between hover:bg-stone-50 transition-colors">
              <div className="space-y-0.5 pr-4">
                <span className="text-sm font-semibold text-stone-900 block">School Announcements & Newsletters</span>
                <p className="text-xs text-stone-500">
                  General school updates, holiday schedules, and event invitations.
                </p>
              </div>
              <input
                type="checkbox"
                checked={preferences.general}
                onChange={() => handleToggle("general")}
                className="w-5 h-5 rounded border-stone-300 text-[#800020] focus:ring-[#800020] cursor-pointer"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <Button
              onClick={handleSavePreferences}
              disabled={saving}
              className="bg-[#800020] hover:bg-[#600018] text-white min-h-[44px] min-w-[44px] touch-manipulation flex items-center gap-1.5"
            >
              {saving ? "Saving Preferences..." : "Save Preferences"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

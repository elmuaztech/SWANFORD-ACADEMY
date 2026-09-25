"use client";

import React, { useState, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Alert,
  PageHeader,
  Button,
  Input,
  FormGroup,
  LoadingState,
  ErrorState,
} from "@/components";
import { ImageUpload } from "@/components/ui/image-upload";
import { SchoolProfile } from "@/lib/academic/school_profile";

export default function AdminSettingsPage() {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoMessage, setPhotoMessage] = useState<string | null>(null);

  // Settings State
  const [profile, setProfile] = useState<SchoolProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    // 1. Fetch photo
    fetch("/api/admin/me/photo")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.url) setPhotoUrl(data.url);
      })
      .catch(() => {});

    // 2. Fetch authoritative school settings
    fetch("/api/admin/settings")
      .then(async (res) => {
        if (res.status === 403) throw new Error("ACCESS_RESTRICTED");
        if (!res.ok) throw new Error("Failed to load school settings.");
        return res.json();
      })
      .then((data) => {
        if (data.profile) setProfile(data.profile);
      })
      .catch((err) => {
        setSaveError(err instanceof Error ? err.message : "Error retrieving settings.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const handlePhotoUploadSuccess = (result: { assetId: string; url: string }) => {
    setPhotoUrl(result.url);
    setPhotoMessage("Profile photo uploaded and processed successfully.");
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    setSaving(true);
    setSaveSuccess(null);
    setSaveError(null);

    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to persist school settings.");
      }

      setProfile(data.profile);
      setSaveSuccess("Institution operational parameters saved and persisted to database.");
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Failed to update school settings.");
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof SchoolProfile, value: string) => {
    if (!profile) return;
    setProfile({
      ...profile,
      [field]: value,
    });
  };

  if (loading) {
    return (
      <div className="py-12">
        <LoadingState message="Loading institutional configuration parameters..." />
      </div>
    );
  }

  if (!profile) {
    const isRestricted =
      saveError === "ACCESS_RESTRICTED" ||
      saveError?.toLowerCase().includes("restricted") ||
      saveError?.toLowerCase().includes("permission");
    return (
      <div className="py-12 max-w-xl mx-auto">
        <ErrorState
          title={isRestricted ? "Access Restricted" : "Settings Unavailable"}
          message={
            isRestricted
              ? "Institutional profile and system configurations are restricted exclusively to Super Administrators."
              : saveError || "Unable to load school settings."
          }
          actionLabel={isRestricted ? "Return to Operations Dashboard" : "Retry"}
          onAction={() => {
            window.location.href = "/admin";
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <PageHeader
        title="School Settings & Operational Profile"
        description="Configure institution identity, campus addresses, official contact numbers, and bank settlement details."
        breadcrumbs={[
          { label: "Dashboard", href: "/admin" },
          { label: "Settings" },
        ]}
      />

      {saveSuccess && (
        <Alert variant="success" onClose={() => setSaveSuccess(null)}>
          {saveSuccess}
        </Alert>
      )}

      {saveError && (
        <Alert variant="error" onClose={() => setSaveError(null)}>
          {saveError}
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Admin Profile Photo & Quick Identity */}
        <div className="space-y-6 lg:col-span-1">
          {/* Administrator Photo Card */}
          <Card className="border border-[#EADBDA]/80">
            <CardHeader className="pb-3 border-b border-[#EADBDA]/60 bg-[#FAF7F2]/50">
              <CardTitle className="text-base font-bold text-stone-900">Administrator Photo</CardTitle>
              <p className="text-xs text-stone-500">
                Official identification photo processed via Swanford Media Engine.
              </p>
            </CardHeader>
            <CardContent className="space-y-4 p-5">
              <ImageUpload
                currentImageUrl={photoUrl}
                uploadEndpoint="/api/admin/me/photo"
                onUploadSuccess={handlePhotoUploadSuccess}
              />
              {photoMessage && (
                <Alert variant="success" onClose={() => setPhotoMessage(null)}>
                  {photoMessage}
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Quick Info Summary */}
          {profile && (
            <Card className="border border-[#EADBDA]/80 bg-[#FAF7F2]/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold text-[#5B0612]">Active Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs text-stone-600">
                <p><strong className="text-stone-900">Institution:</strong> {profile.name}</p>
                <p><strong className="text-stone-900">Motto:</strong> &ldquo;{profile.motto}&rdquo;</p>
                <p><strong className="text-stone-900">Primary Phone:</strong> {profile.phonePrimary}</p>
                <p><strong className="text-stone-900">Email:</strong> {profile.email}</p>
                <p><strong className="text-stone-900">Timezone:</strong> {profile.timezone}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column: Editable School Profile Form */}
        <div className="lg:col-span-2">
          {profile && (
            <form onSubmit={handleSaveSettings} className="space-y-6">
              {/* Institution Identity Card */}
              <Card className="border border-[#EADBDA]/80 shadow-xs">
                <CardHeader className="pb-3 border-b border-[#EADBDA]/60 bg-[#FAF7F2]/50">
                  <CardTitle className="text-base font-bold text-stone-900">Institution Identity</CardTitle>
                  <p className="text-xs text-stone-500">Official names and branding printed on reports, receipts, and transcripts.</p>
                </CardHeader>
                <CardContent className="p-5 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormGroup label="Institution Name" required>
                      <Input
                        value={profile.name}
                        onChange={(e) => updateField("name", e.target.value)}
                        placeholder="Swanford Academy"
                        required
                      />
                    </FormGroup>
                    <FormGroup label="Subtitle / Tagline">
                      <Input
                        value={profile.subtitle || ""}
                        onChange={(e) => updateField("subtitle", e.target.value)}
                        placeholder="Nursery, Primary & Tahfeez School"
                      />
                    </FormGroup>
                  </div>

                  <FormGroup label="School Motto" required>
                    <Input
                      value={profile.motto}
                      onChange={(e) => updateField("motto", e.target.value)}
                      placeholder="Illuminating the Path to Success"
                      required
                    />
                  </FormGroup>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormGroup label="Proprietor / Management Leadership">
                      <Input
                        value={profile.proprietor || ""}
                        onChange={(e) => updateField("proprietor", e.target.value)}
                        placeholder="Muhammad Kanti, Proprietor"
                      />
                    </FormGroup>
                    <FormGroup label="Official Website">
                      <Input
                        type="url"
                        value={profile.website || ""}
                        onChange={(e) => updateField("website", e.target.value)}
                        placeholder="https://swanfordacademy.edu.ng"
                      />
                    </FormGroup>
                  </div>
                </CardContent>
              </Card>

              {/* Vision, Mission & Core Values Card */}
              <Card className="border border-[#EADBDA]/80 shadow-xs">
                <CardHeader className="pb-3 border-b border-[#EADBDA]/60 bg-[#FAF7F2]/50">
                  <CardTitle className="text-base font-bold text-stone-900">Institutional Philosophy</CardTitle>
                  <p className="text-xs text-stone-500">Official Vision, Mission, and Core Values reflecting Swanford Academy excellence.</p>
                </CardHeader>
                <CardContent className="p-5 space-y-4">
                  <FormGroup label="Vision Statement">
                    <textarea
                      className="w-full rounded-md border border-stone-300 p-2.5 text-sm text-stone-900 focus:border-[#5B0612] focus:ring-1 focus:ring-[#5B0612] transition-colors"
                      rows={3}
                      value={profile.vision || ""}
                      onChange={(e) => updateField("vision", e.target.value)}
                      placeholder="To become a leading institution recognised for excellence in education..."
                    />
                  </FormGroup>

                  <FormGroup label="Mission Statement">
                    <textarea
                      className="w-full rounded-md border border-stone-300 p-2.5 text-sm text-stone-900 focus:border-[#5B0612] focus:ring-1 focus:ring-[#5B0612] transition-colors"
                      rows={3}
                      value={profile.mission || ""}
                      onChange={(e) => updateField("mission", e.target.value)}
                      placeholder="To develop highly educated, disciplined, well-mannered and responsible individuals..."
                    />
                  </FormGroup>

                  <FormGroup label="Core Values">
                    <Input
                      value={profile.coreValues || ""}
                      onChange={(e) => updateField("coreValues", e.target.value)}
                      placeholder="Excellence • Integrity • Discipline • Respect • Responsibility • Good Character • Wisdom • Leadership"
                    />
                  </FormGroup>
                </CardContent>
              </Card>

              {/* Location & Official Contact Information */}
              <Card className="border border-[#EADBDA]/80 shadow-xs">
                <CardHeader className="pb-3 border-b border-[#EADBDA]/60 bg-[#FAF7F2]/50">
                  <CardTitle className="text-base font-bold text-stone-900">Contact &amp; Location Parameters</CardTitle>
                  <p className="text-xs text-stone-500">Public contact lines and official address across portal &amp; invoices.</p>
                </CardHeader>
                <CardContent className="p-5 space-y-4">
                  <FormGroup label="Campus Physical Address" required>
                    <Input
                      value={profile.address}
                      onChange={(e) => updateField("address", e.target.value)}
                      placeholder="PLOT 212, DR NUHU MUHAMMADU SANUSI WAY, DUTSE, JIGAWA STATE"
                      required
                    />
                  </FormGroup>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormGroup label="State">
                      <Input
                        value={profile.state || "Jigawa State"}
                        onChange={(e) => updateField("state", e.target.value)}
                        placeholder="Jigawa State"
                      />
                    </FormGroup>
                    <FormGroup label="Country">
                      <Input
                        value={profile.country || "Nigeria"}
                        onChange={(e) => updateField("country", e.target.value)}
                        placeholder="Nigeria"
                      />
                    </FormGroup>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <FormGroup label="Primary Phone" required>
                      <Input
                        value={profile.phonePrimary}
                        onChange={(e) => updateField("phonePrimary", e.target.value)}
                        placeholder="+234 803 695 0352"
                        required
                      />
                    </FormGroup>
                    <FormGroup label="Secondary Phone">
                      <Input
                        value={profile.phoneSecondary || ""}
                        onChange={(e) => updateField("phoneSecondary", e.target.value)}
                        placeholder="Optional backup line"
                      />
                    </FormGroup>
                    <FormGroup label="Official Email Address" required>
                      <Input
                        type="email"
                        value={profile.email}
                        onChange={(e) => updateField("email", e.target.value)}
                        placeholder="info@swanfordacademy.edu.ng"
                        required
                      />
                    </FormGroup>
                  </div>
                </CardContent>
              </Card>

              {/* Settlement Bank Details */}
              <Card className="border border-[#EADBDA]/80 shadow-xs">
                <CardHeader className="pb-3 border-b border-[#EADBDA]/60 bg-[#FAF7F2]/50">
                  <CardTitle className="text-base font-bold text-stone-900">Official Settlement Bank Account</CardTitle>
                  <p className="text-xs text-stone-500">Official institutional bank account displayed on student fee invoices.</p>
                </CardHeader>
                <CardContent className="p-5 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <FormGroup label="Bank Name">
                      <Input
                        value={profile.bankName || "Stanbic IBTC Bank"}
                        onChange={(e) => updateField("bankName", e.target.value)}
                        placeholder="Stanbic IBTC Bank"
                      />
                    </FormGroup>
                    <FormGroup label="Account Name">
                      <Input
                        value={profile.bankAccountName || "Swanford Academy Ltd"}
                        onChange={(e) => updateField("bankAccountName", e.target.value)}
                        placeholder="Swanford Academy Ltd"
                      />
                    </FormGroup>
                    <FormGroup label="Account Number">
                      <Input
                        value={profile.bankAccountNumber || "0034567890"}
                        onChange={(e) => updateField("bankAccountNumber", e.target.value)}
                        placeholder="0034567890"
                      />
                    </FormGroup>
                  </div>
                </CardContent>
              </Card>

              {/* Submit Action Bar */}
              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  disabled={saving}
                  className="w-full sm:w-auto font-bold px-8"
                >
                  {saving ? "Saving Changes..." : "Save School Settings"}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

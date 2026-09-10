"use client";

import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ImageUpload } from "@/components/ui/image-upload";
import { LAGOS_TIMEZONE } from "@/lib/config/timezone";

export default function SuperAdminSettingsPage() {
  const [photoMessage, setPhotoMessage] = useState<string | null>(null);

  const handlePhotoSuccess = () => {
    setPhotoMessage("Super Admin identification photo updated successfully.");
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight">
          Super Admin Credentials &amp; Profile
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Root security configuration, personal passport photo identification, and governance standards.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Photo Upload Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-bold text-stone-900">Governance Identification Photo</CardTitle>
            <p className="text-xs text-stone-500">
              Official passport photo for high-privilege audit records and session verification.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <ImageUpload
              uploadEndpoint="/api/admin/me/photo"
              onUploadSuccess={handlePhotoSuccess}
            />
            {photoMessage && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold rounded-lg">
                {photoMessage}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Security Parameters */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-bold text-stone-900">Security &amp; Compliance Standards</CardTitle>
            <p className="text-xs text-stone-500">Active cryptographic &amp; authorization guards</p>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="py-1.5 border-b border-stone-100 flex justify-between items-center">
              <span className="text-stone-500">Authorization Model</span>
              <Badge variant="brand" size="sm">
                ROLE != PERMISSION != SCOPE
              </Badge>
            </div>
            <div className="py-1.5 border-b border-stone-100 flex justify-between items-center">
              <span className="text-stone-500">Password Hashing</span>
              <span className="font-mono font-semibold text-stone-900">Argon2id</span>
            </div>
            <div className="py-1.5 border-b border-stone-100 flex justify-between items-center">
              <span className="text-stone-500">Audit Trail Retention</span>
              <span className="font-semibold text-emerald-800">Permanent (Immutable)</span>
            </div>
            <div className="py-1.5 flex justify-between items-center">
              <span className="text-stone-500">Canonical Timezone</span>
              <Badge variant="neutral" size="sm">
                {LAGOS_TIMEZONE}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

"use client";

import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ImageUpload } from "@/components/ui/image-upload";
import { SCHOOL_PROFILE } from "@/lib/constants";
import { LAGOS_TIMEZONE } from "@/lib/config/timezone";

export default function AdminSettingsPage() {
  const [photoMessage, setPhotoMessage] = useState<string | null>(null);

  const handlePhotoUploadSuccess = () => {
    setPhotoMessage("Profile photo uploaded and processed successfully.");
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight">
          Admin Settings & Profile
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Administrator account credentials, photo identification, and institution configuration.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Profile & Photo Upload */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-bold text-stone-900">Administrator Photo</CardTitle>
            <p className="text-xs text-stone-500">
              Upload an official passport photo (automatically compressed & sanitized via Swanford Media Engine).
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <ImageUpload
              uploadEndpoint="/api/admin/me/photo"
              onUploadSuccess={handlePhotoUploadSuccess}
            />
            {photoMessage && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold rounded-lg">
                {photoMessage}
              </div>
            )}
          </CardContent>
        </Card>

        {/* School Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-bold text-stone-900">Institution Profile</CardTitle>
            <p className="text-xs text-stone-500">Swanford Academy official operational parameters</p>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="py-1.5 border-b border-stone-100">
              <span className="text-stone-500 block">School Name</span>
              <span className="font-bold text-stone-900">{SCHOOL_PROFILE.name}</span>
            </div>
            <div className="py-1.5 border-b border-stone-100">
              <span className="text-stone-500 block">Motto</span>
              <span className="font-semibold text-stone-800">Illuminating the Path to Success.</span>
            </div>
            <div className="py-1.5 border-b border-stone-100">
              <span className="text-stone-500 block">Campus Address</span>
              <span className="font-semibold text-stone-800">PLOT 212, DR NUHU MUHAMMADU SANUSI WAY, DUTSE, JIGAWA STATE</span>
            </div>
            <div className="py-1.5 border-b border-stone-100">
              <span className="text-stone-500 block">Reconciled Bank</span>
              <span className="font-semibold text-stone-800">Jaiz Bank (0012031162)</span>
            </div>
            <div className="py-1.5 flex justify-between items-center">
              <span className="text-stone-500">Timezone Standard</span>
              <Badge variant="brand" size="sm">
                {LAGOS_TIMEZONE}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

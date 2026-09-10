"use client";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { Avatar } from "@/components/ui/avatar";

interface GuardianDetail {
  id: string;
  firstName: string;
  lastName: string;
  relationshipType: string;
  phonePrimary: string;
  phoneSecondary: string | null;
  email: string | null;
  occupation: string | null;
  residentialAddress: string | null;
  relationships: Array<{
    id: string;
    relationshipType: string;
    isPrimaryPayer: boolean;
    isEmergencyContact: boolean;
    student: {
      id: string;
      admissionNumber: string | null;
      firstName: string;
      lastName: string;
      status: string;
      primaryClass: { name: string } | null;
      tahfeezClass: { name: string } | null;
    };
  }>;
}

export default function GuardianDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const guardianId = resolvedParams.id;

  const [guardian, setGuardian] = useState<GuardianDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGuardian = () => {
    setLoading(true);
    setError(null);
    fetch(`/api/admin/guardians/${guardianId}`)
      .then(async (res) => {
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Failed to load guardian record.");
        }
        return res.json();
      })
      .then((json) => {
        setGuardian(json);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Error retrieving guardian.");
        setLoading(false);
      });
  };

  useEffect(() => {
    fetch(`/api/admin/guardians/${guardianId}`)
      .then(async (res) => {
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Failed to load guardian record.");
        }
        return res.json();
      })
      .then((json) => {
        setGuardian(json);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Error retrieving guardian.");
        setLoading(false);
      });
  }, [guardianId]);

  if (loading) {
    return (
      <div className="py-12">
        <LoadingState message="Loading guardian profile..." />
      </div>
    );
  }

  if (error || !guardian) {
    return (
      <div className="py-8">
        <ErrorState
          title="Guardian Not Found"
          message={error || "Could not retrieve guardian profile."}
          actionLabel="Retry"
          onAction={fetchGuardian}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-stone-500 mb-1">
            <Link href="/admin/guardians" className="hover:underline">
              ← Guardians
            </Link>
            <span>/</span>
            <span>Profile</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight">
            {guardian.firstName} {guardian.lastName}
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Bio Card */}
        <Card className="md:col-span-1">
          <CardHeader className="text-center pb-2">
            <div className="flex justify-center mb-3">
              <Avatar
                size="lg"
                fallback={`${guardian.firstName[0]}${guardian.lastName[0]}`}
                alt={`${guardian.firstName} ${guardian.lastName}`}
              />
            </div>
            <CardTitle className="text-lg font-bold text-stone-900">
              {guardian.firstName} {guardian.lastName}
            </CardTitle>
            <Badge variant="brand" size="sm" className="mt-1">
              {guardian.relationshipType}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3 pt-2 text-xs">
            <div className="py-1.5 border-b border-stone-100">
              <span className="text-stone-500 block">Primary Phone</span>
              <span className="font-semibold text-stone-900">{guardian.phonePrimary}</span>
            </div>
            {guardian.phoneSecondary && (
              <div className="py-1.5 border-b border-stone-100">
                <span className="text-stone-500 block">Secondary Phone</span>
                <span className="font-semibold text-stone-900">{guardian.phoneSecondary}</span>
              </div>
            )}
            <div className="py-1.5 border-b border-stone-100">
              <span className="text-stone-500 block">Email Address</span>
              <span className="font-semibold text-stone-900">{guardian.email || "None provided"}</span>
            </div>
            {guardian.occupation && (
              <div className="py-1.5 border-b border-stone-100">
                <span className="text-stone-500 block">Occupation</span>
                <span className="font-semibold text-stone-900">{guardian.occupation}</span>
              </div>
            )}
            {guardian.residentialAddress && (
              <div className="py-1.5">
                <span className="text-stone-500 block">Residential Address</span>
                <span className="font-semibold text-stone-900">{guardian.residentialAddress}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right Wards Card */}
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold text-stone-900">Enrolled Students / Wards</CardTitle>
            </CardHeader>
            <CardContent>
              {guardian.relationships.length === 0 ? (
                <p className="text-xs text-stone-500">No students currently linked to this guardian record.</p>
              ) : (
                <div className="space-y-3">
                  {guardian.relationships.map((rel) => (
                    <div
                      key={rel.id}
                      className="p-4 rounded-xl border border-stone-200 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-stone-900">
                            {rel.student.firstName} {rel.student.lastName}
                          </span>
                          <span className="text-xs font-mono text-stone-500">
                            ({rel.student.admissionNumber || "Pending"})
                          </span>
                          <Badge
                            variant={rel.student.status === "ACTIVE" ? "success" : "warning"}
                            size="sm"
                          >
                            {rel.student.status}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs text-stone-600 mt-1">
                          <span>Class: {rel.student.primaryClass?.name || "General"}</span>
                          {rel.isPrimaryPayer && <span className="text-[#5B0612] font-semibold">• Primary Payer</span>}
                          {rel.isEmergencyContact && <span className="text-amber-800 font-semibold">• Emergency Contact</span>}
                        </div>
                      </div>
                      <Link href={`/admin/students/${rel.student.id}`}>
                        <Button variant="outline" size="sm" className="text-[#5B0612] font-semibold">
                          View Student →
                        </Button>
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

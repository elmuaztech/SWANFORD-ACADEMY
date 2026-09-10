"use client";

import React, { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { formatNaira } from "@/lib/money";

interface SystemConfig {
  schoolProfile: {
    name: string;
    subtitle: string;
    location: string;
    motto: string;
    bankAccount: {
      bank: string;
      accountName: string;
      accountNumber: string;
    };
  };
  timezone: string;
  academicSessions: Array<{
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    isCurrent: boolean;
    terms: Array<{
      id: string;
      name: string;
      termCode: string;
      isCurrent: boolean;
      startDate: string;
      endDate: string;
    }>;
  }>;
  feeStructures: Array<{
    id: string;
    name: string;
    programme: { name: string };
    applicableGender: string;
    isAdmissionFee: boolean;
    isActive: boolean;
    feeItems: Array<{
      id: string;
      name: string;
      amountKobo: string;
    }>;
  }>;
  programmes: Array<{
    id: string;
    name: string;
    code: string;
    classes: Array<{ id: string; name: string; capacity: number }>;
  }>;
}

export default function SuperAdminConfigPage() {
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = () => {
    setLoading(true);
    setError(null);
    fetch("/api/super-admin/config")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load system configuration.");
        return res.json();
      })
      .then((json) => {
        setConfig(json);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Error retrieving config.");
        setLoading(false);
      });
  };

  useEffect(() => {
    fetch("/api/super-admin/config")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load system configuration.");
        return res.json();
      })
      .then((json) => {
        setConfig(json);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Error retrieving config.");
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="py-12">
        <LoadingState message="Loading enterprise configuration and operational parameters..." />
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className="py-8">
        <ErrorState
          title="Configuration Unavailable"
          message={error || "Could not retrieve system configuration."}
          actionLabel="Retry"
          onAction={fetchConfig}
        />
      </div>
    );
  }

  const { schoolProfile, timezone, feeStructures } = config;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight">
          System Configuration &amp; Governance
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Canonical operational parameters, Africa/Lagos timezone enforcement, and approved fee structures.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Institutional & Bank Parameters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold text-stone-900">Institution Identity &amp; Banking</CardTitle>
            <p className="text-xs text-stone-500">Core parameters governing official documents &amp; invoices</p>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="py-1.5 border-b border-stone-100">
              <span className="text-stone-500 block">Institution Name</span>
              <span className="font-bold text-stone-900">{schoolProfile.name}</span>
            </div>
            <div className="py-1.5 border-b border-stone-100">
              <span className="text-stone-500 block">Subtitle</span>
              <span className="font-semibold text-stone-800">{schoolProfile.subtitle}</span>
            </div>
            <div className="py-1.5 border-b border-stone-100">
              <span className="text-stone-500 block">Motto</span>
              <span className="font-semibold text-stone-800">{schoolProfile.motto}</span>
            </div>
            <div className="py-1.5 border-b border-stone-100">
              <span className="text-stone-500 block">Campus Address</span>
              <span className="font-semibold text-stone-800">{schoolProfile.location}</span>
            </div>
            <div className="py-1.5 border-b border-stone-100 flex justify-between items-center">
              <span className="text-stone-500">Canonical Timezone</span>
              <Badge variant="brand" size="sm">
                {timezone}
              </Badge>
            </div>
            <div className="pt-2">
              <span className="text-stone-500 block mb-1 font-semibold">Official Jaiz Bank Account</span>
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200">
                <p className="font-bold text-sm text-stone-900">{schoolProfile.bankAccount.accountName}</p>
                <p className="text-xs text-stone-600">
                  {schoolProfile.bankAccount.bank} • Account Number:{" "}
                  <span className="font-mono font-bold text-[#5B0612]">{schoolProfile.bankAccount.accountNumber}</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Canonical Fee Structures */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold text-stone-900">Approved Fee Structures</CardTitle>
            <p className="text-xs text-stone-500">Official fee item breakdowns mapped to student billing</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {feeStructures.length === 0 ? (
              <p className="text-xs text-stone-500">No active fee structures registered.</p>
            ) : (
              feeStructures.map((fs) => {
                const totalKobo = fs.feeItems.reduce((acc, item) => acc + BigInt(item.amountKobo), BigInt(0));
                return (
                  <div key={fs.id} className="p-4 rounded-xl border border-stone-200 bg-white space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-sm text-stone-900">{fs.name}</span>
                      <Badge variant="neutral" size="sm">
                        {fs.programme.name}
                      </Badge>
                    </div>
                    <div className="space-y-1 pt-1">
                      {fs.feeItems.map((fi) => (
                        <div key={fi.id} className="flex justify-between text-xs py-0.5 border-b border-stone-50">
                          <span className="text-stone-600">{fi.name}</span>
                          <span className="font-semibold text-stone-900">{formatNaira(BigInt(fi.amountKobo))}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between pt-2 border-t border-stone-200 text-xs font-bold">
                      <span className="text-stone-700">Total Structure Amount:</span>
                      <span className="text-[#5B0612]">{formatNaira(totalKobo)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

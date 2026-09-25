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
  ErrorState,
  PageHeader,
} from "@/components";
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

export default function AdminConfigPage() {
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
    fetchConfig();
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

  const { schoolProfile, feeStructures } = config;

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Configuration & Governance"
        description="Canonical operational parameters, bank settlement accounts, and approved fee structures."
        badge={<Badge variant="brand" size="sm">Super Admin Governance</Badge>}
        breadcrumbs={[
          { label: "Dashboard", href: "/admin" },
          { label: "Configuration" },
        ]}
        actions={
          <Button variant="outline" size="md" onClick={fetchConfig}>
            Refresh Config
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Institutional Parameters */}
        <Card className="border border-[#EADBDA]/80">
          <CardHeader className="pb-3 border-b border-[#EADBDA]/60 bg-[#FAF7F2]/50">
            <CardTitle className="text-base font-bold text-stone-900">Institution Identity</CardTitle>
            <p className="text-xs text-stone-500">Core parameters governing official documents &amp; records</p>
          </CardHeader>
          <CardContent className="space-y-3 text-xs p-5">
            <div className="py-1.5 border-b border-stone-100">
              <span className="text-stone-500 block text-[11px] uppercase tracking-wider font-semibold">Institution Name</span>
              <span className="font-bold text-stone-900 text-sm">{schoolProfile.name}</span>
            </div>
            <div className="py-1.5 border-b border-stone-100">
              <span className="text-stone-500 block text-[11px] uppercase tracking-wider font-semibold">Subtitle</span>
              <span className="font-semibold text-stone-800">{schoolProfile.subtitle}</span>
            </div>
            <div className="py-1.5 border-b border-stone-100">
              <span className="text-stone-500 block text-[11px] uppercase tracking-wider font-semibold">Motto</span>
              <span className="font-semibold text-stone-800">{schoolProfile.motto}</span>
            </div>
            <div className="py-1.5 border-b border-stone-100">
              <span className="text-stone-500 block text-[11px] uppercase tracking-wider font-semibold">Campus Address</span>
              <span className="font-semibold text-stone-800">{schoolProfile.location}</span>
            </div>
            <div className="py-1.5">
              <span className="text-stone-500 block text-[11px] uppercase tracking-wider font-semibold">Settlement Bank Account</span>
              <div className="font-semibold text-stone-800 mt-0.5">
                <p className="text-stone-900 font-bold">{schoolProfile.bankAccount?.bank || "Stanbic IBTC Bank"}</p>
                <p className="font-mono text-xs">{schoolProfile.bankAccount?.accountNumber || "0034567890"} • {schoolProfile.bankAccount?.accountName || "Swanford Academy Ltd"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Canonical Fee Structures */}
        <Card className="border border-[#EADBDA]/80">
          <CardHeader className="pb-3 border-b border-[#EADBDA]/60 bg-[#FAF7F2]/50">
            <CardTitle className="text-base font-bold text-stone-900">Approved Fee Structures</CardTitle>
            <p className="text-xs text-stone-500">Official fee item breakdowns mapped to student billing</p>
          </CardHeader>
          <CardContent className="space-y-4 p-5">
            {feeStructures.length === 0 ? (
              <p className="text-xs text-stone-500 text-center py-6">No active fee structures registered.</p>
            ) : (
              feeStructures.map((fs) => {
                const totalKobo = fs.feeItems.reduce((acc, item) => acc + BigInt(item.amountKobo), BigInt(0));
                return (
                  <div key={fs.id} className="p-4 rounded-xl border border-[#EADBDA] bg-white space-y-2 shadow-xs">
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
                    <div className="flex justify-between pt-2 border-t border-[#EADBDA] text-xs font-bold">
                      <span className="text-stone-700">Total Structure Amount:</span>
                      <span className="text-[#800020] font-mono">{formatNaira(totalKobo)}</span>
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

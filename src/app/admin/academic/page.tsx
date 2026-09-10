"use client";

import React, { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingState, ErrorState } from "@/components/ui/states";

interface ConfigResponse {
  schoolProfile: {
    name: string;
    subtitle: string;
    location: string;
    motto: string;
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
  programmes: Array<{
    id: string;
    name: string;
    code: string;
    classes: Array<{ id: string; name: string; code: string; capacity: number }>;
  }>;
}

export default function AdminAcademicPage() {
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = () => {
    setLoading(true);
    setError(null);
    fetch("/api/super-admin/config")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load academic configuration.");
        return res.json();
      })
      .then((json) => {
        setConfig(json);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Error loading academic data.");
        setLoading(false);
      });
  };

  useEffect(() => {
    fetch("/api/super-admin/config")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load academic configuration.");
        return res.json();
      })
      .then((json) => {
        setConfig(json);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Error loading academic data.");
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="py-12">
        <LoadingState message="Loading academic sessions, terms, and classes..." />
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className="py-8">
        <ErrorState
          title="Academic Records Unavailable"
          message={error || "Could not retrieve academic configuration."}
          actionLabel="Retry"
          onAction={fetchConfig}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight">
          Academic Structure & Sessions
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Configured academic years, operational terms, programmes, and active classroom divisions.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Academic Sessions & Terms */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold text-stone-900">Academic Sessions & Terms</CardTitle>
            <p className="text-xs text-stone-500">Canonical calendar cycles for Swanford Academy</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {config.academicSessions.map((session) => (
              <div
                key={session.id}
                className="p-4 rounded-xl border border-stone-200 bg-white space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-base text-stone-900">{session.name}</span>
                  {session.isCurrent && (
                    <Badge variant="brand" size="sm">
                      Current Session
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                  {session.terms.map((term) => (
                    <div
                      key={term.id}
                      className={`p-3 rounded-lg border text-xs ${
                        term.isCurrent
                          ? "border-[#5B0612] bg-[#FDF2F4] text-[#5B0612] font-bold"
                          : "border-stone-200 bg-stone-50 text-stone-700"
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span>{term.name}</span>
                        {term.isCurrent && <span className="text-[10px] uppercase tracking-wider">Active</span>}
                      </div>
                      <p className="text-[10px] text-stone-500 mt-1 font-mono">{term.termCode}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Programmes & Classes */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold text-stone-900">Programmes & Classrooms</CardTitle>
            <p className="text-xs text-stone-500">Instructional curriculum divisions and capacities</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {config.programmes.map((prog) => (
              <div
                key={prog.id}
                className="p-4 rounded-xl border border-stone-200 bg-white space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-base text-stone-900">{prog.name}</span>
                  <Badge variant="neutral" size="sm">
                    {prog.code}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {prog.classes.map((cls) => (
                    <div
                      key={cls.id}
                      className="p-3 rounded-lg border border-stone-200 bg-stone-50 text-xs"
                    >
                      <p className="font-bold text-stone-900">{cls.name}</p>
                      <p className="text-[11px] text-stone-500 mt-0.5">Capacity: {cls.capacity || 30} students</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

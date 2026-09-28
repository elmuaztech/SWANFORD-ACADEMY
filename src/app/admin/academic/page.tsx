"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Badge,
  Input,
  Modal,
  Alert,
  LoadingState,
  ErrorState,
  EmptyState,
  PageHeader,
  FormGroup,
} from "@/components";

interface AcademicTermItem {
  id: string;
  name: string;
  termCode: string;
  isCurrent: boolean;
  status: string;
  startDate: string;
  endDate: string;
}

interface AcademicSessionItem {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
  isCurrent: boolean;
  terms: AcademicTermItem[];
}

interface ProgrammeItem {
  id: string;
  name: string;
  code: string;
  classes: Array<{ id: string; name: string; code: string; capacity: number }>;
}

export default function AdminAcademicPage() {
  const [sessions, setSessions] = useState<AcademicSessionItem[]>([]);
  const [programmes, setProgrammes] = useState<ProgrammeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Modal State for Creating a new Academic Session
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [sessionNameInput, setSessionNameInput] = useState("");
  const [startDateInput, setStartDateInput] = useState("");
  const [endDateInput, setEndDateInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Action loading state
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchAcademicData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sessionsRes, configRes] = await Promise.all([
        fetch("/api/admin/academic/sessions"),
        fetch("/api/super-admin/config"),
      ]);

      if (!sessionsRes.ok) {
        throw new Error("We could not load the academic sessions. Please try again.");
      }

      const sessionsJson = await sessionsRes.json();
      setSessions(sessionsJson.sessions || []);

      if (configRes.ok) {
        const configJson = await configRes.json();
        setProgrammes(configJson.programmes || []);
        setIsSuperAdmin(true);
      } else {
        setIsSuperAdmin(false);
      }
      setLoading(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "We could not load the sessions. Please try again.");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAcademicData();
  }, [fetchAcademicData]);

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/admin/academic/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: sessionNameInput.trim(),
          startDate: startDateInput || undefined,
          endDate: endDateInput || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create academic session.");
      }

      setActionSuccess(`Academic Session ${sessionNameInput} successfully created with First, Second, and Third Terms.`);
      setIsCreateModalOpen(false);
      setSessionNameInput("");
      setStartDateInput("");
      setEndDateInput("");
      await fetchAcademicData();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : "Failed to create academic session.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSetActiveSession = async (sessionId: string, sessionName: string) => {
    setActionLoadingId(`session-${sessionId}`);
    setActionSuccess(null);
    try {
      const res = await fetch(`/api/admin/academic/sessions/${sessionId}/active`, {
        method: "POST",
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to set active session.");
      }

      setActionSuccess(`Academic Session ${sessionName} is now the active session.`);
      await fetchAcademicData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to activate session.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleActivateTerm = async (sessionId: string, termId: string, termName: string) => {
    setActionLoadingId(`term-${termId}`);
    setActionSuccess(null);
    try {
      const res = await fetch(`/api/admin/academic/sessions/${sessionId}/terms/${termId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ACTIVATE" }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to activate term.");
      }

      setActionSuccess(`${termName} is now the active term.`);
      await fetchAcademicData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to activate term.");
    } finally {
      setActionLoadingId(null);
    }
  };

  if (loading) {
    return (
      <div className="py-12">
        <LoadingState message="Loading academic sessions and terms..." />
      </div>
    );
  }

  if (error && sessions.length === 0) {
    return (
      <div className="py-8">
        <ErrorState
          title="Academic Sessions Unavailable"
          message={error || "We could not load the sessions. Please try again."}
          actionLabel="Retry"
          onAction={fetchAcademicData}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Page Header */}
      <PageHeader
        breadcrumbs={[
          { label: "Admin Dashboard", href: "/admin" },
          { label: "Academic Sessions & Terms" },
        ]}
        title="Academic Sessions & Terms"
        subtitle="Manage official academy sessions, activate operational terms, and inspect educational curriculum arms."
        primaryAction={
          isSuperAdmin ? (
            <Button
              variant="primary"
              size="md"
              onClick={() => {
                setModalError(null);
                setIsCreateModalOpen(true);
              }}
              className="bg-[#800020] hover:bg-[#6b001a] text-white font-bold"
            >
              <span>+</span>
              <span>Create Academic Session</span>
            </Button>
          ) : undefined
        }
      />

      {actionSuccess && (
        <Alert variant="success" onClose={() => setActionSuccess(null)}>
          {actionSuccess}
        </Alert>
      )}

      {error && (
        <Alert variant="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Academic Sessions List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base sm:text-lg font-bold text-[#5B0612] tracking-tight">
            Academic Sessions ({sessions.length})
          </h2>
        </div>

        {sessions.length === 0 ? (
          <EmptyState
            title="No Academic Sessions Configured"
            description="The academy records currently do not contain any academic sessions. Create your first academic session to automatically initialize First, Second, and Third terms."
            actionLabel="Create Academic Session"
            onAction={() => {
              setModalError(null);
              setIsCreateModalOpen(true);
            }}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:gap-6">
            {sessions.map((session) => (
                <div
                  key={session.id}
                  className={`p-5 rounded-2xl border transition-all ${
                    session.isCurrent
                      ? "border-[#800020] bg-white shadow-xs"
                      : "border-stone-200 bg-[#FAF9F6]"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-stone-100">
                    <div className="flex items-center gap-3">
                      <span className="font-extrabold text-lg text-stone-900">
                        {session.name}
                      </span>
                      {session.isCurrent ? (
                        <Badge variant="brand" size="sm">
                          Active Session
                        </Badge>
                      ) : (
                        <Badge variant="neutral" size="sm">
                          {session.status}
                        </Badge>
                      )}
                    </div>

                    {!session.isCurrent && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={actionLoadingId === `session-${session.id}`}
                        onClick={() => handleSetActiveSession(session.id, session.name)}
                        className="text-[#800020] border-[#EADBDA] hover:bg-[#FAF2F4] text-xs font-bold"
                      >
                        {actionLoadingId === `session-${session.id}` ? "Activating..." : "Set Active Session"}
                      </Button>
                    )}
                  </div>

                  {/* Terms for this session */}
                  <div className="pt-4">
                    <span className="text-xs font-bold text-stone-600 uppercase tracking-wider block mb-2.5">
                      Operational Terms
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {session.terms.map((term) => (
                        <div
                          key={term.id}
                          className={`p-3.5 rounded-xl border flex flex-col justify-between gap-3 ${
                            term.isCurrent
                              ? "border-[#800020] bg-[#FAF2F4] text-[#800020]"
                              : "border-stone-200 bg-white text-stone-800"
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-sm">{term.name}</span>
                              {term.isCurrent && (
                                <Badge variant="brand" size="sm">
                                  Current Term
                                </Badge>
                              )}
                            </div>
                            <span className="text-[11px] text-stone-500 font-medium mt-1 block">
                              {new Date(term.startDate).toLocaleDateString()} &ndash;{" "}
                              {new Date(term.endDate).toLocaleDateString()}
                            </span>
                          </div>

                          {session.isCurrent && !term.isCurrent && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={actionLoadingId === `term-${term.id}`}
                              onClick={() => handleActivateTerm(session.id, term.id, term.name)}
                              className="text-xs font-bold w-full py-1 min-h-[36px]"
                            >
                              {actionLoadingId === `term-${term.id}` ? "Opening..." : "Set Active Term"}
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Programmes and Classrooms */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold text-stone-900">
              Approved Programmes &amp; Classes
            </CardTitle>
            <p className="text-xs text-stone-500">
              Active curriculum tracks and classroom divisions
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {programmes.map((prog) => (
                <div key={prog.id} className="p-4 rounded-xl border border-stone-200 bg-stone-50/50 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-sm text-stone-900">{prog.name}</span>
                    <Badge variant="neutral" size="sm">
                      {prog.code}
                    </Badge>
                  </div>
                  <div className="pt-1 space-y-1">
                    <span className="text-[11px] text-stone-500 font-semibold uppercase tracking-wider block">
                      Class Arms ({prog.classes.length}):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {prog.classes.map((cls) => (
                        <span
                          key={cls.id}
                          className="px-2 py-0.5 rounded bg-white border border-stone-200 text-stone-800 text-xs font-medium"
                        >
                          {cls.name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

      {/* Modal: Create Academic Session */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create Academic Session"
        description="Initialize a new school year with standard First, Second, and Third Terms."
        size="md"
      >
        <form onSubmit={handleCreateSession} className="space-y-4 pt-1">
          {modalError && (
            <Alert variant="error" onClose={() => setModalError(null)}>
              {modalError}
            </Alert>
          )}

          <FormGroup
            id="sessionName"
            label="Session Name"
            required
            helperText="Format: startYear/endYear (e.g. 2026/2027)"
          >
            <Input
              id="sessionName"
              type="text"
              placeholder="e.g. 2026/2027"
              required
              value={sessionNameInput}
              onChange={(e) => setSessionNameInput(e.target.value)}
              className="w-full font-mono"
            />
          </FormGroup>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormGroup id="sessionStartDate" label="Start Date (Optional)">
              <Input
                id="sessionStartDate"
                type="date"
                value={startDateInput}
                onChange={(e) => setStartDateInput(e.target.value)}
                className="w-full"
              />
            </FormGroup>

            <FormGroup id="sessionEndDate" label="End Date (Optional)">
              <Input
                id="sessionEndDate"
                type="date"
                value={endDateInput}
                onChange={(e) => setEndDateInput(e.target.value)}
                className="w-full"
              />
            </FormGroup>
          </div>

          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-4 border-t border-stone-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsCreateModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmitting}
              className="bg-[#800020] hover:bg-[#6b001a] text-white font-bold"
            >
              {isSubmitting ? "Creating..." : "Save Academic Session"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

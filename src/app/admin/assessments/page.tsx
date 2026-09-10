"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { AssessmentStatus, AssessmentType } from "@prisma/client";

interface AssessmentItem {
  id: string;
  title: string;
  type: AssessmentType;
  maxScore: string;
  weightPercentage: string;
  status: AssessmentStatus;
  programme: { name: string };
  schoolClass: { name: string };
  subject: { name: string } | null;
  academicSession: { name: string };
  academicTerm: { name: string };
  createdBy: { email: string };
  _count: { scores: number };
}

export default function AdminAssessmentsPage() {
  const [assessments, setAssessments] = useState<AssessmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reopen Modal State
  const [reopenAssessmentId, setReopenAssessmentId] = useState<string | null>(null);
  const [reopenReason, setReopenReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const fetchAssessments = () => {
    setLoading(true);
    setError(null);
    fetch("/api/admin/assessments")
      .then(async (res) => {
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Failed to load assessments.");
        }
        return res.json();
      })
      .then((json) => {
        setAssessments(json);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Error retrieving assessments.");
        setLoading(false);
      });
  };

  useEffect(() => {
    fetch("/api/admin/assessments")
      .then(async (res) => {
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Failed to load assessments.");
        }
        return res.json();
      })
      .then((json) => {
        setAssessments(json);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Error retrieving assessments.");
        setLoading(false);
      });
  }, []);

  const handleFinalize = async (id: string) => {
    if (!confirm("Finalize this assessment and publish results to parents?")) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/assessments/${id}/finalize`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to finalize assessment.");
      await fetchAssessments();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Finalization failed.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReopenSubmit = async () => {
    if (!reopenAssessmentId || !reopenReason.trim()) {
      alert("Please provide an administrative reason to reopen this finalized assessment.");
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/assessments/${reopenAssessmentId}/reopen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reopenReason.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to reopen assessment.");
      setReopenAssessmentId(null);
      setReopenReason("");
      await fetchAssessments();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Reopen failed.");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight">
            Assessments & Grading
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Continuous assessments, exams, finalization workflows, and grade publication control.
          </p>
        </div>
        <Button variant="outline" size="md" onClick={fetchAssessments}>
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="py-12">
          <LoadingState message="Loading assessments roster..." />
        </div>
      ) : error ? (
        <ErrorState
          title="Assessments Unavailable"
          message={error}
          actionLabel="Try Again"
          onAction={fetchAssessments}
        />
      ) : assessments.length === 0 ? (
        <Card className="py-12 text-center">
          <CardContent>
            <p className="text-base font-semibold text-stone-700">No assessments found.</p>
            <p className="text-xs text-stone-500 mt-1">Teachers have not created any assessments for this term yet.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Assessment Title</TableHead>
                  <TableHead>Class & Programme</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Max Score</TableHead>
                  <TableHead>Marks Entered</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assessments.map((ass) => (
                  <TableRow key={ass.id}>
                    <TableCell className="font-bold text-stone-900">
                      <div>{ass.title}</div>
                      <span className="text-[11px] text-stone-400">Created by {ass.createdBy?.email}</span>
                    </TableCell>
                    <TableCell className="text-xs font-semibold text-stone-800">
                      {ass.schoolClass.name} ({ass.programme.name})
                    </TableCell>
                    <TableCell className="text-xs text-stone-600">
                      {ass.subject?.name || "General / Class Assessment"}
                    </TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="neutral" size="sm">
                        {ass.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-semibold text-stone-800">
                      {ass.maxScore} pts
                    </TableCell>
                    <TableCell className="text-xs font-semibold text-stone-700">
                      {ass._count.scores} entries
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          ass.status === "FINALIZED"
                            ? "success"
                            : ass.status === "SUBMITTED"
                            ? "info"
                            : "warning"
                        }
                        size="sm"
                      >
                        {ass.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        {ass.status === "SUBMITTED" && (
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={actionLoading}
                            onClick={() => handleFinalize(ass.id)}
                            className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold"
                          >
                            Finalize & Publish
                          </Button>
                        )}
                        {ass.status === "FINALIZED" && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={actionLoading}
                            onClick={() => setReopenAssessmentId(ass.id)}
                            className="text-amber-800 border-amber-300 hover:bg-amber-50 font-bold"
                          >
                            Reopen
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Reopen Modal */}
      {reopenAssessmentId && (
        <Modal
          isOpen={true}
          onClose={() => setReopenAssessmentId(null)}
          title="Administrative Assessment Reopen"
        >
          <div className="space-y-4 pt-2">
            <p className="text-xs text-stone-600">
              Reopening a finalized assessment changes its status back to SUBMITTED and allows marks to be
              re-edited. An audit log will be created.
            </p>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Administrative Reason (Required)</label>
              <Textarea
                rows={3}
                placeholder="State reason for reopening (e.g. mark recalculation request approved, teacher clerical remark)..."
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setReopenAssessmentId(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={actionLoading || !reopenReason.trim()}
                onClick={handleReopenSubmit}
                className="bg-[#5B0612] text-white font-bold"
              >
                {actionLoading ? "Reopening..." : "Reopen Assessment"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

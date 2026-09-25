"use client";

import React, { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  Badge,
  Button,
  LoadingState,
  ErrorState,
  EmptyState,
  PageHeader,
  Modal,
} from "@/components";

interface IssuedDocument {
  id: string;
  documentType: string;
  title: string;
  status: string;
  issuedAt: string | null;
  createdAt: string;
}

interface DocumentDetail {
  id: string;
  title: string;
  content: string;
  issuedAt: string | null;
}

export default function TeacherDocumentsPage() {
  const [documents, setDocuments] = useState<IssuedDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Document Viewing Modal
  const [viewingDoc, setViewingDoc] = useState<DocumentDetail | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(false);

  const fetchDocuments = () => {
    setLoading(true);
    setError(null);
    fetch("/api/teacher/documents")
      .then(async (res) => {
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Failed to load documents.");
        }
        return res.json();
      })
      .then((data) => {
        setDocuments(data.documents || []);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Error retrieving issued documents.");
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleOpenDocument = (docId: string) => {
    setLoadingDoc(true);
    fetch(`/api/teacher/documents/${docId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load document content.");
        return res.json();
      })
      .then((data) => {
        setViewingDoc(data.document);
        setLoadingDoc(false);
      })
      .catch((err) => {
        alert(err instanceof Error ? err.message : "Error opening document.");
        setLoadingDoc(false);
      });
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Documents & Employment Records"
        description="Official employment appointment letters, probation assessments, and confirmation records issued to you by Swanford Academy Management."
      />

      {loading && <LoadingState message="Loading your official documents..." />}

      {error && !loading && (
        <ErrorState
          title="Could Not Load Documents"
          message={error}
          onRetry={fetchDocuments}
        />
      )}

      {!loading && !error && documents.length === 0 && (
        <Card className="border border-[#EADBDA]/80 shadow-xs">
          <CardContent className="p-8 text-center">
            <EmptyState
              title="No employment documents have been issued."
              description="Official appointment letters and probation assessment forms will appear here once generated and issued by the School Management."
            />
          </CardContent>
        </Card>
      )}

      {!loading && !error && documents.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {documents.map((doc) => {
            const formattedDate = doc.issuedAt
              ? new Date(doc.issuedAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              : "Pending Issuance";

            return (
              <Card
                key={doc.id}
                className="border border-[#EADBDA]/80 hover:border-[#800020]/40 transition-all duration-200 shadow-xs bg-white"
              >
                <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge variant="brand" className="text-[10px] uppercase font-bold tracking-wider">
                        {doc.documentType.replace(/_/g, " ")}
                      </Badge>
                      <Badge variant="success" className="text-[10px]">
                        {doc.status}
                      </Badge>
                    </div>

                    <h3 className="font-bold text-stone-900 text-sm tracking-tight leading-snug">
                      {doc.title}
                    </h3>

                    <p className="text-xs text-stone-500">
                      Date Issued: <strong>{formattedDate}</strong>
                    </p>
                  </div>

                  <div className="pt-2 border-t border-stone-100 flex items-center justify-end">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleOpenDocument(doc.id)}
                      disabled={loadingDoc}
                      className="bg-[#800020] text-white hover:bg-[#600018]"
                    >
                      View & Print Document
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Document Viewer Modal */}
      {viewingDoc && (
        <Modal
          isOpen={true}
          onClose={() => setViewingDoc(null)}
          title={viewingDoc.title}
          size="xl"
        >
          <div className="space-y-4">
            <div className="flex justify-end gap-2 print:hidden pb-2 border-b border-stone-200">
              <Button variant="outline" size="sm" onClick={handlePrint}>
                🖨️ Print / Save as PDF
              </Button>
            </div>

            <div
              className="p-6 bg-white border border-stone-200 rounded-lg max-h-[70vh] overflow-y-auto print:max-h-none print:border-none print:p-0"
              dangerouslySetInnerHTML={{ __html: viewingDoc.content }}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}

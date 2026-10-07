"use client";

import React, { useEffect, useState, use, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Avatar } from "@/components/ui/avatar";
import { ImageUpload } from "@/components/ui/image-upload";
import { PageHeader } from "@/components/layout/page-header";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/states";
import { TableWrapper } from "@/components/ui/table";

interface StudentRosterItem {
  id: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  otherNames?: string | null;
  gender: string;
  dateOfBirth?: string | null;
  profilePhotoId?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelationship?: string | null;
}

function ClassRosterContent({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const classId = resolvedParams.id;
  const searchParams = useSearchParams();
  const programmeId = searchParams.get("programmeId");

  const [students, setStudents] = useState<StudentRosterItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Photo update modal state
  const [editingStudent, setEditingStudent] = useState<StudentRosterItem | null>(null);

  const missingProgrammeError = !programmeId ? "programmeId is required to view class roster." : null;

  useEffect(() => {
    if (!programmeId) return;

    fetch(`/api/teacher/classes/${classId}/students?programmeId=${programmeId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load class roster");
        return res.json();
      })
      .then((d) => {
        setStudents(d.students || []);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setIsLoading(false);
      });
  }, [classId, programmeId]);

  if (missingProgrammeError) {
    return (
      <ErrorState
        title="Class Roster Unavailable"
        message={missingProgrammeError}
      />
    );
  }

  if (isLoading) {
    return <LoadingState description="Loading class roster..." />;
  }

  if (error) {
    return (
      <ErrorState
        title="Class Roster Unavailable"
        message={error}
        onRetry={() => window.location.reload()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Class Roster"
        subtitle={`Enrolled students for this class (${students.length} Total). Emergency details are shown for operational contact.`}
        breadcrumbs={[
          { label: "Teacher Portal", href: "/teacher" },
          { label: "My Classes", href: "/teacher/classes" },
          { label: "Class Roster" },
        ]}
        primaryAction={
          <div className="flex gap-2">
            <Link href={`/teacher/attendance?schoolClassId=${classId}&programmeId=${programmeId}`}>
              <Button variant="primary" className="bg-[#800020] hover:bg-[#6b001a] text-white">
                Take Attendance
              </Button>
            </Link>
          </div>
        }
      />

      {students.length === 0 ? (
        <EmptyState
          title="No Students Enrolled"
          description="There are currently no active students enrolled in this class for the current academic session."
        />
      ) : (
        <>
          {/* Mobile view: Accessible cards */}
          <div className="md:hidden space-y-3">
            {students.map((student) => (
              <Card key={student.id} className="bg-white border-[#EFE9DF] shadow-xs">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Avatar
                        src={student.profilePhotoId ? `/api/media/${student.profilePhotoId}` : null}
                        name={`${student.firstName} ${student.lastName}`}
                        size="md"
                      />
                      <div>
                        <span className="text-xs font-mono text-[#800020] font-semibold">{student.admissionNumber}</span>
                        <h4 className="text-base font-bold text-[#5B0612] leading-snug">
                          {student.lastName}, {student.firstName} {student.otherNames || ""}
                        </h4>
                      </div>
                    </div>
                    <Badge variant="neutral" className="text-[10px]">
                      {student.gender}
                    </Badge>
                  </div>

                  <div className="text-xs text-stone-600 bg-[#FAF7F2] p-2.5 rounded-lg border border-[#EFE9DF] space-y-1">
                    <p>
                      <span className="text-stone-500 font-medium">DOB:</span>{" "}
                      {student.dateOfBirth
                        ? new Date(student.dateOfBirth).toLocaleDateString("en-NG", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })
                        : "—"}
                    </p>
                    {student.emergencyContactName && (
                      <p>
                        <span className="text-stone-500 font-medium">Emergency:</span>{" "}
                        {student.emergencyContactName} ({student.emergencyContactRelationship || "Guardian"}) ·{" "}
                        <a href={`tel:${student.emergencyContactPhone}`} className="text-[#800020] font-medium hover:underline">
                          {student.emergencyContactPhone}
                        </a>
                      </p>
                    )}
                  </div>

                  <div className="pt-2 flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingStudent(student)}
                      className="text-xs"
                    >
                      Update Photo
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Desktop view: Clean, responsive table with Dual Horizontal Scroll */}
          <div className="hidden md:block">
            <TableWrapper className="border border-[#EFE9DF]">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-[#FAF7F2] border-b border-[#EFE9DF] text-xs font-semibold text-stone-600 uppercase tracking-wider">
                    <th className="py-3.5 px-4">#</th>
                    <th className="py-3.5 px-4">Photo</th>
                    <th className="py-3.5 px-4">Admission No.</th>
                    <th className="py-3.5 px-4">Student Name</th>
                    <th className="py-3.5 px-4">Gender</th>
                    <th className="py-3.5 px-4">Date of Birth</th>
                    <th className="py-3.5 px-4">Emergency Contact</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFE9DF]">
                  {students.map((student, idx) => (
                    <tr key={student.id} className="hover:bg-[#FAF7F2]/60 transition-colors">
                      <td className="py-3.5 px-4 text-xs text-stone-400 font-mono">{idx + 1}</td>
                      <td className="py-3.5 px-4">
                        <Avatar
                          src={student.profilePhotoId ? `/api/media/${student.profilePhotoId}` : null}
                          name={`${student.firstName} ${student.lastName}`}
                          size="sm"
                        />
                      </td>
                      <td className="py-3.5 px-4 text-xs font-mono font-bold text-[#800020]">{student.admissionNumber}</td>
                      <td className="py-3.5 px-4 font-semibold text-stone-900">
                        {student.lastName}, {student.firstName} {student.otherNames || ""}
                      </td>
                      <td className="py-3.5 px-4">
                        <Badge variant="neutral" className="text-xs">
                          {student.gender}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-stone-600">
                        {student.dateOfBirth
                          ? new Date(student.dateOfBirth).toLocaleDateString("en-NG", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })
                          : "—"}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-stone-600">
                        {student.emergencyContactName ? (
                          <div>
                            <p className="font-medium text-stone-900">{student.emergencyContactName}</p>
                            <p className="text-stone-500">
                              {student.emergencyContactPhone} ({student.emergencyContactRelationship || "Contact"})
                            </p>
                          </div>
                        ) : (
                          <span className="text-stone-400">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingStudent(student)}
                          className="text-xs text-[#800020] hover:bg-[#FAF7F2]"
                        >
                          Update Photo
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrapper>
          </div>
        </>
      )}

      {/* Modal for Teacher to Update Student Profile Photo */}
      {editingStudent && (
        <Modal
          isOpen={true}
          onClose={() => setEditingStudent(null)}
          title={`Update Photo: ${editingStudent.firstName} ${editingStudent.lastName}`}
          description={`Admission No: ${editingStudent.admissionNumber}. Upload an updated, clear face photo. It will be automatically optimized to a web-friendly WebP profile avatar.`}
        >
          <div className="p-4 space-y-4">
            <ImageUpload
              label="New Student Photo"
              currentImageUrl={editingStudent.profilePhotoId ? `/api/media/${editingStudent.profilePhotoId}` : null}
              uploadEndpoint={`/api/teacher/students/${editingStudent.id}/photo`}
              extraFormData={{
                programmeId: programmeId || "",
                schoolClassId: classId || "",
              }}
              onUploadSuccess={(result) => {
                // Update student in state
                setStudents((prev) =>
                  prev.map((s) =>
                    s.id === editingStudent.id ? { ...s, profilePhotoId: result.assetId } : s
                  )
                );
                setEditingStudent(null);
              }}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function ClassRosterPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<LoadingState description="Loading class roster..." />}>
      <ClassRosterContent params={params} />
    </Suspense>
  );
}

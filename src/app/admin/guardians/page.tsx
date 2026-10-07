"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  Badge,
  Button,
  Input,
  LoadingState,
  ErrorState,
  EmptyState,
  PageHeader,
  Table,
  TableHead,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
  TableWrapper,
  TableMobileCard,
  Modal,
  FormGroup,
  Select,
  Checkbox,
  Alert,
} from "@/components";

interface GuardianItem {
  id: string;
  firstName: string;
  lastName: string;
  relationshipType: string;
  phonePrimary: string;
  email: string | null;
  occupation: string | null;
  relationships: Array<{
    student: { id: string; firstName: string; lastName: string; admissionNumber: string | null };
  }>;
}

export default function AdminGuardiansPage() {
  const [guardians, setGuardians] = useState<GuardianItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Add Guardian Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [submittingAdd, setSubmittingAdd] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);
  const [provisionPortal, setProvisionPortal] = useState(true);
  const [addForm, setAddForm] = useState({
    title: "",
    firstName: "",
    lastName: "",
    email: "",
    phonePrimary: "",
    occupation: "",
    residentialAddress: "",
  });

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user) setCurrentUser(d.user);
      })
      .catch(() => {});
  }, []);

  const handleImpersonateGuardian = async (guardianId: string) => {
    try {
      setImpersonatingId(guardianId);
      setError(null);
      const res = await fetch("/api/super-admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guardianId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to impersonate parent account");
      }
      window.location.href = data.redirectUrl || "/parent";
    } catch (err: any) {
      setError(err?.message || "Failed to impersonate parent.");
      setImpersonatingId(null);
    }
  };

  const fetchGuardians = (query?: string) => {
    setLoading(true);
    setError(null);
    let url = "/api/admin/guardians";
    const q = query !== undefined ? query : search;
    if (q) url += `?search=${encodeURIComponent(q)}`;
    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Failed to load guardians list.");
        }
        return res.json();
      })
      .then((json) => {
        setGuardians(json.guardians || json);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load guardians.");
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchGuardians("");
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchGuardians();
  };

  const handleClear = () => {
    setSearch("");
    fetchGuardians("");
  };

  const handleOpenAddModal = () => {
    setAddForm({
      title: "",
      firstName: "",
      lastName: "",
      email: "",
      phonePrimary: "",
      occupation: "",
      residentialAddress: "",
    });
    setProvisionPortal(true);
    setAddError(null);
    setAddSuccess(null);
    setShowAddModal(true);
  };

  const handleAddGuardianSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingAdd(true);
    setAddError(null);
    setAddSuccess(null);

    try {
      const res = await fetch("/api/admin/guardians", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: addForm.title || undefined,
          firstName: addForm.firstName.trim(),
          lastName: addForm.lastName.trim(),
          email: addForm.email.trim() ? addForm.email.trim() : null,
          phonePrimary: addForm.phonePrimary.trim() ? addForm.phonePrimary.trim() : null,
          occupation: addForm.occupation.trim() ? addForm.occupation.trim() : null,
          residentialAddress: addForm.residentialAddress.trim() ? addForm.residentialAddress.trim() : null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create guardian profile.");
      }

      const createdGuardianId = data.guardian?.id;

      // If portal provisioning requested and email provided, provision portal account
      let portalNote = "";
      if (provisionPortal && addForm.email.trim() && createdGuardianId) {
        try {
          const userRes = await fetch(`/api/admin/guardians/${createdGuardianId}/user`, {
            method: "POST",
          });
          const userData = await userRes.json();
          if (userRes.ok) {
            portalNote = " Parent portal account created and activation email dispatched.";
          }
        } catch {
          portalNote = " Guardian created, but portal activation email could not be queued immediately.";
        }
      }

      setAddSuccess(`Guardian profile registered successfully.${portalNote}`);
      fetchGuardians();
      setTimeout(() => {
        setShowAddModal(false);
        setAddSuccess(null);
      }, 1800);
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : "Failed to register guardian.");
    } finally {
      setSubmittingAdd(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Guardians Directory"
        description="Parents, sponsors, and legal guardians linked to enrolled Swanford Academy students."
        breadcrumbs={[
          { label: "Dashboard", href: "/admin" },
          { label: "Guardians" },
        ]}
        actions={
          <Button
            variant="primary"
            size="md"
            className="font-bold flex items-center gap-1.5"
            onClick={handleOpenAddModal}
          >
            <span>+</span> Add Guardian
          </Button>
        }
      />

      <Card className="border border-[#EADBDA]/80">
        <CardContent className="p-4">
          <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row items-stretch md:items-center gap-3 w-full">
            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder="Search guardian name, phone, or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full"
              />
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <Button type="submit" variant="primary" size="md" className="font-bold whitespace-nowrap">
                Search
              </Button>
              {search && (
                <Button type="button" variant="outline" size="md" onClick={handleClear} className="whitespace-nowrap">
                  Clear
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {loading ? (
        <div className="py-12">
          <LoadingState message="Loading guardians directory..." />
        </div>
      ) : error ? (
        <ErrorState
          title="Guardians Unavailable"
          message={error}
          actionLabel="Try Again"
          onAction={() => fetchGuardians()}
        />
      ) : guardians.length === 0 ? (
        search ? (
          <EmptyState
            title="No Guardians Match Search"
            description="No guardian records match your specified search keywords."
            actionLabel="Clear Search Filter"
            onAction={handleClear}
          />
        ) : (
          <EmptyState
            title="No Guardians Registered"
            description="No parent or guardian records have been registered in the system yet. Guardians are automatically created during student admissions and enrollment."
            actionLabel="Review Admissions"
            actionHref="/admin/admissions"
          />
        )
      ) : (
        <div>
          {/* Desktop Semantic Table View (>= 768px) */}
          <div className="hidden md:block">
            <TableWrapper className="border border-[#EADBDA]/80">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell className="w-14 text-center font-semibold text-stone-700">S/N</TableHeaderCell>
                    <TableHeaderCell className="min-w-[180px] text-left font-semibold text-stone-700">Guardian Name</TableHeaderCell>
                    <TableHeaderCell className="w-32 text-left font-semibold text-stone-700">Relationship</TableHeaderCell>
                    <TableHeaderCell className="w-40 text-left font-semibold text-stone-700">Phone Number</TableHeaderCell>
                    <TableHeaderCell className="min-w-[160px] text-left font-semibold text-stone-700">Email</TableHeaderCell>
                    <TableHeaderCell className="min-w-[200px] text-left font-semibold text-stone-700">Linked Students</TableHeaderCell>
                    <TableHeaderCell className="min-w-[180px] text-right font-semibold text-stone-700">Actions</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {guardians.map((g, index) => (
                    <TableRow key={g.id}>
                      <TableCell className="w-14 text-center text-xs font-semibold text-stone-500">
                        {index + 1}
                      </TableCell>
                      <TableCell className="min-w-[180px] font-bold text-stone-900 break-words">
                        {g.firstName} {g.lastName}
                      </TableCell>
                      <TableCell className="w-32">
                        <Badge variant="neutral" size="sm">
                          {g.relationshipType}
                        </Badge>
                      </TableCell>
                      <TableCell className="w-40 text-xs font-mono text-stone-800">
                        {g.phonePrimary}
                      </TableCell>
                      <TableCell className="min-w-[160px] text-xs text-stone-600 break-words">
                        {g.email || "—"}
                      </TableCell>
                      <TableCell className="min-w-[200px] text-xs">
                        {g.relationships && g.relationships.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {g.relationships.map((r) => (
                              <Link
                                key={r.student.id}
                                href={`/admin/students/${r.student.id}`}
                                className="text-[#800020] font-semibold hover:underline inline-block mr-1"
                              >
                                {r.student.firstName} {r.student.lastName} ({r.student.admissionNumber || "Pending"})
                              </Link>
                            ))}
                          </div>
                        ) : (
                          <span className="text-stone-400">None linked</span>
                        )}
                      </TableCell>
                      <TableCell className="min-w-[180px] text-right">
                        <div className="flex items-center justify-end gap-2">
                          {currentUser?.roles?.includes("SUPER_ADMIN") && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={impersonatingId === g.id}
                              onClick={() => handleImpersonateGuardian(g.id)}
                              className="border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 font-semibold text-xs whitespace-nowrap min-h-[36px]"
                              title="Directly impersonate this parent and open Parent Dashboard"
                            >
                              {impersonatingId === g.id ? "Loading..." : "🎭 Impersonate"}
                            </Button>
                          )}
                          <Link href={`/admin/guardians/${g.id}`}>
                            <Button variant="secondary" size="sm" className="bg-[#FDF2F4] text-[#5B0612] hover:bg-[#F9E2E6] font-semibold whitespace-nowrap min-h-[36px]">
                              View Details
                            </Button>
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableWrapper>
          </div>

          {/* Mobile Responsive Cards (< 768px) */}
          <div className="block md:hidden space-y-3">
            {guardians.map((g, index) => (
              <TableMobileCard
                key={g.id}
                title={
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-stone-100 text-stone-700 text-xs font-bold shrink-0">
                      {index + 1}
                    </span>
                    <span className="font-bold text-sm text-stone-900">
                      {g.firstName} {g.lastName}
                    </span>
                  </div>
                }
                badge={
                  <Badge variant="neutral" size="sm">
                    {g.relationshipType}
                  </Badge>
                }
                fields={[
                  { label: "Phone", value: g.phonePrimary },
                  { label: "Email", value: g.email || "—" },
                  {
                    label: "Students",
                    value: g.relationships && g.relationships.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {g.relationships.map((r) => (
                          <Link
                            key={r.student.id}
                            href={`/admin/students/${r.student.id}`}
                            className="text-[#800020] font-semibold hover:underline"
                          >
                            {r.student.firstName} {r.student.lastName}
                          </Link>
                        ))}
                      </div>
                    ) : (
                      "—"
                    ),
                  },
                ]}
                actions={
                  <div className="w-full space-y-2">
                    {currentUser?.roles?.includes("SUPER_ADMIN") && (
                      <Button
                        variant="outline"
                        size="md"
                        disabled={impersonatingId === g.id}
                        onClick={() => handleImpersonateGuardian(g.id)}
                        className="w-full border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 font-semibold min-h-[44px]"
                      >
                        {impersonatingId === g.id ? "Switching..." : "🎭 Impersonate Parent"}
                      </Button>
                    )}
                    <Link href={`/admin/guardians/${g.id}`} className="w-full block">
                      <Button
                        variant="secondary"
                        size="md"
                        className="w-full bg-[#FDF2F4] text-[#5B0612] hover:bg-[#F9E2E6] font-semibold min-h-[44px]"
                      >
                        View Details
                      </Button>
                    </Link>
                  </div>
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* Add Guardian Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => !submittingAdd && setShowAddModal(false)}
        title="Register New Guardian"
        description="Add a parent, sponsor, or legal guardian profile with optional instant portal account provisioning."
        size="lg"
      >
        <form onSubmit={handleAddGuardianSubmit} className="space-y-4">
          {addError && (
            <Alert variant="danger" title="Registration Failed">
              {addError}
            </Alert>
          )}

          {addSuccess && (
            <Alert variant="success" title="Success">
              {addSuccess}
            </Alert>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormGroup id="guardian-title" label="Title">
              <Select
                id="guardian-title"
                value={addForm.title}
                onChange={(e) => setAddForm({ ...addForm, title: e.target.value })}
              >
                <option value="">Select Title</option>
                <option value="Mr">Mr</option>
                <option value="Mrs">Mrs</option>
                <option value="Alhaji">Alhaji</option>
                <option value="Hajia">Hajia</option>
                <option value="Dr">Dr</option>
                <option value="Chief">Chief</option>
                <option value="Prof">Prof</option>
              </Select>
            </FormGroup>

            <FormGroup id="guardian-firstName" label="First Name" required>
              <Input
                id="guardian-firstName"
                required
                placeholder="e.g. Aliko"
                value={addForm.firstName}
                onChange={(e) => setAddForm({ ...addForm, firstName: e.target.value })}
              />
            </FormGroup>

            <FormGroup id="guardian-lastName" label="Last Name" required>
              <Input
                id="guardian-lastName"
                required
                placeholder="e.g. Dangote"
                value={addForm.lastName}
                onChange={(e) => setAddForm({ ...addForm, lastName: e.target.value })}
              />
            </FormGroup>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormGroup id="guardian-email" label="Email Address" helperText="Required for portal login & activation link.">
              <Input
                id="guardian-email"
                type="email"
                placeholder="e.g. parent@example.com"
                value={addForm.email}
                onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
              />
            </FormGroup>

            <FormGroup id="guardian-phone" label="Primary Phone" helperText="WhatsApp or voice line.">
              <Input
                id="guardian-phone"
                type="tel"
                placeholder="e.g. 08031234567"
                value={addForm.phonePrimary}
                onChange={(e) => setAddForm({ ...addForm, phonePrimary: e.target.value })}
              />
            </FormGroup>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormGroup id="guardian-occupation" label="Occupation">
              <Input
                id="guardian-occupation"
                placeholder="e.g. Civil Servant, Businessman"
                value={addForm.occupation}
                onChange={(e) => setAddForm({ ...addForm, occupation: e.target.value })}
              />
            </FormGroup>

            <FormGroup id="guardian-address" label="Residential Address">
              <Input
                id="guardian-address"
                placeholder="e.g. 14 Victoria Island, Lagos"
                value={addForm.residentialAddress}
                onChange={(e) => setAddForm({ ...addForm, residentialAddress: e.target.value })}
              />
            </FormGroup>
          </div>

          <div className="pt-2 border-t border-stone-100">
            <label className="flex items-start gap-2.5 text-xs text-stone-800 cursor-pointer">
              <Checkbox
                checked={provisionPortal}
                onChange={(e) => setProvisionPortal(e.target.checked)}
                disabled={!addForm.email.trim()}
              />
              <div>
                <span className="font-bold text-stone-900 block">
                  Instantly provision Parent Portal user account
                </span>
                <span className="text-stone-500 block text-[11px]">
                  Dispatches single-use cryptographic activation link to the provided email.
                </span>
              </div>
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-stone-200">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setShowAddModal(false)}
              disabled={submittingAdd}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              className="font-bold min-w-[140px]"
              disabled={submittingAdd || !addForm.firstName.trim() || !addForm.lastName.trim()}
            >
              {submittingAdd ? "Registering..." : "Register Guardian"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}


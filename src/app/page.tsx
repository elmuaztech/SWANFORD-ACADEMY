import React from "react";
import Link from "next/link";
import { SCHOOL_PROFILE } from "@/lib/constants";
import {
  Navbar,
  PageHeader,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Badge,
  Button,
  TableWrapper,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
  TableMobileCard,
  Alert,
} from "@/components";

export default function HomePage() {
  // Real-world representative data demonstrating responsive tables & long Nigerian names
  const sampleEnrollments = [
    {
      id: "SWN/2026/00142",
      name: "Fatima-Zahra Al-Hassan Abdullahi Muhammad",
      programme: "Tahfeez & Primary",
      class: "Primary 4 - Emerald",
      termFee: "₦245,000.00",
      status: "Confirmed",
      badgeVariant: "success" as const,
    },
    {
      id: "SWN/2026/00143",
      name: "Ibrahim Abubakar Sadiq Garba",
      programme: "Nursery",
      class: "Nursery 2 - Gold",
      termFee: "₦185,000.00",
      status: "Pending Verification",
      badgeVariant: "warning" as const,
    },
    {
      id: "SWN/2026/00144",
      name: "Khadijah Maryam Bello-Danbatta",
      programme: "Primary",
      class: "Primary 1 - Diamond",
      termFee: "₦210,000.00",
      status: "Confirmed",
      badgeVariant: "success" as const,
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Universal Top Navigation */}
      <Navbar
        userRole="System Administrator"
        userName="Mal. Usman Danladi"
        currentPath="/"
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Page Header */}
        <PageHeader
          title="Academy Management System"
          subtitle={`${SCHOOL_PROFILE.name} — Nursery, Primary & Tahfeez academic operations, admissions, and financial administration.`}
          badge={
            <Badge variant="brand" size="md" showDot>
              Production Active
            </Badge>
          }
          breadcrumbs={[
            { label: "Home", href: "/" },
            { label: "Operations Overview" },
          ]}
          primaryAction={
            <Link href="/admissions" className="w-full sm:w-auto">
              <Button variant="primary" size="md" className="w-full sm:w-auto">
                Admissions Portal &rarr;
              </Button>
            </Link>
          }
          secondaryAction={
            <Link href="/finance" className="w-full sm:w-auto">
              <Button variant="outline" size="md" className="w-full sm:w-auto">
                Finance Records
              </Button>
            </Link>
          }
        />

        {/* Informational Welcome Alert */}
        <div className="mb-6">
          <Alert
            variant="info"
            title="Swanford Academy Academic Session 2026/2027"
          >
            Admissions and enrollment are active for Nursery, Primary, and Tahfeez programmes.
            All monetary figures are securely maintained in accordance with financial audit standards.
          </Alert>
        </div>

        {/* Primary Metrics Grid (Mobile 1 col -> Tablet 2 col -> Desktop 4 col) */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8" aria-label="Key School Metrics">
          <Card>
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Active Programmes</span>
                <Badge variant="brand" size="sm">3 Core</Badge>
              </div>
              <p className="text-2xl font-bold text-slate-900 mt-2">Nursery &amp; Tahfeez</p>
              <p className="text-xs text-slate-500 mt-1">Primary 1–6 with Quranic Memorization</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Admissions Status</span>
                <Badge variant="success" size="sm" showDot>Open</Badge>
              </div>
              <p className="text-2xl font-bold text-slate-900 mt-2">₦5,000.00</p>
              <p className="text-xs text-slate-500 mt-1">Application form fee (isolated charge)</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Finance Engine</span>
                <Badge variant="brand" size="sm" showDot>Stage 8</Badge>
              </div>
              <p className="text-2xl font-bold text-slate-900 mt-2">Kobo Minor Units</p>
              <p className="text-xs text-slate-500 mt-1">Zero float rounding error architecture</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Security Standard</span>
                <Badge variant="brand" size="sm" showDot>Protected</Badge>
              </div>
              <p className="text-2xl font-bold text-slate-900 mt-2">Role-Based Access</p>
              <p className="text-xs text-slate-500 mt-1">Admin, Accountant, Teacher &amp; Parent Portals</p>
            </CardContent>
          </Card>
        </section>

        {/* Real-World Data Demonstration Section */}
        <section className="mb-8" aria-label="Recent Enrollment Activity">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                Recent Student Enrollments &amp; Fee Status
              </h2>
              <p className="text-xs sm:text-sm text-slate-500">
                Verified against long Nigerian names, currency formatting, and mobile responsiveness.
              </p>
            </div>
          </div>

          {/* Desktop Table View (Hidden on mobile < sm) */}
          <div className="hidden sm:block">
            <TableWrapper showScrollHint>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Registration No.</TableHeaderCell>
                    <TableHeaderCell>Student Full Name</TableHeaderCell>
                    <TableHeaderCell>Programme</TableHeaderCell>
                    <TableHeaderCell>Class Arm</TableHeaderCell>
                    <TableHeaderCell>Term Fee</TableHeaderCell>
                    <TableHeaderCell>Fee Status</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sampleEnrollments.map((student) => (
                    <TableRow key={student.id} isClickable>
                      <TableCell className="font-mono text-xs font-semibold text-slate-700">
                        {student.id}
                      </TableCell>
                      <TableCell className="font-semibold text-slate-900">
                        {student.name}
                      </TableCell>
                      <TableCell>{student.programme}</TableCell>
                      <TableCell className="text-slate-600">{student.class}</TableCell>
                      <TableCell className="font-bold text-slate-900">{student.termFee}</TableCell>
                      <TableCell>
                        <Badge variant={student.badgeVariant} size="sm" showDot>
                          {student.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableWrapper>
          </div>

          {/* Mobile Stacked Card View (Visible only on mobile < sm) */}
          <div className="sm:hidden space-y-3">
            {sampleEnrollments.map((student) => (
              <TableMobileCard
                key={student.id}
                title={student.name}
                subtitle={`Reg: ${student.id}`}
                badge={
                  <Badge variant={student.badgeVariant} size="sm" showDot>
                    {student.status}
                  </Badge>
                }
                fields={[
                  { label: "Programme", value: student.programme },
                  { label: "Class Arm", value: student.class },
                  { label: "Term Fee", value: student.termFee },
                  { label: "Status", value: student.status },
                ]}
                actions={
                  <Button variant="outline" size="sm" className="w-full">
                    View Details
                  </Button>
                }
              />
            ))}
          </div>
        </section>

        {/* Operational Guidelines & Quality Standard Summary */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Human-Readable Dignified Communication</CardTitle>
              <CardDescription>
                Principle 4: No technical jargon or database terminology is ever exposed to normal users.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-xs sm:text-sm">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-700">
                  <span className="font-semibold block mb-0.5 text-slate-600 uppercase tracking-wider text-[10px]">
                    Automated Protection Layer
                  </span>
                  <p className="text-xs text-slate-600">
                    All internal database codes, server diagnostics, and system exceptions are captured in secure server logs and never displayed to parents, teachers, or staff.
                  </p>
                </div>
                <div className="p-3 bg-emerald-50 border border-emerald-200/80 rounded-lg text-emerald-900">
                  <span className="font-semibold block mb-0.5 text-emerald-700 uppercase tracking-wider text-[10px]">
                    Mandatory Human-Readable Copy
                  </span>
                  <p className="font-medium">
                    &ldquo;An account with this email address is already registered in the academy system.&rdquo;
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Mobile-First Layout Standards</CardTitle>
              <CardDescription>
                Guaranteed layout integrity from 360px smartphones to 1920px widescreen displays.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2.5 text-xs sm:text-sm text-slate-600">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 mt-2 shrink-0" />
                  <span><strong>44px Minimum Touch Targets:</strong> Every button, select, and link conforms to mobile finger-tap ergonomics.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 mt-2 shrink-0" />
                  <span><strong>Zero Accidental Overflow:</strong> Forms and cards adapt gracefully without clipping or horizontal page breaks.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 mt-2 shrink-0" />
                  <span><strong>High-Contrast Aesthetics:</strong> Compliant with WCAG standards using dignified academic Emerald and Slate palettes.</span>
                </li>
              </ul>
            </CardContent>
            <CardFooter>
              <span className="text-xs text-slate-500">
                Audited against 360px, 390px, 430px, 768px, 1280px &amp; 1920px
              </span>
            </CardFooter>
          </Card>
        </section>
      </main>

      {/* Footer */}
      <footer className="w-full bg-white border-t border-slate-200 py-6 px-4 sm:px-6 lg:px-8 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>
            &copy; {new Date().getFullYear()} {SCHOOL_PROFILE.name}. All rights reserved.
          </p>
          <p className="italic text-slate-400">
            {SCHOOL_PROFILE.motto} &bull; {SCHOOL_PROFILE.address}
          </p>
        </div>
      </footer>
    </div>
  );
}

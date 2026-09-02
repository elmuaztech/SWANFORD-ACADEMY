import { SCHOOL_PROFILE } from "@/lib/constants";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-between p-4 sm:p-8">
      {/* Header / Brand Area */}
      <header className="max-w-4xl mx-auto w-full pt-8 pb-6 text-center sm:text-left">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 mb-4">
          <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
          Stage 1 Foundation Active
        </div>
        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-slate-900">
          {SCHOOL_PROFILE.name}
        </h1>
        <p className="text-base sm:text-lg font-medium text-emerald-700 mt-1">
          {SCHOOL_PROFILE.subtitle}
        </p>
        <p className="text-sm text-slate-600 italic mt-1">
          &ldquo;{SCHOOL_PROFILE.motto}&rdquo;
        </p>
        <p className="text-xs text-slate-500 mt-2">
          {SCHOOL_PROFILE.address}
        </p>
      </header>

      {/* Stage 1 Technical Foundation Status Cards */}
      <section className="max-w-4xl mx-auto w-full my-auto py-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900 mb-2">
            Technical Architecture &amp; System Foundation
          </h2>
          <p className="text-sm text-slate-600 mb-6">
            Stage 1 has established the foundational runtime, environment separation, database ORM tooling,
            and financial minor-units calculation engine. Business modules remain sealed pending stage-by-stage rollout.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200/80">
              <span className="text-xs font-mono uppercase tracking-wider text-slate-500">Core Runtime</span>
              <p className="font-semibold text-slate-800 mt-1">Next.js App Router (TypeScript)</p>
              <p className="text-xs text-slate-500 mt-1">Server-side authorization ready &amp; strict typing</p>
            </div>

            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200/80">
              <span className="text-xs font-mono uppercase tracking-wider text-slate-500">Database Engine</span>
              <p className="font-semibold text-slate-800 mt-1">PostgreSQL + Prisma 6</p>
              <p className="text-xs text-slate-500 mt-1">Single source of truth with singleton connection management</p>
            </div>

            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200/80">
              <span className="text-xs font-mono uppercase tracking-wider text-slate-500">Financial Groundwork</span>
              <p className="font-semibold text-slate-800 mt-1">Integer Minor Units (Kobo)</p>
              <p className="text-xs text-slate-500 mt-1">Zero floating-point rounding errors on fees &amp; balances</p>
            </div>

            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200/80">
              <span className="text-xs font-mono uppercase tracking-wider text-slate-500">Environment Discipline</span>
              <p className="font-semibold text-slate-800 mt-1">Local / Staging / Production</p>
              <p className="text-xs text-slate-500 mt-1">Isolated databases, secrets, and test credentials</p>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-500 gap-2">
            <span>Production Zero-State Policy: No synthetic mock data.</span>
            <span className="font-mono">Status: Awaiting Stage 2 Instruction</span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="max-w-4xl mx-auto w-full py-4 text-center text-xs text-slate-400 border-t border-slate-200/60">
        &copy; {new Date().getFullYear()} {SCHOOL_PROFILE.name}. All rights reserved.
      </footer>
    </main>
  );
}

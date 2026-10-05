'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SCHOOL_PROFILE } from '@/lib/constants';

export default function ChangePasswordPage() {
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!currentPassword) {
      setErrorMessage('Please enter your initial or current password.');
      return;
    }

    if (newPassword.length < 8) {
      setErrorMessage('New password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('New password and confirmation do not match.');
      return;
    }

    if (newPassword === currentPassword) {
      setErrorMessage('Your new password must be different from your initial password.');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update password.');
      }

      setSuccessMessage(data.message || 'Password changed successfully! Redirecting to your dashboard...');
      setTimeout(() => {
        router.push(data.redirectUrl || '/admin');
        router.refresh();
      }, 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to change password. Please try again.';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#FAF7F2] flex flex-col justify-between text-stone-900 font-sans">
      {/* Top Banner Navigation */}
      <header className="py-4 px-4 sm:px-8 border-b border-[#EADBDA] bg-white/90 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-[#800020] text-amber-300 font-bold flex items-center justify-center text-lg shadow-sm border border-amber-400/30 group-hover:scale-105 transition-transform">
              SA
            </div>
            <div>
              <span className="font-bold text-[#800020] text-base sm:text-lg tracking-tight block leading-tight">
                {SCHOOL_PROFILE.name}
              </span>
              <span className="text-[11px] text-stone-500 block leading-tight font-medium">
                Mandatory Security Configuration
              </span>
            </div>
          </Link>

          <Link
            href="/auth/login"
            className="text-xs font-semibold text-[#800020] hover:text-[#5B0612] transition-colors"
          >
            ← Back to Login
          </Link>
        </div>
      </header>

      {/* Main Form Container */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-[#EADBDA] p-6 sm:p-8 space-y-6">
          {/* Header & Instructions */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#FAF2F4] text-[#800020] mb-1 border border-[#EADBDA]">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <h1 className="text-2xl font-extrabold text-[#5B0612] tracking-tight">
              Change Password Required
            </h1>
            <p className="text-xs sm:text-sm text-stone-600 max-w-sm mx-auto leading-relaxed">
              For your account security, you must establish your confidential private password before accessing your school dashboard.
            </p>
          </div>

          {/* Security Banner */}
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
            <p className="font-bold flex items-center gap-1.5">
              <span>🔒</span> First-Login Security Requirement
            </p>
            <p className="text-amber-800 leading-relaxed">
              Your new password must be at least 8 characters long, contain numbers, letters, and should never be shared.
            </p>
          </div>

          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-[#FDF2F4] border border-[#EADBDA] text-xs sm:text-sm text-[#800020] flex items-start gap-2.5">
              <span className="text-base shrink-0">⚠️</span>
              <div className="flex-1 font-medium">{errorMessage}</div>
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs sm:text-sm text-emerald-900 flex items-start gap-2.5">
              <span className="text-base shrink-0">✓</span>
              <div className="flex-1 font-medium">{successMessage}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                Current / Initial Password
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter initial temporary credential"
                className="w-full px-4 py-3 rounded-xl border border-stone-200 bg-white text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#800020] focus:border-transparent transition-all placeholder:text-stone-400 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                New Private Password
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                className="w-full px-4 py-3 rounded-xl border border-stone-200 bg-white text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#800020] focus:border-transparent transition-all placeholder:text-stone-400 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                Confirm New Password
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className="w-full px-4 py-3 rounded-xl border border-stone-200 bg-white text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#800020] focus:border-transparent transition-all placeholder:text-stone-400 font-mono"
              />
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none text-stone-600">
                <input
                  type="checkbox"
                  checked={showPassword}
                  onChange={(e) => setShowPassword(e.target.checked)}
                  className="rounded border-stone-300 text-[#800020] focus:ring-[#800020]"
                />
                <span>Show passwords</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading || Boolean(successMessage)}
              className="w-full min-h-[48px] py-3.5 px-4 bg-[#800020] hover:bg-[#5B0612] text-white text-sm font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed mt-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Updating Password...</span>
                </>
              ) : (
                <span>Save New Password &amp; Proceed →</span>
              )}
            </button>
          </form>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 px-4 text-center text-xs text-stone-400 border-t border-[#EADBDA]/60 bg-white/50">
        <p>© {new Date().getFullYear()} {SCHOOL_PROFILE.name}. All institutional rights reserved.</p>
      </footer>
    </div>
  );
}

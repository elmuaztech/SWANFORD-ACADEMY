'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { SCHOOL_PROFILE } from '@/lib/constants';

function ActivateAccountContent() {
  const searchParams = useSearchParams();
  const rawToken = searchParams.get('token') || '';

  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [accountEmail, setAccountEmail] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isActivated, setIsActivated] = useState(false);

  useEffect(() => {
    if (!rawToken) {
      setValidating(false);
      setTokenValid(false);
      setValidationError('Activation token is missing. Please use the link sent to your email.');
      return;
    }

    fetch(`/api/auth/activate?token=${encodeURIComponent(rawToken)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.valid) {
          throw new Error(data.message || 'This activation link is invalid, expired, or already used.');
        }
        setTokenValid(true);
        setAccountEmail(data.email || '');
      })
      .catch((err: unknown) => {
        setTokenValid(false);
        setValidationError(err instanceof Error ? err.message : 'Invalid activation token.');
      })
      .finally(() => {
        setValidating(false);
      });
  }, [rawToken]);

  async function handleActivate(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Password confirmation does not match.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch('/api/auth/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: rawToken,
          password,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to activate account.');
      }

      setIsActivated(true);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Activation failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#FDFBF7] flex flex-col justify-between text-stone-900 font-sans">
      {/* Top Banner Navigation */}
      <header className="py-4 px-4 sm:px-8 border-b border-[#EADBDA] bg-white/90 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-3 group">
            <div className="w-10 h-10 shrink-0">
              <img
                src="/images/swanford-logo.jpg"
                alt="Swanford Academy Logo"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <span className="font-extrabold text-base sm:text-lg text-[#5B0612] tracking-tight block">
                Swanford Academy
              </span>
              <span className="text-[10px] sm:text-xs text-stone-500 block uppercase tracking-wider">
                Nursery, Primary &amp; Tahfeez
              </span>
            </div>
          </Link>

          <Link
            href="/auth/login"
            className="text-xs sm:text-sm font-semibold text-stone-600 hover:text-[#800020] transition-colors"
          >
            &larr; Sign In
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8 max-w-xl mx-auto w-full">
        <div className="w-full bg-white rounded-3xl border border-[#EADBDA] shadow-xl p-6 sm:p-10 space-y-6">
          
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-1">
              <img
                src="/images/swanford-logo.jpg"
                alt="Swanford Academy Crest"
                className="w-full h-full object-contain"
              />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#5B0612] tracking-tight">
              Activate Official Account
            </h1>
            <p className="text-xs sm:text-sm text-stone-500">
              {accountEmail ? `Setting up credentials for ${accountEmail}` : 'Establish your private password to activate your account.'}
            </p>
          </div>

          {/* Validating State */}
          {validating && (
            <div className="py-8 text-center space-y-3">
              <div className="w-8 h-8 border-3 border-[#800020] border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs font-semibold text-stone-500">Verifying secure activation token...</p>
            </div>
          )}

          {/* Invalid Token State */}
          {!validating && !tokenValid && (
            <div className="space-y-5 text-center py-4">
              <div className="p-4 rounded-2xl bg-[#FDF2F4] border border-[#EADBDA] text-xs sm:text-sm text-[#800020] leading-relaxed">
                <span className="text-xl block mb-2">⚠️</span>
                <p className="font-bold text-base mb-1">Activation Link Expired or Invalid</p>
                <p>{validationError || 'This activation token is invalid, has expired, or was already used.'}</p>
              </div>

              <div className="space-y-2 text-xs text-stone-500">
                <p>
                  To receive a new activation link, contact the school administrative office:
                </p>
                <a
                  href="https://wa.me/2348036950352?text=Hello%20Swanford%20Academy%20Support%2C%20my%20account%20activation%20link%20has%20expired."
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[#800020] font-bold hover:underline"
                >
                  Contact Administrative Support &rarr;
                </a>
              </div>
            </div>
          )}

          {/* Form State */}
          {!validating && tokenValid && !isActivated && (
            <form onSubmit={handleActivate} className="space-y-4">
              {errorMessage && (
                <div className="p-3.5 rounded-xl bg-[#FDF2F4] border border-[#EADBDA] text-xs sm:text-sm text-[#800020] flex items-start gap-2.5">
                  <span className="text-base shrink-0">⚠️</span>
                  <div className="flex-1 font-medium">{errorMessage}</div>
                </div>
              )}

              <div className="p-3 rounded-xl bg-[#FAF2F4] border border-[#EADBDA] text-xs text-stone-700">
                <p className="font-semibold text-[#800020] mb-0.5">🔒 Strict Privacy Guarantee</p>
                <p>Administrators never view or store your password. Your password is encrypted with bcrypt upon submission.</p>
              </div>

              <div>
                <label
                  htmlFor="set-password"
                  className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5"
                >
                  Create Private Password (Minimum 6 Characters)
                </label>
                <div className="relative">
                  <input
                    id="set-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 pr-12 rounded-xl border border-[#EADBDA] bg-[#FDFBF7] text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#800020] focus:bg-white transition-all min-h-[46px]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-stone-400 hover:text-stone-700 focus:outline-none cursor-pointer"
                  >
                    {showPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="confirm-activate-password"
                  className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5"
                >
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    id="confirm-activate-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    placeholder="••••••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-4 py-3 pr-12 rounded-xl border border-[#EADBDA] bg-[#FDFBF7] text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#800020] focus:bg-white transition-all min-h-[46px]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-stone-400 hover:text-stone-700 focus:outline-none cursor-pointer"
                  >
                    {showConfirmPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-bold text-sm sm:text-base bg-[#800020] hover:bg-[#5B0612] text-white shadow-md hover:shadow-lg transition-all disabled:opacity-60 cursor-pointer"
              >
                {submitting ? 'Activating Account...' : 'Activate Account & Proceed →'}
              </button>
            </form>
          )}

          {/* Success State */}
          {isActivated && (
            <div className="text-center space-y-5 py-4">
              <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-2xl border border-emerald-200">
                ✓
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-[#5B0612]">Account Activated Successfully!</h3>
                <p className="text-xs sm:text-sm text-stone-500">
                  Your private password has been established. You can now sign in to your Swanford Academy portal.
                </p>
              </div>
              <Link
                href="/auth/login"
                className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-bold text-sm sm:text-base bg-[#800020] hover:bg-[#5B0612] text-white shadow-md hover:shadow-lg transition-all"
              >
                Sign In to Portal &rarr;
              </Link>
            </div>
          )}

          {/* Assistance */}
          <div className="pt-4 border-t border-[#EADBDA] text-center space-y-2 text-xs text-stone-500">
            <p>
              Forgot password or trouble signing in?{' '}
              <a
                href="https://wa.me/2348036950352?text=Hello%20Swanford%20Academy%20Support%2C%20I%20need%20assistance%20with%20my%20portal%20account."
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#800020] font-bold hover:underline"
              >
                Contact Administrative Support
              </a>
            </p>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 px-4 text-center text-xs text-stone-500 border-t border-[#EADBDA] bg-white/50">
        &copy; {new Date().getFullYear()} {SCHOOL_PROFILE.name}. All rights reserved. &bull; Dutse, Jigawa State.
      </footer>
    </div>
  );
}

export default function ActivateAccountPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center">
          <div className="w-8 h-8 border-3 border-[#800020] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <ActivateAccountContent />
    </Suspense>
  );
}

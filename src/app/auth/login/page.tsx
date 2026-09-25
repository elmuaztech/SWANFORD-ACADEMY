'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { SCHOOL_PROFILE } from '@/lib/constants';

interface PortalOption {
  id: string;
  name: string;
  destination: string;
}

const PORTALS: PortalOption[] = [
  { id: 'admin', name: 'Admin', destination: '/admin' },
  { id: 'teacher', name: 'Teacher', destination: '/teacher' },
  { id: 'parent', name: 'Parent', destination: '/parent' },
];

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialFrom = searchParams.get('from') || '';

  const [selectedPortal, setSelectedPortal] = useState<string>(() => {
    if (initialFrom.startsWith('/teacher')) return 'teacher';
    if (initialFrom.startsWith('/parent')) return 'parent';
    if (initialFrom.startsWith('/admin')) return 'admin';
    return 'admin';
  });

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleSelectPortal(portal: PortalOption) {
    setSelectedPortal(portal.id);
    setErrorMessage(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    if (!email.trim() || !password) {
      setErrorMessage('Please enter both your authorized email address and password.');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          portal: selectedPortal || 'admin',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Invalid credentials. Please verify your email and password.');
      }

      if (data.mustChangePassword) {
        router.push('/auth/change-password');
        router.refresh();
        return;
      }

      // Server-side permissions determine the user's authoritative role and verified destination
      const userRoles: string[] = data.user?.roles || [];
      let target = data.redirectUrl || '/admin';

      if (initialFrom) {
        if (initialFrom.startsWith('/teacher') && userRoles.includes('TEACHER')) {
          target = initialFrom;
        } else if (initialFrom.startsWith('/parent') && userRoles.includes('PARENT')) {
          target = initialFrom;
        } else if (
          initialFrom.startsWith('/admin') &&
          (userRoles.includes('SUPER_ADMIN') || userRoles.includes('ADMIN') || userRoles.includes('ACCOUNTANT'))
        ) {
          target = initialFrom;
        }
      }

      router.push(target);
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to sign in. Please check your network connection.';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
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
            href="/"
            className="text-xs sm:text-sm font-semibold text-stone-600 hover:text-[#800020] transition-colors"
          >
            &larr; Back to Website
          </Link>
        </div>
      </header>

      {/* Main Login Container */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto w-full">
        <div className="w-full bg-white rounded-3xl border border-[#EADBDA] shadow-xl p-6 sm:p-10 space-y-7">
          
          {/* School Crest & Header */}
          <div className="text-center space-y-2">
            <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-2">
              <img
                src="/images/swanford-logo.jpg"
                alt="Swanford Academy Crest"
                className="w-full h-full object-contain"
              />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#5B0612] tracking-tight">
              Portal Sign In
            </h1>
            <p className="text-xs sm:text-sm text-stone-500 font-normal">
              Select your portal and enter your authorized credentials.
            </p>
          </div>

          {/* EXACTLY THREE PORTALS: Admin, Teacher, Parent */}
          <div className="space-y-2">
            <span className="block text-xs font-bold text-stone-700 uppercase tracking-wider">
              Select Portal
            </span>
            <div className="grid grid-cols-3 gap-3">
              {PORTALS.map((portal) => {
                const isSelected = selectedPortal === portal.id;
                return (
                  <button
                    key={portal.id}
                    type="button"
                    onClick={() => handleSelectPortal(portal)}
                    className={`min-h-[48px] py-2.5 px-3 rounded-xl border text-center transition-all cursor-pointer flex items-center justify-center font-bold text-sm ${
                      isSelected
                        ? 'border-[#800020] bg-[#800020] text-white shadow-xs'
                        : 'border-stone-200 bg-white hover:border-stone-400 text-stone-800'
                    }`}
                  >
                    {portal.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Human-Readable Error Notification */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-[#FDF2F4] border border-[#EADBDA] text-xs sm:text-sm text-[#800020] flex items-start gap-2.5 leading-snug">
              <span className="text-base shrink-0">⚠️</span>
              <div className="flex-1 font-medium">{errorMessage}</div>
            </div>
          )}

          {/* Standard Authentication Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5"
              >
                Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="e.g. administrator@swanfordacademy.edu.ng"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-[#EADBDA] bg-[#FDFBF7] text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#800020] focus:bg-white transition-all min-h-[46px]"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="password"
                  className="block text-xs font-bold text-stone-700 uppercase tracking-wider"
                >
                  Password
                </label>
                <Link
                  href="/auth/forgot-password"
                  className="text-xs text-[#800020] hover:underline font-semibold"
                >
                  Forgot Password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-12 rounded-xl border border-[#EADBDA] bg-[#FDFBF7] text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#800020] focus:bg-white transition-all min-h-[46px]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-stone-400 hover:text-stone-700 focus:outline-none focus:text-[#800020] cursor-pointer"
                >
                  {showPassword ? (
                    // Eye-off icon
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.75}
                      stroke="currentColor"
                      className="w-5 h-5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
                      />
                    </svg>
                  ) : (
                    // Eye icon
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.75}
                      stroke="currentColor"
                      className="w-5 h-5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Sign In Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-bold text-sm sm:text-base bg-[#800020] hover:bg-[#5B0612] text-white shadow-md hover:shadow-lg transition-all disabled:opacity-60 cursor-pointer"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Signing in...</span>
                  </>
                ) : (
                  <span>Sign In to Portal &rarr;</span>
                )}
              </button>
            </div>
          </form>

          {/* Assistance Links */}
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
            <p>
              Prospective parent?{' '}
              <Link href="/admissions" className="text-[#800020] font-bold hover:underline">
                Apply for Admission Online
              </Link>
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

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center">
          <div className="w-8 h-8 border-3 border-[#800020] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}

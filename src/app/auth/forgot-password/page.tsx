'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SCHOOL_PROFILE } from '@/lib/constants';

type FlowStep = 'REQUEST_OTP' | 'VERIFY_OTP' | 'SET_PASSWORD' | 'SUCCESS';

export default function ForgotPasswordPage() {
  const router = useRouter();

  const [step, setStep] = useState<FlowStep>('REQUEST_OTP');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [resetTicket, setResetTicket] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // 2-minute (120 seconds) OTP countdown
  const [secondsRemaining, setSecondsRemaining] = useState(120);
  const [isTimerActive, setIsTimerActive] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isTimerActive && secondsRemaining > 0) {
      interval = setInterval(() => {
        setSecondsRemaining((prev) => prev - 1);
      }, 1000);
    } else if (secondsRemaining === 0) {
      setIsTimerActive(false);
    }
    return () => clearInterval(interval);
  }, [isTimerActive, secondsRemaining]);

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // Step 1: Request OTP
  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setErrorMessage('Please enter your account email address.');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch('/api/auth/forgot-password/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send verification code.');
      }

      setInfoMessage(data.message || 'If an account exists, a 6-digit code has been sent.');
      setStep('VERIFY_OTP');
      setSecondsRemaining(300); // 5 minutes
      setIsTimerActive(true);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to request code.');
    } finally {
      setLoading(false);
    }
  }

  // Step 2: Verify OTP
  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    const cleanOtp = otp.trim();
    if (!/^\d{6}$/.test(cleanOtp)) {
      setErrorMessage('Please enter the exact 6-digit verification code.');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch('/api/auth/forgot-password/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          otp: cleanOtp,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Invalid or expired verification code.');
      }

      setResetTicket(data.resetTicket);
      setStep('SET_PASSWORD');
      setIsTimerActive(false);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setLoading(false);
    }
  }

  // Step 3: Set New Password
  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    if (newPassword.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('Password confirmation does not match.');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch('/api/auth/forgot-password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          resetTicket,
          newPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update password.');
      }

      setStep('SUCCESS');
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Password reset failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#FAF7F2] flex flex-col justify-between text-stone-900 font-sans">
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
            &larr; Back to Sign In
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
              {step === 'REQUEST_OTP' && 'Reset Portal Password'}
              {step === 'VERIFY_OTP' && 'Enter Verification Code'}
              {step === 'SET_PASSWORD' && 'Set New Password'}
              {step === 'SUCCESS' && 'Password Updated'}
            </h1>
            <p className="text-xs sm:text-sm text-stone-500">
              {step === 'REQUEST_OTP' && 'Enter your registered email to receive a secure 6-digit code.'}
              {step === 'VERIFY_OTP' && `Please enter the 6-digit code sent to ${email}.`}
              {step === 'SET_PASSWORD' && 'Create your new private password (minimum 6 characters).'}
              {step === 'SUCCESS' && 'Your account password has been successfully reset.'}
            </p>
          </div>

          {/* Messages */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-[#FDF2F4] border border-[#EADBDA] text-xs sm:text-sm text-[#800020] flex items-start gap-2.5">
              <span className="text-base shrink-0">⚠️</span>
              <div className="flex-1 font-medium">{errorMessage}</div>
            </div>
          )}
          {infoMessage && step === 'VERIFY_OTP' && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs sm:text-sm text-emerald-800 flex items-start gap-2.5">
              <span className="text-base shrink-0">✉️</span>
              <div className="flex-1 font-medium">{infoMessage}</div>
            </div>
          )}

          {/* STEP 1: REQUEST OTP */}
          {step === 'REQUEST_OTP' && (
            <form onSubmit={handleRequestOtp} className="space-y-4">
              <div>
                <label
                  htmlFor="reset-email"
                  className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5"
                >
                  Registered Email Address
                </label>
                <input
                  id="reset-email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="e.g. parent@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-[#EADBDA] bg-[#FDFBF7] text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#800020] focus:bg-white transition-all min-h-[46px]"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-bold text-sm sm:text-base bg-[#800020] hover:bg-[#5B0612] text-white shadow-md hover:shadow-lg transition-all disabled:opacity-60 cursor-pointer"
              >
                {loading ? 'Sending Verification Code...' : 'Send 6-Digit Code →'}
              </button>
            </form>
          )}

          {/* STEP 2: VERIFY 6-DIGIT OTP */}
          {step === 'VERIFY_OTP' && (
            <form onSubmit={handleVerifyOtp} className="space-y-5">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="otp-code"
                    className="block text-xs font-bold text-stone-700 uppercase tracking-wider"
                  >
                    6-Digit Verification Code
                  </label>
                  <span className="text-xs font-semibold text-stone-500">
                    Expires in:{' '}
                    <span className={secondsRemaining < 60 ? 'text-[#800020] font-bold' : 'text-stone-800'}>
                      {formatTime(secondsRemaining)}
                    </span>
                  </span>
                </div>
                <input
                  id="otp-code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  required
                  autoFocus
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => {
                    const clean = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setOtp(clean);
                  }}
                  className="w-full text-center text-3xl font-mono tracking-[0.5em] px-4 py-3 rounded-xl border border-[#EADBDA] bg-[#FDFBF7] text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#800020] focus:bg-white transition-all min-h-[52px]"
                />
                <p className="text-[11px] text-stone-400 mt-1 text-center">
                  Format: Exactly 6 digits (e.g. 042718). Leading zeros are preserved.
                </p>
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={handleRequestOtp}
                  disabled={loading || secondsRemaining > 90}
                  className="text-xs text-[#800020] hover:underline font-semibold disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  Resend Code {secondsRemaining > 90 ? `(${secondsRemaining - 90}s)` : ''}
                </button>
                <button
                  type="button"
                  onClick={() => setStep('REQUEST_OTP')}
                  className="text-xs text-stone-500 hover:text-stone-800"
                >
                  Change Email
                </button>
              </div>

              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-bold text-sm sm:text-base bg-[#800020] hover:bg-[#5B0612] text-white shadow-md hover:shadow-lg transition-all disabled:opacity-60 cursor-pointer"
              >
                {loading ? 'Verifying Code...' : 'Verify Code & Continue →'}
              </button>
            </form>
          )}

          {/* STEP 3: SET NEW PASSWORD */}
          {step === 'SET_PASSWORD' && (
            <form onSubmit={handleSetPassword} className="space-y-4">
              <div>
                <label
                  htmlFor="new-password"
                  className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5"
                >
                  New Password (Minimum 6 Characters)
                </label>
                <div className="relative">
                  <input
                    id="new-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    placeholder="••••••••••••"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
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
                  htmlFor="confirm-password"
                  className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5"
                >
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    id="confirm-password"
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
                disabled={loading}
                className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-bold text-sm sm:text-base bg-[#800020] hover:bg-[#5B0612] text-white shadow-md hover:shadow-lg transition-all disabled:opacity-60 cursor-pointer"
              >
                {loading ? 'Updating Password...' : 'Save New Password & Sign In →'}
              </button>
            </form>
          )}

          {/* STEP 4: SUCCESS */}
          {step === 'SUCCESS' && (
            <div className="text-center space-y-5 py-4">
              <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-2xl border border-emerald-200">
                ✓
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-[#5B0612]">Password Changed Successfully</h3>
                <p className="text-xs sm:text-sm text-stone-500">
                  Your password has been updated. All previous sessions have been logged out for security.
                </p>
              </div>
              <Link
                href="/auth/login"
                className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-bold text-sm sm:text-base bg-[#800020] hover:bg-[#5B0612] text-white shadow-md hover:shadow-lg transition-all"
              >
                Sign In With New Password &rarr;
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

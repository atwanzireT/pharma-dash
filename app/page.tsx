// app/login/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import app from '@/firebase';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
} from 'firebase/auth';
import { Mail, Lock, Eye, EyeOff, Loader2, Shield } from 'lucide-react';

export default function LoginPage() {
  const auth = getAuth(app);
  const router = useRouter();
  const params = useSearchParams();

  const [mounted, setMounted] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect if already signed in
  useEffect(() => {
    setMounted(true);
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) {
        const next = params.get('next') || '/dashboard';
        router.replace(next);
      }
    });
    return () => unsub();
  }, [auth, router, params]);

  const canSubmit = useMemo(() => {
    const emailOk = /\S+@\S+\.\S+/.test(email.trim());
    return emailOk && password.length >= 1 && !submitting;
  }, [email, password, submitting]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      setSubmitting(true);
      await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
      await signInWithEmailAndPassword(auth, email.trim(), password);
      // onAuthStateChanged will redirect
    } catch (err: any) {
      let msg = 'Failed to sign in.';
      if (err?.code === 'auth/user-not-found') msg = 'Account not found.';
      else if (err?.code === 'auth/wrong-password') msg = 'Wrong password.';
      else if (err?.code === 'auth/invalid-email') msg = 'Invalid email.';
      else if (err?.message) msg = err.message;
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleForgot() {
    setError(null);
    try {
      const targetEmail = email.trim();
      if (!/\S+@\S+\.\S+/.test(targetEmail)) {
        setError('Enter your email first.');
        return;
      }
      await sendPasswordResetEmail(auth, targetEmail);
      setError(`Password reset link sent to ${targetEmail}.`);
    } catch (err: any) {
      setError(err?.message ?? 'Could not send reset email.');
    }
  }

  if (!mounted) return null;

  return (
    <main className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-2 justify-center">
          <Shield className="h-8 w-8 text-blue-600 dark:text-blue-400" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Sign in</h1>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm"
        >
          {/* Email */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-800 dark:text-gray-200">
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="pl-10 pr-4 py-2.5 w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white/60 dark:bg-gray-900/60 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400"
                required
                autoComplete="username"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-800 dark:text-gray-200">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="pl-10 pr-10 py-2.5 w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white/60 dark:bg-gray-900/60 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400"
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label={showPw ? 'Hide password' : 'Show password'}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Options */}
          <div className="flex items-center justify-between">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-4 w-4"
              />
              <span className="text-gray-700 dark:text-gray-200">Remember me</span>
            </label>

            <button
              type="button"
              onClick={handleForgot}
              className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
            >
              Forgot password?
            </button>
          </div>

          {/* Errors / info */}
          {error && (
            <div className="rounded-lg border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-900/20 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2.5 text-sm shadow-sm"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Sign in
          </button>
        </form>

        {/* Footer links */}
        <div className="mt-6 text-xs text-gray-500 dark:text-gray-400 text-center">
          Don’t have an account?{' '}
          <Link
            href="/user-manager/new"
            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
          >
            Create a drug shop
          </Link>
        </div>
      </div>
    </main>
  );
}

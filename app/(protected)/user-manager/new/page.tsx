// app/user-manager/new/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getDatabase, ref, set } from 'firebase/database';
import { createUserWithEmailAndPassword, getAuth } from 'firebase/auth';
import { database } from '@/firebase';
import { Check, Loader2, Users, Building } from 'lucide-react';
import Navbar from '@/components/Navbar';

type FormState = {
  phone: string;
  name: string;
  email: string;
  password: string;
};

type UserType = 'drugshop' | 'main';

// Normalize to E.164 Uganda (+2567XXXXXXXX)
function toE164UG(raw: string): string | null {
  const p = raw.replace(/\s+/g, '');
  if (/^0[7-9]\d{8}$/.test(p)) return `+256${p.slice(1)}`;
  if (/^\+256[7-9]\d{8}$/.test(p)) return p;
  if (/^256[7-9]\d{8}$/.test(p)) return `+${p}`;
  return null;
}

// Use a managed email derived from phone for drugshop users
const emailFromPhone = (e164: string) =>
  `${e164.replace(/[^\d]/g, '')}@inspections.local`;

export default function NewUserPage() {
  const [meUid, setMeUid] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [successUid, setSuccessUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userType, setUserType] = useState<UserType>('drugshop');
  const [form, setForm] = useState<FormState>({
    phone: '',
    name: '',
    email: '',
    password: '',
  });

  // Get current user's UID
  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        setMeUid(user.uid);
      } else {
        setMeUid(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // Reset form when user type changes
  useEffect(() => {
    setForm({
      phone: '',
      name: '',
      email: '',
      password: '',
    });
    setError(null);
    setSuccessUid(null);
  }, [userType]);

  const disabled = useMemo(() => {
    if (!meUid) return true;

    if (userType === 'drugshop') {
      const phoneOk = !!toE164UG(form.phone);
      const passOk = form.password.length >= 8;
      const nameOk = form.name.trim().length >= 2;
      return !(phoneOk && passOk && nameOk) || submitting;
    } else {
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);
      const passOk = form.password.length >= 8;
      const nameOk = form.name.trim().length >= 2;
      return !(emailOk && passOk && nameOk) || submitting;
    }
  }, [meUid, form, submitting, userType]);

  const onChange =
    (k: keyof FormState) =>
      (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((s) => ({ ...s, [k]: e.target.value }));

  const createDrugshopUser = async () => {
    const auth = getAuth();
    const e164Phone = toE164UG(form.phone);

    if (!e164Phone) {
      throw new Error('Invalid phone number format');
    }

    const email = emailFromPhone(e164Phone);

    // Create user in Firebase Auth
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      form.password
    );

    const newUserUid = userCredential.user.uid;

    // Store user profile in Realtime Database
    await set(ref(database, 'users/' + newUserUid), {
      name: form.name.trim(),
      phone: e164Phone,
      type: 'drugshop',
      createdAt: Date.now(),
      createdBy: meUid,
    });

    // Store in drugshops collection
    await set(ref(database, 'drugshops/' + newUserUid), {
      name: form.name.trim(),
      phone: e164Phone,
      createdAt: Date.now(),
      createdBy: meUid,
    });

    return newUserUid;
  };

  const createMainUser = async () => {
    const auth = getAuth();

    // Create user in Firebase Auth
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      form.email,
      form.password
    );

    const newUserUid = userCredential.user.uid;

    // Store user profile in Realtime Database
    await set(ref(database, 'users/' + newUserUid), {
      name: form.name.trim(),
      email: form.email,
      type: 'main',
      createdAt: Date.now(),
      createdBy: meUid,
    });

    return newUserUid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccessUid(null);

    try {
      let newUserUid: string;

      if (userType === 'drugshop') {
        newUserUid = await createDrugshopUser();
      } else {
        newUserUid = await createMainUser();
      }

      setSuccessUid(newUserUid);

      // Reset form
      setForm({
        phone: '',
        name: '',
        email: '',
        password: '',
      });

      console.log('User created successfully with UID:', newUserUid);
    } catch (err: any) {
      console.error('Error creating user:', err);

      // Handle specific Firebase Auth errors
      if (err.code === 'auth/email-already-in-use') {
        setError('A user with this email/phone already exists.');
      } else if (err.code === 'auth/weak-password') {
        setError('Password is too weak. Please choose a stronger password.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Invalid email format.');
      } else {
        setError(err.message || 'Failed to create user. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <main className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Create User</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Create either Drugshop Users (phone-based) or Main Users (email-based) with Firebase Auth.
          </p>
        </div>

        {/* User Type Selector */}
        <div className="mb-6">
          <label className="mb-2 block text-sm font-medium text-gray-800 dark:text-gray-200">
            User Type
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setUserType('drugshop')}
              className={`flex items-center justify-center gap-2 rounded-xl border p-4 text-sm font-medium transition-colors ${userType === 'drugshop'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                  : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-750'
                }`}
            >
              <Building className="h-5 w-5" />
              Drugshop User
            </button>
            <button
              type="button"
              onClick={() => setUserType('main')}
              className={`flex items-center justify-center gap-2 rounded-xl border p-4 text-sm font-medium transition-colors ${userType === 'main'
                  ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                  : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-750'
                }`}
            >
              <Users className="h-5 w-5" />
              Main User / Field Officers
            </button>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm"
        >
          {/* Name Field - Common to both */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-800 dark:text-gray-200">
              {userType === 'drugshop' ? 'Drugshop Name' : 'Full Name'}
            </label>
            <input
              type="text"
              value={form.name}
              onChange={onChange('name')}
              placeholder={
                userType === 'drugshop'
                  ? 'e.g., God Cares Drugshop'
                  : 'e.g., John Doe'
              }
              className="block w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white/60 dark:bg-gray-900/60 px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400"
              required
            />
          </div>

          {/* Phone Field - Drugshop only */}
          {userType === 'drugshop' && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-800 dark:text-gray-200">
                Phone (Uganda)
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={onChange('phone')}
                placeholder="+2567XXXXXXXX or 07XXXXXXXX"
                className="block w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white/60 dark:bg-gray-900/60 px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400"
                required
                inputMode="tel"
              />
              <p className="mt-1 text-xs text-gray-500">
                We'll provision login using a managed email derived from this phone.
              </p>
            </div>
          )}

          {/* Email Field - Main users only */}
          {userType === 'main' && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-800 dark:text-gray-200">
                Email Address
              </label>
              <input
                type="email"
                value={form.email}
                onChange={onChange('email')}
                placeholder="user@example.com"
                className="block w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white/60 dark:bg-gray-900/60 px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400"
                required
              />
            </div>
          )}

          {/* Password Field - Common to both */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-800 dark:text-gray-200">
              Password
            </label>
            <input
              type="password"
              value={form.password}
              onChange={onChange('password')}
              placeholder="Min 8 characters"
              className="block w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white/60 dark:bg-gray-900/60 px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-900/20 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}

          {successUid && (
            <div className="flex items-center gap-2 rounded-lg border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20 px-3 py-2 text-sm text-green-800 dark:text-green-300">
              <Check className="h-4 w-4" />
              {userType === 'drugshop' ? 'Drugshop' : 'Main'} user created successfully.
              UID: <span className="font-mono">{successUid}</span>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={disabled}
              className={`inline-flex items-center gap-2 rounded-xl text-white px-4 py-2 text-sm shadow-sm ${userType === 'drugshop'
                  ? 'bg-blue-600 hover:bg-blue-700 disabled:opacity-60'
                  : 'bg-green-600 hover:bg-green-700 disabled:opacity-60'
                }`}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Create {userType === 'drugshop' ? 'Drugshop' : 'Main'} User
            </button>

            <Link
              href="/user-manager"
              className="inline-flex items-center rounded-xl border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Back to Users
            </Link>
          </div>
        </form>

        <div className="mt-6 text-xs text-gray-500 dark:text-gray-400">
          {userType === 'drugshop' ? (
            <>
              Drugshop users use phone-derived emails for login. Profiles live in both
              <code className="mx-1">/users/&lt;uid&gt;</code> and
              <code className="mx-1">/drugshops/&lt;uid&gt;</code>.
            </>
          ) : (
            <>
              Main users use email/password authentication. Profiles live in
              <code className="mx-1">/users/&lt;uid&gt;</code>.
            </>
          )}
        </div>
      </main>
    </div>
  );
}
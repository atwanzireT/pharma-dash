// app/user-manager/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getDatabase, ref, onValue, off, update } from 'firebase/database';
import { database } from '@/firebase';
import {
  Plus, Search, Users, Building, Mail, Phone, Calendar,
  Edit, Trash2, X, Loader2
} from 'lucide-react';

type User = {
  uid: string;
  name: string;
  email?: string;
  phone?: string;
  type: 'drugshop' | 'main';
  createdAt: number;
  createdBy?: string;
};

type EditForm = {
  name: string;
  email?: string;
  phone?: string;
};

function toE164UG(raw: string): string | null {
  const p = (raw || '').replace(/\s+/g, '');
  if (!p) return null;
  if (/^0[7-9]\d{8}$/.test(p)) return `+256${p.slice(1)}`;
  if (/^\+256[7-9]\d{8}$/.test(p)) return p;
  if (/^256[7-9]\d{8}$/.test(p)) return `+${p}`;
  return null;
}

const formatDate = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

const formatPhone = (phone?: string) => {
  if (!phone) return 'N/A';
  const clean = phone.replace(/\D/g, '');
  if (clean.startsWith('256') && clean.length === 12) {
    return `0${clean.slice(3)}`.replace(/(\d{4})(\d{3})(\d{3})/, '$1 $2 $3');
  }
  if (clean.length === 10 && clean.startsWith('0')) {
    return clean.replace(/(\d{4})(\d{3})(\d{3})/, '$1 $2 $3');
  }
  return phone;
};

export default function UserManagerPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'drugshop' | 'main'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit modal state
  const [editing, setEditing] = useState<User | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ name: '', email: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Fetch users from Realtime Database
  useEffect(() => {
    const db = getDatabase();
    const usersRef = ref(db, 'users');

    const handleData = (snapshot: any) => {
      try {
        const usersData = snapshot.val();
        if (usersData) {
          const usersList: User[] = Object.entries(usersData).map(([uid, userData]: [string, any]) => ({
            uid,
            ...userData
          }));
          setUsers(usersList);
          setFilteredUsers(usersList);
        } else {
          setUsers([]);
          setFilteredUsers([]);
        }
        setLoading(false);
      } catch (err) {
        console.error('Error processing users data:', err);
        setError('Failed to process users data');
        setLoading(false);
      }
    };

    const handleError = (err: any) => {
      console.error('Error fetching users:', err);
      setError('Failed to load users');
      setLoading(false);
    };

    onValue(usersRef, handleData, handleError);
    return () => off(usersRef, 'value', handleData);
  }, []);

  // Filter users based on search term and type
  useEffect(() => {
    let filtered = users;

    if (filterType !== 'all') {
      filtered = filtered.filter((u) => u.type === filterType);
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((u) =>
        u.name.toLowerCase().includes(term) ||
        u.email?.toLowerCase().includes(term) ||
        u.phone?.includes(term)
      );
    }

    setFilteredUsers(filtered);
  }, [users, searchTerm, filterType]);

  const counts = useMemo(() => {
    const total = users.length;
    const drugshop = users.filter((u) => u.type === 'drugshop').length;
    const main = users.filter((u) => u.type === 'main').length;
    return { total, drugshop, main };
  }, [users]);

  // Open modal and seed form
  const openEdit = (u: User) => {
    setEditing(u);
    setSaveError(null);
    setSaving(false);
    setEditForm({
      name: u.name || '',
      email: u.email || '',
      phone: u.phone || '',
    });
  };

  const closeEdit = () => {
    setEditing(null);
    setSaveError(null);
    setSaving(false);
  };

  const onEditChange =
    (k: keyof EditForm) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setEditForm((s) => ({ ...s, [k]: e.target.value }));

  // Save handler
  const saveUser = async () => {
    if (!editing) return;
    setSaving(true);
    setSaveError(null);

    try {
      const updates: Record<string, any> = {};

      // Always update /users/{uid}
      updates[`users/${editing.uid}/name`] = editForm.name.trim();

      if (editing.type === 'main') {
        // Validate email
        const email = (editForm.email || '').trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          throw new Error('Please enter a valid email for main users.');
        }
        updates[`users/${editing.uid}/email`] = email;
        // Remove phone if accidentally present in form
        updates[`users/${editing.uid}/phone`] = null;
      } else {
        // drugshop: validate phone
        const e164 = toE164UG(editForm.phone || '');
        if (!e164) {
          throw new Error('Please enter a valid Uganda phone (e.g., +2567XXXXXXXX or 07XXXXXXXX).');
        }
        updates[`users/${editing.uid}/phone`] = e164;
        // Reflect drugshop registry
        updates[`drugshops/${editing.uid}/name`] = editForm.name.trim();
        updates[`drugshops/${editing.uid}/phone`] = e164;
        // Remove email if present
        updates[`users/${editing.uid}/email`] = null;
      }

      await update(ref(database), updates);
      closeEdit();
    } catch (e: any) {
      console.error(e);
      setSaveError(e?.message || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">User Management</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Manage all users in the system - both drugshop inspectors and main platform users.
          </p>
        </div>
        <Link
          href="/user-manager/new"
          className="mt-4 sm:mt-0 inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 text-sm font-medium shadow-sm transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create New User
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-100 dark:bg-blue-900/20 p-3">
              <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Users</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{counts.total}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-green-100 dark:bg-green-900/20 p-3">
              <Building className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Drugshop Users</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{counts.drugshop}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-purple-100 dark:bg-purple-900/20 p-3">
              <Users className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Main Users</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{counts.main}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="mb-6 space-y-4 sm:space-y-0 sm:flex sm:items-center sm:justify-between">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Type Filter */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Filter by type:</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
            >
              <option value="all">All Users</option>
              <option value="drugshop">Drugshop Only</option>
              <option value="main">Main Only</option>
            </select>
          </div>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 pl-10 pr-4 py-2.5 text-sm placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
          />
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 rounded-lg border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-900/20 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {/* Users Table */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
        {filteredUsers.length === 0 ? (
          <div className="text-center py-12">
            <Users className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-4 text-sm font-medium text-gray-900 dark:text-white">No users found</h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {users.length === 0 ? 'Get started by creating your first user.' : 'No users match your search criteria.'}
            </p>
            {users.length === 0 && (
              <Link
                href="/user-manager/new"
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-medium"
              >
                <Plus className="h-4 w-4" />
                Create New User
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800">
                  <th className="text-left py-4 px-6 text-sm font-medium text-gray-700 dark:text-gray-300">User</th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-gray-700 dark:text-gray-300">Contact</th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-gray-700 dark:text-gray-300">Type</th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-gray-700 dark:text-gray-300">Created</th>
                  <th className="text-right py-4 px-6 text-sm font-medium text-gray-700 dark:text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {filteredUsers.map((u) => (
                  <tr key={u.uid} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
                            u.type === 'drugshop'
                              ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                              : 'bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400'
                          }`}
                        >
                          {u.type === 'drugshop' ? <Building className="h-5 w-5" /> : <Users className="h-5 w-5" />}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900 dark:text-white">{u.name}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">UID: {u.uid.slice(0, 8)}...</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="space-y-1">
                        {u.email && (
                          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                            <Mail className="h-4 w-4" />
                            {u.email}
                          </div>
                        )}
                        {u.phone && (
                          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                            <Phone className="h-4 w-4" />
                            {formatPhone(u.phone)}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          u.type === 'drugshop'
                            ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                            : 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                        }`}
                      >
                        {u.type === 'drugshop' ? (
                          <>
                            <Building className="h-3 w-3" />
                            Drugshop
                          </>
                        ) : (
                          <>
                            <Users className="h-3 w-3" />
                            Main User
                          </>
                        )}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <Calendar className="h-4 w-4" />
                        {formatDate(u.createdAt)}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openEdit(u)}
                          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                          <Edit className="h-4 w-4" />
                          Edit
                        </button>
                        <button
                          onClick={() => console.log('Delete user:', u.uid)}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-300 dark:border-rose-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer Stats */}
      <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
        Showing {filteredUsers.length} of {users.length} users
        {filterType !== 'all' && ` • Filtered by: ${filterType}`}
        {searchTerm && ` • Searching: "${searchTerm}"`}
      </div>

      {/* EDIT MODAL */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          aria-modal="true"
          role="dialog"
          onClick={(e) => {
            // close when clicking backdrop
            if (e.target === e.currentTarget) closeEdit();
          }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" />

          {/* Modal card */}
          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                Edit {editing.type === 'drugshop' ? 'Drugshop' : 'Main'} User
              </h3>
              <button
                onClick={closeEdit}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label="Close"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-800 dark:text-gray-200 mb-1.5">
                  {editing.type === 'drugshop' ? 'Drugshop Name' : 'Full Name'}
                </label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={onEditChange('name')}
                  placeholder={editing.type === 'drugshop' ? 'e.g., God Cares Drugshop' : 'e.g., Jane Doe'}
                  className="block w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white/60 dark:bg-gray-900/60 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400"
                />
              </div>

              {/* Contact (conditional) */}
              {editing.type === 'main' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-800 dark:text-gray-200 mb-1.5">Email</label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={onEditChange('email')}
                    placeholder="user@example.com"
                    className="block w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white/60 dark:bg-gray-900/60 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-800 dark:text-gray-200 mb-1.5">
                    Phone (Uganda)
                  </label>
                  <input
                    type="tel"
                    value={editForm.phone}
                    onChange={onEditChange('phone')}
                    placeholder="+2567XXXXXXXX or 07XXXXXXXX"
                    className="block w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white/60 dark:bg-gray-900/60 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Saved in both <code className="px-1">/users</code> and <code className="px-1">/drugshops</code>.
                  </p>
                </div>
              )}

              {saveError && (
                <div className="rounded-lg border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-900/20 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
                  {saveError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between px-5 py-4 border-t border-gray-200 dark:border-gray-800">
              <button
                onClick={closeEdit}
                className="inline-flex items-center rounded-xl border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={saveUser}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 text-sm shadow-sm"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

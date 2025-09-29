// app/inspections/page.tsx
'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  getDatabase,
  ref,
  query,
  orderByChild,
  limitToLast,
  onValue,
  DataSnapshot,
} from 'firebase/database';
import { database as dbFromAlias } from '@/firebase';
import { Plus, RefreshCw, X, ShieldCheck } from 'lucide-react';

type Inspection = {
  id: string;
  serialNumber: string;
  drugshopName: string;
  date: string;               // ISO string
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | string;
  createdBy?: string;
  createdAt?: number;         // ms timestamp
  location?: string | { coordinates?: any; formattedAddress?: string };
  clientTelephone?: string;
  boxesImpounded?: string | number;
  impoundedBy?: string;
  releasedAt?: number;
};

const STATUS_STYLES: Record<
  string,
  { bg: string; text: string; ring: string }
> = {
  draft: {
    bg: 'bg-gray-100 dark:bg-gray-800',
    text: 'text-gray-800 dark:text-gray-100',
    ring: 'ring-gray-200 dark:ring-gray-700',
  },
  submitted: {
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    text: 'text-blue-800 dark:text-blue-200',
    ring: 'ring-blue-200 dark:ring-blue-800/50',
  },
  approved: {
    bg: 'bg-green-100 dark:bg-green-900/30',
    text: 'text-green-800 dark:text-green-200',
    ring: 'ring-green-200 dark:ring-green-800/50',
  },
  rejected: {
    bg: 'bg-rose-100 dark:bg-rose-900/30',
    text: 'text-rose-800 dark:text-rose-200',
    ring: 'ring-rose-200 dark:ring-rose-800/50',
  },
};

function StatusBadge({ value }: { value: string }) {
  const style = STATUS_STYLES[value] ?? STATUS_STYLES['draft'];
  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1',
        style.bg,
        style.text,
        style.ring,
      ].join(' ')}
    >
      {value}
    </span>
  );
}

function formatDate(iso?: string | number) {
  try {
    const d = typeof iso === 'number' ? new Date(iso) : new Date(iso ?? '');
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return '—';
  }
}

function parseNum(n: unknown) {
  if (typeof n === 'number') return n;
  if (typeof n === 'string') {
    const x = Number(n);
    return Number.isFinite(x) ? x : 0;
  }
  return 0;
}

export default function InspectionsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Inspection['status']>('all');
  const [refreshing, setRefreshing] = useState(false);

  // Modal state
  const [openId, setOpenId] = useState<string | null>(null);
  const openRow = useMemo(
    () => inspections.find((x) => x.id === openId) || null,
    [openId, inspections]
  );

  // ESC to close modal
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenId(null);
    }
    if (openId) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openId]);

  useEffect(() => {
    const db = dbFromAlias ?? getDatabase();
    const q = query(ref(db, 'inspections'), orderByChild('createdAt'), limitToLast(500));

    const unsub = onValue(
      q,
      (snap: DataSnapshot) => {
        const val = snap.val() as Record<string, any> | null;
        const list: Inspection[] = val
          ? Object.entries(val).map(([id, v]) => ({ id, ...v }))
          : [];
        list.sort((a, b) => {
          const aT = a.createdAt ?? new Date(a.date ?? 0).getTime();
          const bT = b.createdAt ?? new Date(b.date ?? 0).getTime();
          return bT - aT;
        });
        setInspections(list);
        setLoading(false);
      },
      () => setLoading(false)
    );

    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return inspections.filter((i) => {
      const matchesSearch =
        !s ||
        i.serialNumber?.toLowerCase().includes(s) ||
        i.drugshopName?.toLowerCase().includes(s) ||
        i.createdBy?.toLowerCase().includes(s);
      const matchesStatus =
        statusFilter === 'all' ? true : (i.status || 'draft') === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [inspections, search, statusFilter]);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  };

  const openModal = useCallback((id: string) => setOpenId(id), []);
  const closeModal = useCallback(() => setOpenId(null), []);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Inspections
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Live list of submitted and draft inspections.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
            aria-label="Refresh"
            title="Refresh"
          >
            <RefreshCw className={['h-4 w-4', refreshing ? 'animate-spin' : ''].join(' ')} />
            Refresh
          </button>

          <Link
            href="/inspections/new"
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm shadow-sm"
          >
            <Plus className="h-4 w-4" />
            New Inspection
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="col-span-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by Serial, Drugshop, or Created By…"
            className="block w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white/60 dark:bg-gray-900/60 px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400"
          />
        </div>

        <div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="block w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white/60 dark:bg-gray-900/60 px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400"
          >
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="submitted">Submitted</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {/* Table / List */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800/60 text-gray-600 dark:text-gray-300">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Serial</th>
                <th className="px-4 py-3 text-left font-semibold">Drugshop</th>
                <th className="px-4 py-3 text-left font-semibold">Date</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-left font-semibold">Created By</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={`sk-${i}`} className="animate-pulse">
                    <td className="px-4 py-3"><div className="h-4 w-24 bg-gray-200 dark:bg-gray-800 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-40 bg-gray-200 dark:bg-gray-800 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-32 bg-gray-200 dark:bg-gray-800 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-20 bg-gray-200 dark:bg-gray-800 rounded-full" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-28 bg-gray-200 dark:bg-gray-800 rounded" /></td>
                    <td className="px-4 py-3 text-right"><div className="h-9 w-24 bg-gray-200 dark:bg-gray-800 rounded-xl ml-auto" /></td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-gray-600 dark:text-gray-400">
                    No inspections found.
                  </td>
                </tr>
              ) : (
                filtered.map((i) => (
                  <tr key={i.id} className="hover:bg-gray-50/60 dark:hover:bg-gray-800/40">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                      {i.serialNumber || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      {i.drugshopName || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      {i.date ? formatDate(i.date) : i.createdAt ? formatDate(i.createdAt) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge value={(i.status || 'draft').toString()} />
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      {i.createdBy || '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openModal(i.id)}
                        className="inline-flex items-center rounded-xl border border-gray-300 dark:border-gray-700 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800"
                        title="View details"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer summary */}
        {!loading && (
          <div className="flex items-center justify-between px-4 py-3 text-xs text-gray-600 dark:text-gray-400">
            <span>Total: {inspections.length}</span>
            <span>Showing: {filtered.length}</span>
          </div>
        )}
      </div>

      {/* DETAILS MODAL */}
      {openRow && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" />

          {/* Card */}
          <div className="relative z-10 w-full max-w-2xl rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                  Inspection • <span className="font-mono">{openRow.serialNumber || openRow.id}</span>
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {openRow.drugshopName || '—'} • {formatDate(openRow.date || openRow.createdAt)}
                </p>
              </div>
              <button
                onClick={closeModal}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label="Close"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Status</div>
                  <StatusBadge value={(openRow.status || 'draft').toString()} />
                </div>

                <div className="space-y-2">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Created By</div>
                  <div className="text-sm text-gray-800 dark:text-gray-200">
                    {openRow.createdBy || '—'}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Boxes Impounded</div>
                  <div className="text-sm text-gray-800 dark:text-gray-200">
                    {parseNum(openRow.boxesImpounded)}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Impounded By</div>
                  <div className="text-sm text-gray-800 dark:text-gray-200">
                    {openRow.impoundedBy || '—'}
                  </div>
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Client Telephone</div>
                  <div className="text-sm text-gray-800 dark:text-gray-200">
                    {openRow.clientTelephone || '—'}
                  </div>
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Location</div>
                  <div className="text-sm text-gray-800 dark:text-gray-200 break-words">
                    {typeof openRow.location === 'string'
                      ? openRow.location
                      : openRow.location?.formattedAddress ||
                        (openRow.location?.coordinates ? 'has coordinates' : '—')}
                  </div>
                </div>

                {openRow.releasedAt ? (
                  <div className="space-y-2 sm:col-span-2">
                    <div className="text-xs text-gray-500 dark:text-gray-400">Released At</div>
                    <div className="text-sm text-gray-800 dark:text-gray-200">
                      {formatDate(openRow.releasedAt)}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-4 border-t border-gray-200 dark:border-gray-800">
              <button
                onClick={closeModal}
                className="inline-flex items-center rounded-xl border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Close
              </button>

              <Link
                href={`/inspections/${openRow.id}`}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-300 dark:border-gray-700 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800"
                title="Open inspection page"
              >
                <ShieldCheck className="h-4 w-4" />
                Open full page
              </Link>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// app/inspections/page.tsx
'use client';

import { useEffect, useMemo, useState, useCallback, useDeferredValue } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  getDatabase,
  ref,
  query as rtdbQuery,
  orderByChild,
  limitToLast,
  onValue,
} from 'firebase/database';
import { database as dbFromAlias } from '@/firebase';
import { Plus, RefreshCw, X, ShieldCheck } from 'lucide-react';
import Navbar from '@/components/Navbar';

type Inspection = {
  id: string;
  serialNumber?: string;
  drugshopName?: string;
  date?: string;               // ISO string
  status?: 'draft' | 'submitted' | 'approved' | 'rejected' | string;
  createdBy?: string;
  createdAt?: number;          // ms timestamp
  location?: string | { coordinates?: any; formattedAddress?: string };
  clientTelephone?: string;
  boxesImpounded?: string | number;
  impoundedBy?: string;
  releasedAt?: number | string;
};

const STATUS_STYLES: Record<string, { bg: string; text: string; ring: string }> = {
  draft:     { bg: 'bg-gray-100 dark:bg-gray-800',          text: 'text-gray-800 dark:text-gray-100',   ring: 'ring-gray-200 dark:ring-gray-700' },
  submitted: { bg: 'bg-blue-100 dark:bg-blue-900/30',       text: 'text-blue-800 dark:text-blue-200',   ring: 'ring-blue-200 dark:ring-blue-800/50' },
  approved:  { bg: 'bg-green-100 dark:bg-green-900/30',     text: 'text-green-800 dark:text-green-200', ring: 'ring-green-200 dark:ring-green-800/50' },
  rejected:  { bg: 'bg-rose-100 dark:bg-rose-900/30',       text: 'text-rose-800 dark:text-rose-200',   ring: 'ring-rose-200 dark:ring-rose-800/50' },
};

function StatusBadge({ value }: { value: string }) {
  const style = STATUS_STYLES[value] ?? STATUS_STYLES['draft'];
  return (
    <span className={['inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1', style.bg, style.text, style.ring].join(' ')}>
      {value}
    </span>
  );
}

function toMs(x?: string | number) {
  if (x === null || x === undefined) return 0;
  if (typeof x === 'number') return Number.isFinite(x) ? x : 0;
  const t = Date.parse(String(x));
  return Number.isFinite(t) ? t : 0;
}
function fmtDate(x?: string | number) {
  const ms = toMs(x);
  if (!ms) return '—';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(ms));
}
function toNum(n: unknown) {
  if (typeof n === 'number') return Number.isFinite(n) ? n : 0;
  if (typeof n === 'string') {
    const x = Number(n.trim());
    return Number.isFinite(x) ? x : 0;
  }
  return 0;
}
function norm(s?: string) {
  return (s ?? '').toLowerCase().trim();
}

export default function InspectionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const [loading, setLoading] = useState(true);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // URL-backed filters
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '');
  const [statusFilter, setStatusFilter] = useState<'all' | NonNullable<Inspection['status']>>(
    (searchParams.get('status') as any) || 'all'
  );
  const deferredSearch = useDeferredValue(search);

  // Keep URL in sync (q + status). Runs when filters change.
  useEffect(() => {
    const sp = new URLSearchParams(searchParams);
    if (search) sp.set('q', search); else sp.delete('q');
    if (statusFilter && statusFilter !== 'all') sp.set('status', statusFilter as string);
    else sp.delete('status');
    const url = `${pathname}?${sp.toString()}`;
    // Avoid unnecessary pushes
    if (url !== `${pathname}?${searchParams.toString()}`) {
      router.replace(url, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter]);

  // Live subscription: last 500 by createdAt (indexOn recommended)
  useEffect(() => {
    const db = dbFromAlias ?? getDatabase();
    const q = rtdbQuery(ref(db, 'inspections'), orderByChild('createdAt'), limitToLast(500));

    const unsub = onValue(
      q,
      (snap) => {
        const val = (snap.val() ?? {}) as Record<string, any>;
        const list: Inspection[] = Object.entries(val).map(([id, v]) => ({ id, ...v }));
        // Sort newest first (fallback to `date` if missing createdAt)
        list.sort((a, b) => (a.createdAt ?? toMs(a.date)) < (b.createdAt ?? toMs(b.date)) ? 1 : -1);
        setInspections(list);
        setLoading(false);
      },
      () => setLoading(false)
    );

    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    const s = norm(deferredSearch);
    return inspections.filter((i) => {
      const matchesSearch =
        !s ||
        norm(i.serialNumber).includes(s) ||
        norm(i.drugshopName).includes(s) ||
        norm(i.createdBy).includes(s);
      const st = (i.status || 'draft').toString();
      const matchesStatus = statusFilter === 'all' ? true : st === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [inspections, deferredSearch, statusFilter]);

  // Modal state
  const [openId, setOpenId] = useState<string | null>(null);
  const openRow = useMemo(() => filtered.find((x) => x.id === openId) || null, [openId, filtered]);

  // ESC to close modal
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenId(null);
    }
    if (openId) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openId]);

  const handleRefresh = () => {
    // RTDB is live; this is just a visual nudge
    setRefreshing(true);
    const t = setTimeout(() => setRefreshing(false), 500);
    return () => clearTimeout(t);
  };

  const openModal = useCallback((id: string) => setOpenId(id), []);
  const closeModal = useCallback(() => setOpenId(null), []);

  return (
    <div>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Inspections</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">Live list of submitted and draft inspections.</p>
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

        {/* Table */}
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
                        {fmtDate(i.createdAt ?? i.date)}
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
                    {openRow.drugshopName || '—'} • {fmtDate(openRow.createdAt ?? openRow.date)}
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
                      {toNum(openRow.boxesImpounded)}
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
                        {fmtDate(openRow.releasedAt)}
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
    </div>
  );
}

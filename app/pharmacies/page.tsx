'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import app, { database } from '@/firebase';
import { getAuth } from 'firebase/auth';
import { ref, onValue, query as rtdbQuery, orderByChild } from 'firebase/database';
import { Search, Phone, MapPin, Loader2, ExternalLink } from 'lucide-react';

type Coordinates = { lat?: number; lng?: number };
type Inspection = {
  id: string;
  drugshopName?: string;
  clientTelephone?: string;
  location?:
    | string
    | {
        formattedAddress?: string;
        address?: string;
        coordinates?: { lat?: number; lng?: number; latitude?: number; longitude?: number };
      }
    | null;
  date?: string;                 // ISO
  createdAt?: string | number;   // ISO or ms
};

type Pharmacy = {
  key: string;                   // normalized
  name: string;
  phone?: string;
  formattedAddress?: string;
  coordinates?: Coordinates;
  lastSeenISO?: string;
  visits: number;
};

function normalizeName(s?: string) { return (s ?? '').trim(); }
function keyOfName(s?: string) { return normalizeName(s).toLowerCase(); }
function toISO(x?: string | number) {
  if (!x) return undefined;
  const d = typeof x === 'number' ? new Date(x) : new Date(x);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}
function latestISO(a?: string, b?: string) {
  if (!a) return b; if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}
function fmtDate(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' :
    new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: '2-digit' }).format(d);
}
function asAddress(v: any): string | undefined {
  if (!v) return undefined;
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return v.formattedAddress ?? v.address ?? undefined;
  return undefined;
}
function asCoords(v: any): Coordinates | undefined {
  if (!v) return undefined;
  const src = typeof v === 'object' && 'coordinates' in v ? (v as any).coordinates : v;
  if (typeof src !== 'object') return undefined;
  const lat = Number(src.lat ?? src.latitude);
  const lng = Number(src.lng ?? src.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  return undefined;
}

export default function PharmaciesPage() {
  const db = database;
  const _auth = getAuth(app); // ready if you later gate by user

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Inspection[]>([]);
  const [search, setSearch] = useState('');

  // Read inspections -> build pharmacies
  useEffect(() => {
    const node = ref(db, 'inspectionRegister/inspections');
    const q = rtdbQuery(node, orderByChild('drugshopName'));
    const unsub = onValue(
      q,
      (snap) => {
        const val = (snap.val() ?? {}) as Record<string, any>;
        const list: Inspection[] = Object.entries(val).map(([id, v]) => ({ id, ...v }));
        setRows(list);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [db]);

  // Deduplicate by drugshopName and merge location/phone
  const pharmacies = useMemo<Pharmacy[]>(() => {
    const map = new Map<string, Pharmacy & { _count: number }>();
    for (const r of rows) {
      const key = keyOfName(r.drugshopName);
      if (!key) continue;

      const existing = map.get(key);
      const seen = latestISO(existing?.lastSeenISO, toISO(r.date ?? r.createdAt));
      const addr = existing?.formattedAddress ?? asAddress(r.location);
      const coords = existing?.coordinates ?? asCoords(r.location);

      map.set(key, {
        key,
        name: normalizeName(r.drugshopName) || 'Unknown pharmacy',
        phone: existing?.phone ?? r.clientTelephone,
        formattedAddress: addr,
        coordinates: coords,
        lastSeenISO: seen,
        visits: (existing?._count ?? 0) + 1,
        _count: (existing?._count ?? 0) + 1,
      });
    }
    return Array.from(map.values())
      .map(({ _count, ...p }) => ({ ...p, visits: _count }))
      .sort((a, b) => {
        const at = a.lastSeenISO ? new Date(a.lastSeenISO).getTime() : 0;
        const bt = b.lastSeenISO ? new Date(b.lastSeenISO).getTime() : 0;
        if (bt !== at) return bt - at;
        return a.name.localeCompare(b.name);
      });
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pharmacies;
    return pharmacies.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      (p.phone ?? '').toLowerCase().includes(q) ||
      (p.formattedAddress ?? '').toLowerCase().includes(q)
    );
  }, [pharmacies, search]);

  const telHref = (phone?: string) => phone ? `tel:${phone.replace(/\s+/g, '')}` : undefined;
  const mapsHref = (p: Pharmacy) => {
    if (p.coordinates?.lat && p.coordinates?.lng) {
      return `https://www.google.com/maps?q=${p.coordinates.lat},${p.coordinates.lng}(${encodeURIComponent(p.name)})`;
    }
    if (p.formattedAddress) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.formattedAddress)}`;
    }
    return undefined;
  };

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Pharmacies</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">Unique drugshops extracted from inspections with their locations.</p>
      </div>

      {/* Search box */}
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone, or address…"
            className="pl-10 pr-4 py-2.5 w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white/60 dark:bg-gray-900/60 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800/60 text-gray-600 dark:text-gray-300">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Pharmacy</th>
                <th className="px-4 py-3 text-left font-semibold">Phone</th>
                <th className="px-4 py-3 text-left font-semibold">Address</th>
                <th className="px-4 py-3 text-left font-semibold">Last Seen</th>
                <th className="px-4 py-3 text-left font-semibold">Visits</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={`sk-${i}`} className="animate-pulse">
                    <td className="px-4 py-3"><div className="h-4 w-48 bg-gray-200 dark:bg-gray-800 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-28 bg-gray-200 dark:bg-gray-800 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-64 bg-gray-200 dark:bg-gray-800 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-28 bg-gray-200 dark:bg-gray-800 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-10 bg-gray-200 dark:bg-gray-800 rounded" /></td>
                    <td className="px-4 py-3 text-right"><div className="h-9 w-40 bg-gray-200 dark:bg-gray-800 rounded-xl ml-auto" /></td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-gray-600 dark:text-gray-400">
                    No pharmacies found.
                  </td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const tel = telHref(p.phone);
                  const maps = mapsHref(p);
                  return (
                    <tr key={p.key} className="hover:bg-gray-50/60 dark:hover:bg-gray-800/40">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{p.name}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                        {p.phone ? (
                          <a href={tel} className="inline-flex items-center gap-1 underline hover:no-underline">
                            <Phone className="h-4 w-4" /> {p.phone}
                          </a>
                        ) : <span className="text-gray-500">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                        {p.formattedAddress || <span className="text-gray-500">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{fmtDate(p.lastSeenISO)}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{p.visits}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          {maps ? (
                            <Link
                              href={maps}
                              target="_blank"
                              className="inline-flex items-center gap-1 rounded-xl border border-gray-300 dark:border-gray-700 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800"
                            >
                              <MapPin className="h-4 w-4" />
                              Directions
                            </Link>
                          ) : (
                            <button
                              disabled
                              className="inline-flex items-center gap-1 rounded-xl border border-gray-200 dark:border-gray-800 px-3 py-2 opacity-50"
                            >
                              <MapPin className="h-4 w-4" />
                              Directions
                            </button>
                          )}

                          <Link
                            href={`/inspections?pharmacy=${encodeURIComponent(p.name)}`}
                            className="inline-flex items-center gap-1 rounded-xl border border-gray-300 dark:border-gray-700 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800"
                          >
                            <ExternalLink className="h-4 w-4" />
                            Inspections
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {!loading && (
          <div className="flex items-center justify-between px-4 py-3 text-xs text-gray-600 dark:text-gray-400">
            <span>Total unique: {pharmacies.length}</span>
            <span>Showing: {filtered.length}</span>
          </div>
        )}
      </div>

      {!loading && rows.length === 0 && (
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
          <Loader2 className="h-4 w-4" /> Data source: <code className="px-1">/inspectionRegister/inspections</code>
        </p>
      )}
    </main>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { formatDate } from '@/lib/utils';

interface Session {
  id: string;
  date: string;
  notes: string | null;
  entries: { id: string; sets: number; reps: number; weight: number; exercise: { name: string; muscleGroup: string | null } }[];
}

interface Run {
  id: string;
  date: string;
  distance: number;
  duration: number;
  splits: number[];
  notes: string | null;
}

function formatPace(secPerKm: number) {
  if (!secPerKm) return '—';
  return `${Math.floor(secPerKm / 60)}'${Math.round(secPerKm % 60).toString().padStart(2, '0')}"`;
}
function formatDur(s: number) {
  const m = Math.floor(s / 60), sec = Math.round(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function ProfilPage() {
  const router = useRouter();
  const { userId: authUserId, isLoggedIn, loading: authLoading } = useAuth();
  const params = useParams();
  const targetUserId = params.userId as string;

  const [userName, setUserName] = useState('');
  const [tab, setTab] = useState<'treningi' | 'biegi'>('treningi');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !isLoggedIn) router.push('/login');
  }, [isLoggedIn, authLoading, router]);

  useEffect(() => {
    if (!targetUserId) return;
    fetch('/api/users').then(r => r.json()).then(data => {
      const u = Array.isArray(data) ? data.find((x: { id: string; name: string }) => x.id === targetUserId) : null;
      if (u) setUserName(u.name);
    });
  }, [targetUserId]);

  const loadData = useCallback(async () => {
    if (!targetUserId) return;
    setLoading(true);
    try {
      const [sessRes, runsRes] = await Promise.all([
        fetch(`/api/sessions?userId=${targetUserId}&limit=100`),
        fetch(`/api/runs?userId=${targetUserId}&limit=100`),
      ]);
      if (sessRes.ok) setSessions(await sessRes.json());
      if (runsRes.ok) {
        const data = await runsRes.json();
        setRuns(data.map((r: Run) => ({ ...r, splits: Array.isArray(r.splits) ? r.splits : [] })));
      }
    } finally {
      setLoading(false);
    }
  }, [targetUserId]);

  useEffect(() => { loadData(); }, [loadData]);

  const totalVolume = sessions.reduce((sum, s) =>
    sum + s.entries.reduce((es, e) => es + e.sets * e.reps * e.weight, 0), 0);
  const totalKm = runs.reduce((s, r) => s + r.distance, 0);
  const bestRun = runs.length > 1
    ? runs.reduce((best, r) => r.duration / r.distance < best.duration / best.distance ? r : best)
    : runs[0] ?? null;

  if (authLoading) return null;

  // Redirect if viewing own profile
  if (!authLoading && authUserId === targetUserId) {
    router.replace('/historia');
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white border-b px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-500 text-xl">←</button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">👤 {userName || 'Profil'}</h1>
          <p className="text-sm text-gray-500">podgląd</p>
        </div>
      </div>

      {/* Stats */}
      <div className="max-w-lg mx-auto px-4 pt-5 space-y-5">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
            <div className="text-2xl font-bold text-blue-600">{sessions.length}</div>
            <div className="text-xs text-gray-500 mt-1">treningi</div>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
            <div className="text-2xl font-bold text-purple-600">{(totalVolume / 1000).toFixed(1)}t</div>
            <div className="text-xs text-gray-500 mt-1">wolumen</div>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
            <div className="text-2xl font-bold text-green-600">{totalKm.toFixed(1)}</div>
            <div className="text-xs text-gray-500 mt-1">km biegi</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex bg-gray-100 rounded-2xl p-1 gap-1">
          {(['treningi', 'biegi'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                tab === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'
              }`}
            >
              {t === 'treningi' ? `💪 Treningi (${sessions.length})` : `🏃 Biegi (${runs.length})`}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center text-gray-400 py-10">Ładowanie...</div>
        ) : tab === 'treningi' ? (
          sessions.length === 0 ? (
            <div className="text-center text-gray-400 py-10 bg-white rounded-2xl">Brak treningów</div>
          ) : (
            <div className="space-y-3">
              {sessions.map(s => (
                <div key={s.id} className="bg-white rounded-2xl p-4 shadow-sm">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-semibold text-gray-800">{formatDate(s.date)}</div>
                      <div className="text-sm text-gray-500 mt-0.5">{s.entries.length} ćwiczeń</div>
                      {s.notes && <div className="text-xs text-gray-400 mt-1">{s.notes}</div>}
                    </div>
                    <Link
                      href={`/trening/podsumowanie/${s.id}`}
                      className="text-blue-500 text-sm font-medium"
                    >
                      📊
                    </Link>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {[...new Set(s.entries.map(e => e.exercise?.muscleGroup?.replace(/\s*\(.*?\)/g, '').trim() || 'Inne'))].map(g => (
                      <span key={g} className="text-xs bg-gray-100 text-gray-600 rounded-lg px-2 py-0.5">{g}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          runs.length === 0 ? (
            <div className="text-center text-gray-400 py-10 bg-white rounded-2xl">Brak biegów</div>
          ) : (
            <div className="space-y-3">
              {bestRun && runs.length > 1 && (
                <div className="bg-green-50 border border-green-200 rounded-2xl p-3 flex items-center gap-3">
                  <span className="text-2xl">🏆</span>
                  <div>
                    <div className="text-sm font-semibold text-green-800">Najlepsze tempo</div>
                    <div className="text-green-700">{formatPace(bestRun.duration / bestRun.distance)}/km · {(3600 / (bestRun.duration / bestRun.distance)).toFixed(2)} km/h</div>
                  </div>
                </div>
              )}
              {runs.map(r => (
                <div key={r.id} className="bg-white rounded-2xl p-4 shadow-sm">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-bold text-gray-900">{r.distance} km</div>
                      <div className="text-sm text-gray-500">{formatDate(r.date)}</div>
                      {r.notes && <div className="text-xs text-gray-400 mt-1">{r.notes}</div>}
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-blue-600">{formatPace(r.duration / r.distance)}/km</div>
                      <div className="text-sm text-gray-500">{(3600 / (r.duration / r.distance)).toFixed(2)} km/h</div>
                      <div className="text-sm text-gray-400">{formatDur(r.duration)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}

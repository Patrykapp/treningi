'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { formatDate } from '@/lib/utils';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { ArrowLeft, User, Trophy, BarChart3, ChevronDown, ChevronUp } from 'lucide-react';

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
  if (!secPerKm || secPerKm <= 0) return '—';
  return `${Math.floor(secPerKm / 60)}'${Math.round(secPerKm % 60).toString().padStart(2, '0')}"`;
}
function formatDur(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.round(s % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
function paceToKmh(secPerKm: number): string {
  if (!secPerKm || secPerKm <= 0) return '—';
  return (3600 / secPerKm).toFixed(2);
}
function splitDistance(index: number, distance: number): number {
  const fullKms = Math.floor(distance);
  if (index < fullKms) return 1;
  return distance - fullKms;
}
function splitLabel(index: number, distance: number): string {
  const fullKms = Math.floor(distance);
  const partial = distance - fullKms;
  if (index < fullKms) return `km ${index + 1}`;
  if (partial > 0.01) return `${(partial * 1000).toFixed(0)}m`;
  return `km ${index + 1}`;
}

interface RunCardProps {
  run: Run;
  isPR: boolean;
  expanded: boolean;
  onToggle: () => void;
}

function RunCard({ run, isPR, expanded, onToggle }: RunCardProps) {
  const hasSplits = run.splits && run.splits.length > 0;
  const fullSplits: number[] = [];
  if (hasSplits) {
    run.splits.forEach((pace, j) => {
      if (splitDistance(j, run.distance) > 0.98) fullSplits.push(pace);
    });
  }
  const minP = fullSplits.length ? Math.min(...fullSplits) : 0;
  const maxP = fullSplits.length ? Math.max(...fullSplits) : 0;

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="p-4">
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-gray-900">{run.distance} km</span>
              {isPR && <span className="text-xs font-bold bg-yellow-400 text-yellow-900 rounded-xl px-2 py-0.5">PR</span>}
            </div>
            <div className="text-sm text-gray-500">{formatDate(run.date)}</div>
            {run.notes && <div className="text-xs text-gray-400 mt-1">{run.notes}</div>}
          </div>
          <div className="text-right">
            <div className="font-semibold text-blue-600">{formatPace(run.duration / run.distance)}/km</div>
            <div className="text-sm text-gray-500">{paceToKmh(run.duration / run.distance)} km/h</div>
            <div className="text-sm text-gray-400">{formatDur(run.duration)}</div>
          </div>
        </div>
        {hasSplits && (
          <button onClick={onToggle} className="mt-3 flex items-center gap-1 text-xs text-blue-500 font-medium transition-colors hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded">
            {expanded ? <ChevronUp className="w-3.5 h-3.5" strokeWidth={2} /> : <ChevronDown className="w-3.5 h-3.5" strokeWidth={2} />}
            {expanded ? 'Ukryj splity' : `Splity per km (${run.splits.length})`}
          </button>
        )}
      </div>
      {hasSplits && expanded && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-2">
          {run.splits.map((pace, i) => {
            const dist = splitDistance(i, run.distance);
            const isPartialKm = dist < 0.99;
            const isFastest = !isPartialKm && fullSplits.length > 1 && pace === minP;
            const isSlowest = !isPartialKm && fullSplits.length > 1 && pace === maxP;
            const barWidth = maxP > minP ? 30 + 70 * (1 - (pace - minP) / (maxP - minP)) : 80;
            return (
              <div key={i} className="flex items-center gap-2">
                <span className="text-sm text-gray-500 w-14 shrink-0">{splitLabel(i, run.distance)}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${isFastest ? 'bg-green-400' : isSlowest ? 'bg-orange-400' : 'bg-blue-300'}`}
                    style={{ width: `${isPartialKm ? 50 : barWidth}%` }}
                  />
                </div>
                <div className="text-right shrink-0 w-28">
                  <span className="text-sm font-medium text-gray-800">{formatPace(pace)}/km</span>
                  <span className="text-xs text-gray-400 ml-1">{paceToKmh(pace)}</span>
                </div>
                {isFastest && <span className="text-xs">🟢</span>}
                {isSlowest && <span className="text-xs">🔴</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
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
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

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

  if (!authLoading && authUserId === targetUserId) {
    router.replace('/historia');
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white border-b px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="p-1.5 rounded-full text-gray-500 transition-colors hover:bg-gray-100 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
          <ArrowLeft className="w-5 h-5" strokeWidth={2} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><User className="w-5 h-5 text-gray-700" strokeWidth={2} /> {userName || 'Profil'}</h1>
          <p className="text-sm text-gray-500">podgląd</p>
        </div>
      </div>

      <div className="max-w-lg md:max-w-3xl lg:max-w-4xl mx-auto px-4 pt-5 space-y-5">
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

        <div className="flex bg-gray-100 rounded-2xl p-1 gap-1">
          {(['treningi', 'biegi'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                tab === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'treningi' ? `Treningi (${sessions.length})` : `Biegi (${runs.length})`}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : tab === 'treningi' ? (
          sessions.length === 0 ? (
            <div className="text-center text-gray-400 py-10 bg-white rounded-2xl">Brak treningow</div>
          ) : (
            <div className="space-y-3">
              {sessions.map(s => (
                <div key={s.id} className="bg-white rounded-2xl p-4 shadow-sm">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-semibold text-gray-800">{formatDate(s.date)}</div>
                      <div className="text-sm text-gray-500 mt-0.5">{s.entries.length} cwiczen</div>
                      {s.notes && <div className="text-xs text-gray-400 mt-1">{s.notes}</div>}
                    </div>
                    <Link href={`/trening/podsumowanie/${s.id}`} className="p-1.5 rounded-lg text-blue-500 text-sm font-medium transition-colors hover:bg-blue-50 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
                      <BarChart3 className="w-4 h-4" strokeWidth={2} />
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
            <div className="text-center text-gray-400 py-10 bg-white rounded-2xl">Brak biegow</div>
          ) : (
            <div className="space-y-3">
              {bestRun && runs.length > 1 && (
                <div className="bg-green-50 border border-green-200 rounded-2xl p-3 flex items-center gap-3">
                  <Trophy className="w-6 h-6 text-green-600 shrink-0" strokeWidth={2} />
                  <div>
                    <div className="text-sm font-semibold text-green-800">Najlepsze tempo</div>
                    <div className="text-green-700">{formatPace(bestRun.duration / bestRun.distance)}/km · {paceToKmh(bestRun.duration / bestRun.distance)} km/h</div>
                  </div>
                </div>
              )}
              {runs.map(r => (
                <RunCard
                  key={r.id}
                  run={r}
                  isPR={bestRun?.id === r.id && runs.length > 1}
                  expanded={expandedRun === r.id}
                  onToggle={() => setExpandedRun(prev => prev === r.id ? null : r.id)}
                />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatDate } from '@/lib/utils';
import { strengthCalories, latestWeight } from '@/lib/calories';
import { parseTcx, HR_BUCKET_SEC } from '@/lib/tcx';
import { computeHrZones, estimateHrMax, formatZoneTime } from '@/lib/hr';
import { useAuth } from '@/hooks/useAuth';
import { SkeletonCard } from '@/components/ui/Skeleton';
import {
  ArrowLeft,
  Trophy,
  Timer,
  Heart,
  Watch,
  Flame,
} from 'lucide-react';

function formatDur(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}min` : `${m} min`;
}

// Lekki wykres tętna (SVG, bez bibliotek) — linia + gradient wypełnienia
// pod krzywą i siatka pomocnicza, żeby wygladał jak "prawdziwy" wykres.
function HrChart({ series }: { series: number[] }) {
  const vals = series.filter(v => v > 0);
  if (vals.length < 3) return null;
  const minVal = Math.min(...vals);
  const maxVal = Math.max(...vals);
  const min = minVal - 5;
  const max = maxVal + 5;
  const W = 600, H = 90;
  const toX = (i: number) => (i / (series.length - 1)) * W;
  const toY = (v: number) => H - ((v - min) / (max - min)) * H;
  const validIdx = series.map((v, i) => (v > 0 ? i : -1)).filter(i => i >= 0);
  const pts = validIdx.map(i => `${toX(i)},${toY(series[i])}`).join(' ');
  const firstIdx = validIdx[0];
  const lastIdx = validIdx[validIdx.length - 1];
  const areaPts = validIdx.length > 0
    ? `${toX(firstIdx)},${H} ${pts} ${toX(lastIdx)},${H}`
    : '';

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-24" preserveAspectRatio="none">
        <defs>
          <linearGradient id="hrFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Siatka pomocnicza */}
        {[0.25, 0.5, 0.75].map(p => (
          <line key={p} x1="0" y1={H * p} x2={W} y2={H * p} stroke="#e5e7eb" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
        {areaPts && <polygon points={areaPts} fill="url(#hrFill)" />}
        <polyline points={pts} fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-xs text-gray-400 mt-1">
        <span>{minVal} bpm</span>
        <span>{Math.round(series.length * HR_BUCKET_SEC / 60)} min</span>
        <span>{maxVal} bpm</span>
      </div>
    </div>
  );
}

interface SetData { reps: number; weight: number; }
interface Exercise { id: string; name: string; muscleGroup?: string | null; }
interface Entry {
  id: string;
  exerciseId: string;
  exercise: Exercise;
  sets: number;
  reps: number;
  weight: number;
  rpe?: number | null;
  setsData: SetData[];
}
interface Session {
  id: string;
  date: string;
  notes?: string | null;
  user: { id: string; name: string };
  entries: Entry[];
  durationSec?: number | null;
  kcal?: number | null;
  avgHr?: number | null;
  maxHr?: number | null;
  hrSeries?: number[];
}
interface Rating {
  score: number;
  stars: number;
  label: string;
  emoji: string;
  prCount: number;
  prExerciseIds: string[];
  details: string[];
  tips: string[];
  breakdown: {
    volume: { score: number; current: number; avg: number };
    progress: { score: number };
    rpe: { score: number; value: number } | null;
  };
}

function normalizeMuscle(raw?: string | null) {
  if (!raw) return 'Inne';
  return raw.replace(/\s*\(.*?\)/g, '').trim() || 'Inne';
}

function calcVolume(entry: Entry): number {
  if (entry.setsData?.length > 0) {
    return entry.setsData.reduce((s, x) => s + x.reps * x.weight, 0);
  }
  return entry.sets * entry.reps * entry.weight;
}

function calcMaxWeight(entry: Entry): number {
  if (entry.setsData?.length > 0) return Math.max(...entry.setsData.map(s => s.weight));
  return entry.weight;
}

function Stars({ count, max = 5 }: { count: number; max?: number }) {
  return (
    <span className="text-yellow-400 text-2xl leading-none">
      {'★'.repeat(Math.max(0, count))}
      <span className="text-gray-300">{'★'.repeat(Math.max(0, max - count))}</span>
    </span>
  );
}

const MUSCLE_ORDER = ['Klatka piersiowa', 'Plecy', 'Barki', 'Biceps', 'Triceps', 'Nogi', 'Brzuch', 'Cardio', 'Inne'];

export default function TreningSummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [rating, setRating] = useState<Rating | null>(null);
  const [weightKg, setWeightKg] = useState(0);
  const [loading, setLoading] = useState(true);
  const { userId: authUserId } = useAuth();

  const attachTcx = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session) return;
    const parsed = parseTcx(await file.text());
    e.target.value = '';
    if (!parsed) return;
    const res = await fetch(`/api/sessions/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ watch: {
        durationSec: parsed.durationSec, kcal: parsed.kcal, avgHr: parsed.avgHr, maxHr: parsed.maxHr,
        hrSeries: parsed.hrSeries,
      } }),
    });
    if (res.ok) {
      const updated = await res.json();
      if (updated && !updated.error) setSession(updated);
    }
  };

  useEffect(() => {
    Promise.all([
      fetch(`/api/sessions/${id}`).then(r => r.json()),
      fetch(`/api/sessions/${id}/rating`).then(r => r.json()),
    ]).then(([sess, rat]) => {
      if (sess && !sess.error) {
        setSession(sess);
        // Waga ciała właściciela treningu — do szacowania kcal
        if (sess.user?.id) {
          fetch(`/api/body-weight?userId=${sess.user.id}&limit=1`)
            .then(r => r.json())
            .then(d => setWeightKg(latestWeight(Array.isArray(d) ? d : [])))
            .catch(() => {});
        }
      }
      if (rat && !rat.error) setRating(rat);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="px-4 py-4 space-y-4 md:max-w-3xl lg:max-w-4xl md:mx-auto">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
  if (!session) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-gray-500">
      <p>Nie znaleziono treningu.</p>
      <button
        onClick={() => router.back()}
        className="text-blue-600 underline text-sm transition-colors hover:text-blue-700 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      >Wróć</button>
    </div>
  );

  const totalVolume = session.entries.reduce((s, e) => s + calcVolume(e), 0);
  const totalSets = session.entries.reduce((s, e) => s + (e.setsData?.length || e.sets), 0);

  // Group by muscle
  const byMuscle: Record<string, Entry[]> = {};
  for (const e of session.entries) {
    const g = normalizeMuscle(e.exercise.muscleGroup);
    if (!byMuscle[g]) byMuscle[g] = [];
    byMuscle[g].push(e);
  }
  const muscleKeys = MUSCLE_ORDER.filter(g => byMuscle[g])
    .concat(Object.keys(byMuscle).filter(g => !MUSCLE_ORDER.includes(g)));

  const statsByMuscle = muscleKeys.map(g => ({
    name: g,
    sets: byMuscle[g].reduce((s, e) => s + (e.setsData?.length || e.sets), 0),
    volume: byMuscle[g].reduce((s, e) => s + calcVolume(e), 0),
  }));
  const maxMuscleSets = Math.max(...statsByMuscle.map(m => m.sets), 1);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b px-4 pt-4 pb-3 sticky top-0 z-10">
        <button
          onClick={() => router.back()}
          className="text-blue-600 text-sm mb-2 flex items-center gap-1 rounded-lg transition-colors hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={2} /> Wróć
        </button>
        <h1 className="text-xl font-bold text-gray-900">Podsumowanie treningu</h1>
        <p className="text-sm text-gray-500">{formatDate(session.date)} · {session.user.name}</p>
      </div>

      <div className="px-4 py-4 space-y-4 md:max-w-3xl lg:max-w-4xl md:mx-auto">

        {/* Ocena */}
        {rating && (
          <div className="bg-blue-600 rounded-2xl p-5 text-white">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs uppercase tracking-widest opacity-70 mb-0.5">Ocena treningu</p>
                <p className="text-2xl font-black">{rating.emoji} {rating.label}</p>
              </div>
              <div className="text-right">
                <Stars count={rating.stars} />
                <p className="text-xs opacity-70 mt-0.5">{rating.score}/10</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white/15 rounded-xl p-2.5 text-center">
                <p className="text-xs opacity-70 mb-0.5">Wolumen</p>
                <p className="font-bold text-sm">{rating.breakdown.volume.score}/10</p>
              </div>
              <div className="bg-white/15 rounded-xl p-2.5 text-center">
                <p className="text-xs opacity-70 mb-0.5">Progres</p>
                <p className="font-bold text-sm">{rating.breakdown.progress.score}/10</p>
              </div>
              {rating.breakdown.rpe ? (
                <div className="bg-white/15 rounded-xl p-2.5 text-center">
                  <p className="text-xs opacity-70 mb-0.5">RPE</p>
                  <p className="font-bold text-sm">{rating.breakdown.rpe.value}</p>
                </div>
              ) : (
                <div className="bg-white/15 rounded-xl p-2.5 text-center">
                  <p className="text-xs opacity-70 mb-0.5">PR</p>
                  <p className="font-bold text-sm">
                    {rating.prCount > 0 ? (
                      <span className="inline-flex items-center gap-1"><Trophy className="w-4 h-4" strokeWidth={2} /> ×{rating.prCount}</span>
                    ) : '—'}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Statystyki ogólne */}
        <div className={`grid gap-2 ${(session.kcal || weightKg > 0) ? 'grid-cols-4' : 'grid-cols-3'}`}>
          <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
            <p className="text-xl font-black text-blue-600">{session.entries.length}</p>
            <p className="text-xs text-gray-500 mt-0.5">ćwiczeń</p>
          </div>
          <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
            <p className="text-xl font-black text-gray-900">{totalSets}</p>
            <p className="text-xs text-gray-500 mt-0.5">serii</p>
          </div>
          <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
            <p className="text-xl font-black text-gray-900">{Math.round(totalVolume / 1000 * 10) / 10}t</p>
            <p className="text-xs text-gray-500 mt-0.5">wolumen</p>
          </div>
          {session.kcal ? (
            <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
              <p className="text-xl font-black text-red-500">{session.kcal}</p>
              <p className="text-xs text-gray-500 mt-0.5 flex items-center justify-center gap-1">kcal <Watch className="w-3.5 h-3.5" strokeWidth={2} /></p>
            </div>
          ) : weightKg > 0 && (
            <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
              <p className="text-xl font-black text-red-500">~{strengthCalories(weightKg, totalSets)}</p>
              <p className="text-xs text-gray-500 mt-0.5 flex items-center justify-center gap-1">kcal <Flame className="w-3.5 h-3.5" strokeWidth={2} /></p>
            </div>
          )}
        </div>

        {/* Dane z zegarka */}
        {(session.durationSec || session.avgHr) ? (
          <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
            <div className="flex items-center justify-around text-center">
              {session.durationSec && (
                <div>
                  <p className="text-base font-bold text-gray-900 flex items-center justify-center gap-1.5"><Timer className="w-4 h-4" strokeWidth={2} /> {formatDur(session.durationSec)}</p>
                  <p className="text-xs text-gray-500">czas treningu</p>
                </div>
              )}
              {session.avgHr && (
                <div>
                  <p className="text-base font-bold text-gray-900 flex items-center justify-center gap-1.5"><Heart className="w-4 h-4" strokeWidth={2} /> {session.avgHr}{session.maxHr ? ` / ${session.maxHr}` : ''}</p>
                  <p className="text-xs text-gray-500">tętno śr. / maks.</p>
                </div>
              )}
            </div>

            {/* Wykres tętna */}
            {Array.isArray(session.hrSeries) && session.hrSeries.length > 2 && (
              <HrChart series={session.hrSeries} />
            )}

            {/* Strefy tętna */}
            {Array.isArray(session.hrSeries) && session.hrSeries.length > 2 && (() => {
              const zones = computeHrZones(session.hrSeries, estimateHrMax(session.maxHr));
              const total = zones.reduce((s, z) => s + z.seconds, 0);
              if (total <= 0) return null;
              return (
                <div>
                  <div className="flex h-3 rounded-full overflow-hidden mb-2">
                    {zones.filter(z => z.seconds > 0).map(z => (
                      <div key={z.name} className={z.color} style={{ width: `${(z.seconds / total) * 100}%` }} />
                    ))}
                  </div>
                  <div className="grid grid-cols-5 gap-1 text-center">
                    {zones.map(z => (
                      <div key={z.name}>
                        <div className={`w-2.5 h-2.5 rounded-full mx-auto mb-0.5 ${z.color}`} />
                        <p className="text-xs font-semibold text-gray-700">{z.seconds > 0 ? formatZoneTime(z.seconds) : '—'}</p>
                        <p className="text-[10px] text-gray-400">{z.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        ) : authUserId === session.user.id && (
          <label className="w-full text-center text-sm text-blue-600 font-medium bg-white rounded-2xl shadow-sm py-3 cursor-pointer transition-colors hover:bg-gray-50 flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
            <Watch className="w-4 h-4" strokeWidth={2} /> Importuj dane z zegarka (TCX)
            <input type="file" accept=".tcx,.xml" onChange={attachTcx} className="hidden" />
          </label>
        )}

        {/* Serie per grupa mięśniowa */}
        {statsByMuscle.length > 1 && (
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Serie per partia</h3>
            <div className="space-y-2">
              {[...statsByMuscle].sort((a, b) => b.sets - a.sets).map(m => (
                <div key={m.name} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-24 shrink-0">{m.name}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                    <div className="bg-blue-500 h-full rounded-full flex items-center justify-end pr-2"
                      style={{ width: `${(m.sets / maxMuscleSets) * 100}%` }}>
                      <span className="text-xs font-bold text-white">{m.sets}</span>
                    </div>
                  </div>
                  <span className="text-xs text-gray-400 w-16 shrink-0 text-right">
                    {m.volume >= 1000 ? `${Math.round(m.volume / 100) / 10}t` : `${Math.round(m.volume)}kg`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PR */}
        {rating && rating.prCount > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-yellow-800 mb-2 flex items-center gap-1.5"><Trophy className="w-4 h-4" strokeWidth={2} /> Nowe rekordy ({rating.prCount})</h3>
            <div className="space-y-1">
              {session.entries
                .filter(e => rating.prExerciseIds.includes(e.exerciseId))
                .map(e => (
                  <div key={e.id} className="flex items-center justify-between">
                    <span className="text-sm text-yellow-900 font-medium">{e.exercise.name}</span>
                    <span className="text-sm font-bold text-yellow-700">{calcMaxWeight(e)} kg</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Ćwiczenia per partia */}
        {muscleKeys.map(muscle => (
          <div key={muscle} className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">{muscle}</p>
            </div>
            {byMuscle[muscle].map(entry => {
              const isPR = rating?.prExerciseIds.includes(entry.exerciseId);
              const sets = entry.setsData?.length > 0 ? entry.setsData : null;
              return (
                <div key={entry.id} className="px-4 py-3 border-b border-gray-50 last:border-0">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/cwiczenie/${entry.exerciseId}`}
                      className="text-sm font-semibold text-gray-900 flex-1 rounded transition-colors hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
                      {entry.exercise.name}
                      {isPR && (
                        <span className="ml-1.5 text-xs bg-yellow-100 text-yellow-700 rounded px-1.5 py-0.5 font-bold inline-flex items-center gap-1">
                          <Trophy className="w-3.5 h-3.5" strokeWidth={2} /> PR
                        </span>
                      )}
                    </Link>
                    {entry.rpe && (
                      <span className="text-xs text-gray-400 shrink-0">RPE {entry.rpe}</span>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {sets ? sets.map((s, i) => (
                      <span key={i} className="text-xs bg-gray-100 text-gray-700 rounded-lg px-2 py-1 font-medium">
                        {s.reps}×{s.weight > 0 ? `${s.weight}kg` : 'bw'}
                      </span>
                    )) : (
                      <span className="text-xs bg-gray-100 text-gray-700 rounded-lg px-2 py-1 font-medium">
                        {entry.sets}×{entry.reps} {entry.weight > 0 ? `@ ${entry.weight}kg` : '(bw)'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {/* Wskazówki */}
        {rating && rating.tips.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Jak poprawić następny trening</h3>
            <div className="space-y-2">
              {rating.tips.map((tip, i) => (
                <p key={i} className="text-sm text-gray-600 bg-gray-50 rounded-xl px-3 py-2">{tip}</p>
              ))}
            </div>
          </div>
        )}

        {session.notes && !session.notes.startsWith('Challenge:') && (
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="text-sm text-gray-500 italic">{session.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}

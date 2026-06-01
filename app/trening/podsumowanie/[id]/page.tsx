'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatDate } from '@/lib/utils';

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
  user: { name: string };
  entries: Entry[];
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/sessions/${id}`).then(r => r.json()),
      fetch(`/api/sessions/${id}/rating`).then(r => r.json()),
    ]).then(([sess, rat]) => {
      if (sess && !sess.error) setSession(sess);
      if (rat && !rat.error) setRating(rat);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">Ładowanie...</div>;
  if (!session) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-gray-500">
      <p>Nie znaleziono treningu.</p>
      <button onClick={() => router.back()} className="text-blue-600 underline text-sm">Wróć</button>
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

  const volumeByMuscle = muscleKeys.map(g => ({
    name: g,
    volume: byMuscle[g].reduce((s, e) => s + calcVolume(e), 0),
  }));
  const maxMuscleVol = Math.max(...volumeByMuscle.map(m => m.volume), 1);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b px-4 pt-4 pb-3 sticky top-0 z-10">
        <button onClick={() => router.back()} className="text-blue-600 text-sm mb-2 block">← Wróć</button>
        <h1 className="text-xl font-bold text-gray-900">Podsumowanie treningu</h1>
        <p className="text-sm text-gray-500">{formatDate(session.date)} · {session.user.name}</p>
      </div>

      <div className="px-4 py-4 space-y-4">

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
                  <p className="font-bold text-sm">{rating.prCount > 0 ? `🏆×${rating.prCount}` : '—'}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Statystyki ogólne */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
            <p className="text-2xl font-black text-blue-600">{session.entries.length}</p>
            <p className="text-xs text-gray-500 mt-0.5">ćwiczeń</p>
          </div>
          <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
            <p className="text-2xl font-black text-gray-900">{totalSets}</p>
            <p className="text-xs text-gray-500 mt-0.5">serii</p>
          </div>
          <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
            <p className="text-xl font-black text-gray-900">{Math.round(totalVolume / 1000 * 10) / 10}t</p>
            <p className="text-xs text-gray-500 mt-0.5">wolumen</p>
          </div>
        </div>

        {/* Wolumen per grupa mięśniowa */}
        {volumeByMuscle.length > 1 && (
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Wolumen per partia</h3>
            <div className="space-y-2">
              {volumeByMuscle.sort((a, b) => b.volume - a.volume).map(m => (
                <div key={m.name} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-24 shrink-0">{m.name}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                    <div className="bg-blue-500 h-full rounded-full flex items-center justify-end pr-2"
                      style={{ width: `${(m.volume / maxMuscleVol) * 100}%` }}>
                      {m.volume > 0 && (
                        <span className="text-xs font-bold text-white">
                          {m.volume >= 1000 ? `${Math.round(m.volume / 100) / 10}t` : `${Math.round(m.volume)}kg`}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PR */}
        {rating && rating.prCount > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-yellow-800 mb-2">🏆 Nowe rekordy ({rating.prCount})</h3>
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
                      className="text-sm font-semibold text-gray-900 flex-1">
                      {entry.exercise.name}
                      {isPR && <span className="ml-1.5 text-xs bg-yellow-100 text-yellow-700 rounded px-1.5 py-0.5 font-bold">🏆 PR</span>}
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

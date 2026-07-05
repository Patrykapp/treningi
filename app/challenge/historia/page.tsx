'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { formatDate } from '@/lib/utils';

interface Challenge {
  sessionId: string;
  date: string;
  exerciseId: string;
  exerciseName: string;
  muscleGroup: string | null;
  totalReps: number;
  reps: number[];
  durations: number[] | null;
  restSeconds: number | null;
  setsCount: number;
}

interface Attempt extends Challenge {
  gapDays: number | null;   // dni od poprzedniej próby tego ćwiczenia
  delta: number | null;     // różnica łącznych powtórzeń vs poprzednia próba
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

export default function ChallengeHistoriaPage() {
  const { userId, loading } = useAuth();
  const [items, setItems] = useState<Challenge[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (loading) return;
    const q = userId ? `?userId=${userId}` : '';
    fetch(`/api/challenges${q}`)
      .then(r => r.json())
      .then(d => { setItems(Array.isArray(d) ? d : []); setReady(true); })
      .catch(() => setReady(true));
  }, [loading, userId]);

  // Grupuj po ćwiczeniu (API zwraca rosnąco po dacie).
  const groups = new Map<string, { name: string; muscleGroup: string | null; attempts: Challenge[] }>();
  for (const c of items) {
    if (!groups.has(c.exerciseId)) groups.set(c.exerciseId, { name: c.exerciseName, muscleGroup: c.muscleGroup, attempts: [] });
    groups.get(c.exerciseId)!.attempts.push(c);
  }

  // Ćwiczenia wg najświeższej próby (malejąco).
  const groupArr = [...groups.values()].sort(
    (a, b) => new Date(b.attempts[b.attempts.length - 1].date).getTime() - new Date(a.attempts[a.attempts.length - 1].date).getTime()
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white border-b px-4 pt-4 pb-3 sticky top-0 z-10">
        <Link href="/challenge" className="text-blue-600 text-sm mb-2 block">← Challenge</Link>
        <h1 className="text-xl font-bold text-gray-900">📊 Postępy w challengach</h1>
        <p className="text-sm text-gray-500">Kolejne próby, przerwy między nimi i zmiana względem poprzedniej</p>
      </div>

      <div className="px-4 py-4 space-y-5">
        {ready && groupArr.length === 0 && (
          <div className="text-center py-16 text-gray-500">
            <p className="text-3xl mb-2">⚡</p>
            <p>Brak zapisanych challengy.</p>
            <Link href="/challenge" className="text-blue-600 text-sm font-medium hover:underline">Zrób pierwszy →</Link>
          </div>
        )}

        {groupArr.map(g => {
          const asc = g.attempts;
          const best = Math.max(...asc.map(a => a.totalReps));
          // Dolicz przerwy i różnice względem poprzedniej próby (na osi rosnącej).
          const withDeltas: Attempt[] = asc.map((a, i) => ({
            ...a,
            gapDays: i > 0 ? daysBetween(asc[i - 1].date, a.date) : null,
            delta: i > 0 ? a.totalReps - asc[i - 1].totalReps : null,
          }));
          const view = [...withDeltas].reverse(); // najnowsze na górze

          return (
            <div key={g.attempts[0].exerciseId} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <div className="min-w-0">
                  <h2 className="font-semibold text-gray-900 text-sm truncate">{g.name}</h2>
                  <p className="text-xs text-gray-400">{asc.length} prób · rekord {best} powt.</p>
                </div>
                {g.muscleGroup && <span className="text-xs text-gray-400 shrink-0 ml-2">{g.muscleGroup}</span>}
              </div>

              <div className="divide-y divide-gray-100">
                {view.map(a => (
                  <Link key={a.sessionId} href={`/challenge/wynik/${a.sessionId}`}
                    className="block px-4 py-3 active:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">{formatDate(a.date)}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-black text-gray-900">{a.totalReps}</span>
                        <span className="text-xs text-gray-400">powt.</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      {a.reps.map((r, i) => (
                        <span key={i} className="text-xs bg-gray-100 text-gray-600 rounded-md px-1.5 py-0.5">{r}</span>
                      ))}
                      {a.totalReps === best && (
                        <span className="text-xs bg-amber-100 text-amber-700 rounded-md px-1.5 py-0.5 font-medium">🏆 rekord</span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 mt-1.5 text-xs">
                      {a.gapDays !== null && (
                        <span className="text-gray-400">przerwa {a.gapDays} {a.gapDays === 1 ? 'dzień' : 'dni'}</span>
                      )}
                      {a.delta !== null && (
                        <span className={a.delta > 0 ? 'text-green-600 font-medium' : a.delta < 0 ? 'text-red-500 font-medium' : 'text-gray-400'}>
                          {a.delta > 0 ? `▲ +${a.delta}` : a.delta < 0 ? `▼ ${a.delta}` : '= bez zmian'} vs poprzednia
                        </span>
                      )}
                      {a.restSeconds != null && (
                        <span className="text-gray-400">odpoczynek {a.restSeconds < 60 ? `${a.restSeconds}s` : `${Math.round(a.restSeconds / 60)}min`}</span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

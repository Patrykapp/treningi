'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { formatDate } from '@/lib/utils';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { BarChart3, Zap, Trophy, ArrowLeft, TrendingUp, TrendingDown } from 'lucide-react';

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

function setsLabel(n: number): string {
  if (n === 1) return '1 seria';
  const t = n % 10, h = n % 100;
  if (t >= 2 && t <= 4 && (h < 10 || h >= 20)) return `${n} serie`;
  return `${n} serii`;
}
function restLabel(sec: number): string {
  return sec < 60 ? `${sec} s` : `${Math.round(sec / 60)} min`;
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
  const groupArr = [...groups.values()].sort(
    (a, b) => new Date(b.attempts[b.attempts.length - 1].date).getTime() - new Date(a.attempts[a.attempts.length - 1].date).getTime()
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white border-b px-4 pt-4 pb-3 sticky top-0 z-10">
        <Link
          href="/challenge"
          className="inline-flex items-center gap-1 text-blue-600 text-sm mb-2 rounded-md px-1 -mx-1 transition-colors hover:text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2} /> Challenge
        </Link>
        <h1 className="text-xl font-bold text-gray-900 inline-flex items-center gap-2">
          <BarChart3 className="w-5 h-5" strokeWidth={2} /> Postępy w challengach
        </h1>
        <p className="text-sm text-gray-500">Porównanie tylko w obrębie tej samej liczby serii</p>
      </div>

      <div className="px-4 py-4 space-y-5 max-w-2xl mx-auto md:max-w-3xl lg:max-w-4xl">
        {!ready && (
          <div className="space-y-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}
        {ready && groupArr.length === 0 && (
          <div className="text-center py-16 text-gray-500">
            <Zap className="w-8 h-8 mx-auto mb-2 text-gray-400" strokeWidth={2} />
            <p>Brak zapisanych challengy.</p>
            <Link
              href="/challenge"
              className="text-blue-600 text-sm font-medium rounded-md px-1 -mx-1 transition-colors hover:underline hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >Zrób pierwszy →</Link>
          </div>
        )}

        {groupArr.map(g => {
          const asc = g.attempts;
          // Rekord liczony osobno dla każdego schematu (tej samej liczby serii).
          const schemeBest = new Map<number, number>();
          for (const a of asc) schemeBest.set(a.setsCount, Math.max(schemeBest.get(a.setsCount) ?? 0, a.totalReps));
          // Zmiana względem poprzedniej próby o TEJ SAMEJ liczbie serii.
          const meta = asc.map((a, i) => {
            let prevSame: Challenge | null = null;
            for (let j = i - 1; j >= 0; j--) { if (asc[j].setsCount === a.setsCount) { prevSame = asc[j]; break; } }
            return {
              ...a,
              delta: prevSame ? a.totalReps - prevSame.totalReps : null,
              isRecord: (schemeBest.get(a.setsCount) ?? 0) > 0 && a.totalReps === schemeBest.get(a.setsCount),
            };
          });
          const view = [...meta].reverse(); // najnowsze na górze

          return (
            <div key={g.attempts[0].exerciseId} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <div className="min-w-0">
                  <h2 className="font-semibold text-gray-900 text-sm truncate">{g.name}</h2>
                  <p className="text-xs text-gray-400">{asc.length} prób</p>
                </div>
                {g.muscleGroup && <span className="text-xs text-gray-400 shrink-0 ml-2">{g.muscleGroup}</span>}
              </div>

              <div className="divide-y divide-gray-100">
                {view.map(a => (
                  <Link key={a.sessionId} href={`/challenge/wynik/${a.sessionId}`}
                    className="block px-4 py-3 transition-colors hover:bg-gray-50 active:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
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
                      <span className="text-xs bg-blue-50 text-blue-600 rounded-md px-1.5 py-0.5 font-medium">{setsLabel(a.setsCount)}</span>
                      {a.isRecord && (
                        <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 rounded-md px-1.5 py-0.5 font-medium">
                          <Trophy className="w-3 h-3" strokeWidth={2} /> rekord
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 mt-1.5 text-xs">
                      {a.restSeconds != null ? (
                        <span className="text-gray-500">przerwa {restLabel(a.restSeconds)} między seriami</span>
                      ) : (
                        <span className="text-gray-300">przerwa: b/d</span>
                      )}
                      {a.delta !== null && (
                        <span className={`inline-flex items-center gap-0.5 ${a.delta > 0 ? 'text-green-600 font-medium' : a.delta < 0 ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                          {a.delta > 0 ? (<><TrendingUp className="w-3.5 h-3.5" strokeWidth={2} /> +{a.delta}</>) : a.delta < 0 ? (<><TrendingDown className="w-3.5 h-3.5" strokeWidth={2} /> {a.delta}</>) : '= bez zmian'} vs poprzednia
                        </span>
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

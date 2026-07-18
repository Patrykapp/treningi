'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { SkeletonCard, Skeleton } from '@/components/ui/Skeleton';
import { Trophy, ArrowLeft, Footprints, MapPin, Timer, Zap, Flame, Sparkles } from 'lucide-react';
import { latestWeight, runCalories } from '@/lib/calories';

interface SetResult {
  reps: number;
  duration: number | null;
}

interface Run {
  id: string;
  date: string;
  distance: number;
  duration: number;
  notes?: string | null;
}

interface ChallengeData {
  exerciseName: string;
  sets: SetResult[];
  totalReps: number;
  date: string;
  userId: string;
  runs: Run[];
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// Tempo w formacie min'ss"/km
function formatPace(secPerKm: number): string {
  if (!secPerKm || secPerKm <= 0) return '—';
  const mins = Math.floor(secPerKm / 60);
  const secs = Math.round(secPerKm % 60);
  return `${mins}'${secs.toString().padStart(2, '0')}"`;
}
function formatRunDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function ChallengeWynikPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [data, setData] = useState<ChallengeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [weightKg, setWeightKg] = useState(0);
  const [compareRuns, setCompareRuns] = useState<Run[]>([]);
  const [aiComment, setAiComment] = useState<string | null>(null);
  const [aiCommentLoading, setAiCommentLoading] = useState(false);
  const [aiCommentAttempted, setAiCommentAttempted] = useState(false);

  useEffect(() => {
    setAiComment(null);
    setAiCommentAttempted(false);
    fetch(`/api/sessions/${id}`)
      .then(r => r.json())
      .then(session => {
        if (!session || session.error) { setError(true); return; }

        const entry = session.entries?.[0];
        if (!entry) { setError(true); return; }

        const setsData: { reps: number; weight: number }[] = Array.isArray(entry.setsData) ? entry.setsData : [];

        // Try to parse durations from comment JSON
        let durations: number[] | null = null;
        try {
          const parsed = JSON.parse(entry.comment || '');
          if (parsed?.challenge && Array.isArray(parsed.durations)) {
            durations = parsed.durations;
          }
        } catch { /* old format — no durations */ }

        const sets: SetResult[] = setsData.map((s, i) => ({
          reps: s.reps,
          duration: durations ? (durations[i] ?? null) : null,
        }));

        setData({
          exerciseName: entry.exercise?.name || 'Ćwiczenie',
          sets,
          totalReps: sets.reduce((acc, s) => acc + s.reps, 0),
          date: session.date,
          userId: session.user?.id || '',
          runs: Array.isArray(session.runs) ? session.runs : [],
        });
        if (session.aiComment) { setAiComment(session.aiComment); setAiCommentAttempted(true); }
        setLoading(false);

        if (session.user?.id) {
          fetch(`/api/body-weight?userId=${session.user.id}&limit=1`)
            .then(r => r.json())
            .then(d => setWeightKg(latestWeight(Array.isArray(d) ? d : [])))
            .catch(() => {});
        }
      })
      .catch(() => setError(true));
  }, [id]);

  // Komentarz AI do Wyzwania — generowany raz i cache'owany w bazie
  // (WorkoutSession.aiComment), więc odpalamy tylko gdy jeszcze go nie ma.
  useEffect(() => {
    if (!data || aiComment || aiCommentLoading || aiCommentAttempted) return;
    setAiCommentLoading(true);
    setAiCommentAttempted(true);
    fetch('/api/ai/session-comment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: id }),
    })
      .then(r => r.json())
      .then(d => { if (d?.comment) setAiComment(d.comment); })
      .catch(() => {})
      .finally(() => setAiCommentLoading(false));
  }, [data, aiComment, aiCommentLoading, aiCommentAttempted, id]);

  // Bieg przypięty do tego challengu — do porównania (śr./najlepsze tempo)
  // pobieramy pozostałe biegi właściciela sesji.
  useEffect(() => {
    if (!data?.runs?.length || !data.userId) { setCompareRuns([]); return; }
    fetch(`/api/runs?userId=${data.userId}&limit=30`)
      .then(r => r.json())
      .then(d => setCompareRuns(Array.isArray(d) ? d : []))
      .catch(() => setCompareRuns([]));
  }, [data?.runs, data?.userId]);

  if (loading && !error) {
    return (
      <div className="min-h-screen bg-gray-50 pb-24">
        <div className="bg-white border-b px-4 pt-4 pb-3 sticky top-0 z-10">
          <Skeleton className="h-4 w-20 mb-2" />
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="px-4 py-4 space-y-4 max-w-2xl mx-auto md:max-w-3xl lg:max-w-4xl">
          <SkeletonCard className="h-32" />
          <SkeletonCard />
        </div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-gray-500 gap-4">
        <p>Nie znaleziono wyników challengu.</p>
        <button
          onClick={() => router.back()}
          className="text-blue-600 underline text-sm rounded-md px-1 transition-colors hover:text-blue-700 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >Wróć</button>
      </div>
    );
  }

  const maxReps = Math.max(...data.sets.map(s => s.reps));

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white border-b px-4 pt-4 pb-3 sticky top-0 z-10">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1 text-blue-600 text-sm mb-2 rounded-md px-1 -mx-1 transition-colors hover:text-blue-700 hover:bg-blue-50 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2} /> Wróć
        </button>
        <h1 className="text-xl font-bold text-gray-900 inline-flex items-center gap-2">
          <Trophy className="w-5 h-5" strokeWidth={2} /> Challenge zakończony!
        </h1>
        <p className="text-sm text-blue-600 font-medium mt-0.5 truncate">{data.exerciseName}</p>
      </div>

      <div className="px-4 py-4 space-y-4 max-w-2xl mx-auto md:max-w-3xl lg:max-w-4xl">
        <div className="bg-blue-600 rounded-2xl p-6 text-center text-white shadow">
          <div className="text-xs uppercase tracking-widest opacity-80 mb-1">Łącznie</div>
          <div className="text-6xl font-black">{data.totalReps}</div>
          <div className="text-sm opacity-80 mt-1">powtórzeń w {data.sets.length} seriach</div>
        </div>

        {/* Komentarz AI */}
        {aiComment && (
          <div className="bg-white rounded-2xl shadow-sm p-4 flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" strokeWidth={2} />
            <p className="text-sm text-gray-700 italic">{aiComment}</p>
          </div>
        )}

        {/* Bieg przypięty do tego challengu (np. bieg + challenge tego samego dnia) */}
        {data.runs.map(run => {
          const pace = run.distance > 0 ? run.duration / run.distance : 0;
          const others = compareRuns.filter(r => r.id !== run.id);
          const avgOthersPace = others.length > 0
            ? others.reduce((s, r) => s + r.duration / r.distance, 0) / others.length
            : 0;
          const bestOthersPace = others.length > 0
            ? Math.min(...others.map(r => r.duration / r.distance))
            : 0;
          const runKcal = runCalories(weightKg, run.distance);
          const isPR = others.length > 0 && pace > 0 && pace <= bestOthersPace;
          const pctVsAvg = avgOthersPace > 0 && pace > 0 ? ((avgOthersPace - pace) / avgOthersPace) * 100 : null;
          return (
            <div key={run.id} className="bg-white rounded-2xl shadow-sm p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
                <Footprints className="w-4 h-4" strokeWidth={2} /> Bieg tego dnia
                {isPR && (
                  <span className="text-xs font-bold bg-yellow-400 text-yellow-900 rounded-lg px-2 py-0.5 flex items-center gap-1">
                    <Trophy className="w-3.5 h-3.5" strokeWidth={2} /> najlepsze tempo
                  </span>
                )}
              </h3>
              <div className="grid grid-cols-3 gap-2 text-center mb-2">
                <div className="bg-orange-50 rounded-xl p-2.5">
                  <p className="font-bold text-gray-900 flex items-center justify-center gap-1"><MapPin className="w-3.5 h-3.5" strokeWidth={2} /> {run.distance} km</p>
                </div>
                <div className="bg-orange-50 rounded-xl p-2.5">
                  <p className="font-bold text-gray-900 flex items-center justify-center gap-1"><Timer className="w-3.5 h-3.5" strokeWidth={2} /> {formatRunDuration(run.duration)}</p>
                </div>
                <div className="bg-orange-50 rounded-xl p-2.5">
                  <p className="font-bold text-gray-900 flex items-center justify-center gap-1"><Zap className="w-3.5 h-3.5" strokeWidth={2} /> {formatPace(pace)}/km</p>
                </div>
              </div>
              {runKcal > 0 && (
                <p className="text-xs text-red-500 font-medium flex items-center gap-1 mb-1"><Flame className="w-3.5 h-3.5" strokeWidth={2} /> ~{runKcal} kcal</p>
              )}
              {pctVsAvg !== null && (
                <p className="text-xs text-gray-500">
                  {pctVsAvg > 1
                    ? `📈 Szybciej niż średnio o ${pctVsAvg.toFixed(0)}% (śr. tempo: ${formatPace(avgOthersPace)}/km)`
                    : pctVsAvg < -1
                      ? `📉 Wolniej niż średnio o ${Math.abs(pctVsAvg).toFixed(0)}% (śr. tempo: ${formatPace(avgOthersPace)}/km)`
                      : `Podobnie do średniej (śr. tempo: ${formatPace(avgOthersPace)}/km)`}
                </p>
              )}
              {run.notes && <p className="text-sm text-gray-500 italic mt-1">{run.notes}</p>}
            </div>
          );
        })}

        <div className="bg-white rounded-2xl shadow-sm p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Wyniki per seria</h3>
          <div className="space-y-2">
            {data.sets.map((s, i) => {
              const barWidth = maxReps > 0 ? (s.reps / maxReps) * 100 : 0;
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-6 shrink-0">S{i + 1}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                    <div className="bg-blue-500 h-full rounded-full flex items-center justify-end pr-2 transition-all"
                      style={{ width: `${barWidth}%` }}>
                      <span className="text-xs font-bold text-white">{s.reps}</span>
                    </div>
                  </div>
                  {s.duration !== null ? (
                    <span className="text-xs text-gray-400 w-12 shrink-0 text-right">{formatTime(s.duration)}</span>
                  ) : (
                    <span className="w-12 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-sm">
            <span className="text-gray-500">Najlepsza seria</span>
            <span className="font-bold text-gray-900">{Math.max(...data.sets.map(s => s.reps))} powt.</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Najsłabsza seria</span>
            <span className="font-bold text-gray-900">{Math.min(...data.sets.map(s => s.reps))} powt.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

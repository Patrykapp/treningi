'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { formatDate } from '@/lib/utils';
import { runCalories, latestWeight } from '@/lib/calories';
import { SkeletonCard } from '@/components/ui/Skeleton';
import {
  ArrowLeft, Trophy, Timer, MapPin, Zap, Flame, Heart, CircleDot,
} from 'lucide-react';

interface Run {
  id: string;
  date: string;
  distance: number;
  duration: number;
  splits: number[];
  notes?: string | null;
  kcal?: number | null;
  avgHr?: number | null;
  maxHr?: number | null;
  user: { id: string; name: string };
}

function formatPace(secPerKm: number): string {
  if (!secPerKm || secPerKm <= 0) return '—';
  const mins = Math.floor(secPerKm / 60);
  const secs = Math.round(secPerKm % 60);
  return `${mins}'${secs.toString().padStart(2, '0')}"`;
}
function paceToKmh(secPerKm: number): string {
  if (!secPerKm || secPerKm <= 0) return '—';
  return (3600 / secPerKm).toFixed(2);
}
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
function splitLabel(index: number, distance: number): string {
  const fullKms = Math.floor(distance);
  const partial = distance - fullKms;
  if (index < fullKms) return `km ${index + 1}`;
  if (partial > 0.01) return `${(partial * 1000).toFixed(0)}m`;
  return `km ${index + 1}`;
}
function splitDistance(index: number, distance: number): number {
  const fullKms = Math.floor(distance);
  if (index < fullKms) return 1;
  return distance - fullKms;
}

export default function BiegSummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [run, setRun] = useState<Run | null>(null);
  const [others, setOthers] = useState<Run[]>([]);
  const [weightKg, setWeightKg] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/runs/${id}`)
      .then(r => r.json())
      .then(data => {
        if (data && !data.error) {
          setRun({ ...data, splits: Array.isArray(data.splits) ? data.splits : [] });
          if (data.user?.id) {
            fetch(`/api/runs?userId=${data.user.id}&limit=100`)
              .then(r => r.json())
              .then(d => setOthers(Array.isArray(d) ? d.filter((r: Run) => r.id !== data.id) : []))
              .catch(() => {});
            fetch(`/api/body-weight?userId=${data.user.id}&limit=1`)
              .then(r => r.json())
              .then(d => setWeightKg(latestWeight(Array.isArray(d) ? d : [])))
              .catch(() => {});
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="px-4 py-4 space-y-4 md:max-w-3xl lg:max-w-4xl md:mx-auto">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );

  if (!run) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-gray-500">
      <p>Nie znaleziono biegu.</p>
      <button
        onClick={() => router.back()}
        className="text-blue-600 underline text-sm transition-colors hover:text-blue-700 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      >Wróć</button>
    </div>
  );

  const pace = run.distance > 0 ? run.duration / run.distance : 0;
  const kcal = run.kcal || runCalories(weightKg, run.distance);
  const bestOthersPace = others.length > 0 ? Math.min(...others.map(r => r.duration / r.distance)) : 0;
  const avgOthersPace = others.length > 0
    ? others.reduce((s, r) => s + r.duration / r.distance, 0) / others.length
    : 0;
  const isPR = others.length > 0 && pace > 0 && pace <= bestOthersPace;
  const pctVsAvg = avgOthersPace > 0 && pace > 0 ? ((avgOthersPace - pace) / avgOthersPace) * 100 : null;

  const hasSplits = run.splits.length > 0;
  const fullSplits = run.splits.filter((_, j) => splitDistance(j, run.distance) >= 0.99);
  const minP = fullSplits.length > 0 ? Math.min(...fullSplits) : 0;
  const maxP = fullSplits.length > 0 ? Math.max(...fullSplits) : 0;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white border-b px-4 pt-4 pb-3 sticky top-0 z-10">
        <button
          onClick={() => router.back()}
          className="text-blue-600 text-sm mb-2 flex items-center gap-1 rounded-lg transition-colors hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={2} /> Wróć
        </button>
        <h1 className="text-xl font-bold text-gray-900 inline-flex items-center gap-2">
          Bieg
          {isPR && others.length > 1 && (
            <span className="text-xs font-bold bg-yellow-400 text-yellow-900 rounded-lg px-2 py-0.5 inline-flex items-center gap-1">
              <Trophy className="w-3.5 h-3.5" strokeWidth={2} /> najlepsze tempo
            </span>
          )}
        </h1>
        <p className="text-sm text-gray-500">{formatDate(run.date)} · {run.user.name}</p>
      </div>

      <div className="px-4 py-4 space-y-4 md:max-w-3xl lg:max-w-4xl md:mx-auto">
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
            <p className="text-xl font-black text-gray-900 flex items-center justify-center gap-1.5"><MapPin className="w-4 h-4" strokeWidth={2} /> {run.distance} km</p>
            <p className="text-xs text-gray-500 mt-0.5">dystans</p>
          </div>
          <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
            <p className="text-xl font-black text-blue-600 flex items-center justify-center gap-1.5"><Timer className="w-4 h-4" strokeWidth={2} /> {formatDuration(run.duration)}</p>
            <p className="text-xs text-gray-500 mt-0.5">czas</p>
          </div>
          <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
            <p className="text-xl font-black text-gray-900 flex items-center justify-center gap-1.5"><Zap className="w-4 h-4" strokeWidth={2} /> {formatPace(pace)}</p>
            <p className="text-xs text-gray-500 mt-0.5">/km · {paceToKmh(pace)} km/h</p>
          </div>
        </div>

        {(kcal > 0 || run.avgHr) && (
          <div className="bg-white rounded-2xl shadow-sm p-4 flex items-center justify-around text-center">
            {kcal > 0 && (
              <div>
                <p className="text-base font-bold text-red-500 flex items-center justify-center gap-1.5"><Flame className="w-4 h-4" strokeWidth={2} /> ~{kcal}</p>
                <p className="text-xs text-gray-500">kcal</p>
              </div>
            )}
            {run.avgHr && (
              <div>
                <p className="text-base font-bold text-gray-900 flex items-center justify-center gap-1.5"><Heart className="w-4 h-4" strokeWidth={2} /> {run.avgHr}{run.maxHr ? ` / ${run.maxHr}` : ''}</p>
                <p className="text-xs text-gray-500">tętno śr. / maks.</p>
              </div>
            )}
          </div>
        )}

        {pctVsAvg !== null && (
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="text-sm text-gray-600">
              {pctVsAvg > 1
                ? `📈 Szybciej niż średnio o ${pctVsAvg.toFixed(0)}% (śr. tempo: ${formatPace(avgOthersPace)}/km)`
                : pctVsAvg < -1
                  ? `📉 Wolniej niż średnio o ${Math.abs(pctVsAvg).toFixed(0)}% (śr. tempo: ${formatPace(avgOthersPace)}/km)`
                  : `Podobnie do średniej (śr. tempo: ${formatPace(avgOthersPace)}/km)`}
            </p>
          </div>
        )}

        {hasSplits && (
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Splity per km</h3>
            <div className="space-y-2">
              {run.splits.map((paceSeg, i) => {
                const dist = splitDistance(i, run.distance);
                const isPartialKm = dist < 0.99;
                const isFastest = !isPartialKm && fullSplits.length > 1 && paceSeg === minP;
                const isSlowest = !isPartialKm && fullSplits.length > 1 && paceSeg === maxP;
                const barWidth = maxP > minP
                  ? 30 + 70 * (1 - (paceSeg - minP) / (maxP - minP))
                  : 80;
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
                      <span className="text-sm font-medium text-gray-800">{formatPace(paceSeg)}/km</span>
                      <span className="text-xs text-gray-400 ml-1">{paceToKmh(paceSeg)}</span>
                    </div>
                    {isFastest && <CircleDot className="w-3.5 h-3.5 text-green-500" strokeWidth={2} />}
                    {isSlowest && <CircleDot className="w-3.5 h-3.5 text-red-500" strokeWidth={2} />}
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex gap-4 text-xs text-gray-400">
              <span className="flex items-center gap-1"><CircleDot className="w-3.5 h-3.5 text-green-500" strokeWidth={2} /> najszybszy</span>
              <span className="flex items-center gap-1"><CircleDot className="w-3.5 h-3.5 text-red-500" strokeWidth={2} /> najwolniejszy</span>
            </div>
          </div>
        )}

        {run.notes && (
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="text-sm text-gray-500 italic">{run.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}

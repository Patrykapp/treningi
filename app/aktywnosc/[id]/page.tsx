'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { formatDate } from '@/lib/utils';
import { parseTcx, HR_BUCKET_SEC } from '@/lib/tcx';
import { computeHrZones, estimateHrMax, formatZoneTime } from '@/lib/hr';
import { useAuth } from '@/hooks/useAuth';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { ArrowLeft, Timer, MapPin, Flame, Heart, Watch } from 'lucide-react';

interface Activity {
  id: string;
  date: string;
  type: string;
  durationMin: number;
  distanceKm: number | null;
  kcal: number | null;
  avgHr: number | null;
  maxHr: number | null;
  hrSeries: number[];
  notes: string | null;
  user: { id: string; name: string };
}

function formatDur(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

// Lekki wykres tętna (SVG, bez bibliotek) — ten sam wzorzec co w podsumowaniu treningu.
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
          <linearGradient id="hrFillAct" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map(p => (
          <line key={p} x1="0" y1={H * p} x2={W} y2={H * p} stroke="#e5e7eb" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
        {areaPts && <polygon points={areaPts} fill="url(#hrFillAct)" />}
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

export default function AktywnoscSummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { userId: authUserId } = useAuth();
  const [activity, setActivity] = useState<Activity | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/activities/${id}`)
      .then(r => r.json())
      .then(data => {
        if (data && !data.error) {
          setActivity({ ...data, hrSeries: Array.isArray(data.hrSeries) ? data.hrSeries : [] });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  const attachTcx = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activity) return;
    const text = await file.text();
    const parsed = parseTcx(text);
    if (!parsed) return;
    const res = await fetch(`/api/activities/${activity.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        durationMin: Math.round(parsed.durationSec / 60),
        distanceKm: parsed.distanceKm > 0 ? parsed.distanceKm : undefined,
        kcal: parsed.kcal > 0 ? parsed.kcal : undefined,
        avgHr: parsed.avgHr || undefined,
        maxHr: parsed.maxHr || undefined,
        hrSeries: parsed.hrSeries,
      }),
    });
    if (res.ok) {
      const updated = await res.json();
      setActivity({ ...updated, hrSeries: Array.isArray(updated.hrSeries) ? updated.hrSeries : [] });
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="px-4 py-4 space-y-4 md:max-w-3xl lg:max-w-4xl md:mx-auto">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );

  if (!activity) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-gray-500">
      <p>Nie znaleziono aktywności.</p>
      <button
        onClick={() => router.back()}
        className="text-blue-600 underline text-sm transition-colors hover:text-blue-700 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      >Wróć</button>
    </div>
  );

  const isMine = authUserId === activity.user.id;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white border-b px-4 pt-4 pb-3 sticky top-0 z-10">
        <button
          onClick={() => router.back()}
          className="text-blue-600 text-sm mb-2 flex items-center gap-1 rounded-lg transition-colors hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={2} /> Wróć
        </button>
        <h1 className="text-xl font-bold text-gray-900">{activity.type}</h1>
        <p className="text-sm text-gray-500">{formatDate(activity.date)} · {activity.user.name}</p>
      </div>

      <div className="px-4 py-4 space-y-4 md:max-w-3xl lg:max-w-4xl md:mx-auto">
        {/* Statystyki ogólne */}
        <div className={`grid gap-2 ${activity.distanceKm || activity.kcal ? 'grid-cols-3' : 'grid-cols-1'}`}>
          <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
            <p className="text-xl font-black text-blue-600 flex items-center justify-center gap-1.5"><Timer className="w-4 h-4" strokeWidth={2} /> {formatDur(activity.durationMin)}</p>
            <p className="text-xs text-gray-500 mt-0.5">czas</p>
          </div>
          {activity.distanceKm && (
            <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
              <p className="text-xl font-black text-gray-900 flex items-center justify-center gap-1.5"><MapPin className="w-4 h-4" strokeWidth={2} /> {activity.distanceKm} km</p>
              <p className="text-xs text-gray-500 mt-0.5">dystans</p>
            </div>
          )}
          {activity.kcal && (
            <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
              <p className="text-xl font-black text-red-500 flex items-center justify-center gap-1.5"><Flame className="w-4 h-4" strokeWidth={2} /> {activity.kcal}</p>
              <p className="text-xs text-gray-500 mt-0.5">kcal</p>
            </div>
          )}
        </div>

        {/* Dane z zegarka — tętno */}
        {activity.avgHr ? (
          <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
            <div className="flex items-center justify-around text-center">
              <div>
                <p className="text-base font-bold text-gray-900 flex items-center justify-center gap-1.5"><Heart className="w-4 h-4" strokeWidth={2} /> {activity.avgHr}{activity.maxHr ? ` / ${activity.maxHr}` : ''}</p>
                <p className="text-xs text-gray-500">tętno śr. / maks.</p>
              </div>
            </div>

            {activity.hrSeries.length > 2 && <HrChart series={activity.hrSeries} />}

            {activity.hrSeries.length > 2 && (() => {
              const zones = computeHrZones(activity.hrSeries, estimateHrMax(activity.maxHr));
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
        ) : isMine && (
          <label className="w-full text-center text-sm text-blue-600 font-medium bg-white rounded-2xl shadow-sm py-3 cursor-pointer transition-colors hover:bg-gray-50 flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
            <Watch className="w-4 h-4" strokeWidth={2} /> Importuj dane z zegarka (TCX)
            <input type="file" accept=".tcx,.xml" onChange={attachTcx} className="hidden" />
          </label>
        )}

        {activity.notes && (
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="text-sm text-gray-500 italic">{activity.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}

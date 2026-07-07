'use client';

import { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts';
import { X, Trophy, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';

interface ProgressPoint {
  date: string;
  maxWeight: number;
  bestReps: number;
  best1RM: number;
  volume: number;
}

interface Props {
  exerciseId: string;
  exerciseName: string;
  userId?: string;
  onClose: () => void;
}

type Mode = '1rm' | 'weight' | 'volume';

const MODE_LABELS: Record<Mode, string> = {
  '1rm': 'Szac. 1RM',
  'weight': 'Max ciężar',
  'volume': 'Objętość',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}.${d.getMonth() + 1}`;
}

function formatDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d: ProgressPoint = payload[0].payload;
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-lg text-xs">
      <p className="font-bold text-gray-800 mb-1">{formatDateLong(d.date)}</p>
      {d.best1RM > 0 && <p className="text-purple-700">1RM: <strong>{d.best1RM} kg</strong></p>}
      <p className="text-gray-700">Max: {d.maxWeight} kg × {d.bestReps}</p>
      <p className="text-gray-500">Vol: {d.volume.toLocaleString('pl-PL')} kg</p>
    </div>
  );
}

export function ExerciseProgressModal({ exerciseId, exerciseName, userId, onClose }: Props) {
  const [points, setPoints] = useState<ProgressPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>('1rm');

  useEffect(() => {
    const params = new URLSearchParams();
    if (userId) params.set('userId', userId);
    fetch(`/api/exercises/${exerciseId}/progress?${params}`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setPoints(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [exerciseId, userId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const dataKey: keyof ProgressPoint = mode === '1rm' ? 'best1RM' : mode === 'weight' ? 'maxWeight' : 'volume';
  const color = mode === '1rm' ? '#7c3aed' : mode === 'weight' ? '#2563eb' : '#059669';

  const allVals = points.map(p => p[dataKey] as number).filter(v => v > 0);
  const minVal = allVals.length ? Math.floor(Math.min(...allVals) * 0.92) : 0;
  const maxVal = allVals.length ? Math.ceil(Math.max(...allVals) * 1.05) : 100;

  // Oblicz PR (max wartość)
  const prPoint = points.reduce<ProgressPoint | null>((best, p) =>
    !best || (p[dataKey] as number) > (best[dataKey] as number) ? p : best, null);

  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  const trend = last && prev
    ? ((last[dataKey] as number) - (prev[dataKey] as number))
    : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col transition-opacity duration-200" style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mt-auto bg-white rounded-t-3xl w-full max-h-[85vh] flex flex-col transition-all duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900">{exerciseName}</h2>
            <p className="text-xs text-gray-500">Postęp — {points.length} sesji</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 w-10 h-10 flex items-center justify-center rounded-xl transition hover:bg-gray-100 hover:text-gray-600 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            aria-label="Zamknij"
          >
            <X className="w-5 h-5" strokeWidth={2} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-4 pb-3 shrink-0">
          {(Object.keys(MODE_LABELS) as Mode[]).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-xl transition-colors active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                mode === m ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>

        {/* Statsy */}
        {!loading && points.length > 0 && (
          <div className="flex gap-3 px-4 pb-3 shrink-0">
            {prPoint && (
              <div className="flex-1 bg-purple-50 rounded-xl px-3 py-2 text-center">
                <div className="text-xs text-purple-600 font-medium flex items-center justify-center gap-1"><Trophy className="w-3.5 h-3.5" strokeWidth={2} /> Rekord</div>
                <div className="text-lg font-bold text-purple-800">
                  {prPoint[dataKey]} {mode === 'volume' ? '' : 'kg'}
                </div>
                <div className="text-[10px] text-purple-500">{formatDateLong(prPoint.date)}</div>
              </div>
            )}
            {last && (
              <div className="flex-1 bg-gray-50 rounded-xl px-3 py-2 text-center">
                <div className="text-xs text-gray-500 font-medium">Ostatnio</div>
                <div className="text-lg font-bold text-gray-800">
                  {last[dataKey]} {mode === 'volume' ? '' : 'kg'}
                </div>
                {trend !== null && (
                  <div className={`text-[10px] font-medium flex items-center justify-center gap-0.5 ${trend > 0 ? 'text-green-600' : trend < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                    {trend > 0 ? <TrendingUp className="w-3 h-3" strokeWidth={2} /> : trend < 0 ? <TrendingDown className="w-3 h-3" strokeWidth={2} /> : <Minus className="w-3 h-3" strokeWidth={2} />}
                    {Math.abs(trend)} {mode === 'volume' ? '' : 'kg'}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Wykres */}
        <div className="flex-1 overflow-auto px-2 pb-6">
          {loading ? (
            <div className="h-40 flex flex-col justify-center gap-2 px-4">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          ) : points.length < 2 ? (
            <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
              {points.length === 0 ? 'Brak danych' : 'Potrzebujesz min. 2 sesji do wykresu'}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={points} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                <YAxis domain={[minVal, maxVal]} tick={{ fontSize: 10, fill: '#9ca3af' }} width={40} />
                <Tooltip content={<CustomTooltip />} />
                {prPoint && (
                  <ReferenceLine
                    x={prPoint.date}
                    stroke="#f59e0b"
                    strokeDasharray="4 2"
                    label={{ value: 'PR', position: 'top', fontSize: 9, fill: '#f59e0b' }}
                  />
                )}
                <Line
                  type="monotone" dataKey={dataKey}
                  stroke={color} strokeWidth={2}
                  dot={{ r: 3, fill: color, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: color }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

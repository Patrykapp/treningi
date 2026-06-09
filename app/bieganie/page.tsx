'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { formatDateInput } from '@/lib/utils';

interface RunSession {
  id: string;
  date: string;
  distance: number;
  duration: number;
  splits: number[]; // seconds per km segment
  notes: string | null;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function formatPace(secPerKm: number): string {
  if (!secPerKm || secPerKm <= 0) return '—';
  const mins = Math.floor(secPerKm / 60);
  const secs = Math.round(secPerKm % 60);
  return `${mins}'${secs.toString().padStart(2, '0')}"`;
}

function formatPaceFromDistDur(distance: number, duration: number): string {
  if (!distance || !duration) return '—';
  return formatPace(duration / distance);
}

function formatSpeed(distance: number, duration: number): string {
  if (!distance || !duration) return '—';
  return (distance / (duration / 3600)).toFixed(2);
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function parseSplitInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  // accept: 5'24", 5:24, 524, 5m24s, just numbers as seconds
  const colonMatch = trimmed.match(/^(\d+)[:'"](\d{1,2})["]?$/);
  if (colonMatch) return parseInt(colonMatch[1]) * 60 + parseInt(colonMatch[2]);
  const numOnly = parseInt(trimmed);
  if (!isNaN(numOnly) && trimmed.match(/^\d+$/)) {
    // treat as seconds if <= 999, else as mmss
    return numOnly <= 999 ? numOnly : Math.floor(numOnly / 100) * 60 + (numOnly % 100);
  }
  return null;
}

function splitLabel(index: number, total: number, distance: number): string {
  const fullKms = Math.floor(distance);
  const partial = distance - fullKms;
  if (index < fullKms) return `km ${index + 1}`;
  if (partial > 0.01) return `(${partial.toFixed(2)} km)`;
  return `km ${index + 1}`;
}

function splitDistance(index: number, distance: number): number {
  const fullKms = Math.floor(distance);
  if (index < fullKms) return 1;
  return distance - fullKms;
}

// ─── component ──────────────────────────────────────────────────────────────

export default function BieganiePage() {
  const router = useRouter();
  const { isLoggedIn, loading, userId } = useAuth();

  const [runs, setRuns] = useState<RunSession[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(true);

  // Form
  const [date, setDate] = useState(formatDateInput(new Date()));
  const [distance, setDistance] = useState('');
  const [splitInputs, setSplitInputs] = useState<string[]>([]);
  const [manualDuration, setManualDuration] = useState(''); // fallback if no splits
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  // Derive number of split slots from distance
  const distNum = parseFloat(distance);
  const splitCount = useMemo(() => {
    if (!distNum || distNum <= 0) return 0;
    const full = Math.floor(distNum);
    const partial = distNum - full;
    return full + (partial > 0.01 ? 1 : 0);
  }, [distNum]);

  // Sync splitInputs array length when distance changes
  useEffect(() => {
    setSplitInputs(prev => {
      const next = Array(splitCount).fill('');
      for (let i = 0; i < Math.min(prev.length, splitCount); i++) next[i] = prev[i];
      return next;
    });
  }, [splitCount]);

  // Parse all splits
  const parsedSplits = splitInputs.map(v => parseSplitInput(v));
  const allSplitsFilled = parsedSplits.length > 0 && parsedSplits.every(s => s !== null);

  // Total duration: from splits if available, else manual input
  const totalDurFromSplits = allSplitsFilled
    ? parsedSplits.reduce((a, b) => (a ?? 0) + (b ?? 0), 0) ?? 0
    : 0;

  const manualDurSec = useMemo(() => {
    const trimmed = manualDuration.trim();
    if (!trimmed) return 0;
    const parts = trimmed.split(':').map(Number);
    if (parts.some(isNaN)) return 0;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return 0;
  }, [manualDuration]);

  const effectiveDuration = allSplitsFilled ? totalDurFromSplits : manualDurSec;
  const liveOk = distNum > 0 && effectiveDuration > 0;

  // ─── data loading ──────────────────────────────────────────────────────────

  const loadRuns = useCallback(async () => {
    if (!userId) return;
    setLoadingRuns(true);
    try {
      const res = await fetch(`/api/runs?userId=${userId}`);
      if (res.ok) {
        const data = await res.json();
        setRuns(data.map((r: RunSession) => ({ ...r, splits: Array.isArray(r.splits) ? r.splits : [] })));
      }
    } finally {
      setLoadingRuns(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!loading && !isLoggedIn) router.push('/login');
  }, [isLoggedIn, loading, router]);

  useEffect(() => {
    if (userId) loadRuns();
  }, [userId, loadRuns]);

  // ─── submit ────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!distNum || distNum <= 0) { setError('Podaj dystans'); return; }
    if (!effectiveDuration) { setError('Podaj czas lub splity'); return; }
    if (splitInputs.some((v, i) => v.trim() && parsedSplits[i] === null)) {
      setError('Nieprawidłowy format splitu (np. 5\'24" lub 5:24)'); return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          distance: distNum,
          duration: effectiveDuration,
          splits: allSplitsFilled ? parsedSplits : [],
          notes,
          userId,
        }),
      });
      if (!res.ok) throw new Error();
      setSuccess('Bieg zapisany!');
      setDistance('');
      setSplitInputs([]);
      setManualDuration('');
      setNotes('');
      setTimeout(() => setSuccess(''), 3000);
      await loadRuns();
    } catch {
      setError('Błąd zapisu biegu');
    } finally {
      setSaving(false);
    }
  };

  // ─── stats ─────────────────────────────────────────────────────────────────

  const bestRun = runs.length > 1
    ? runs.reduce((best, r) => (r.duration / r.distance < best.duration / best.distance ? r : best))
    : null;

  const chartRuns = [...runs].reverse().slice(-10);
  const chartPaces = chartRuns.map(r => r.duration / r.distance);
  const minPace = chartPaces.length ? Math.min(...chartPaces) : 1;
  const maxPace = chartPaces.length ? Math.max(...chartPaces) : 1;
  const paceRange = maxPace - minPace || 1;

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-gray-500">Ładowanie...</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700 text-xl">←</button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">🏃 Bieganie</h1>
          <p className="text-sm text-gray-500">{runs.length} biegów</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-6">

        {/* Stats row */}
        {runs.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
              <div className="text-2xl font-bold text-blue-600">
                {runs.reduce((s, r) => s + r.distance, 0).toFixed(1)}
              </div>
              <div className="text-xs text-gray-500 mt-1">km łącznie</div>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
              <div className="text-2xl font-bold text-green-600">
                {bestRun ? formatPaceFromDistDur(bestRun.distance, bestRun.duration) : '—'}
              </div>
              <div className="text-xs text-gray-500 mt-1">najlepsze tempo</div>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
              <div className="text-2xl font-bold text-purple-600">
                {runs.length > 0
                  ? formatPaceFromDistDur(
                      runs.reduce((s, r) => s + r.distance, 0),
                      runs.reduce((s, r) => s + r.duration, 0)
                    )
                  : '—'}
              </div>
              <div className="text-xs text-gray-500 mt-1">śr. tempo</div>
            </div>
          </div>
        )}

        {/* Pace chart (last 10 runs) */}
        {chartRuns.length >= 2 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Tempo — ostatnie biegi</h3>
            <div className="flex items-end gap-2 h-24">
              {chartRuns.map((r) => {
                const pace = r.duration / r.distance;
                // Better pace = taller bar (invert)
                const heightPct = 0.25 + 0.75 * (1 - (pace - minPace) / paceRange);
                const isBest = bestRun?.id === r.id;
                return (
                  <div key={r.id} className="flex-1 flex flex-col items-center gap-1">
                    <div className="text-gray-400 leading-none" style={{ fontSize: '9px' }}>
                      {formatPaceFromDistDur(r.distance, r.duration)}
                    </div>
                    <div
                      className={`w-full rounded-t-sm ${isBest ? 'bg-green-400' : 'bg-blue-300'}`}
                      style={{ height: `${heightPct * 52}px` }}
                    />
                    <div className="text-gray-400 leading-none" style={{ fontSize: '9px' }}>
                      {r.distance}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="text-xs text-gray-400 text-center mt-1">km</div>
          </div>
        )}

        {/* Form */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-4">Zapisz bieg</h2>
          <form onSubmit={handleSubmit} className="space-y-4">

            <div>
              <label className="block text-sm text-gray-600 mb-1">Data</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">Dystans (km)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="np. 3.15"
                value={distance}
                onChange={e => setDistance(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            {/* Split inputs */}
            {splitCount > 0 && (
              <div>
                <label className="block text-sm text-gray-600 mb-2">
                  Czas per km <span className="text-gray-400">(opcjonalnie, np. 5&apos;24&quot; lub 5:24)</span>
                </label>
                <div className="space-y-2">
                  {splitInputs.map((val, i) => {
                    const dist = splitDistance(i, distNum);
                    const parsed = parseSplitInput(val);
                    const isPartial = dist < 0.99;
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-sm text-gray-500 w-20 shrink-0">
                          {splitLabel(i, splitCount, distNum)}
                        </span>
                        <input
                          type="text"
                          placeholder="mm:ss"
                          value={val}
                          onChange={e => {
                            const next = [...splitInputs];
                            next[i] = e.target.value;
                            setSplitInputs(next);
                          }}
                          className={`flex-1 border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                            val && !parsed ? 'border-red-300' : 'border-gray-300'
                          }`}
                        />
                        {parsed !== null && (
                          <span className="text-xs text-blue-600 w-16 text-right shrink-0">
                            {isPartial ? formatDuration(parsed) : formatPace(parsed) + '/km'}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                {allSplitsFilled && (
                  <div className="mt-2 text-xs text-green-600 font-medium">
                    ✓ Łączny czas z splitów: {formatDuration(totalDurFromSplits)}
                  </div>
                )}
              </div>
            )}

            {/* Manual duration — shown when splits not all filled */}
            {!allSplitsFilled && (
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Całkowity czas {splitCount > 0 ? <span className="text-gray-400">(lub wypełnij splity powyżej)</span> : ''}
                </label>
                <input
                  type="text"
                  placeholder="mm:ss lub h:mm:ss"
                  value={manualDuration}
                  onChange={e => setManualDuration(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            )}

            {/* Live preview */}
            {liveOk && (
              <div className="bg-blue-50 rounded-xl p-3 grid grid-cols-2 gap-2 text-center">
                <div>
                  <div className="text-lg font-bold text-blue-700">
                    {formatPaceFromDistDur(distNum, effectiveDuration)}/km
                  </div>
                  <div className="text-xs text-blue-500">tempo</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-blue-700">
                    {formatSpeed(distNum, effectiveDuration)} km/h
                  </div>
                  <div className="text-xs text-blue-500">prędkość</div>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm text-gray-600 mb-1">Notatki (opcjonalnie)</label>
              <input
                type="text"
                placeholder="np. Bieganie na świeżym powietrzu"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            {error && <div className="text-red-600 text-sm bg-red-50 rounded-xl px-3 py-2">{error}</div>}
            {success && <div className="text-green-700 text-sm bg-green-50 rounded-xl px-3 py-2">✓ {success}</div>}

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-blue-600 text-white rounded-xl py-3 font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Zapisywanie...' : 'Zapisz bieg'}
            </button>
          </form>
        </div>

        {/* History */}
        <div>
          <h2 className="font-semibold text-gray-800 mb-3">Historia biegów</h2>
          {loadingRuns ? (
            <div className="text-center text-gray-400 py-8">Ładowanie...</div>
          ) : runs.length === 0 ? (
            <div className="text-center text-gray-400 py-8 bg-white rounded-2xl">
              Brak biegów. Zapisz pierwszy!
            </div>
          ) : (
            <div className="space-y-3">
              {runs.map(run => {
                const isPR = bestRun?.id === run.id;
                const hasSplits = run.splits && run.splits.length > 0;
                const isExpanded = expandedRun === run.id;
                const maxSplit = hasSplits ? Math.max(...run.splits) : 0;

                return (
                  <div key={run.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                    {/* Main row */}
                    <div className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-900 text-lg">{run.distance} km</span>
                            {isPR && runs.length > 1 && (
                              <span className="text-xs font-bold bg-yellow-400 text-yellow-900 rounded-xl px-2 py-0.5">🏆 PR</span>
                            )}
                          </div>
                          <div className="text-sm text-gray-500 mt-0.5">
                            {new Date(run.date).toLocaleDateString('pl-PL', {
                              weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
                            })}
                          </div>
                          {run.notes && <div className="text-sm text-gray-400 mt-1">{run.notes}</div>}
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-blue-600">
                            {formatPaceFromDistDur(run.distance, run.duration)}/km
                          </div>
                          <div className="text-sm text-gray-500">{formatSpeed(run.distance, run.duration)} km/h</div>
                          <div className="text-sm text-gray-400">{formatDuration(run.duration)}</div>
                        </div>
                      </div>

                      {hasSplits && (
                        <button
                          onClick={() => setExpandedRun(isExpanded ? null : run.id)}
                          className="mt-3 text-xs text-blue-500 hover:text-blue-700 font-medium"
                        >
                          {isExpanded ? '▲ Ukryj splity' : `▼ Splity per km (${run.splits.length})`}
                        </button>
                      )}
                    </div>

                    {/* Splits detail */}
                    {hasSplits && isExpanded && (
                      <div className="border-t border-gray-100 px-4 pb-4 pt-3">
                        <div className="space-y-2">
                          {run.splits.map((sec, i) => {
                            const dist = splitDistance(i, run.distance);
                            const isPartialKm = dist < 0.99;
                            const barWidth = maxSplit > 0 ? (sec / maxSplit) * 100 : 50;
                            // Only compare full km splits for fastest/slowest
                            const fullSplits = run.splits.filter((_, j) => splitDistance(j, run.distance) >= 0.99);
                            const isFastest = !isPartialKm && fullSplits.length > 1 && sec === Math.min(...fullSplits);
                            const isSlowest = !isPartialKm && fullSplits.length > 1 && sec === Math.max(...fullSplits);
                            return (
                              <div key={i} className="flex items-center gap-3">
                                <span className="text-sm text-gray-500 w-14 shrink-0">
                                  {splitLabel(i, run.splits.length, run.distance)}
                                </span>
                                <div className="flex-1 flex items-center gap-2">
                                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                                    <div
                                      className={`h-2 rounded-full ${isFastest ? 'bg-green-400' : isSlowest ? 'bg-orange-400' : 'bg-blue-300'}`}
                                      style={{ width: `${barWidth}%` }}
                                    />
                                  </div>
                                  <span className="text-sm font-medium text-gray-700 w-12 text-right shrink-0">
                                    {formatDuration(sec)}
                                  </span>
                                  <span className="text-xs text-gray-400 w-16 text-right shrink-0">
                                    {isPartialKm ? `${(dist * 1000).toFixed(0)}m` : `${formatPace(sec)}/km`}
                                  </span>
                                </div>
                                {isFastest && <span className="text-xs">🟢</span>}
                                {isSlowest && <span className="text-xs">🔴</span>}
                              </div>
                            );
                          })}
                        </div>
                        <div className="mt-2 flex gap-4 text-xs text-gray-400">
                          <span>🟢 najszybszy</span>
                          <span>🔴 najwolniejszy</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

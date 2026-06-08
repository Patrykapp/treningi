'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { formatDateInput } from '@/lib/utils';

interface RunSession {
  id: string;
  date: string;
  distance: number;
  duration: number;
  notes: string | null;
}

function formatPace(distance: number, duration: number): string {
  if (!distance || !duration) return '—';
  const secPerKm = duration / distance;
  const mins = Math.floor(secPerKm / 60);
  const secs = Math.round(secPerKm % 60);
  return `${mins}'${secs.toString().padStart(2, '0')}"`;
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

function parseDuration(value: string): number | null {
  // accepts: mm:ss or h:mm:ss
  const parts = value.trim().split(':').map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

export default function BieganiePage() {
  const router = useRouter();
  const { isLoggedIn, loading, userId } = useAuth();

  const [runs, setRuns] = useState<RunSession[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(true);

  // Form state
  const [date, setDate] = useState(formatDateInput(new Date()));
  const [distance, setDistance] = useState('');
  const [durationInput, setDurationInput] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadRuns = useCallback(async () => {
    if (!userId) return;
    setLoadingRuns(true);
    try {
      const res = await fetch(`/api/runs?userId=${userId}`);
      if (res.ok) setRuns(await res.json());
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

  // Live calculated values
  const distNum = parseFloat(distance);
  const durSec = parseDuration(durationInput) ?? 0;
  const liveOk = distNum > 0 && durSec > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const dur = parseDuration(durationInput);
    if (!dur) { setError('Nieprawidłowy format czasu (mm:ss lub h:mm:ss)'); return; }
    if (!distance || parseFloat(distance) <= 0) { setError('Podaj dystans'); return; }

    setSaving(true);
    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, distance: parseFloat(distance), duration: dur, notes, userId }),
      });
      if (!res.ok) throw new Error('Błąd zapisu');
      setSuccess('Bieg zapisany!');
      setDistance('');
      setDurationInput('');
      setNotes('');
      setTimeout(() => setSuccess(''), 3000);
      await loadRuns();
    } catch {
      setError('Błąd zapisu biegu');
    } finally {
      setSaving(false);
    }
  };

  // Best pace (lowest sec/km)
  const bestRun = runs.length > 0
    ? runs.reduce((best, r) => (r.duration / r.distance < best.duration / best.distance ? r : best))
    : null;

  // Chart: last 10 runs pace in sec/km (lower = better)
  const chartRuns = [...runs].reverse().slice(-10);
  const maxPaceSec = chartRuns.length > 0
    ? Math.max(...chartRuns.map(r => r.duration / r.distance))
    : 1;

  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="text-gray-500">Ładowanie...</div></div>;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
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
                {bestRun ? formatPace(bestRun.distance, bestRun.duration) : '—'}
              </div>
              <div className="text-xs text-gray-500 mt-1">najlepsze tempo</div>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
              <div className="text-2xl font-bold text-purple-600">
                {runs.length > 0
                  ? formatPace(
                      runs.reduce((s, r) => s + r.distance, 0),
                      runs.reduce((s, r) => s + r.duration, 0)
                    )
                  : '—'}
              </div>
              <div className="text-xs text-gray-500 mt-1">śr. tempo</div>
            </div>
          </div>
        )}

        {/* Pace chart */}
        {chartRuns.length >= 2 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Tempo (ostatnie biegi)</h3>
            <div className="flex items-end gap-1.5 h-20">
              {chartRuns.map((r, i) => {
                const paceSec = r.duration / r.distance;
                // Invert: best pace = tallest bar
                const heightPct = maxPaceSec > 0 ? (1 - (paceSec - Math.min(...chartRuns.map(x => x.duration / x.distance))) / (maxPaceSec - Math.min(...chartRuns.map(x => x.duration / x.distance)) + 0.001)) * 0.7 + 0.3 : 0.5;
                return (
                  <div key={r.id} className="flex-1 flex flex-col items-center gap-1">
                    <div className="text-xs text-gray-400" style={{ fontSize: '9px' }}>
                      {formatPace(r.distance, r.duration)}
                    </div>
                    <div
                      className="w-full rounded-t-sm bg-blue-400"
                      style={{ height: `${heightPct * 56}px` }}
                      title={`${r.distance}km – ${formatPace(r.distance, r.duration)}/km`}
                    />
                    <div className="text-xs text-gray-400" style={{ fontSize: '9px' }}>
                      {r.distance}km
                    </div>
                  </div>
                );
              })}
            </div>
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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Dystans (km)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="np. 5.25"
                  value={distance}
                  onChange={e => setDistance(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Czas (mm:ss)</label>
                <input
                  type="text"
                  placeholder="np. 25:30"
                  value={durationInput}
                  onChange={e => setDurationInput(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </div>

            {/* Live stats preview */}
            {liveOk && (
              <div className="bg-blue-50 rounded-xl p-3 grid grid-cols-2 gap-2 text-center">
                <div>
                  <div className="text-lg font-bold text-blue-700">{formatPace(distNum, durSec)}/km</div>
                  <div className="text-xs text-blue-500">tempo</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-blue-700">{formatSpeed(distNum, durSec)} km/h</div>
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
                const isPersonalBest = bestRun?.id === run.id && runs.length > 1;
                return (
                  <div key={run.id} className="bg-white rounded-2xl p-4 shadow-sm">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-900 text-lg">{run.distance} km</span>
                          {isPersonalBest && (
                            <span className="text-xs font-bold bg-yellow-400 text-yellow-900 rounded-xl px-2 py-0.5">🏆 PR</span>
                          )}
                        </div>
                        <div className="text-sm text-gray-500 mt-0.5">
                          {new Date(run.date).toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>
                        {run.notes && <div className="text-sm text-gray-400 mt-1">{run.notes}</div>}
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-blue-600">{formatPace(run.distance, run.duration)}/km</div>
                        <div className="text-sm text-gray-500">{formatSpeed(run.distance, run.duration)} km/h</div>
                        <div className="text-sm text-gray-400">{formatDuration(run.duration)}</div>
                      </div>
                    </div>
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

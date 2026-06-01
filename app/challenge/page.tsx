'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Toast } from '@/components/ui/Toast';
import { Exercise } from '@/types';

type Phase = 'setup' | 'active' | 'rest' | 'summary';

interface SetResult {
  reps: number;
  duration: number;
}

interface SavedState {
  phase: Phase;
  selectedExercise: Exercise | null;
  numSets: number;
  restSeconds: number;
  currentSet: number;
  results: SetResult[];
  pendingReps: string;
  // Timestamps for timer reconstruction
  setStartedAt: number | null;   // Date.now() when active set began
  restStartedAt: number | null;  // Date.now() when rest began
}

const STORAGE_KEY = 'challenge_state';

function saveState(s: SavedState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}
function clearState() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}
function loadState(): SavedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function formatTime(sec: number) {
  const m = Math.floor(Math.abs(sec) / 60).toString().padStart(2, '0');
  const s = (Math.abs(sec) % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function ChallengePage() {
  const { isLoggedIn, userId } = useAuth();
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [saveAsUserId, setSaveAsUserId] = useState('');
  const [search, setSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const [phase, setPhase] = useState<Phase>('setup');
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [numSets, setNumSets] = useState(3);
  const [restSeconds, setRestSeconds] = useState(300);
  const [currentSet, setCurrentSet] = useState(1);
  const [results, setResults] = useState<SetResult[]>([]);
  const [pendingReps, setPendingReps] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [elapsed, setElapsed] = useState(0);
  const [restRemaining, setRestRemaining] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const setStartedAtRef = useRef<number | null>(null);
  const restStartedAtRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  // ── Restore from localStorage on mount ──────────────────────────────────
  useEffect(() => {
    fetch('/api/exercises').then(r => r.json()).then(d => setExercises(Array.isArray(d) ? d : []));
    fetch('/api/users').then(r => r.json()).then(d => setUsers(Array.isArray(d) ? d : []));

    const saved = loadState();
    if (saved && saved.phase !== 'setup') {
      setPhase(saved.phase);
      setSelectedExercise(saved.selectedExercise);
      setNumSets(saved.numSets);
      setRestSeconds(saved.restSeconds);
      setCurrentSet(saved.currentSet);
      setResults(saved.results);
      setPendingReps(saved.pendingReps);

      if (saved.phase === 'active' && saved.setStartedAt) {
        setStartedAtRef.current = saved.setStartedAt;
        setElapsed(Math.floor((Date.now() - saved.setStartedAt) / 1000));
      }
      if (saved.phase === 'rest' && saved.restStartedAt) {
        restStartedAtRef.current = saved.restStartedAt;
        const gone = Math.floor((Date.now() - saved.restStartedAt) / 1000);
        const remaining = Math.max(0, saved.restSeconds - gone);
        setRestRemaining(remaining);
        if (remaining === 0) {
          setPhase('active');
          setStartedAtRef.current = Date.now();
        }
      }
    }
    setHydrated(true);
  }, []);

  // ── Persist state on every change ────────────────────────────────────────
  useEffect(() => {
    if (!hydrated) return;
    if (phase === 'setup') { clearState(); return; }
    saveState({
      phase, selectedExercise, numSets, restSeconds, currentSet, results, pendingReps,
      setStartedAt: setStartedAtRef.current,
      restStartedAt: restStartedAtRef.current,
    });
  }, [phase, selectedExercise, numSets, restSeconds, currentSet, results, pendingReps, hydrated]);

  // ── Active set timer ──────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'active') return;
    if (!setStartedAtRef.current) {
      setStartedAtRef.current = Date.now();
      setElapsed(0);
    }
    clearTimer();
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - setStartedAtRef.current!) / 1000));
    }, 1000);
    return clearTimer;
  }, [phase, currentSet]);

  // ── Rest countdown ────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'rest') return;
    if (!restStartedAtRef.current) {
      restStartedAtRef.current = Date.now();
      setRestRemaining(restSeconds);
    }
    clearTimer();
    timerRef.current = setInterval(() => {
      const gone = Math.floor((Date.now() - restStartedAtRef.current!) / 1000);
      const remaining = Math.max(0, restSeconds - gone);
      setRestRemaining(remaining);
      if (remaining === 0) {
        clearTimer();
        restStartedAtRef.current = null;
        setStartedAtRef.current = Date.now();
        setPhase('active');
      }
    }, 1000);
    return clearTimer;
  }, [phase, restSeconds]);

  const filtered = exercises.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 8);

  const startChallenge = () => {
    if (!selectedExercise) return;
    setResults([]);
    setCurrentSet(1);
    setPendingReps('');
    setStartedAtRef.current = Date.now();
    restStartedAtRef.current = null;
    setPhase('active');
  };

  const finishSet = () => {
    clearTimer();
    const reps = parseInt(pendingReps) || 0;
    const newResults = [...results, { reps, duration: elapsed }];
    setResults(newResults);
    setPendingReps('');
    setStartedAtRef.current = null;

    if (currentSet >= numSets) {
      restStartedAtRef.current = null;
      setPhase('summary');
    } else {
      setCurrentSet(s => s + 1);
      restStartedAtRef.current = Date.now();
      setRestRemaining(restSeconds);
      setPhase('rest');
    }
  };

  const skipRest = () => {
    clearTimer();
    restStartedAtRef.current = null;
    setStartedAtRef.current = Date.now();
    setElapsed(0);
    setPhase('active');
  };

  const saveChallenge = async () => {
    if (!selectedExercise || results.length === 0) return;
    setSaving(true);
    const setsData = results.map(r => ({ reps: r.reps, weight: 0 }));
    const totalReps = results.reduce((s, r) => s + r.reps, 0);
    const effectiveUserId = saveAsUserId || userId;
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: new Date().toISOString().split('T')[0],
        notes: `Challenge: ${numSets} serie do upadku`,
        targetUserId: effectiveUserId || undefined,
        entries: [{
          exerciseId: selectedExercise.id,
          sets: results.length,
          reps: Math.round(totalReps / results.length),
          weight: 0,
          setsData,
          comment: JSON.stringify({ challenge: true, totalReps, durations: results.map(r => r.duration) }),
        }],
      }),
    });
    if (res.ok) {
      clearState();
      setSaved(true);
      setToast({ message: 'Challenge zapisany! 💪', type: 'success' });
    } else {
      setToast({ message: 'Błąd zapisu', type: 'error' });
    }
    setSaving(false);
  };

  const restartChallenge = () => {
    clearTimer();
    clearState();
    setPhase('setup');
    setResults([]);
    setPendingReps('');
    setSaved(false);
    setStartedAtRef.current = null;
    restStartedAtRef.current = null;
  };

  const totalReps = results.reduce((s, r) => s + r.reps, 0);

  if (!hydrated) return null;

  // ── SETUP ──────────────────────────────────────────────────────────────────
  if (phase === 'setup') {
    return (
      <div className="min-h-screen bg-gray-50 pb-24">
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        <div className="bg-white border-b px-4 pt-4 pb-3 sticky top-0 z-10">
          <h1 className="text-xl font-bold text-gray-900">⚡ Challenge</h1>
          <p className="text-sm text-gray-500">Serie do upadku mięśniowego</p>
        </div>
        <div className="px-4 py-4 space-y-4">
          <div className="bg-white rounded-2xl shadow-sm p-4 space-y-2">
            <label className="text-sm font-medium text-gray-700 block">Ćwiczenie</label>
            <div className="relative">
              <input
                type="text"
                value={selectedExercise ? selectedExercise.name : search}
                placeholder="Szukaj ćwiczenia..."
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
                onFocus={() => { setShowDropdown(true); if (selectedExercise) { setSearch(''); setSelectedExercise(null); } }}
                onChange={e => { setSearch(e.target.value); setShowDropdown(true); setSelectedExercise(null); }}
              />
              {showDropdown && filtered.length > 0 && !selectedExercise && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-lg border border-gray-100 z-20 max-h-56 overflow-y-auto">
                  {filtered.map(ex => (
                    <button key={ex.id} className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 border-b border-gray-50 last:border-0"
                      onMouseDown={() => { setSelectedExercise(ex); setSearch(''); setShowDropdown(false); }}>
                      <div className="font-medium text-gray-900">{ex.name}</div>
                      {ex.muscleGroup && <div className="text-xs text-gray-400">{ex.muscleGroup}</div>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {selectedExercise && (
              <div className="flex items-center gap-2 bg-blue-50 rounded-xl px-3 py-2">
                <span className="text-blue-600 text-sm font-medium flex-1">{selectedExercise.name}</span>
                <button onClick={() => { setSelectedExercise(null); setSearch(''); }} className="text-gray-400 text-xs">✕</button>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-4 space-y-4">
            <label className="text-sm font-medium text-gray-700 block">Ustawienia</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Liczba serii</label>
                <div className="flex items-center gap-2">
                  <button onClick={() => setNumSets(s => Math.max(1, s - 1))}
                    className="w-8 h-8 rounded-full bg-gray-100 text-gray-700 font-bold text-lg flex items-center justify-center">−</button>
                  <span className="text-xl font-bold text-gray-900 w-6 text-center">{numSets}</span>
                  <button onClick={() => setNumSets(s => Math.min(10, s + 1))}
                    className="w-8 h-8 rounded-full bg-gray-100 text-gray-700 font-bold text-lg flex items-center justify-center">+</button>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Odpoczynek</label>
                <div className="flex flex-wrap gap-1">
                  {[60, 120, 180, 300].map(s => (
                    <button key={s} onClick={() => setRestSeconds(s)}
                      className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors ${restSeconds === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                      {s < 60 ? `${s}s` : `${s / 60}min`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <button onClick={startChallenge} disabled={!selectedExercise || !isLoggedIn}
            className="w-full bg-blue-600 text-white py-4 rounded-2xl text-lg font-bold disabled:opacity-40 shadow-sm active:scale-95 transition-transform">
            {!isLoggedIn ? 'Zaloguj się aby kontynuować' : !selectedExercise ? 'Wybierz ćwiczenie' : `🔥 Start — ${numSets} serie`}
          </button>
        </div>
      </div>
    );
  }

  // ── ACTIVE SET ─────────────────────────────────────────────────────────────
  if (phase === 'active') {
    return (
      <div className="min-h-screen bg-gray-50 pb-24 flex flex-col">
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        <div className="bg-white border-b px-4 pt-4 pb-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Seria</p>
              <h1 className="text-3xl font-black text-gray-900">{currentSet} / {numSets}</h1>
            </div>
            <button onClick={restartChallenge} className="text-sm text-gray-400 underline">Anuluj</button>
          </div>
          <p className="text-sm text-blue-600 font-medium mt-1 truncate">{selectedExercise?.name}</p>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-8 px-4 py-8">
          <div className="text-center">
            <div className="text-7xl font-black text-gray-900 tabular-nums">{formatTime(elapsed)}</div>
            <p className="text-sm text-gray-400 mt-1">czas serii</p>
          </div>
          {results.length > 0 && (
            <div className="flex gap-2">
              {results.map((r, i) => (
                <div key={i} className="bg-white rounded-xl px-3 py-2 text-center shadow-sm">
                  <div className="text-sm font-bold text-gray-900">{r.reps}</div>
                  <div className="text-xs text-gray-400">S{i + 1}</div>
                </div>
              ))}
            </div>
          )}
          <div className="w-full max-w-xs space-y-3">
            <label className="text-sm text-gray-500 block text-center">Ile powtórzeń zrobiłeś?</label>
            <input type="number" inputMode="numeric" value={pendingReps}
              onChange={e => setPendingReps(e.target.value)} placeholder="np. 25"
              className="w-full border-2 border-blue-200 rounded-2xl px-4 py-4 text-3xl font-bold text-center focus:border-blue-500 outline-none"
              autoFocus />
          </div>
          <button onClick={finishSet} disabled={!pendingReps}
            className="w-full max-w-xs bg-blue-600 text-white py-4 rounded-2xl text-lg font-bold disabled:opacity-40 shadow active:scale-95 transition-transform">
            {currentSet < numSets ? `Koniec serii → odpoczynek ${formatTime(restSeconds)}` : 'Koniec ostatniej serii ✓'}
          </button>
        </div>
      </div>
    );
  }

  // ── REST ───────────────────────────────────────────────────────────────────
  if (phase === 'rest') {
    const lastResult = results[results.length - 1];
    const pct = ((restSeconds - restRemaining) / restSeconds) * 100;
    return (
      <div className="min-h-screen bg-gray-50 pb-24 flex flex-col">
        <div className="bg-white border-b px-4 pt-4 pb-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Następna</p>
              <h1 className="text-3xl font-black text-gray-900">Seria {currentSet} / {numSets}</h1>
            </div>
            <button onClick={restartChallenge} className="text-sm text-gray-400 underline">Anuluj</button>
          </div>
          <p className="text-sm text-blue-600 font-medium mt-1 truncate">{selectedExercise?.name}</p>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-8 px-4 py-8">
          {lastResult && (
            <div className="bg-white rounded-2xl shadow-sm px-8 py-4 text-center">
              <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Seria {results.length}</div>
              <div className="text-4xl font-black text-gray-900">{lastResult.reps}</div>
              <div className="text-sm text-gray-400">powtórzeń · {formatTime(lastResult.duration)}</div>
            </div>
          )}
          <div className="text-center">
            <div className="text-7xl font-black text-blue-600 tabular-nums">{formatTime(restRemaining)}</div>
            <p className="text-sm text-gray-400 mt-1">odpoczynek</p>
          </div>
          <div className="w-full max-w-xs bg-gray-200 rounded-full h-2">
            <div className="bg-blue-500 h-2 rounded-full transition-all duration-1000" style={{ width: `${pct}%` }} />
          </div>
          {results.length > 1 && (
            <div className="flex gap-2">
              {results.map((r, i) => (
                <div key={i} className="bg-white rounded-xl px-3 py-2 text-center shadow-sm">
                  <div className="text-sm font-bold text-gray-900">{r.reps}</div>
                  <div className="text-xs text-gray-400">S{i + 1}</div>
                </div>
              ))}
            </div>
          )}
          <button onClick={skipRest} className="text-sm text-blue-600 underline">Pomiń odpoczynek →</button>
        </div>
      </div>
    );
  }

  // ── SUMMARY ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <div className="bg-white border-b px-4 pt-4 pb-3">
        <h1 className="text-xl font-bold text-gray-900">🏆 Challenge zakończony!</h1>
        <p className="text-sm text-blue-600 font-medium mt-0.5 truncate">{selectedExercise?.name}</p>
      </div>
      <div className="px-4 py-4 space-y-4">
        <div className="bg-blue-600 rounded-2xl p-6 text-center text-white shadow">
          <div className="text-xs uppercase tracking-widest opacity-80 mb-1">Łącznie</div>
          <div className="text-6xl font-black">{totalReps}</div>
          <div className="text-sm opacity-80 mt-1">powtórzeń w {results.length} seriach</div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Wyniki per seria</h3>
          <div className="space-y-2">
            {results.map((r, i) => {
              const maxReps = Math.max(...results.map(x => x.reps));
              const barWidth = maxReps > 0 ? (r.reps / maxReps) * 100 : 0;
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-6 shrink-0">S{i + 1}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                    <div className="bg-blue-500 h-full rounded-full flex items-center justify-end pr-2 transition-all"
                      style={{ width: `${barWidth}%` }}>
                      <span className="text-xs font-bold text-white">{r.reps}</span>
                    </div>
                  </div>
                  <span className="text-xs text-gray-400 w-12 shrink-0 text-right">{formatTime(r.duration)}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-sm">
            <span className="text-gray-500">Najlepsza seria</span>
            <span className="font-bold text-gray-900">{Math.max(...results.map(r => r.reps))} powt.</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Najsłabsza seria</span>
            <span className="font-bold text-gray-900">{Math.min(...results.map(r => r.reps))} powt.</span>
          </div>
        </div>

        {users.length > 1 && (
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <label className="text-sm font-medium text-gray-700 block mb-2">Zapisz jako</label>
            <div className="flex gap-2">
              {users.map(u => (
                <button key={u.id} onClick={() => setSaveAsUserId(u.id)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                    (saveAsUserId || userId) === u.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'
                  }`}>
                  {u.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          {saved ? (
            <div className="w-full bg-green-50 border border-green-200 text-green-700 py-4 rounded-2xl text-lg font-bold text-center">
              ✓ Zapisano
            </div>
          ) : (
            <button onClick={saveChallenge} disabled={saving}
              className="w-full bg-blue-600 text-white py-4 rounded-2xl text-lg font-bold disabled:opacity-50 shadow active:scale-95 transition-transform">
              {saving ? 'Zapisuję...' : '💾 Zapisz wynik'}
            </button>
          )}
          <button onClick={restartChallenge}
            className="w-full bg-white border border-gray-200 text-gray-600 py-3 rounded-2xl text-sm font-medium">
            Nowy challenge
          </button>
        </div>
      </div>
    </div>
  );
}

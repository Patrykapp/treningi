'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { WorkoutSession } from '@/types';
import { formatDate } from '@/lib/utils';
import { Toast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useAuth } from '@/hooks/useAuth';
import { sessionCalories, latestWeight } from '@/lib/calories';

interface SessionRating {
  score: number;
  stars: number;
  label: string;
  emoji: string;
  prCount: number;
  prExerciseIds: string[];
  details: string[];
  tips: string[];
  breakdown: {
    volume: { score: number; label: string; current: number; avg: number };
    progress: { score: number; label: string };
    rpe: { score: number; label: string; value: number } | null;
  };
}

// Normalizuje nazwę grupy mięśniowej — usuwa warianty w nawiasach
// np. "Nogi (uda)", "Nogi (łydki)" → "Nogi"
function normalizeMuscle(raw: string | null | undefined): string {
  if (!raw) return 'Inne';
  return raw.replace(/\s*\(.*?\)/g, '').trim() || 'Inne';
}

// Grupuje entries sesji po grupie mięśniowej
function groupByMuscle(entries: WorkoutSession['entries']): Record<string, WorkoutSession['entries']> {
  const groups: Record<string, WorkoutSession['entries']> = {};
  for (const entry of entries) {
    const key = normalizeMuscle(entry.exercise?.muscleGroup);
    if (!groups[key]) groups[key] = [];
    groups[key].push(entry);
  }
  return groups;
}

// Renderuje gwiazdki 1-5
function Stars({ count, max = 5 }: { count: number; max?: number }) {
  return (
    <span className="text-yellow-400 text-base leading-none">
      {'★'.repeat(Math.max(0, count))}
      <span className="text-gray-300">{'★'.repeat(Math.max(0, max - count))}</span>
    </span>
  );
}

function HistoriaPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoggedIn, userId: authUserId } = useAuth();
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [viewUserId, setViewUserId] = useState<string | null>(null); // null = własne
  const [weightKg, setWeightKg] = useState(0); // waga ciała przeglądanej osoby (kcal)
  const [exercises, setExercises] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterExerciseId, setFilterExerciseId] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [ratings, setRatings] = useState<Record<string, SessionRating>>({});
  const [expandedRating, setExpandedRating] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [merging, setMerging] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/exercises').then(r => r.json()).then(setExercises);
    fetch('/api/users').then(r => r.json()).then(d => { if (Array.isArray(d)) setUsers(d); }).catch(() => {});
  }, []);

  // Wejście z linku ?userId=... (np. kafelek partnera na pulpicie)
  useEffect(() => {
    const u = searchParams.get('userId');
    if (u && authUserId && u !== authUserId) setViewUserId(u);
  }, [searchParams, authUserId]);

  // Waga ciała przeglądanej osoby — do szacowania kcal
  useEffect(() => {
    const target = viewUserId || authUserId;
    if (!target) return;
    fetch(`/api/body-weight?userId=${target}&limit=1`)
      .then(r => r.json())
      .then(d => setWeightKg(latestWeight(Array.isArray(d) ? d : [])))
      .catch(() => {});
  }, [viewUserId, authUserId]);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '100' });
    if (viewUserId) params.set('userId', viewUserId);
    if (filterFrom) params.set('from', filterFrom);
    if (filterTo) params.set('to', filterTo);
    const data = await fetch(`/api/sessions?${params}`).then(r => r.json());
    const filtered = filterExerciseId
      ? (Array.isArray(data) ? data : []).filter((s: WorkoutSession) => s.entries.some(e => e.exerciseId === filterExerciseId))
      : (Array.isArray(data) ? data : []);
    setSessions(filtered);
    setLoading(false);
    // Oceny zbiorczo — jeden request zamiast osobnego na każdą sesję
    const sessionList = Array.isArray(data) ? data : [];
    const ids = sessionList.slice(0, 10).map((s: WorkoutSession) => s.id);
    if (ids.length > 0) {
      try {
        const res = await fetch('/api/sessions/ratings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids }),
        });
        if (res.ok) {
          const map = await res.json();
          if (map && !map.error) setRatings(prev => ({ ...prev, ...map }));
        }
      } catch { /* oceny są opcjonalne */ }
    }
  }, [filterExerciseId, filterFrom, filterTo, viewUserId]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setToast({ message: 'Trening usunięty', type: 'success' });
      setSessions(prev => prev.filter(s => s.id !== id));
    } else {
      setToast({ message: 'Błąd usuwania', type: 'error' });
    }
    setConfirmDelete(null);
  };

  const handleMerge = async (keepId: string, deleteId: string) => {
    setMerging(deleteId);
    const res = await fetch('/api/sessions/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keepId, deleteId }),
    });
    if (res.ok) {
      setToast({ message: 'Treningi połączone!', type: 'success' });
      setSessions(prev => prev.filter(s => s.id !== deleteId));
    } else {
      setToast({ message: 'Błąd łączenia', type: 'error' });
    }
    setMerging(null);
  };

  const clearFilters = () => {
    setFilterExerciseId('');
    setFilterFrom('');
    setFilterTo('');
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      {confirmDelete && (
        <ConfirmDialog
          isOpen={true}
          message="Usunąć ten trening? Nie można cofnąć."
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      <div className="bg-white border-b px-4 py-4 sticky top-0 z-10">
        <h1 className="text-xl font-bold text-gray-900">Historia treningów</h1>
      </div>

      <div className="bg-white border-b px-4 py-3 space-y-2">
        {users.length > 1 && (
          <div className="flex gap-2">
            {users.map(u => {
              const active = u.id === authUserId ? viewUserId === null : viewUserId === u.id;
              return (
                <button
                  key={u.id}
                  onClick={() => setViewUserId(u.id === authUserId ? null : u.id)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
                    active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'
                  }`}
                >
                  {u.id === authUserId ? 'Ty' : u.name}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex gap-2">
          <select
            value={filterExerciseId}
            onChange={e => setFilterExerciseId(e.target.value)}
            className="flex-1 min-w-0 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
          >
            <option value="">Wszystkie ćwiczenia</option>
            {exercises.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm" />
          <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm" />
          {(filterExerciseId || filterFrom || filterTo) && (
            <button onClick={clearFilters} className="px-3 py-2 text-sm text-blue-600 font-medium">Reset</button>
          )}
        </div>
      </div>

      <div className="px-4 py-4">
        {loading ? (
          <div className="text-center py-8 text-gray-600">Ładowanie...</div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-8 text-gray-600 bg-white rounded-2xl px-6">
            <p className="text-4xl mb-2">🏋️</p>
            <p className="font-medium mb-1">Brak treningów</p>
            <p className="text-sm text-gray-400 mb-4">
              {filterExerciseId || filterFrom || filterTo ? 'Brak wyników dla wybranych filtrów.' : 'Nie masz jeszcze żadnych treningów.'}
            </p>
            {!filterExerciseId && !filterFrom && !filterTo && (
              <Link href="/trening" className="inline-block bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold text-sm">
                + Dodaj pierwszy trening
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-700 font-medium">{sessions.length} treningów</p>
            {(() => {
              // Group sessions by date (YYYY-MM-DD) to detect same-day duplicates
              const byDate: Record<string, WorkoutSession[]> = {};
              for (const s of sessions) {
                const day = s.date.slice(0, 10);
                if (!byDate[day]) byDate[day] = [];
                byDate[day].push(s);
              }
              return sessions.map(session => {
              const rating = ratings[session.id];
              const dayKey = session.date.slice(0, 10);
              const sameDaySessions = byDate[dayKey];
              // The "main" session for this day is the one with the most entries
              const mainSession = sameDaySessions.reduce((a, b) => a.entries.length >= b.entries.length ? a : b);
              const muscleGroups = groupByMuscle(session.entries);
              const isExpanded = expandedRating === session.id;

              return (
                <div key={session.id} className="bg-white rounded-2xl p-4 shadow-sm">
                  {/* Nagłówek karty */}
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span className="font-bold text-gray-900">{formatDate(session.date)}</span>
                      <span className="ml-2 text-sm text-blue-600 font-medium">{session.user?.name}</span>
                      {(() => {
                        const sc = sessionCalories(session, weightKg);
                        if (sc.kcal <= 0) return null;
                        return (
                          <span className="ml-2 text-xs text-red-500 font-medium whitespace-nowrap">
                            🔥 {sc.estimated ? '~' : ''}{sc.kcal} kcal{!sc.estimated && ' ⌚'}
                          </span>
                        );
                      })()}
                      {session.notes?.startsWith('Challenge:') && (
                        <Link href={`/challenge/wynik/${session.id}`}
                          className="ml-2 text-xs font-semibold bg-blue-100 text-blue-700 rounded-lg px-2 py-0.5">
                          ⚡ Challenge →
                        </Link>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Gwiazdki oceny + PR badge */}
                      {rating?.prCount > 0 && (
                        <span className="text-sm font-bold bg-yellow-400 text-yellow-900 rounded-xl px-2.5 py-1 leading-none">
                          🏆 ×{rating.prCount}
                        </span>
                      )}
                      {rating ? (
                        <button
                          onClick={() => setExpandedRating(isExpanded ? null : session.id)}
                          className="flex items-center gap-1.5 bg-gray-50 rounded-xl px-2.5 py-1.5"
                          title="Kliknij aby zobaczyć ocenę i wskazówki"
                        >
                          <Stars count={rating.stars} />
                        </button>
                      ) : (
                        <div className="flex items-center gap-1 px-2 py-1">
                          <Stars count={0} />
                        </div>
                      )}
                      <div className="flex gap-1 items-center">
                        <Link
                          href={session.notes?.startsWith('Challenge:') ? `/challenge/wynik/${session.id}` : `/trening/podsumowanie/${session.id}`}
                          className="p-2 rounded-xl text-gray-400 hover:text-purple-600 hover:bg-purple-50 transition-colors"
                          title="Podsumowanie"
                        >📊</Link>
                        {isLoggedIn && session.userId === authUserId && (
                          <>
                            {sameDaySessions.length > 1 && session.id !== mainSession.id && (
                              <button
                                onClick={() => handleMerge(mainSession.id, session.id)}
                                disabled={merging === session.id}
                                className="px-2 py-1.5 rounded-xl text-xs font-semibold text-orange-600 bg-orange-50 hover:bg-orange-100 transition-colors disabled:opacity-50"
                                title="Połącz z głównym treningiem tego dnia"
                              >
                                {merging === session.id ? '...' : '🔗 Połącz'}
                              </button>
                            )}
                            <button
                              onClick={() => router.push(`/trening?sessionId=${session.id}`)}
                              className="p-2 rounded-xl text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                              title="Edytuj trening"
                            >✏️</button>
                            <button
                              onClick={() => setConfirmDelete(session.id)}
                              className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                              title="Usuń trening"
                            >🗑️</button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Rozwinięta ocena ze wskazówkami */}
                  {isExpanded && rating && (
                    <div className="bg-gray-50 rounded-xl p-3 mb-3 space-y-3">
                      {/* Nagłówek oceny */}
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{rating.emoji}</span>
                        <div>
                          <p className="font-bold text-gray-800">{rating.label} — <Stars count={rating.stars} /> <span className="text-sm text-gray-500 font-normal">({rating.score}/10)</span></p>
                        </div>
                      </div>

                      {/* Składowe */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-white rounded-lg p-2">
                          <p className="text-gray-500 mb-0.5">Wolumen</p>
                          <p className="font-semibold text-gray-800">{rating.breakdown.volume.current.toLocaleString()} kg</p>
                          <p className="text-gray-400">śr. {rating.breakdown.volume.avg.toLocaleString()} kg</p>
                        </div>
                        <div className="bg-white rounded-lg p-2">
                          <p className="text-gray-500 mb-0.5">Progres</p>
                          <p className="font-semibold text-gray-800">{rating.breakdown.progress.score}/10</p>
                          {rating.prCount > 0 && <p className="text-yellow-600">🏆 {rating.prCount} PR!</p>}
                        </div>
                        {rating.breakdown.rpe && (
                          <div className="bg-white rounded-lg p-2">
                            <p className="text-gray-500 mb-0.5">Intensywność</p>
                            <p className="font-semibold text-gray-800">RPE {rating.breakdown.rpe.value}</p>
                          </div>
                        )}
                      </div>

                      {/* Co się udało */}
                      {rating.details.length > 0 && (
                        <div className="space-y-0.5">
                          {rating.details.map((d, i) => (
                            <p key={i} className="text-xs text-gray-600">{d}</p>
                          ))}
                        </div>
                      )}

                      {/* Wskazówki do poprawy */}
                      {rating.tips.length > 0 && (
                        <div className="border-t border-gray-200 pt-2">
                          <p className="text-xs font-semibold text-gray-500 mb-1.5">Jak poprawić ocenę:</p>
                          <div className="space-y-1">
                            {rating.tips.map((tip, i) => (
                              <p key={i} className="text-xs text-gray-700 bg-white rounded-lg px-2.5 py-1.5">{tip}</p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {session.notes && <p className="text-sm text-gray-700 italic mb-2">{session.notes}</p>}

                  {/* Ćwiczenia pogrupowane po mięśniach */}
                  <div className="space-y-2">
                    {Object.entries(muscleGroups).map(([muscle, entries]) => (
                      <div key={muscle}>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{muscle}</p>
                        <div className="space-y-1">
                          {entries.map(entry => (
                            <div key={entry.id} className="flex items-start justify-between gap-3 py-1">
                              <Link href={`/cwiczenie/${entry.exerciseId}`}
                                className="text-sm font-medium text-gray-900 flex-1 min-w-0 break-words leading-snug">
                                {entry.exercise?.name}
                                {rating?.prExerciseIds?.includes(entry.exerciseId) && (
                                  <span className="ml-1" title="Nowy rekord!">🏆</span>
                                )}
                              </Link>
                              <div className="text-sm text-gray-700 text-right shrink-0 max-w-[55%] leading-snug">
                                {Array.isArray(entry.setsData) && entry.setsData.length > 0 ? (
                                  <span className="inline-flex flex-wrap justify-end gap-x-0.5">
                                    {(entry.setsData as { reps: number; weight: number }[]).map((s, i) => (
                                      <span key={i} className="whitespace-nowrap">
                                        {i > 0 && <span className="text-gray-400 mx-0.5">·</span>}
                                        {s.reps}x<strong>{s.weight}kg</strong>
                                      </span>
                                    ))}
                                  </span>
                                ) : (
                                  <span className="whitespace-nowrap">{entry.sets}x{entry.reps} @ <strong>{entry.weight}kg</strong></span>
                                )}
                                {entry.rpe && <span className="ml-1 text-xs text-gray-500 whitespace-nowrap">RPE {entry.rpe}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            });
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

export default function HistoriaPageWrapper() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-500">Ładowanie...</div>}>
      <HistoriaPage />
    </Suspense>
  );
}

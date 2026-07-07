'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { WorkoutSession } from '@/types';
import { formatDate } from '@/lib/utils';
import { Toast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { useAuth } from '@/hooks/useAuth';
import { sessionCalories, runCalories, latestWeight } from '@/lib/calories';
import {
  Dumbbell,
  Calendar,
  Link2,
  Flame,
  MapPin,
  Timer,
  Zap,
  Trophy,
  BarChart3,
  Pencil,
  Trash2,
  Footprints,
} from 'lucide-react';

interface Run {
  id: string;
  userId: string;
  date: string;
  distance: number;
  duration: number;
  notes?: string | null;
}

interface OtherActivity {
  id: string;
  userId: string;
  date: string;
  type: string;
  durationMin: number;
  distanceKm: number | null;
  kcal: number | null;
  notes: string | null;
  sessionId: string | null;
  user?: { id: string; name: string };
}

type SessionWithActivities = WorkoutSession & { activities?: OtherActivity[] };

// Czas trwania aktywności w formacie "1 h 5 min"
function formatActDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

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

// Kolory tagów grup mięśniowych
const MUSCLE_TAG: Record<string, string> = {
  'Klatka piersiowa': 'bg-blue-100 text-blue-700',
  'Plecy':            'bg-emerald-100 text-emerald-700',
  'Barki':            'bg-purple-100 text-purple-700',
  'Biceps':           'bg-orange-100 text-orange-700',
  'Triceps':          'bg-yellow-100 text-yellow-800',
  'Nogi':             'bg-red-100 text-red-700',
  'Brzuch':           'bg-teal-100 text-teal-700',
  'Cardio':           'bg-pink-100 text-pink-700',
  'Inne':             'bg-gray-100 text-gray-600',
};
function muscleTagClass(g: string): string {
  return MUSCLE_TAG[g] || 'bg-gray-100 text-gray-600';
}

// Numer tygodnia ISO + etykieta
function weekLabel(date: string): string {
  const d = new Date(date);
  // Poniedziałek bieżącego tygodnia
  const mon = new Date(d);
  mon.setHours(0, 0, 0, 0);
  mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const fmt = (dd: Date) => dd.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
  return `${fmt(mon)} – ${fmt(sun)}`;
}
function weekKey(date: string): string {
  const d = new Date(date);
  const mon = new Date(d);
  mon.setHours(0, 0, 0, 0);
  mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return mon.toISOString().slice(0, 10);
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
  const [sessions, setSessions] = useState<SessionWithActivities[]>([]);
  const [activities, setActivities] = useState<OtherActivity[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [linkingId, setLinkingId] = useState<string | null>(null);
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

    // Inne aktywności + biegi w tej samej osi czasu
    // (gdy nie filtrujemy po ćwiczeniu — nie mają one ćwiczeń)
    if (filterExerciseId) {
      setActivities([]);
      setRuns([]);
    } else {
      const aParams = new URLSearchParams({ limit: '100' });
      if (viewUserId) aParams.set('userId', viewUserId);
      if (filterFrom) aParams.set('from', filterFrom);
      const aData = await fetch(`/api/activities?${aParams}`).then(r => r.json()).catch(() => []);
      let acts: OtherActivity[] = Array.isArray(aData) ? aData : [];
      if (filterTo) {
        const to = new Date(filterTo); to.setHours(23, 59, 59, 999);
        acts = acts.filter(a => new Date(a.date) <= to);
      }
      setActivities(acts);

      // Biegi — /api/runs nie wspiera from/to, więc filtrujemy zakres po stronie klienta
      const rParams = new URLSearchParams({ limit: '100' });
      if (viewUserId) rParams.set('userId', viewUserId);
      const rData = await fetch(`/api/runs?${rParams}`).then(r => r.json()).catch(() => []);
      let runsList: Run[] = Array.isArray(rData) ? rData : [];
      if (filterFrom) {
        const from = new Date(filterFrom); from.setHours(0, 0, 0, 0);
        runsList = runsList.filter(r => new Date(r.date) >= from);
      }
      if (filterTo) {
        const to = new Date(filterTo); to.setHours(23, 59, 59, 999);
        runsList = runsList.filter(r => new Date(r.date) <= to);
      }
      setRuns(runsList);
    }
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

  // Podłącz/odepnij aktywność do treningu (przeładuj, by przeniosła się pod trening)
  const linkActivity = async (activityId: string, sessionId: string | null) => {
    const res = await fetch(`/api/activities/${activityId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    if (res.ok) {
      setToast({ message: sessionId ? 'Podłączono do treningu' : 'Odpięto od treningu', type: 'success' });
      setLinkingId(null);
      loadSessions();
    } else {
      const err = await res.json().catch(() => ({}));
      setToast({ message: err.error || 'Błąd łączenia', type: 'error' });
    }
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
                  className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                    active ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:border-gray-300'
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
            className="flex-1 min-w-0 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Wszystkie ćwiczenia</option>
            {exercises.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
          <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
          {(filterExerciseId || filterFrom || filterTo) && (
            <button
              onClick={clearFilters}
              className="px-3 py-2 text-sm text-blue-600 font-medium rounded-xl transition-colors hover:bg-blue-50 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >Reset</button>
          )}
        </div>
      </div>

      <div className="px-4 py-4 max-w-2xl mx-auto md:max-w-3xl lg:max-w-4xl">
        {loading ? (
          <div className="space-y-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : sessions.length === 0 && activities.length === 0 && runs.length === 0 ? (
          <div className="text-center py-8 text-gray-600 bg-white rounded-2xl px-6">
            <Dumbbell className="w-8 h-8 mx-auto mb-2 text-gray-400" strokeWidth={2} />
            <p className="font-medium mb-1">Brak treningów</p>
            <p className="text-sm text-gray-400 mb-4">
              {filterExerciseId || filterFrom || filterTo ? 'Brak wyników dla wybranych filtrów.' : 'Nie masz jeszcze żadnych treningów.'}
            </p>
            {!filterExerciseId && !filterFrom && !filterTo && (
              <Link
                href="/trening"
                className="inline-block bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold text-sm transition-colors hover:bg-blue-700 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                + Dodaj pierwszy trening
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-700 font-medium">
              {sessions.length} {sessions.length === 1 ? 'trening' : 'treningów'}
              {runs.length > 0 && ` · ${runs.length} ${runs.length === 1 ? 'bieg' : 'biegów'}`}
              {activities.length > 0 && ` · ${activities.length} ${activities.length === 1 ? 'aktywność' : 'aktywności'}`}
            </p>
            {(() => {
              // Group sessions by date (YYYY-MM-DD) to detect same-day duplicates
              const byDate: Record<string, WorkoutSession[]> = {};
              for (const s of sessions) {
                const day = s.date.slice(0, 10);
                if (!byDate[day]) byDate[day] = [];
                byDate[day].push(s);
              }
              // Wspólna oś czasu: treningi siłowe + inne aktywności, malejąco po dacie
              type TLItem =
                | { kind: 'workout'; date: string; session: SessionWithActivities }
                | { kind: 'activity'; date: string; activity: OtherActivity }
                | { kind: 'run'; date: string; run: Run };
              const timeline: TLItem[] = [
                ...sessions.map(s => ({ kind: 'workout' as const, date: s.date, session: s })),
                // Tylko samodzielne aktywności — przypięte pokazujemy pod treningiem
                ...activities.filter(a => !a.sessionId).map(a => ({ kind: 'activity' as const, date: a.date, activity: a })),
                ...runs.map(r => ({ kind: 'run' as const, date: r.date, run: r })),
              ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
              let lastWeekKey = '';
              return timeline.flatMap(item => {
              // Wspólny sticky nagłówek tygodnia (dla treningów i aktywności)
              const itemWk = weekKey(item.date);
              const itemWeekHeader = itemWk !== lastWeekKey ? (
                <div key={`wk-${itemWk}`} className="sticky top-[120px] z-10 -mx-0 px-0 py-1">
                  <div className="bg-gray-100 rounded-xl px-3 py-1.5 flex items-center">
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-gray-500 uppercase tracking-wide">
                      <Calendar className="w-3.5 h-3.5" strokeWidth={2} /> {weekLabel(item.date)}
                    </span>
                  </div>
                </div>
              ) : null;
              lastWeekKey = itemWk;

              if (item.kind === 'activity') {
                const a = item.activity;
                const dur = formatActDuration(a.durationMin);
                const mine = a.userId === authUserId;
                // Treningi z tego samego dnia (do podpięcia) — już mamy je w pamięci
                const daySess = mine
                  ? sessions.filter(s => s.date.slice(0, 10) === a.date.slice(0, 10))
                  : [];
                return [
                  itemWeekHeader,
                  <div key={`act-${a.id}`} className="bg-white rounded-2xl p-4 shadow-sm border-l-4 border-cyan-300">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-gray-900">{a.type}</span>
                        <span className="text-sm text-gray-500">{formatDate(a.date)}</span>
                        <span className="text-[10px] font-semibold rounded-md px-1.5 py-0.5 bg-cyan-100 text-cyan-700">Aktywność</span>
                        {!mine && a.user && (
                          <span className="text-xs bg-purple-100 text-purple-700 rounded-lg px-2 py-0.5 font-semibold">{a.user.name}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-sm text-gray-600">
                        <span className="inline-flex items-center gap-1"><Timer className="w-4 h-4" strokeWidth={2} /> {dur}</span>
                        {a.distanceKm && <span className="inline-flex items-center gap-1"><MapPin className="w-4 h-4" strokeWidth={2} /> {a.distanceKm} km</span>}
                        {a.kcal && <span className="inline-flex items-center gap-1 text-red-500"><Flame className="w-4 h-4" strokeWidth={2} /> {a.kcal} kcal</span>}
                      </div>
                      {a.notes && <p className="text-sm text-gray-500 italic mt-1">{a.notes}</p>}
                      {mine && daySess.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <button
                            onClick={() => setLinkingId(linkingId === a.id ? null : a.id)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 rounded-lg px-1 -mx-1 transition-colors hover:text-blue-700 hover:bg-blue-50 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                          >
                            <Link2 className="w-3.5 h-3.5" strokeWidth={2} /> {linkingId === a.id ? 'Anuluj' : 'Podłącz do treningu'}
                          </button>
                          {linkingId === a.id && (
                            <div className="mt-2 space-y-1.5">
                              {daySess.map(s => {
                                const muscles = [...new Set(s.entries.map(e => normalizeMuscle(e.exercise?.muscleGroup)))];
                                return (
                                  <button
                                    key={s.id}
                                    onClick={() => linkActivity(a.id, s.id)}
                                    className="w-full text-left text-sm bg-blue-50 hover:bg-blue-100 text-blue-800 rounded-xl px-3 py-2 transition-colors active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 inline-flex items-center gap-1.5"
                                  >
                                    <Dumbbell className="w-4 h-4" strokeWidth={2} /> Trening · {muscles.length ? muscles.join(', ') : `${s.entries.length} ćwiczeń`}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>,
                ];
              }

              if (item.kind === 'run') {
                const r = item.run;
                const mine = r.userId === authUserId;
                const owner = users.find(u => u.id === r.userId);
                const totalSec = r.duration;
                const hh = Math.floor(totalSec / 3600);
                const mm = Math.floor((totalSec % 3600) / 60);
                const ss = totalSec % 60;
                const durStr = hh > 0 ? `${hh} h ${mm} min` : `${mm}:${String(ss).padStart(2, '0')}`;
                const paceSec = r.distance > 0 ? r.duration / r.distance : 0;
                const pace = paceSec > 0
                  ? `${Math.floor(paceSec / 60)}'${String(Math.round(paceSec % 60)).padStart(2, '0')}"/km`
                  : '';
                const kcal = runCalories(weightKg, r.distance);
                return [
                  itemWeekHeader,
                  <div key={`run-${r.id}`} className="bg-white rounded-2xl p-4 shadow-sm border-l-4 border-orange-300">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1.5 font-bold text-gray-900"><Footprints className="w-4 h-4" strokeWidth={2} /> Bieg</span>
                        <span className="text-sm text-gray-500">{formatDate(r.date)}</span>
                        <span className="text-[10px] font-semibold rounded-md px-1.5 py-0.5 bg-orange-100 text-orange-700">Bieg</span>
                        {!mine && owner && (
                          <span className="text-xs bg-purple-100 text-purple-700 rounded-lg px-2 py-0.5 font-semibold">{owner.name}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-sm text-gray-600">
                        <span className="inline-flex items-center gap-1"><MapPin className="w-4 h-4" strokeWidth={2} /> {r.distance} km</span>
                        <span className="inline-flex items-center gap-1"><Timer className="w-4 h-4" strokeWidth={2} /> {durStr}</span>
                        {pace && <span className="inline-flex items-center gap-1"><Zap className="w-4 h-4" strokeWidth={2} /> {pace}</span>}
                        {kcal > 0 && <span className="inline-flex items-center gap-1 text-red-500"><Flame className="w-4 h-4" strokeWidth={2} /> ~{kcal} kcal</span>}
                      </div>
                      {r.notes && <p className="text-sm text-gray-500 italic mt-1">{r.notes}</p>}
                    </div>
                  </div>,
                ];
              }

              const session = item.session;
              const rating = ratings[session.id];
              const dayKey = session.date.slice(0, 10);
              const sameDaySessions = byDate[dayKey];
              // The "main" session for this day is the one with the most entries
              const mainSession = sameDaySessions.reduce((a, b) => a.entries.length >= b.entries.length ? a : b);
              const muscleGroups = groupByMuscle(session.entries);
              const isExpanded = expandedRating === session.id;
              const weekHeader = itemWeekHeader;
              // Unique muscle groups for this session (ordered)
              const sessionMuscles = [...new Set(
                session.entries.map(e => normalizeMuscle(e.exercise?.muscleGroup))
              )];

              return [
                weekHeader,
                <div key={session.id} className="bg-white rounded-2xl p-4 shadow-sm">
                  {/* Nagłówek karty */}
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span className="font-bold text-gray-900">{formatDate(session.date)}</span>
                      <span className="ml-2 text-sm text-blue-600 font-medium">{session.user?.name}</span>
                      {sessionMuscles.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {sessionMuscles.map(g => (
                            <span key={g} className={`text-[10px] font-semibold rounded-md px-1.5 py-0.5 ${muscleTagClass(g)}`}>
                              {g}
                            </span>
                          ))}
                        </div>
                      )}
                      {(() => {
                        const sc = sessionCalories(session, weightKg);
                        if (sc.kcal <= 0) return null;
                        return (
                          <span className="ml-2 inline-flex items-center gap-1 text-xs text-red-500 font-medium whitespace-nowrap">
                            <Flame className="w-3.5 h-3.5" strokeWidth={2} /> {sc.estimated ? '~' : ''}{sc.kcal} kcal{!sc.estimated && ' ⌚'}
                          </span>
                        );
                      })()}
                      {session.notes?.startsWith('Challenge:') && (
                        <Link
                          href={`/challenge/wynik/${session.id}`}
                          className="ml-2 inline-flex items-center gap-1 text-xs font-semibold bg-blue-100 text-blue-700 rounded-lg px-2 py-0.5 transition-colors hover:bg-blue-200 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                        >
                          <Zap className="w-3.5 h-3.5" strokeWidth={2} /> Challenge →
                        </Link>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Gwiazdki oceny + PR badge */}
                      {rating?.prCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-sm font-bold bg-yellow-400 text-yellow-900 rounded-xl px-2.5 py-1 leading-none">
                          <Trophy className="w-4 h-4" strokeWidth={2} /> ×{rating.prCount}
                        </span>
                      )}
                      {rating ? (
                        <button
                          onClick={() => setExpandedRating(isExpanded ? null : session.id)}
                          className="flex items-center gap-1.5 bg-gray-50 rounded-xl px-2.5 py-1.5 transition-colors hover:bg-gray-100 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
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
                          className="p-2 rounded-xl text-gray-400 hover:text-purple-600 hover:bg-purple-50 transition-colors active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                          title="Podsumowanie"
                        ><BarChart3 className="w-4 h-4" strokeWidth={2} /></Link>
                        {isLoggedIn && session.userId === authUserId && (
                          <>
                            {sameDaySessions.length > 1 && session.id !== mainSession.id && (
                              <button
                                onClick={() => handleMerge(mainSession.id, session.id)}
                                disabled={merging === session.id}
                                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-xl text-xs font-semibold text-orange-600 bg-orange-50 hover:bg-orange-100 transition-colors active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                                title="Połącz z głównym treningiem tego dnia"
                              >
                                {merging === session.id ? '...' : (<><Link2 className="w-3.5 h-3.5" strokeWidth={2} /> Połącz</>)}
                              </button>
                            )}
                            <button
                              onClick={() => router.push(`/trening?sessionId=${session.id}`)}
                              className="p-2 rounded-xl text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                              title="Edytuj trening"
                            ><Pencil className="w-4 h-4" strokeWidth={2} /></button>
                            <button
                              onClick={() => setConfirmDelete(session.id)}
                              className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                              title="Usuń trening"
                            ><Trash2 className="w-4 h-4" strokeWidth={2} /></button>
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
                          {rating.prCount > 0 && <p className="inline-flex items-center gap-1 text-yellow-600"><Trophy className="w-3.5 h-3.5" strokeWidth={2} /> {rating.prCount} PR!</p>}
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
                              <Link
                                href={`/cwiczenie/${entry.exerciseId}`}
                                className="text-sm font-medium text-gray-900 flex-1 min-w-0 break-words leading-snug rounded-md transition-colors hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                              >
                                {entry.exercise?.name}
                                {rating?.prExerciseIds?.includes(entry.exerciseId) && (
                                  <Trophy className="inline w-3.5 h-3.5 ml-1 text-yellow-500" strokeWidth={2} aria-label="Nowy rekord!" />
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

                  {/* Przypięte aktywności (worek bokserski itp.) */}
                  {session.activities && session.activities.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                      {session.activities.map(a => (
                        <div key={`pin-${a.id}`} className="flex items-center justify-between gap-2 bg-cyan-50 rounded-xl px-3 py-2">
                          <div className="min-w-0">
                            <span className="inline-flex items-center gap-1 text-sm font-semibold text-cyan-800">
                              <Link2 className="w-3.5 h-3.5" strokeWidth={2} /> {a.type}
                            </span>
                            <span className="ml-2 inline-flex items-center gap-1 text-xs text-gray-600">
                              <Timer className="w-3.5 h-3.5" strokeWidth={2} /> {formatActDuration(a.durationMin)}
                              {a.distanceKm ? (<> · <MapPin className="inline w-3.5 h-3.5" strokeWidth={2} /> {a.distanceKm} km</>) : ''}
                              {a.kcal ? (<> · <Flame className="inline w-3.5 h-3.5" strokeWidth={2} /> {a.kcal} kcal</>) : ''}
                            </span>
                          </div>
                          {isLoggedIn && a.userId === authUserId && (
                            <button
                              onClick={() => linkActivity(a.id, null)}
                              className="text-xs text-gray-500 underline shrink-0 rounded-md transition-colors hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                            >Odepnij</button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>,
              ];
            }).filter(Boolean);
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

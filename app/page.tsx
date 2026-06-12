'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { WorkoutSession } from '@/types';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { runCalories, sessionCalories } from '@/lib/calories';

interface Run {
  id: string;
  userId: string;
  date: string;
  distance: number;
  duration: number;
}

interface AppUser { id: string; name: string; }

interface DashboardData {
  users: AppUser[];
  sessionsByUser: Record<string, WorkoutSession[]>;
  runsByUser: Record<string, Run[]>;
  weightByUser: Record<string, number>;
}

// Dowolna aktywność z datą (trening siłowy lub bieg)
interface Dated { date: string }

const CACHE_KEY = 'dashboardCacheV1';

function calcStreak(sessions: Dated[]): number {
  if (!sessions.length) return 0;
  const days = new Set(sessions.map(s => {
    const d = new Date(s.date);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }));
  const prevDay = (d: Date) => { const n = new Date(d); n.setDate(n.getDate() - 1); return n; };
  // Start: dziś, a jeśli dziś (jeszcze) nie było treningu — wczoraj.
  let cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  if (!days.has(cursor.getTime())) cursor = prevDay(cursor);
  let streak = 0;
  while (days.has(cursor.getTime())) {
    streak++;
    cursor = prevDay(cursor);
  }
  return streak;
}

// "Ten tydzień" = tydzień kalendarzowy od PONIEDZIAŁKU (nie kroczące 7 dni)
function calcWeeklyCount(sessions: Dated[]): number {
  const start = weekStart(new Date());
  return sessions.filter(s => new Date(s.date).getTime() >= start).length;
}

function lastWeek<T extends Dated>(items: T[]): T[] {
  const start = weekStart(new Date());
  return items.filter(i => new Date(i.date).getTime() >= start);
}

// Początek tygodnia (poniedziałek, 00:00) dla danej daty
function weekStart(d: Date): number {
  const dd = new Date(d);
  dd.setHours(0, 0, 0, 0);
  dd.setDate(dd.getDate() - ((dd.getDay() + 6) % 7));
  return dd.getTime();
}

// Kolejne tygodnie kalendarzowe z co najmniej jednym treningiem
function calcWeekStreak(sessions: Dated[]): number {
  if (!sessions.length) return 0;
  const weeks = new Set(sessions.map(s => weekStart(new Date(s.date))));
  let cursor = weekStart(new Date());
  let streak = 0;
  if (!weeks.has(cursor)) {
    const d = new Date(cursor); d.setDate(d.getDate() - 7);
    cursor = weekStart(d);
  }
  while (weeks.has(cursor)) {
    streak++;
    const d = new Date(cursor); d.setDate(d.getDate() - 7);
    cursor = weekStart(d);
  }
  return streak;
}

// Objętość z bieżącego tygodnia (od poniedziałku) pogrupowana po grupie mięśniowej
function calcWeeklyVolume(sessions: WorkoutSession[]): { total: number; groups: [string, number][] } {
  const start = weekStart(new Date());
  const groups: Record<string, number> = {};
  let total = 0;
  for (const s of sessions) {
    if (new Date(s.date).getTime() < start) continue;
    for (const e of s.entries || []) {
      const sd = Array.isArray(e.setsData) && e.setsData.length > 0 ? e.setsData : null;
      const vol = sd
        ? sd.reduce((sum, x) => sum + x.reps * x.weight, 0)
        : e.sets * e.reps * e.weight;
      if (vol <= 0) continue;
      const g = (e.exercise?.muscleGroup || 'Inne').replace(/\s*\(.*?\)/g, '').trim() || 'Inne';
      groups[g] = (groups[g] || 0) + vol;
      total += vol;
    }
  }
  return { total, groups: Object.entries(groups).sort((a, b) => b[1] - a[1]) };
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewUserId, setViewUserId] = useState<string | null>(null); // null = zalogowany
  const { isLoggedIn, name, userId } = useAuth();

  const loadDashboard = useCallback(async () => {
    // 1. Natychmiast pokaż ostatnie dane z cache (jeśli są), odśwież w tle
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as DashboardData;
        if (parsed?.users?.length) {
          setData(parsed);
          setLoading(false);
        }
      }
    } catch { /* uszkodzony cache — pomiń */ }

    // 2. Świeże dane jednym requestem
    try {
      const res = await fetch('/api/dashboard');
      if (res.ok) {
        const fresh = await res.json() as DashboardData;
        if (fresh && !('error' in fresh)) {
          setData(fresh);
          try { localStorage.setItem(CACHE_KEY, JSON.stringify(fresh)); } catch { /* pełny storage */ }
        }
      }
    } catch { /* offline — zostają dane z cache */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn) loadDashboard();
    else if (isLoggedIn === false) setLoading(false);
  }, [isLoggedIn, loadDashboard]);

  const users = data?.users || [];
  const sessionsByUser = data?.sessionsByUser || {};
  const runsByUser = data?.runsByUser || {};
  const weightByUser = data?.weightByUser || {};

  // Osoba, której pulpit oglądamy (statystyki, objętość)
  const activeId = viewUserId || userId || '';
  const activeSessions = sessionsByUser[activeId] || [];
  const activeRuns = runsByUser[activeId] || [];
  const activeActivities: Dated[] = [...activeSessions, ...activeRuns];

  const streak = calcStreak(activeActivities);
  const weeklyCount = calcWeeklyCount(activeActivities);
  const totalCount = activeSessions.length + activeRuns.length;
  const weekStreakVal = calcWeekStreak(activeActivities);
  const weekVol = calcWeeklyVolume(activeSessions);

  // Porównanie tygodniowe wszystkich użytkowników (motywacja!)
  const comparison = users.map(u => {
    const us = sessionsByUser[u.id] || [];
    const runs = runsByUser[u.id] || [];
    const weightKg = weightByUser[u.id] || 0;
    const weekSessions = lastWeek(us);
    const weekRuns = lastWeek(runs);
    const weekKcal =
      weekSessions.reduce((sum, s) => sum + sessionCalories(s, weightKg).kcal, 0) +
      weekRuns.reduce((sum, r) => sum + runCalories(weightKg, r.distance), 0);
    // Punktacja rankingu tygodniowego:
    //   100 pkt za trening (siłowy lub bieg)
    //   +30 pkt za każdy DZIEŃ z treningiem (premiuje regularność, nie kumulowanie w 1 dzień)
    //   +1 pkt za każde 10 kcal (premiuje cięższe/dłuższe treningi)
    const weekDays = new Set([...weekSessions, ...weekRuns].map(x => {
      const d = new Date(x.date); d.setHours(0, 0, 0, 0); return d.getTime();
    })).size;
    const weekCount = weekSessions.length + weekRuns.length;
    const score = weekCount * 100 + weekDays * 30 + Math.round(weekKcal / 10);
    return {
      id: u.id,
      name: u.id === userId ? 'Ty' : u.name,
      isMe: u.id === userId,
      weekCount,
      weekVolume: calcWeeklyVolume(us).total,
      weekKcal,
      score,
      streak: calcStreak([...us, ...runs]),
    };
  });
  const maxScore = Math.max(0, ...comparison.map(c => c.score));
  const leader = comparison.filter(c => c.score === maxScore && maxScore > 0);

  // Wspólny feed — treningi siłowe i biegi wszystkich, posortowane po dacie
  type FeedItem =
    | { kind: 'workout'; date: string; session: WorkoutSession }
    | { kind: 'run'; date: string; run: Run };
  const feed: FeedItem[] = [
    ...Object.values(sessionsByUser).flat().map(s => ({ kind: 'workout' as const, date: s.date, session: s })),
    ...Object.values(runsByUser).flat().map(r => ({ kind: 'run' as const, date: r.date, run: r })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 8);
  const userName = (id: string) => users.find(u => u.id === id)?.name || '?';
  const activeName = activeId === userId ? 'Ty' : userName(activeId);

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b px-4 py-4 sticky top-0 z-10">
        <h1 className="text-xl font-bold text-gray-900">Dziennik Treningów</h1>
        <p className="text-sm text-gray-500">
          {isLoggedIn ? `Witaj, ${name || ''}` : 'Zaloguj się aby korzystać'}
        </p>
      </div>

      <div className="px-4 py-4 space-y-4">
        {isLoggedIn ? (
          <Link href="/trening" className="block w-full bg-blue-600 text-white text-center py-4 rounded-2xl font-semibold text-lg shadow-sm">
            + Dodaj trening
          </Link>
        ) : (
          <Link href="/login" className="block w-full bg-gray-100 text-gray-700 text-center py-4 rounded-2xl font-medium text-base">
            Zaloguj się aby dodawać treningi
          </Link>
        )}

        {/* Porównanie tygodnia — widoczne od razu, motywacja dla obojga */}
        {isLoggedIn && comparison.length > 1 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <h2 className="text-sm font-bold text-gray-700 mb-3">Ten tydzień — kto prowadzi? 🏁</h2>
            <div className="grid grid-cols-2 gap-3">
              {comparison.map(c => {
                const isLeader = leader.some(l => l.id === c.id) && leader.length === 1;
                return (
                  <button key={c.id} type="button" onClick={() => setViewUserId(c.isMe ? null : c.id)}
                    className="text-left w-full">
                    <div className={`rounded-xl p-3 text-center border-2 transition-colors ${
                      isLeader ? 'border-yellow-400 bg-yellow-50' : 'border-gray-100 bg-gray-50'
                    } ${activeId === c.id ? 'ring-2 ring-blue-400' : ''}`}>
                      <div className="text-sm font-bold text-gray-800 mb-1">
                        {isLeader && '👑 '}{c.name}
                      </div>
                      <div className="text-2xl font-bold text-blue-600">{c.score}</div>
                      <div className="text-xs text-gray-500">pkt</div>
                      <div className="text-xs text-gray-600 font-medium mt-1">
                        {c.weekCount} {c.weekCount === 1 ? 'trening' : c.weekCount < 5 ? 'treningi' : 'treningów'} w tym tyg.
                      </div>
                      {c.weekVolume > 0 && (
                        <div className="text-xs text-gray-600 font-medium mt-1">
                          {Math.round(c.weekVolume).toLocaleString('pl-PL')} kg
                        </div>
                      )}
                      {c.weekKcal > 0 && (
                        <div className="text-xs text-red-500 font-medium mt-0.5">
                          🔥 ~{c.weekKcal.toLocaleString('pl-PL')} kcal
                        </div>
                      )}
                      {c.streak > 1 && (
                        <div className="text-xs text-orange-500 font-medium mt-0.5">⚡ {c.streak} dni z rzędu</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-400 text-center mt-2">
              Punkty: 100 za trening · +30 za każdy dzień treningowy · +1 za 10 kcal
            </p>
            <p className="text-xs text-gray-400 text-center mt-0.5">
              Kliknij osobę, aby zobaczyć jej statystyki poniżej
            </p>
          </div>
        )}

        {/* Statystyki wybranej osoby — ten sam widok dla każdego */}
        {isLoggedIn && !loading && data && (
          <>
            {activeId !== userId && (
              <p className="text-sm font-semibold text-purple-700 bg-purple-50 rounded-xl px-3 py-2">
                Oglądasz statystyki: {activeName}
                <button type="button" onClick={() => setViewUserId(null)} className="ml-2 text-purple-500 underline">
                  wróć do swoich
                </button>
              </p>
            )}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
                <div className="text-2xl font-bold text-blue-600">{totalCount}</div>
                <div className="text-xs text-gray-600 font-medium mt-0.5">Treningów</div>
              </div>
              <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
                <div className="text-2xl font-bold text-orange-500">{weeklyCount}</div>
                <div className="text-xs text-gray-600 font-medium mt-0.5">Ten tydzień</div>
              </div>
              <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
                <div className="text-2xl font-bold text-green-600">{streak}</div>
                <div className="text-xs text-gray-600 font-medium mt-0.5">
                  {streak === 1 ? 'Dzień z rzędu' : 'Dni z rzędu'}
                </div>
              </div>
            </div>

            {weekVol.total > 0 && (
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-bold text-gray-700">Objętość — ten tydzień</h2>
                  <span className="text-sm font-bold text-blue-600">{Math.round(weekVol.total).toLocaleString('pl-PL')} kg</span>
                </div>
                <div className="space-y-1.5">
                  {weekVol.groups.map(([g, v]) => (
                    <div key={g} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-24 shrink-0 truncate">{g}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-2">
                        <div
                          className="h-2 rounded-full bg-blue-400"
                          style={{ width: `${Math.max(8, 100 * v / weekVol.groups[0][1])}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-600 w-16 text-right shrink-0">{Math.round(v).toLocaleString('pl-PL')} kg</span>
                    </div>
                  ))}
                </div>
                {weekStreakVal > 1 && (
                  <p className="text-xs text-green-600 font-medium mt-2">🔥 {weekStreakVal} tygodni treningowych z rzędu</p>
                )}
              </div>
            )}
          </>
        )}

        <div className="grid grid-cols-3 gap-3">
          {[
            { href: '/historia', icon: '📊', label: 'Historia' },
            { href: '/bieganie', icon: '🏃', label: 'Bieganie' },
            { href: '/waga', icon: '⚖️', label: 'Waga' },
          ].map(({ href, icon, label }) => (
            <Link key={href} href={href} className="bg-white rounded-2xl p-4 text-center shadow-sm block">
              <div className="text-2xl mb-1">{icon}</div>
              <div className="text-xs font-medium text-gray-700">{label}</div>
            </Link>
          ))}
        </div>

        {isLoggedIn && (
          <div>
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-2">Ostatnia aktywność</h2>
            {loading && !data ? (
              <div className="bg-white rounded-2xl p-6 text-center text-gray-400 text-sm">Ładowanie...</div>
            ) : feed.length === 0 ? (
              <div className="bg-white rounded-2xl p-6 text-center">
                <p className="text-gray-400 text-sm mb-3">Brak treningów. Zacznij pierwszy!</p>
                <Link href="/trening" className="inline-block bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold">
                  + Dodaj trening
                </Link>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                {feed.map((item, i) => {
                  const ownerId = item.kind === 'workout' ? item.session.userId : item.run.userId;
                  const mine = ownerId === userId;
                  const weightKg = weightByUser[ownerId] || 0;
                  const badge = (
                    <span className={`text-xs font-bold rounded-lg px-2 py-0.5 ${
                      mine ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                    }`}>
                      {mine ? 'Ty' : (item.kind === 'workout' ? item.session.user?.name : userName(ownerId))}
                    </span>
                  );
                  if (item.kind === 'run') {
                    const kcal = runCalories(weightKg, item.run.distance);
                    const paceSec = item.run.distance > 0 ? item.run.duration / item.run.distance : 0;
                    const pace = paceSec > 0 ? `${Math.floor(paceSec / 60)}'${String(Math.round(paceSec % 60)).padStart(2, '0')}"/km` : '';
                    return (
                      <Link key={`r-${item.run.id}`} href="/bieganie"
                        className={`flex items-center justify-between gap-2 px-4 py-3 ${i > 0 ? 'border-t border-gray-100' : ''}`}>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {badge}
                            <span className="font-medium text-gray-900 text-sm">{formatDate(item.run.date)}</span>
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            🏃 {item.run.distance} km{pace && ` · ${pace}`}{kcal > 0 && ` · ~${kcal} kcal`}
                          </div>
                        </div>
                        <span className="text-gray-400 shrink-0">›</span>
                      </Link>
                    );
                  }
                  const session = item.session;
                  const sc = sessionCalories(session, weightKg);
                  return (
                    <Link
                      key={session.id}
                      href={`/trening/podsumowanie/${session.id}`}
                      className={`flex items-center justify-between gap-2 px-4 py-3 ${i > 0 ? 'border-t border-gray-100' : ''}`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {badge}
                          <span className="font-medium text-gray-900 text-sm">{formatDate(session.date)}</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          🏋️ {session.entries?.length || 0} ćwiczeń{sc.kcal > 0 && ` · ${sc.estimated ? '~' : ''}${sc.kcal} kcal${sc.estimated ? '' : ' ⌚'}`}
                          {session.notes && <span className="italic"> · {session.notes}</span>}
                        </div>
                      </div>
                      <span className="text-gray-400 shrink-0">›</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

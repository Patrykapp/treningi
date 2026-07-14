'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { WorkoutSession } from '@/types';
import { formatDate, formatDateInput } from '@/lib/utils';
import { DAY_LABELS, getPlanToday, PlanLike } from '@/lib/plans';
import { useAuth } from '@/hooks/useAuth';
import { runCalories, sessionCalories } from '@/lib/calories';
import { ActivityHeatmap } from '@/components/ui/ActivityHeatmap';
import { SkeletonCard } from '@/components/ui/Skeleton';
import {
  Plus, Flag, BarChart3, PersonStanding, Bike, Scale, Sparkles,
  Crown, Flame, Zap, ChevronRight, Dumbbell, TrendingUp, Ruler, Target,
  BellRing, X, Calendar, Play,
} from 'lucide-react';

interface Run {
  id: string;
  userId: string;
  date: string;
  distance: number;
  duration: number;
}

interface AppUser { id: string; name: string; }

interface OtherActivity {
  id: string;
  userId: string;
  date: string;
  type: string;
  durationMin: number;
  distanceKm: number | null;
  kcal: number | null;
  notes: string | null;
  sessionId?: string | null;
  user?: { id: string; name: string };
}

interface DashboardData {
  users: AppUser[];
  sessionsByUser: Record<string, WorkoutSession[]>;
  runsByUser: Record<string, Run[]>;
  activitiesByUser: Record<string, OtherActivity[]>;
  weightByUser: Record<string, number>;
}

// Dowolna aktywność z datą (trening siłowy lub bieg)
interface Dated { date: string }

const CACHE_KEY = 'dashboardCacheV1';
const REMINDER_SETTINGS_KEY = 'reminderSettings';
const REMINDER_DISMISSED_KEY = 'reminderDismissedOn';

// Przypomnienie o treningu (v1, bez powiadomień push) — licznik dni od ostatniej
// AKTYWNOŚCI WŁASNEJ zalogowanego użytkownika (niezależnie od tego, czyj profil
// jest akurat oglądany na dashboardzie). Ustawienia (włącz/wyłącz, próg dni)
// trzymane w localStorage — patrz app/ustawienia/page.tsx.
function useReminderBanner(myActivities: Dated[]) {
  const [visible, setVisible] = useState(false);
  const [daysSince, setDaysSince] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined' || myActivities.length === 0) { setVisible(false); return; }
    let settings = { enabled: true, thresholdDays: 3 };
    try {
      const raw = localStorage.getItem(REMINDER_SETTINGS_KEY);
      if (raw) settings = { ...settings, ...JSON.parse(raw) };
    } catch { /* uszkodzone ustawienia — użyj domyślnych */ }
    if (!settings.enabled) { setVisible(false); return; }

    const mostRecentMs = Math.max(...myActivities.map(a => new Date(a.date).getTime()));
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const recentDay = new Date(mostRecentMs); recentDay.setHours(0, 0, 0, 0);
    const diffDays = Math.round((today.getTime() - recentDay.getTime()) / 86400000);
    setDaysSince(diffDays);

    if (diffDays < settings.thresholdDays) { setVisible(false); return; }
    const dismissedOn = localStorage.getItem(REMINDER_DISMISSED_KEY);
    setVisible(dismissedOn !== formatDateInput(today));
  }, [myActivities]);

  const dismiss = () => {
    try { localStorage.setItem(REMINDER_DISMISSED_KEY, formatDateInput(new Date())); } catch { /* pełny storage */ }
    setVisible(false);
  };

  return { visible, daysSince, dismiss };
}

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

// Objętość łączna (bez ograniczenia do tygodnia) — do porównania "od zawsze"
function calcTotalVolume(sessions: WorkoutSession[]): number {
  let total = 0;
  for (const s of sessions) {
    for (const e of s.entries || []) {
      const sd = Array.isArray(e.setsData) && e.setsData.length > 0 ? e.setsData : null;
      const vol = sd ? sd.reduce((sum, x) => sum + x.reps * x.weight, 0) : e.sets * e.reps * e.weight;
      if (vol > 0) total += vol;
    }
  }
  return total;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewUserId, setViewUserId] = useState<string | null>(null); // null = zalogowany
  const [comparisonPeriod, setComparisonPeriod] = useState<'week' | 'alltime'>('week');
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
  const activitiesByUser = data?.activitiesByUser || {};
  const weightByUser = data?.weightByUser || {};

  // Osoba, której pulpit oglądamy (statystyki, objętość)
  const activeId = viewUserId || userId || '';
  const activeSessions = sessionsByUser[activeId] || [];
  const activeRuns = runsByUser[activeId] || [];
  const activeOtherActivities = activitiesByUser[activeId] || [];
  // Aktywność podpięta do treningu jest częścią tego treningu — nie liczymy jej
  // jako osobnej pozycji (historia też pokazuje ją pod treningiem, nie na osi czasu)
  const activeSoloActivities = activeOtherActivities.filter(a => !a.sessionId);
  // Trening siłowy + bieg + samodzielna aktywność — liczy się do passy/statystyk
  const activeActivities: Dated[] = [...activeSessions, ...activeRuns, ...activeSoloActivities];

  // Do przypomnienia liczy się WŁASNA aktywność zalogowanego — niezależnie od tego,
  // czyj profil jest akurat oglądany (viewUserId może wskazywać na drugą osobę).
  const myActivities: Dated[] = userId ? [
    ...(sessionsByUser[userId] || []),
    ...(runsByUser[userId] || []),
    ...(activitiesByUser[userId] || []).filter(a => !a.sessionId),
  ] : [];
  const reminder = useReminderBanner(myActivities);

  // Aktywny plan treningowy zalogowanego — pokazuje "dziś wg planu" niezależnie
  // od tego, czyj profil jest oglądany (tak jak przypomnienie o treningu wyżej).
  const [myPlan, setMyPlan] = useState<PlanLike & { name: string; dayTemplateNames: (string | null)[]; dayTemplateValid: boolean[] } | null>(null);
  useEffect(() => {
    if (!isLoggedIn) { setMyPlan(null); return; }
    fetch('/api/plans')
      .then(r => (r.ok ? r.json() : []))
      .then((data: (PlanLike & { active: boolean; name: string; dayTemplateNames: (string | null)[]; dayTemplateValid: boolean[] })[]) => {
        if (Array.isArray(data)) setMyPlan(data.find(p => p.active) || null);
      })
      .catch(() => {});
  }, [isLoggedIn]);
  const planToday = myPlan ? getPlanToday(myPlan) : null;

  const streak = calcStreak(activeActivities);
  const weeklyCount = calcWeeklyCount(activeActivities);
  const totalCount = activeSessions.length + activeRuns.length + activeSoloActivities.length;
  const weekStreakVal = calcWeekStreak(activeActivities);
  const weekVol = calcWeeklyVolume(activeSessions);

  // Porównanie tygodniowe wszystkich użytkowników (motywacja!)
  const comparison = users.map(u => {
    const us = sessionsByUser[u.id] || [];
    const runs = runsByUser[u.id] || [];
    const acts = activitiesByUser[u.id] || [];
    const weightKg = weightByUser[u.id] || 0;
    const weekSessions = lastWeek(us);
    const weekRuns = lastWeek(runs);
    const weekActs = lastWeek(acts);
    // Aktywności podpięte do treningu nie są osobną pozycją (są częścią treningu),
    // ale ich kalorie to realny wysiłek: kcal liczymy z wszystkich, licznik tylko z samodzielnych
    const weekActsSolo = weekActs.filter(a => !a.sessionId);
    const weekKcal =
      weekSessions.reduce((sum, s) => sum + sessionCalories(s, weightKg).kcal, 0) +
      weekRuns.reduce((sum, r) => sum + runCalories(weightKg, r.distance), 0) +
      weekActs.reduce((sum, a) => sum + (a.kcal || 0), 0);
    // Punktacja rankingu tygodniowego:
    //   100 pkt za trening (siłowy, bieg lub inna aktywność)
    //   +30 pkt za każdy DZIEŃ z treningiem (premiuje regularność, nie kumulowanie w 1 dzień)
    //   +1 pkt za każde 10 kcal (premiuje cięższe/dłuższe treningi)
    const weekDays = new Set([...weekSessions, ...weekRuns, ...weekActsSolo].map(x => {
      const d = new Date(x.date); d.setHours(0, 0, 0, 0); return d.getTime();
    })).size;
    const weekCount = weekSessions.length + weekRuns.length + weekActsSolo.length;
    const score = weekCount * 100 + weekDays * 30 + Math.round(weekKcal / 10);
    const actsSolo = acts.filter(a => !a.sessionId);
    return {
      id: u.id,
      name: u.id === userId ? 'Ty' : u.name,
      isMe: u.id === userId,
      weekCount,
      weekVolume: calcWeeklyVolume(us).total,
      weekKcal,
      score,
      streak: calcStreak([...us, ...runs, ...actsSolo]),
      allTimeCount: us.length + runs.length + actsSolo.length,
      allTimeVolume: calcTotalVolume(us),
      allTimeKm: runs.reduce((s, r) => s + r.distance, 0),
    };
  });
  // Metryka rankingu zależna od wybranego okresu porównania (tydzień = punktacja, od zawsze = liczba treningów)
  const comparisonMetric = (c: typeof comparison[number]) => comparisonPeriod === 'week' ? c.score : c.allTimeCount;
  const maxScore = Math.max(0, ...comparison.map(comparisonMetric));
  const leader = comparison.filter(c => comparisonMetric(c) === maxScore && maxScore > 0);

  // Wspólny feed — treningi siłowe i biegi wszystkich, posortowane po dacie
  type FeedItem =
    | { kind: 'workout'; date: string; session: WorkoutSession }
    | { kind: 'run'; date: string; run: Run }
    | { kind: 'activity'; date: string; activity: OtherActivity };
  const feed: FeedItem[] = [
    ...Object.values(sessionsByUser).flat().map(s => ({ kind: 'workout' as const, date: s.date, session: s })),
    ...Object.values(runsByUser).flat().map(r => ({ kind: 'run' as const, date: r.date, run: r })),
    ...Object.values(activitiesByUser).flat().map(a => ({ kind: 'activity' as const, date: a.date, activity: a })),
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

      <div className="px-4 py-4 space-y-4 md:max-w-3xl lg:max-w-4xl md:mx-auto">
        {isLoggedIn ? (
          <Link href="/trening" className="flex items-center justify-center gap-2 w-full bg-blue-600 text-white text-center py-4 rounded-2xl font-semibold text-lg shadow-sm transition-colors hover:bg-blue-700 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
            <Plus className="w-5 h-5" strokeWidth={2} /> Dodaj trening
          </Link>
        ) : (
          <Link href="/login" className="block w-full bg-gray-100 text-gray-700 text-center py-4 rounded-2xl font-medium text-base transition-colors hover:bg-gray-200 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
            Zaloguj się aby dodawać treningi
          </Link>
        )}

        {isLoggedIn && reminder.visible && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center gap-3">
            <BellRing className="w-6 h-6 text-amber-500 shrink-0" strokeWidth={2} />
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-700">
                {reminder.daysSince} {reminder.daysSince === 1 ? 'dzień' : 'dni'} bez treningu
              </p>
              <p className="text-xs text-amber-600">Wróć do formy — nawet krótki trening się liczy 💪</p>
            </div>
            <button
              onClick={reminder.dismiss}
              className="p-1.5 rounded-lg text-amber-400 transition-colors hover:text-amber-700 hover:bg-amber-100 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              aria-label="Ukryj przypomnienie na dziś"
            >
              <X className="w-4 h-4" strokeWidth={2} />
            </button>
          </div>
        )}

        {isLoggedIn && myPlan && planToday?.status === 'active' && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" strokeWidth={2} /> {DAY_LABELS[planToday.dayOfWeek]} · {myPlan.name}
                </p>
                <p className="font-bold text-gray-900 mt-0.5 truncate">
                  {planToday.templateId ? (myPlan.dayTemplateNames[planToday.dayOfWeek] || '(usunięty szablon)') : 'Dzień wolny 🌴'}
                </p>
              </div>
              {planToday.templateId && myPlan.dayTemplateValid[planToday.dayOfWeek] ? (
                <Link
                  href={`/trening?templateId=${planToday.templateId}`}
                  className="shrink-0 inline-flex items-center gap-1.5 bg-blue-600 text-white px-3 py-2 rounded-xl text-sm font-semibold transition-colors hover:bg-blue-700 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                >
                  <Play className="w-4 h-4" strokeWidth={2} /> Start
                </Link>
              ) : (
                <Link href="/plan" className="shrink-0 text-xs text-blue-600 font-medium rounded-lg px-2 py-1 transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
                  Zobacz plan
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Porównanie — widoczne od razu, motywacja dla obojga */}
        {isLoggedIn && comparison.length > 1 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
                <Flag className="w-4 h-4" strokeWidth={2} /> {comparisonPeriod === 'week' ? 'Ten tydzień — kto prowadzi?' : 'Od zawsze'}
              </h2>
              <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs font-medium shrink-0">
                <button
                  type="button"
                  onClick={() => setComparisonPeriod('week')}
                  className={`px-2.5 py-1 rounded-md transition-colors ${comparisonPeriod === 'week' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
                >
                  Tydzień
                </button>
                <button
                  type="button"
                  onClick={() => setComparisonPeriod('alltime')}
                  className={`px-2.5 py-1 rounded-md transition-colors ${comparisonPeriod === 'alltime' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
                >
                  Od zawsze
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {comparison.map(c => {
                const isLeader = leader.some(l => l.id === c.id) && leader.length === 1;
                return (
                  <button key={c.id} type="button" onClick={() => setViewUserId(c.isMe ? null : c.id)}
                    className="text-left w-full transition active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded-xl">
                    <div className={`rounded-xl p-3 text-center border-2 transition-colors hover:border-blue-300 ${
                      isLeader ? 'border-yellow-400 bg-yellow-50' : 'border-gray-100 bg-gray-50'
                    } ${activeId === c.id ? 'ring-2 ring-blue-400' : ''}`}>
                      <div className="text-sm font-bold text-gray-800 mb-1 flex items-center justify-center gap-1">
                        {isLeader && <Crown className="w-4 h-4 text-yellow-500" strokeWidth={2} />}{c.name}
                      </div>
                      {comparisonPeriod === 'week' ? (
                        <>
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
                            <div className="text-xs text-red-500 font-medium mt-0.5 flex items-center justify-center gap-1">
                              <Flame className="w-3.5 h-3.5" strokeWidth={2} /> ~{c.weekKcal.toLocaleString('pl-PL')} kcal
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="text-2xl font-bold text-blue-600">{c.allTimeCount}</div>
                          <div className="text-xs text-gray-500">treningów łącznie</div>
                          {c.allTimeVolume > 0 && (
                            <div className="text-xs text-gray-600 font-medium mt-1">
                              {Math.round(c.allTimeVolume / 1000).toLocaleString('pl-PL')} t łącznie
                            </div>
                          )}
                          {c.allTimeKm > 0 && (
                            <div className="text-xs text-green-600 font-medium mt-0.5">
                              {c.allTimeKm.toFixed(1)} km łącznie
                            </div>
                          )}
                        </>
                      )}
                      {c.streak > 1 && (
                        <div className="text-xs text-orange-500 font-medium mt-0.5 flex items-center justify-center gap-1">
                          <Zap className="w-3.5 h-3.5" strokeWidth={2} /> {c.streak} dni z rzędu
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            {comparisonPeriod === 'week' ? (
              <p className="text-xs text-gray-400 text-center mt-2">
                Punkty: 100 za trening · +30 za każdy dzień treningowy · +1 za 10 kcal
              </p>
            ) : (
              <p className="text-xs text-gray-400 text-center mt-2">
                Łączna liczba treningów, wolumen i kilometry od początku korzystania z appki
              </p>
            )}
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
                <button type="button" onClick={() => setViewUserId(null)} className="ml-2 text-purple-500 underline transition-colors hover:text-purple-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded">
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

            {weekStreakVal >= 2 && (
              <div className="bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3 flex items-center gap-3">
                <Flame className="w-6 h-6 text-orange-500 shrink-0" strokeWidth={2} />
                <div>
                  <p className="text-sm font-bold text-orange-700">{weekStreakVal} tygodnie z rzędu!</p>
                  <p className="text-xs text-orange-500">Nie przerywaj passy — trenuj w tym tygodniu</p>
                </div>
              </div>
            )}

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
              </div>
            )}

            <ActivityHeatmap userId={activeId || undefined} />

            {/* Trend formy — średnie tętno treningów z zegarka */}
            {(() => {
              const withHr = [...activeSessions].filter(s => s.avgHr).reverse().slice(-10);
              if (withHr.length < 3) return null;
              const vals = withHr.map(s => s.avgHr as number);
              const min = Math.min(...vals) - 3;
              const max = Math.max(...vals) + 3;
              const W = 600, H = 60;
              const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * W},${H - ((v - min) / (max - min)) * H}`).join(' ');
              const trend = vals[vals.length - 1] - vals[0];
              return (
                <div className="bg-white rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-1">
                    <h2 className="text-sm font-bold text-gray-700 flex items-center gap-1.5"><TrendingUp className="w-4 h-4 text-red-500" strokeWidth={2} /> Forma — śr. tętno treningów</h2>
                    <span className={`text-xs font-bold ${trend <= 0 ? 'text-green-600' : 'text-orange-500'}`}>
                      {trend <= 0 ? '▼' : '▲'} {Math.abs(trend)} bpm
                    </span>
                  </div>
                  <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-14" preserveAspectRatio="none">
                    <polyline points={pts} fill="none" stroke="#ef4444" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                  </svg>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>{vals[0]} bpm</span>
                    <span>{vals[vals.length - 1]} bpm</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Niższe tętno przy podobnym wysiłku = lepsza forma. Ostatnie {withHr.length} treningów z zegarka.
                  </p>
                </div>
              );
            })()}
          </>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { href: '/challenge', icon: Zap, label: 'Challenge' },
            { href: '/historia', icon: BarChart3, label: 'Historia' },
            { href: '/bieganie', icon: PersonStanding, label: 'Bieganie' },
            { href: '/aktywnosci', icon: Bike, label: 'Aktywności' },
            { href: '/waga', icon: Scale, label: 'Waga' },
            { href: '/pomiary', icon: Ruler, label: 'Pomiary' },
            { href: '/cele', icon: Target, label: 'Cele' },
            { href: '/plan', icon: Calendar, label: 'Plan' },
            { href: '/insighty', icon: Sparkles, label: 'AI Insighty' },
          ].map(({ href, icon: Icon, label }) => (
            <Link key={href} href={href} className="bg-white rounded-2xl p-4 text-center shadow-sm block transition-all hover:shadow-md hover:border-gray-300 border border-transparent active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
              <Icon className="w-6 h-6 mx-auto mb-1 text-gray-700" strokeWidth={2} />
              <div className="text-xs font-medium text-gray-700">{label}</div>
            </Link>
          ))}
        </div>

        {isLoggedIn && (
          <div>
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-2">Ostatnia aktywność</h2>
            {loading && !data ? (
              <div className="space-y-3">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </div>
            ) : feed.length === 0 ? (
              <div className="bg-white rounded-2xl p-6 text-center">
                <p className="text-gray-400 text-sm mb-3">Brak treningów. Zacznij pierwszy!</p>
                <Link href="/trening" className="inline-flex items-center gap-1.5 bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors hover:bg-blue-700 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
                  <Plus className="w-4 h-4" strokeWidth={2} /> Dodaj trening
                </Link>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                {feed.map((item, i) => {
                  const ownerId = item.kind === 'workout' ? item.session.userId
                    : item.kind === 'run' ? item.run.userId
                    : item.activity.userId;
                  const mine = ownerId === userId;
                  const weightKg = weightByUser[ownerId] || 0;
                  const badge = (
                    <span className={`text-xs font-bold rounded-lg px-2 py-0.5 ${
                      mine ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                    }`}>
                      {mine ? 'Ty' : (item.kind === 'workout' ? item.session.user?.name : userName(ownerId))}
                    </span>
                  );
                  if (item.kind === 'activity') {
                    const a = item.activity;
                    const h = Math.floor(a.durationMin / 60);
                    const m = a.durationMin % 60;
                    const dur = h > 0 ? `${h} h${m > 0 ? ` ${m} min` : ''}` : `${m} min`;
                    return (
                      <Link key={`a-${a.id}`} href="/aktywnosci"
                        className={`flex items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${i > 0 ? 'border-t border-gray-100' : ''}`}>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {badge}
                            <span className="font-medium text-gray-900 text-sm">{formatDate(a.date)}</span>
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {a.type} · {dur}{a.distanceKm ? ` · ${a.distanceKm} km` : ''}{a.kcal ? ` · ~${a.kcal} kcal` : ''}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" strokeWidth={2} />
                      </Link>
                    );
                  }
                  if (item.kind === 'run') {
                    const kcal = runCalories(weightKg, item.run.distance);
                    const paceSec = item.run.distance > 0 ? item.run.duration / item.run.distance : 0;
                    const pace = paceSec > 0 ? `${Math.floor(paceSec / 60)}'${String(Math.round(paceSec % 60)).padStart(2, '0')}"/km` : '';
                    return (
                      <Link key={`r-${item.run.id}`} href="/bieganie"
                        className={`flex items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${i > 0 ? 'border-t border-gray-100' : ''}`}>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {badge}
                            <span className="font-medium text-gray-900 text-sm">{formatDate(item.run.date)}</span>
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                            <PersonStanding className="w-3.5 h-3.5" strokeWidth={2} /> {item.run.distance} km{pace && ` · ${pace}`}{kcal > 0 && ` · ~${kcal} kcal`}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" strokeWidth={2} />
                      </Link>
                    );
                  }
                  const session = item.session;
                  const sc = sessionCalories(session, weightKg);
                  return (
                    <Link
                      key={session.id}
                      href={`/trening/podsumowanie/${session.id}`}
                      className={`flex items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${i > 0 ? 'border-t border-gray-100' : ''}`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {badge}
                          <span className="font-medium text-gray-900 text-sm">{formatDate(session.date)}</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                          <Dumbbell className="w-3.5 h-3.5" strokeWidth={2} /> {session.entries?.length || 0} ćwiczeń{sc.kcal > 0 && ` · ${sc.estimated ? '~' : ''}${sc.kcal} kcal${sc.estimated ? '' : ' ⌚'}`}
                          {session.notes && <span className="italic"> · {session.notes}</span>}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" strokeWidth={2} />
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

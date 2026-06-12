'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { WorkoutSession } from '@/types';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

function calcStreak(sessions: WorkoutSession[]): number {
  if (!sessions.length) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dates = [...new Set(sessions.map(s => {
    const d = new Date(s.date);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }))].sort((a, b) => b - a);
  let streak = 0;
  let expected = today.getTime();
  for (const d of dates) {
    if (d === expected || d === expected - 86400000) {
      streak++;
      expected = d - 86400000;
    } else { break; }
  }
  return streak;
}

function calcWeeklyCount(sessions: WorkoutSession[]): number {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return sessions.filter(s => new Date(s.date) >= weekAgo).length;
}

// Początek tygodnia (poniedziałek, 00:00) dla danej daty
function weekStart(d: Date): number {
  const dd = new Date(d);
  dd.setHours(0, 0, 0, 0);
  dd.setDate(dd.getDate() - ((dd.getDay() + 6) % 7));
  return dd.getTime();
}

// Kolejne tygodnie kalendarzowe z co najmniej jednym treningiem
function calcWeekStreak(sessions: WorkoutSession[]): number {
  if (!sessions.length) return 0;
  const weeks = new Set(sessions.map(s => weekStart(new Date(s.date))));
  let cursor = weekStart(new Date());
  let streak = 0;
  // bieżący tydzień może być jeszcze pusty — wtedy licz od poprzedniego
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

// Objętość z ostatnich 7 dni pogrupowana po grupie mięśniowej
function calcWeeklyVolume(sessions: WorkoutSession[]): { total: number; groups: [string, number][] } {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const groups: Record<string, number> = {};
  let total = 0;
  for (const s of sessions) {
    if (new Date(s.date).getTime() < weekAgo) continue;
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
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [allSessions, setAllSessions] = useState<WorkoutSession[]>([]);
  const [loading, setLoading] = useState(true);
  const { isLoggedIn, name } = useAuth();

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const [recent, all] = await Promise.all([
        fetch('/api/sessions?limit=5').then(r => r.json()),
        fetch('/api/sessions?limit=200').then(r => r.json()),
      ]);
      setSessions(Array.isArray(recent) ? recent : []);
      setAllSessions(Array.isArray(all) ? all : []);
    } catch {
      setSessions([]);
      setAllSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn) loadSessions();
    else setLoading(false);
  }, [isLoggedIn, loadSessions]);

  const streak = calcStreak(allSessions);
  const weeklyCount = calcWeeklyCount(allSessions);
  const totalCount = allSessions.length;
  const weekStreak = calcWeekStreak(allSessions);
  const weekVol = calcWeeklyVolume(allSessions);

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

        {isLoggedIn && !loading && (
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
        )}

        {isLoggedIn && !loading && weekVol.total > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold text-gray-700">Objętość — ostatnie 7 dni</h2>
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
            {weekStreak > 1 && (
              <p className="text-xs text-green-600 font-medium mt-2">🔥 {weekStreak} tygodni treningowych z rzędu</p>
            )}
          </div>
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
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-2">Ostatnie treningi</h2>
            {loading ? (
              <div className="bg-white rounded-2xl p-6 text-center text-gray-400 text-sm">Ładowanie...</div>
            ) : sessions.length === 0 ? (
              <div className="bg-white rounded-2xl p-6 text-center">
                <p className="text-gray-400 text-sm mb-3">Brak treningów. Zacznij pierwszy!</p>
                <Link href="/trening" className="inline-block bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold">
                  + Dodaj trening
                </Link>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                {sessions.map((session, i) => (
                  <Link
                    key={session.id}
                    href={`/historia`}
                    className={`flex items-center justify-between px-4 py-3.5 ${i > 0 ? 'border-t border-gray-100' : ''}`}
                  >
                    <div>
                      <div className="font-medium text-gray-900 text-sm">{formatDate(session.date)}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {session.entries?.length || 0} ćwiczeń
                      </div>
                    </div>
                    <span className="text-gray-400">›</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

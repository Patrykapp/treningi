'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { WorkoutSession } from '@/types';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

function calcStreak(sessions: WorkoutSession[]): number {
  if (!sessions.length) return 0;
  const days = new Set(sessions.map(s => {
    const d = new Date(s.date);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }));
  const prevDay = (d: Date) => { const n = new Date(d); n.setDate(n.getDate() - 1); return n; };
  // Start: dziś, a jeśli dziś (jeszcze) nie było treningu — wczoraj.
  // Dalej wymagane są kolejne dni BEZ przerw (wcześniej warunek
  // akceptował 1 dzień przerwy na każdym kroku i treningi co drugi
  // dzień liczyły się jako "dni z rzędu").
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

interface AppUser { id: string; name: string; }

export default function DashboardPage() {
  const [allSessions, setAllSessions] = useState<WorkoutSession[]>([]);
  const [partnerSessions, setPartnerSessions] = useState<Record<string, WorkoutSession[]>>({});
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const { isLoggedIn, name, userId } = useAuth();

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const [all, usersRes] = await Promise.all([
        fetch('/api/sessions?limit=200').then(r => r.json()),
        fetch('/api/users').then(r => r.json()),
      ]);
      setAllSessions(Array.isArray(all) ? all : []);
      const userList: AppUser[] = Array.isArray(usersRes) ? usersRes : [];
      setUsers(userList);
      // Treningi pozostałych użytkowników — do porównania i wspólnego feedu
      const others = userList.filter(u => u.id !== userId);
      const results = await Promise.all(
        others.map(u => fetch(`/api/sessions?userId=${u.id}&limit=200`).then(r => r.json()).catch(() => []))
      );
      const map: Record<string, WorkoutSession[]> = {};
      others.forEach((u, i) => { map[u.id] = Array.isArray(results[i]) ? results[i] : []; });
      setPartnerSessions(map);
    } catch {
      setAllSessions([]);
      setPartnerSessions({});
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (isLoggedIn && userId) loadSessions();
    else if (isLoggedIn === false) setLoading(false);
  }, [isLoggedIn, userId, loadSessions]);

  const streak = calcStreak(allSessions);
  const weeklyCount = calcWeeklyCount(allSessions);
  const totalCount = allSessions.length;
  const weekStreak = calcWeekStreak(allSessions);
  const weekVol = calcWeeklyVolume(allSessions);

  // Porównanie tygodniowe wszystkich użytkowników (motywacja!)
  const comparison = users.map(u => {
    const us = u.id === userId ? allSessions : (partnerSessions[u.id] || []);
    return {
      id: u.id,
      name: u.id === userId ? 'Ty' : u.name,
      isMe: u.id === userId,
      weekCount: calcWeeklyCount(us),
      weekVolume: calcWeeklyVolume(us).total,
      streak: calcStreak(us),
      lastDate: us[0]?.date || null,
    };
  });
  const maxWeekCount = Math.max(0, ...comparison.map(c => c.weekCount));
  const leader = comparison.filter(c => c.weekCount === maxWeekCount && maxWeekCount > 0);

  // Wspólny feed — treningi wszystkich, posortowane po dacie
  const feed = [
    ...allSessions,
    ...Object.values(partnerSessions).flat(),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 6);

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
        {isLoggedIn && !loading && comparison.length > 1 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <h2 className="text-sm font-bold text-gray-700 mb-3">Ten tydzień — kto prowadzi? 🏁</h2>
            <div className="grid grid-cols-2 gap-3">
              {comparison.map(c => {
                const isLeader = leader.some(l => l.id === c.id) && leader.length === 1;
                const inner = (
                  <div className={`rounded-xl p-3 text-center border-2 transition-colors ${
                    isLeader ? 'border-yellow-400 bg-yellow-50' : 'border-gray-100 bg-gray-50'
                  }`}>
                    <div className="text-sm font-bold text-gray-800 mb-1">
                      {isLeader && '👑 '}{c.name}
                    </div>
                    <div className="text-2xl font-bold text-blue-600">{c.weekCount}</div>
                    <div className="text-xs text-gray-500">
                      {c.weekCount === 1 ? 'trening' : 'treningi'} w tym tyg.
                    </div>
                    {c.weekVolume > 0 && (
                      <div className="text-xs text-gray-600 font-medium mt-1">
                        {Math.round(c.weekVolume).toLocaleString('pl-PL')} kg
                      </div>
                    )}
                    {c.streak > 1 && (
                      <div className="text-xs text-orange-500 font-medium mt-0.5">🔥 {c.streak} dni z rzędu</div>
                    )}
                  </div>
                );
                return c.isMe ? (
                  <div key={c.id}>{inner}</div>
                ) : (
                  <Link key={c.id} href={`/profil/${c.id}`}>{inner}</Link>
                );
              })}
            </div>
          </div>
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
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-2">Ostatnia aktywność</h2>
            {loading ? (
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
                {feed.map((session, i) => {
                  const mine = session.userId === userId;
                  return (
                    <Link
                      key={session.id}
                      href={`/trening/podsumowanie/${session.id}`}
                      className={`flex items-center justify-between gap-2 px-4 py-3 ${i > 0 ? 'border-t border-gray-100' : ''}`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold rounded-lg px-2 py-0.5 ${
                            mine ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                          }`}>
                            {mine ? 'Ty' : session.user?.name}
                          </span>
                          <span className="font-medium text-gray-900 text-sm">{formatDate(session.date)}</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {session.entries?.length || 0} ćwiczeń
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

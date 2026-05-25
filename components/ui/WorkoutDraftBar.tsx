'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { activeSession } from '@/hooks/useActiveSession';
import { useAuth } from '@/hooks/useAuth';

interface SessionEntry {
  id: string;
  exercise: { name: string };
  sets: number;
  reps: number;
  weight: number;
}

interface LiveSession {
  id: string;
  entries: SessionEntry[];
  date: string;
}

export function WorkoutDraftBar() {
  const [session, setSession] = useState<LiveSession | null>(null);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { isLoggedIn } = useAuth();

  const refresh = useCallback(async () => {
    const id = activeSession.getId();
    if (!id) { setSession(null); return; }
    try {
      const res = await fetch(`/api/sessions/${id}`);
      if (!res.ok) { activeSession.clear(); setSession(null); return; }
      const data = await res.json();
      setSession(data);
    } catch {
      setSession(null);
    }
  }, []);

  // Odśwież przy każdej nawigacji i przy zdarzeniu
  useEffect(() => { refresh(); }, [pathname, refresh]);

  useEffect(() => {
    window.addEventListener('activeSessionChanged', refresh);
    // Gdy użytkownik wraca do zakładki
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refresh();
    });
    return () => window.removeEventListener('activeSessionChanged', refresh);
  }, [refresh]);

  if (!isLoggedIn || !session || session.entries.length === 0) return null;
  if (pathname === '/login' || pathname === '/trening') return null;

  const handleFinish = () => {
    router.push(`/trening?sessionId=${session.id}`);
  };

  const handleDiscard = () => {
    if (confirm(`Anulować trening? Usunie ${session.entries.length} zapisanych ćwiczeń.`)) {
      fetch(`/api/sessions/${session.id}`, { method: 'DELETE' });
      activeSession.clear();
      setSession(null);
    }
  };

  const handleRemoveEntry = async (entryId: string) => {
    // Usuń wpis z bazy przez sessions endpoint – pobierz sesję i zapisz bez tego wpisu
    const updated = session.entries.filter(e => e.id !== entryId);
    if (updated.length === 0) {
      handleDiscard();
      return;
    }
    await fetch(`/api/sessions/${session.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: session.date,
        userId: (session as { userId?: string }).userId,
        entries: updated.map(e => ({
          exerciseId: e.exercise ? (e as { exerciseId?: string }).exerciseId || '' : '',
          sets: e.sets,
          reps: e.reps,
          weight: e.weight,
        })),
      }),
    });
    refresh();
  };

  return (
    <div className="fixed bottom-16 left-0 right-0 z-40 px-3 pb-1">
      <div className="max-w-2xl mx-auto">
        <div className="bg-blue-600 rounded-2xl shadow-lg overflow-hidden">
          {/* Header */}
          <button
            onClick={() => setOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-3"
          >
            <div className="flex items-center gap-2">
              <span className="text-white text-lg">💪</span>
              <span className="text-white font-semibold text-sm">
                Trening w toku · {session.entries.length}{' '}
                {session.entries.length === 1 ? 'ćwiczenie' : session.entries.length < 5 ? 'ćwiczenia' : 'ćwiczeń'}
              </span>
            </div>
            <span className="text-blue-200 text-xs">{open ? '▴' : '▾'}</span>
          </button>

          {/* Lista ćwiczeń */}
          {open && (
            <div className="bg-blue-700 px-4 pb-3 space-y-1.5 max-h-48 overflow-y-auto">
              {session.entries.map((entry, i) => {
                const name = entry.exercise?.name || '—';
                const short = name.includes(' - ') ? name.split(' - ').slice(1).join(' - ') : name;
                return (
                  <div key={entry.id} className="flex items-center justify-between">
                    <span className="text-blue-100 text-xs">
                      {i + 1}. {short}
                      <span className="text-blue-300 ml-1">
                        {entry.sets}×{entry.reps} @ {entry.weight}kg
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Akcje */}
          <div className="flex gap-2 px-4 pb-3 pt-1">
            <button
              onClick={handleFinish}
              className="flex-1 bg-white text-blue-600 font-bold py-2.5 rounded-xl text-sm"
            >
              Zakończ trening →
            </button>
            <button
              onClick={handleDiscard}
              className="bg-blue-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium"
            >
              Anuluj
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

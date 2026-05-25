'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { workoutDraft, WorkoutDraft } from '@/hooks/useWorkoutDraft';
import { useAuth } from '@/hooks/useAuth';

export function WorkoutDraftBar() {
  const [draft, setDraft] = useState<WorkoutDraft | null>(null);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { isLoggedIn } = useAuth();

  const refresh = useCallback(() => {
    setDraft(workoutDraft.get());
  }, []);

  // Odczytaj draft przy każdym montowaniu i przy zmianie ścieżki
  useEffect(() => {
    refresh();
  }, [pathname, refresh]);

  // Słuchaj na zdarzenie 'draftChanged' emitowane po dodaniu ćwiczenia
  useEffect(() => {
    window.addEventListener('draftChanged', refresh);
    return () => window.removeEventListener('draftChanged', refresh);
  }, [refresh]);

  if (!isLoggedIn || !draft || draft.entries.length === 0) return null;
  if (pathname === '/login' || pathname === '/trening') return null;

  const handleFinish = () => {
    router.push('/trening?fromDraft=1');
  };

  const handleDiscard = () => {
    if (confirm(`Anulować trening? Stracisz ${draft.entries.length} dodane ćwiczenia.`)) {
      workoutDraft.clear();
      setDraft(null);
    }
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
                Trening w toku · {draft.entries.length} {draft.entries.length === 1 ? 'ćwiczenie' : draft.entries.length < 5 ? 'ćwiczenia' : 'ćwiczeń'}
              </span>
            </div>
            <span className="text-blue-200 text-xs">{open ? '▴' : '▾'}</span>
          </button>

          {/* Lista ćwiczeń */}
          {open && (
            <div className="bg-blue-700 px-4 pb-3 space-y-1.5 max-h-48 overflow-y-auto">
              {draft.entries.map((entry, i) => (
                <div key={entry.id} className="flex items-center justify-between">
                  <span className="text-blue-100 text-xs">
                    {i + 1}. {entry.exerciseName.includes(' - ')
                      ? entry.exerciseName.split(' - ').slice(1).join(' - ')
                      : entry.exerciseName}
                    {' '}
                    <span className="text-blue-300">
                      {entry.setsData.length > 0
                        ? `${entry.setsData.length} serie`
                        : `${entry.sets}×${entry.reps} @ ${entry.weight}kg`}
                    </span>
                  </span>
                  <button
                    onClick={() => {
                      workoutDraft.remove(entry.id);
                      refresh();
                      window.dispatchEvent(new Event('draftChanged'));
                    }}
                    className="text-blue-300 text-sm px-2 py-0.5 hover:text-white"
                  >
                    ×
                  </button>
                </div>
              ))}
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

'use client';

import { useState } from 'react';
import { Exercise } from '@/types';

// Przyjazny wybór ćwiczenia: pole szukania + przeglądalna lista pogrupowana
// wg partii mięśniowej (jak w sekcji „Ćwiczenia"). Ulubione na górze, w obrębie
// grupy sortowane po popularności. Tapnięcie wybiera ćwiczenie (onSelect).

const GROUP_ORDER = [
  'Ulubione', 'Barki', 'Biceps', 'Brzuch', 'Klatka piersiowa', 'Nogi',
  'Plecy', 'Przedramiona', 'Ramiona', 'Triceps', 'Cardio', 'Inne',
];

function normalizeMuscle(raw: string | null | undefined): string {
  return (raw || '').replace(/\s*\(.*?\)/g, '').trim() || 'Inne';
}

export function ExercisePicker({
  exercises,
  favorites = [],
  onSelect,
}: {
  exercises: Exercise[];
  favorites?: string[];
  onSelect: (ex: Exercise) => void;
}) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const q = search.trim().toLowerCase();
  const matches = q ? exercises.filter(e => e.name.toLowerCase().includes(q)) : [];

  const sorted = [...exercises].sort((a, b) => {
    const af = favorites.includes(a.id) ? 0 : 1;
    const bf = favorites.includes(b.id) ? 0 : 1;
    if (af !== bf) return af - bf;
    const ua = a.usageCount || 0;
    const ub = b.usageCount || 0;
    if (ub !== ua) return ub - ua;
    return a.name.localeCompare(b.name, 'pl');
  });

  const groups: Record<string, Exercise[]> = {};
  for (const ex of sorted) {
    const g = favorites.includes(ex.id) ? 'Ulubione' : normalizeMuscle(ex.muscleGroup);
    (groups[g] ||= []).push(ex);
  }
  const groupEntries = Object.entries(groups).sort(([a], [b]) => {
    const ai = GROUP_ORDER.indexOf(a);
    const bi = GROUP_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b, 'pl');
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  const toggle = (g: string) => setExpanded(prev => {
    const n = new Set(prev);
    if (n.has(g)) n.delete(g); else n.add(g);
    return n;
  });

  const Row = ({ ex, showFav }: { ex: Exercise; showFav?: boolean }) => (
    <button
      onClick={() => onSelect(ex)}
      className="w-full text-left px-3 py-2.5 rounded-xl bg-gray-50 active:bg-blue-50 flex items-center justify-between gap-2"
    >
      <span className="text-sm font-medium text-gray-900 min-w-0 truncate">{ex.name}</span>
      {showFav && favorites.includes(ex.id)
        ? <span className="text-xs shrink-0">⭐</span>
        : ex.muscleGroup ? <span className="text-xs text-gray-400 shrink-0">{ex.muscleGroup}</span> : null}
    </button>
  );

  return (
    <div>
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Szukaj ćwiczenia..."
        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
      />

      {q ? (
        <div className="mt-2 space-y-1 max-h-72 overflow-y-auto">
          {matches.length === 0
            ? <p className="text-sm text-gray-400 py-4 text-center">Brak wyników dla „{search}"</p>
            : matches.map(ex => <Row key={ex.id} ex={ex} />)}
        </div>
      ) : (
        <div className="mt-2 space-y-2 max-h-80 overflow-y-auto">
          {groupEntries.map(([g, exs]) => {
            const collapsed = !expanded.has(g);
            return (
              <div key={g}>
                <button onClick={() => toggle(g)} className="w-full flex items-center justify-between px-1 py-1 text-left">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                    {g === 'Ulubione' ? '⭐ Ulubione' : g}
                    <span className="ml-1.5 font-normal normal-case opacity-60">({exs.length})</span>
                  </span>
                  <span className={`text-gray-400 text-sm inline-block transition-transform ${collapsed ? '' : 'rotate-90'}`}>▸</span>
                </button>
                {!collapsed && (
                  <div className="space-y-1 mt-1">
                    {exs.map(ex => <Row key={ex.id} ex={ex} showFav />)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

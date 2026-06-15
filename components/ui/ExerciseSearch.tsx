'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Exercise } from '@/types';
import { ExerciseThumb } from '@/components/ui/ExerciseThumb';

interface Props {
  exercises: Exercise[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  onAddNew?: () => void;
}

const USAGE_KEY = 'exerciseUsageCount';

function readUsageCounts(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(USAGE_KEY) || '{}'); } catch { return {}; }
}

function incrementUsage(id: string): Record<string, number> {
  const counts = readUsageCounts();
  counts[id] = (counts[id] || 0) + 1;
  try { localStorage.setItem(USAGE_KEY, JSON.stringify(counts)); } catch {}
  return counts;
}

const TOP_N = 8;

function normalizeMuscle(raw: string | null | undefined): string {
  if (!raw) return 'Inne';
  return raw.replace(/\s*\(.*?\)/g, '').trim() || 'Inne';
}

const GROUP_ORDER = [
  'Klatka piersiowa', 'Plecy', 'Barki', 'Biceps', 'Triceps',
  'Nogi', 'Brzuch', 'Cardio', 'Inne',
];

const STRETCHING_GROUP = 'Rozciąganie';

const Thumb = ExerciseThumb;

export function ExerciseSearch({ exercises, value, onChange, placeholder = 'Wybierz ćwiczenie...', onAddNew }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [focusedIdx, setFocusedIdx] = useState(-1);
  // collapsed groups: track which are CLOSED (default: all open)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [usageCounts, setUsageCounts] = useState<Record<string, number>>(() => readUsageCounts());
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = exercises.find(e => e.id === value);

  const filtered = search
    ? exercises
        .filter(e => e.name.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => {
          // Rozciąganie zawsze na końcu wyników wyszukiwania
          const aStr = isStretching(normalizeMuscle(a.muscleGroup)) ? 1 : 0;
          const bStr = isStretching(normalizeMuscle(b.muscleGroup)) ? 1 : 0;
          if (aStr !== bStr) return aStr - bStr;
          const diff = (usageCounts[b.id] || 0) - (usageCounts[a.id] || 0);
          return diff !== 0 ? diff : a.name.localeCompare(b.name, 'pl');
        })
    : [];

  const close = useCallback(() => {
    setOpen(false);
    setSearch('');
    setFocusedIdx(-1);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [close]);

  const handleOpen = () => {
    setOpen(o => !o);
    setFocusedIdx(-1);
    setTimeout(() => inputRef.current?.focus(), 60);
  };

  const handleSelect = (id: string) => {
    onChange(id);
    if (id) setUsageCounts(incrementUsage(id));
    close();
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setSearch('');
  };

  const toggleGroup = (group: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  // Keyboard nav applies only to flat search results
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === 'ArrowDown') { setOpen(true); setTimeout(() => inputRef.current?.focus(), 60); }
      return;
    }
    if (e.key === 'Escape') { close(); return; }
    if (!search) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIdx(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && focusedIdx >= 0 && filtered[focusedIdx]) {
      handleSelect(filtered[focusedIdx].id);
    }
  };

  useEffect(() => {
    if (focusedIdx >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-exercise-item]');
      (items[focusedIdx] as HTMLElement)?.scrollIntoView({ block: 'nearest' });
    }
  }, [focusedIdx]);

  // Po otwarciu listy przewiń do aktualnie wybranego ćwiczenia —
  // przy pomyłce nie trzeba scrollować od początku
  useEffect(() => {
    if (!open || search || !value) return;
    const t = setTimeout(() => {
      listRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'center' });
    }, 50);
    return () => clearTimeout(t);
  }, [open, search, value]);

  const isStretching = (g: string) => g.toLowerCase().includes('rozciąg');

  // Build grouped structure
  const grouped: Record<string, Exercise[]> = {};
  for (const ex of exercises) {
    const g = normalizeMuscle(ex.muscleGroup);
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(ex);
  }
  // Rozciąganie zawsze na końcu listy grup
  const mainGroups = GROUP_ORDER.filter(g => grouped[g] && !isStretching(g))
    .concat(Object.keys(grouped).filter(g => !GROUP_ORDER.includes(g) && !isStretching(g)).sort());
  const stretchingKeys = Object.keys(grouped).filter(isStretching);
  const groupKeys = [...mainGroups, ...stretchingKeys];

  // Domyślnie zwiń grupy Rozciąganie przy pierwszym otwarciu
  useEffect(() => {
    if (stretchingKeys.length === 0) return;
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      let changed = false;
      for (const k of stretchingKeys) { if (!next.has(k)) { next.add(k); changed = true; } }
      return changed ? next : prev;
    });
  // stretchingKeys zmienia się razem z exercises — porównaj po join
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stretchingKeys.join(',')]);

  // Top exercises by usage (only those used at least once, exclude stretching)
  const topExercises = exercises
    .filter(e => (usageCounts[e.id] || 0) > 0 && !isStretching(normalizeMuscle(e.muscleGroup)))
    .sort((a, b) => {
      const diff = (usageCounts[b.id] || 0) - (usageCounts[a.id] || 0);
      return diff !== 0 ? diff : a.name.localeCompare(b.name, 'pl');
    })
    .slice(0, TOP_N);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleOpen}
        onKeyDown={handleKeyDown}
        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base bg-white text-left flex items-center justify-between"
      >
        <span className={selected ? 'text-gray-900' : 'text-gray-500'}>
          {selected ? selected.name : placeholder}
        </span>
        <span className="flex items-center gap-1">
          {selected && (
            <span
              role="button"
              onClick={handleClear}
              className="text-gray-400 hover:text-gray-600 text-lg leading-none px-1"
              title="Wyczyść"
            >
              ×
            </span>
          )}
          <span className="text-gray-400 text-sm">{open ? '▴' : '▾'}</span>
        </span>
      </button>

      {open && (
        <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-xl shadow-xl mt-1 overflow-hidden">
          {/* Search input */}
          <div className="p-2 border-b border-gray-100 relative">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setFocusedIdx(0); }}
              onKeyDown={handleKeyDown}
              placeholder="Szukaj ćwiczenia..."
              className="w-full px-3 py-2 pr-8 text-sm border border-gray-200 rounded-lg text-gray-900 bg-gray-50"
            />
            {search && (
              <button
                type="button"
                onClick={() => { setSearch(''); setFocusedIdx(-1); inputRef.current?.focus(); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg"
              >
                ×
              </button>
            )}
          </div>

          <div ref={listRef} className="max-h-72 overflow-y-auto">
            {search ? (
              // ── Flat search results ──────────────────────────
              filtered.length === 0 ? (
                <div className="text-center py-4 text-sm text-gray-500">
                  <p>Brak wyników dla &quot;{search}&quot;</p>
                  {onAddNew && (
                    <button
                      type="button"
                      onClick={() => { close(); onAddNew(); }}
                      className="mt-2 text-blue-600 font-medium hover:underline"
                    >
                      + Dodaj nowe ćwiczenie
                    </button>
                  )}
                </div>
              ) : (
                filtered.map((ex, i) => (
                  <button
                    key={ex.id}
                    data-exercise-item
                    data-selected={ex.id === value}
                    type="button"
                    onClick={() => handleSelect(ex.id)}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors border-t border-gray-50 first:border-t-0 flex items-center gap-2.5 ${
                      i === focusedIdx
                        ? 'bg-blue-100 text-blue-800'
                        : ex.id === value
                          ? 'bg-blue-50 text-blue-700 font-semibold'
                          : 'text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    <Thumb ex={ex} />
                    <span className="min-w-0 flex-1 leading-snug">
                      {ex.id === value && <span className="mr-1.5">✓</span>}
                      {ex.name}
                      {ex.muscleGroup && (
                        <span className="ml-1.5 text-xs text-gray-400">{normalizeMuscle(ex.muscleGroup)}</span>
                      )}
                    </span>
                  </button>
                ))
              )
            ) : (
              // ── Grouped view ─────────────────────────────────
              <>
              {topExercises.length > 0 && (
                <div>
                  <div className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold uppercase tracking-wide border-b border-gray-100 bg-amber-50 text-amber-700 sticky top-0 z-10">
                    <span>★ Najczęściej <span className="font-normal opacity-60">({topExercises.length})</span></span>
                  </div>
                  {topExercises.map(ex => (
                    <button
                      key={ex.id}
                      data-exercise-item
                      data-selected={ex.id === value}
                      type="button"
                      onClick={() => handleSelect(ex.id)}
                      className={`w-full text-left px-3 py-2 text-sm border-t border-gray-50 transition-colors flex items-center gap-2.5 ${
                        ex.id === value
                          ? 'bg-blue-50 text-blue-700 font-semibold'
                          : 'text-gray-900 hover:bg-gray-50'
                      }`}
                    >
                      <Thumb ex={ex} />
                      <span className="min-w-0 flex-1 leading-snug">
                        {ex.id === value && <span className="mr-1.5">✓</span>}
                        {ex.name}
                        {ex.muscleGroup && (
                          <span className="ml-1.5 text-xs text-gray-400">{normalizeMuscle(ex.muscleGroup)}</span>
                        )}
                      </span>
                      <span className="text-xs text-amber-500 shrink-0">{usageCounts[ex.id]}×</span>
                    </button>
                  ))}
                </div>
              )}
              {groupKeys.map(group => {
                const isCollapsed = collapsedGroups.has(group);
                const groupExercises = grouped[group];
                const hasSelected = groupExercises.some(e => e.id === value);
                return (
                  <div key={group}>
                    {/* Group header */}
                    <button
                      type="button"
                      onClick={() => toggleGroup(group)}
                      className={`w-full flex items-center justify-between px-3 py-2 text-xs font-bold uppercase tracking-wide border-b border-gray-100 sticky top-0 z-10 ${
                        hasSelected ? 'bg-blue-50 text-blue-700'
                        : isStretching(group) ? 'bg-teal-50 text-teal-700'
                        : 'bg-gray-50 text-gray-500'
                      }`}
                    >
                      <span>{isStretching(group) ? '🧘 ' : ''}{group} <span className="font-normal opacity-60">({groupExercises.length})</span></span>
                      <span className="text-gray-400">{isCollapsed ? '▸' : '▾'}</span>
                    </button>
                    {/* Exercises in group */}
                    {!isCollapsed && groupExercises.map(ex => (
                      <button
                        key={ex.id}
                        data-exercise-item
                        data-selected={ex.id === value}
                        type="button"
                        onClick={() => handleSelect(ex.id)}
                        className={`w-full text-left px-3 py-2 text-sm border-t border-gray-50 transition-colors flex items-center gap-2.5 ${
                          ex.id === value
                            ? 'bg-blue-50 text-blue-700 font-semibold'
                            : 'text-gray-900 hover:bg-gray-50'
                        }`}
                      >
                        <Thumb ex={ex} />
                        <span className="min-w-0 flex-1 leading-snug">
                          {ex.id === value && <span className="mr-1.5">✓</span>}
                          {ex.name}
                        </span>
                      </button>
                    ))}
                  </div>
                );
              })}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

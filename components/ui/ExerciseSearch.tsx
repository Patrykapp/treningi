'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Exercise } from '@/types';
import { ExerciseThumb } from '@/components/ui/ExerciseThumb';
import { X, ChevronUp, ChevronDown, ChevronRight, Check, Search, Star, Clock, Flame, Sparkles } from 'lucide-react';

interface Props {
  exercises: Exercise[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  onAddNew?: () => void;
  /** ID ulubionych ćwiczeń (sekcja ★ Ulubione + priorytet w wyszukiwaniu) */
  favoriteIds?: string[];
  /** ID ostatnio używanych ćwiczeń, od najnowszego (sekcja 🕐 Ostatnio) */
  recentIds?: string[];
  /** Liczba użyć per ćwiczenie z bazy (historia treningów) — nadpisuje localStorage */
  usageCounts?: Record<string, number>;
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

const TOP_N = 5;
const RECENT_N = 5;

function normalizeMuscle(raw: string | null | undefined): string {
  if (!raw) return 'Inne';
  return raw.replace(/\s*\(.*?\)/g, '').trim() || 'Inne';
}

// Normalizacja do wyszukiwania: małe litery + usunięcie polskich znaków.
// Uwaga: ł/Ł nie rozkłada się przez NFD, stąd osobne zamiany.
function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

const GROUP_ORDER = [
  'Klatka piersiowa', 'Plecy', 'Barki', 'Biceps', 'Triceps',
  'Nogi', 'Brzuch', 'Cardio', 'Inne',
];

const STRETCHING_GROUP = 'Rozciąganie';

const Thumb = ExerciseThumb;

export function ExerciseSearch({
  exercises, value, onChange, placeholder = 'Wybierz ćwiczenie...', onAddNew,
  favoriteIds, recentIds, usageCounts: usageCountsProp,
}: Props) {
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

  // Liczniki użyć: z bazy (props) jeśli dostępne, inaczej localStorage
  const effCounts = usageCountsProp && Object.keys(usageCountsProp).length > 0
    ? usageCountsProp
    : usageCounts;
  const favSet = new Set(favoriteIds ?? []);

  // MUSI być przed `filtered` — używane w sortowaniu podczas wyszukiwania
  const isStretching = (g: string) => g.toLowerCase().includes('rozciąg');

  // Wyszukiwanie odporne na polskie znaki i kolejność słów:
  // "lawce skosnej" znajdzie "ławce skośnej", "hantli wyciskanie" → "Wyciskanie hantli..."
  const tokens = normalizeText(search).split(/\s+/).filter(Boolean);
  const filtered = tokens.length > 0
    ? exercises
        .filter(e => {
          const name = normalizeText(e.name);
          return tokens.every(t => name.includes(t));
        })
        .sort((a, b) => {
          // Rozciąganie zawsze na końcu wyników wyszukiwania
          const aStr = isStretching(normalizeMuscle(a.muscleGroup)) ? 1 : 0;
          const bStr = isStretching(normalizeMuscle(b.muscleGroup)) ? 1 : 0;
          if (aStr !== bStr) return aStr - bStr;
          // Ulubione na górze wyników
          const aFav = favSet.has(a.id) ? 1 : 0;
          const bFav = favSet.has(b.id) ? 1 : 0;
          if (aFav !== bFav) return bFav - aFav;
          const diff = (effCounts[b.id] || 0) - (effCounts[a.id] || 0);
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

  // Sekcje szybkiego wyboru: Ulubione → Ostatnio → Najczęściej (bez powtórzeń)
  const byId = new Map(exercises.map(e => [e.id, e]));
  const shownIds = new Set<string>();

  const favoriteExercises = (favoriteIds ?? [])
    .map(id => byId.get(id))
    .filter((e): e is Exercise => !!e)
    .sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  favoriteExercises.forEach(e => shownIds.add(e.id));

  const recentExercises = (recentIds ?? [])
    .filter(id => !shownIds.has(id))
    .map(id => byId.get(id))
    .filter((e): e is Exercise => !!e)
    .slice(0, RECENT_N);
  recentExercises.forEach(e => shownIds.add(e.id));

  // Top exercises by usage (only those used at least once, exclude stretching)
  const topExercises = exercises
    .filter(e => (effCounts[e.id] || 0) > 0 && !shownIds.has(e.id) && !isStretching(normalizeMuscle(e.muscleGroup)))
    .sort((a, b) => {
      const diff = (effCounts[b.id] || 0) - (effCounts[a.id] || 0);
      return diff !== 0 ? diff : a.name.localeCompare(b.name, 'pl');
    })
    .slice(0, TOP_N);

  const renderRow = (ex: Exercise, right?: React.ReactNode) => (
    <button
      key={ex.id}
      data-exercise-item
      data-selected={ex.id === value}
      type="button"
      onClick={() => handleSelect(ex.id)}
      className={`w-full text-left px-3 py-2 text-sm border-t border-gray-50 transition-colors flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
        ex.id === value
          ? 'bg-blue-50 text-blue-700 font-semibold'
          : 'text-gray-900 hover:bg-gray-50'
      }`}
    >
      <Thumb ex={ex} />
      <span className="min-w-0 flex-1 leading-snug">
        {ex.id === value && <Check className="w-3.5 h-3.5 inline-block mr-1.5 -mt-0.5" strokeWidth={2} />}
        {ex.name}
        {ex.muscleGroup && (
          <span className="ml-1.5 text-xs text-gray-400">{normalizeMuscle(ex.muscleGroup)}</span>
        )}
      </span>
      {right}
    </button>
  );

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleOpen}
        onKeyDown={handleKeyDown}
        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base bg-white text-left flex items-center justify-between transition hover:border-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      >
        <span className={selected ? 'text-gray-900' : 'text-gray-500'}>
          {selected ? selected.name : placeholder}
        </span>
        <span className="flex items-center gap-1">
          {selected && (
            <span
              role="button"
              onClick={handleClear}
              className="text-gray-400 hover:text-gray-600 leading-none p-1 rounded-lg transition hover:bg-gray-100"
              title="Wyczyść"
            >
              <X className="w-4 h-4" strokeWidth={2} />
            </span>
          )}
          {open ? <ChevronUp className="w-4 h-4 text-gray-400" strokeWidth={2} /> : <ChevronDown className="w-4 h-4 text-gray-400" strokeWidth={2} />}
        </span>
      </button>

      {open && (
        <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-xl shadow-xl mt-1 overflow-hidden">
          {/* Search input */}
          <div className="p-2 border-b border-gray-100 relative">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" strokeWidth={2} />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setFocusedIdx(0); }}
              onKeyDown={handleKeyDown}
              placeholder="Szukaj ćwiczenia..."
              className="w-full pl-8 pr-8 py-2 text-sm border border-gray-200 rounded-lg text-gray-900 bg-gray-50 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            />
            {search && (
              <button
                type="button"
                onClick={() => { setSearch(''); setFocusedIdx(-1); inputRef.current?.focus(); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded-md transition hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                <X className="w-4 h-4" strokeWidth={2} />
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
                      className="mt-2 text-blue-600 font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded"
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
                    className={`w-full text-left px-3 py-2 text-sm transition-colors border-t border-gray-50 first:border-t-0 flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                      i === focusedIdx
                        ? 'bg-blue-100 text-blue-800'
                        : ex.id === value
                          ? 'bg-blue-50 text-blue-700 font-semibold'
                          : 'text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    <Thumb ex={ex} />
                    <span className="min-w-0 flex-1 leading-snug">
                      {ex.id === value && <Check className="w-3.5 h-3.5 inline-block mr-1.5 -mt-0.5" strokeWidth={2} />}
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
              {favoriteExercises.length > 0 && (
                <div>
                  <div className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold uppercase tracking-wide border-b border-gray-100 bg-yellow-50 text-yellow-700 sticky top-0 z-10">
                    <span className="flex items-center gap-1"><Star className="w-3.5 h-3.5 fill-yellow-500" strokeWidth={2} /> Ulubione <span className="font-normal opacity-60">({favoriteExercises.length})</span></span>
                  </div>
                  {favoriteExercises.map(ex => renderRow(ex))}
                </div>
              )}
              {recentExercises.length > 0 && (
                <div>
                  <div className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold uppercase tracking-wide border-b border-gray-100 bg-sky-50 text-sky-700 sticky top-0 z-10">
                    <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" strokeWidth={2} /> Ostatnio <span className="font-normal opacity-60">({recentExercises.length})</span></span>
                  </div>
                  {recentExercises.map(ex => renderRow(ex))}
                </div>
              )}
              {topExercises.length > 0 && (
                <div>
                  <div className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold uppercase tracking-wide border-b border-gray-100 bg-amber-50 text-amber-700 sticky top-0 z-10">
                    <span className="flex items-center gap-1"><Flame className="w-3.5 h-3.5" strokeWidth={2} /> Najczęściej <span className="font-normal opacity-60">({topExercises.length})</span></span>
                  </div>
                  {topExercises.map(ex => renderRow(
                    ex,
                    <span className="text-xs text-amber-500 shrink-0">{effCounts[ex.id]}×</span>
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
                      className={`w-full flex items-center justify-between px-3 py-2 text-xs font-bold uppercase tracking-wide border-b border-gray-100 sticky top-0 z-10 transition-colors ${
                        hasSelected ? 'bg-blue-50 text-blue-700'
                        : isStretching(group) ? 'bg-teal-50 text-teal-700'
                        : 'bg-gray-50 text-gray-500'
                      }`}
                    >
                      <span className="flex items-center gap-1">{isStretching(group) ? <Sparkles className="w-3.5 h-3.5" strokeWidth={2} /> : null}{group} <span className="font-normal opacity-60">({groupExercises.length})</span></span>
                      {isCollapsed ? <ChevronRight className="w-3.5 h-3.5 text-gray-400" strokeWidth={2} /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" strokeWidth={2} />}
                    </button>
                    {/* Exercises in group */}
                    {!isCollapsed && groupExercises.map(ex => (
                      <button
                        key={ex.id}
                        data-exercise-item
                        data-selected={ex.id === value}
                        type="button"
                        onClick={() => handleSelect(ex.id)}
                        className={`w-full text-left px-3 py-2 text-sm border-t border-gray-50 transition-colors flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                          ex.id === value
                            ? 'bg-blue-50 text-blue-700 font-semibold'
                            : 'text-gray-900 hover:bg-gray-50'
                        }`}
                      >
                        <Thumb ex={ex} />
                        <span className="min-w-0 flex-1 leading-snug">
                          {ex.id === value && <Check className="w-3.5 h-3.5 inline-block mr-1.5 -mt-0.5" strokeWidth={2} />}
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

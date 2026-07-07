'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Exercise } from '@/types';
import { ExerciseThumb } from '@/components/ui/ExerciseThumb';
import { Star, ChevronRight, Search, Plus } from 'lucide-react';

export default function CwiczeniaPage() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [search, setSearch] = useState('');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  // Grupy rozwinięte choć raz — dopiero wtedy montujemy miniatury (GIF-y),
  // inaczej przeglądarka ładuje setki animowanych GIF-ów naraz i zabija płynność.
  const [everExpanded, setEverExpanded] = useState<Set<string>>(new Set());
  const router = useRouter();

  const toggleGroup = (group: string) => {
    setEverExpanded(prev => prev.has(group) ? prev : new Set(prev).add(group));
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const loadFavorites = useCallback(async () => {
    try {
      const res = await fetch('/api/favorites');
      if (res.ok) setFavorites(await res.json());
    } catch { /* zostaw pusta liste */ }
  }, []);

  useEffect(() => {
    fetch('/api/exercises').then(r => r.json()).then(setExercises);
    loadFavorites();
  }, [loadFavorites]);

  const toggleFavorite = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const isFav = favorites.includes(id);
    setFavorites(prev => isFav ? prev.filter(f => f !== id) : [...prev, id]);
    try {
      await fetch('/api/favorites', {
        method: isFav ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exerciseId: id }),
      });
    } catch {
      setFavorites(prev => isFav ? [...prev, id] : prev.filter(f => f !== id));
    }
  };

  // Normalizuje grupę mięśniową (usuwa nawiasy) i wykrywa rozciąganie
  const normalizeMuscle = (raw: string | null | undefined) =>
    (raw || '').replace(/\s*\(.*?\)/g, '').trim() || 'Inne';
  const isStretching = (ex: Exercise) =>
    (ex.muscleGroup || '').toLowerCase().includes('rozciąg') ||
    ex.name.toLowerCase().includes('rozciąg');

  const baseFiltered = exercises.filter(ex => ex.name.toLowerCase().includes(search.toLowerCase()));
  const filtered = showOnlyFavorites ? baseFiltered.filter(ex => favorites.includes(ex.id)) : baseFiltered;
  const sorted = showOnlyFavorites ? filtered : [...filtered].sort((a, b) => {
    const af = favorites.includes(a.id) ? 0 : 1;
    const bf = favorites.includes(b.id) ? 0 : 1;
    if (af !== bf) return af - bf;
    // W obrębie tej samej "warstwy" (ulubione/reszta) — najpierw najczęściej używane
    const ua = a.usageCount || 0;
    const ub = b.usageCount || 0;
    if (ub !== ua) return ub - ua;
    return a.name.localeCompare(b.name, 'pl');
  });

  const groups = sorted.reduce((acc, ex) => {
    const namePrefix = ex.name.includes(' - ') ? ex.name.split(' - ')[0] : null;
    let prefix: string;
    if (showOnlyFavorites || favorites.includes(ex.id)) {
      prefix = 'Ulubione';
    } else if (isStretching(ex)) {
      prefix = 'Rozciąganie';
    } else {
      prefix = normalizeMuscle(ex.muscleGroup) || namePrefix || 'Inne';
    }
    if (!acc[prefix]) acc[prefix] = [];
    acc[prefix].push(ex);
    return acc;
  }, {} as Record<string, Exercise[]>);

  const groupOrder = ['Ulubione', 'Barki', 'Biceps', 'Brzuch', 'Extra', 'Kalenistyka', 'Klatka piersiowa', 'Klata', 'Nogi', 'Plecy', 'Przedramie', 'Triceps', 'Inne', 'Cardio'];
  const sortedGroups = Object.entries(groups).sort(([a], [b]) => {
    // Rozciąganie zawsze na końcu
    if (a === 'Rozciąganie') return 1;
    if (b === 'Rozciąganie') return -1;
    const ai = groupOrder.indexOf(a), bi = groupOrder.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b, 'pl');
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b px-4 pt-4 pb-3 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-gray-900">Ćwiczenia</h1>
          <button
            onClick={() => setShowOnlyFavorites(o => !o)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${showOnlyFavorites ? 'bg-yellow-400 text-yellow-900 hover:bg-yellow-500' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            <Star className="w-4 h-4" strokeWidth={2} />
            Ulubione {favorites.length > 0 && `(${favorites.length})`}
          </button>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" strokeWidth={2} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Szukaj..."
            className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2 text-gray-900 bg-gray-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          />
        </div>
      </div>
      <div className="px-4 py-4 space-y-5 md:max-w-3xl lg:max-w-4xl md:mx-auto">
        {sortedGroups.map(([group, exs]) => {
          const isCollapsed = !expandedGroups.has(group);
          return (
          <div key={group}>
            <button
              onClick={() => toggleGroup(group)}
              className="w-full flex items-center justify-between mb-2 px-1 text-left rounded-lg transition-colors hover:bg-gray-100 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1">
                {group === 'Ulubione' ? <><Star className="w-3.5 h-3.5" strokeWidth={2} /> Ulubione</> : group}
                <span className="ml-1.5 font-normal normal-case opacity-60">({exs.length})</span>
              </h2>
              <ChevronRight className={`w-4 h-4 text-gray-400 shrink-0 transition-transform duration-300 ${isCollapsed ? '' : 'rotate-90'}`} strokeWidth={2} />
            </button>
            <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${isCollapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'}`}>
              <div className="overflow-hidden">
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                {exs.map((ex, i) => {
                  // Skracaj nazwę tylko przy starej konwencji "Grupa - nazwa"
                  // (prefiks zgodny z grupą mięśniową lub brak grupy)
                  const namePrefix = ex.name.includes(' - ') ? ex.name.split(' - ')[0] : null;
                  const stripPrefix = namePrefix &&
                    (!ex.muscleGroup || namePrefix.toLowerCase() === ex.muscleGroup.toLowerCase());
                  const shortName = stripPrefix ? ex.name.split(' - ').slice(1).join(' - ') : ex.name;
                  const isFav = favorites.includes(ex.id);
                  return (
                    <button
                      key={ex.id}
                      onClick={() => router.push(`/cwiczenie/${ex.id}`)}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-gray-50 active:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${i > 0 ? 'border-t border-gray-100' : ''}`}
                    >
                      {everExpanded.has(group) ? <ExerciseThumb ex={ex} className="w-14 h-14" /> : null}
                      <span className="font-medium text-gray-900 text-sm flex-1 min-w-0 leading-snug">{shortName}</span>
                      {(ex.usageCount || 0) > 0 && (
                        <span className="text-xs text-amber-500 mr-1 shrink-0">{ex.usageCount}×</span>
                      )}
                      <button
                        onClick={(e) => toggleFavorite(ex.id, e)}
                        className={`mr-2 p-0.5 rounded transition-transform active:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${isFav ? 'opacity-100' : 'opacity-30'}`}
                      >
                        <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" strokeWidth={2} />
                      </button>
                      <ChevronRight className="w-5 h-5 text-gray-400 shrink-0" strokeWidth={2} />
                    </button>
                  );
                })}
              </div>
              </div>
            </div>
          </div>
          );
        })}
        {sorted.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            {showOnlyFavorites ? (
              <Star className="w-8 h-8 mx-auto mb-2 text-gray-400" strokeWidth={2} />
            ) : (
              <Search className="w-8 h-8 mx-auto mb-2 text-gray-400" strokeWidth={2} />
            )}
            <p className="mb-3">{showOnlyFavorites ? 'Brak ulubionych. Dodaj przez gwiazdkę!' : `Brak wyników dla „${search}"`}</p>
            {!showOnlyFavorites && search && (
              <button
                onClick={() => router.push('/trening')}
                className="inline-flex items-center gap-1 text-sm text-blue-600 font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded"
              >
                <Plus className="w-4 h-4" strokeWidth={2} /> Dodaj „{search}&quot; jako nowe ćwiczenie w treningu
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

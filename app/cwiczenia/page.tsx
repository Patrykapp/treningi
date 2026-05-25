'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Exercise } from '@/types';

export default function CwiczeniaPage() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [search, setSearch] = useState('');
  const router = useRouter();

  useEffect(() => {
    fetch('/api/exercises').then(r => r.json()).then(setExercises);
  }, []);

  const filtered = exercises.filter(ex =>
    ex.name.toLowerCase().includes(search.toLowerCase())
  );

  // Grupuj po prefiksie "Grupa - Nazwa"
  const groups = filtered.reduce((acc, ex) => {
    const prefix = ex.name.includes(' - ') ? ex.name.split(' - ')[0] : (ex.muscleGroup || 'Inne');
    if (!acc[prefix]) acc[prefix] = [];
    acc[prefix].push(ex);
    return acc;
  }, {} as Record<string, Exercise[]>);

  const groupOrder = ['Barki', 'Biceps', 'Brzuch', 'Extra', 'Kalenistyka', 'Klata', 'Nogi', 'Plecy', 'Przedramię', 'Triceps', 'Inne'];

  const sortedGroups = Object.entries(groups).sort(([a], [b]) => {
    const ai = groupOrder.indexOf(a);
    const bi = groupOrder.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b px-4 pt-4 pb-3 sticky top-0 z-10">
        <h1 className="text-xl font-bold text-gray-900 mb-3">Ćwiczenia</h1>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍  Szukaj..."
          className="w-full border border-gray-200 rounded-xl px-4 py-2 text-gray-900 bg-gray-50"
        />
      </div>

      <div className="px-4 py-4 space-y-5">
        {sortedGroups.map(([group, exs]) => (
          <div key={group}>
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 px-1">{group}</h2>
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              {exs.map((ex, i) => {
                const shortName = ex.name.includes(' - ') ? ex.name.split(' - ').slice(1).join(' - ') : ex.name;
                return (
                  <button
                    key={ex.id}
                    onClick={() => router.push(`/cwiczenie/${ex.id}`)}
                    className={`w-full flex items-center justify-between px-4 py-3.5 text-left active:bg-gray-50 ${i > 0 ? 'border-t border-gray-100' : ''}`}
                  >
                    <span className="font-medium text-gray-900 text-sm">{shortName}</span>
                    <span className="text-gray-400 text-lg leading-none">›</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <p className="text-3xl mb-2">🔍</p>
            <p>Brak wyników dla „{search}"</p>
          </div>
        )}
      </div>
    </div>
  );
}

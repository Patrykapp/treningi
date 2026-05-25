'use client';

import { useState, useRef, useEffect } from 'react';
import { Exercise } from '@/types';

interface Props {
  exercises: Exercise[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}

export function ExerciseSearch({ exercises, value, onChange, placeholder = 'Wybierz ćwiczenie...' }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = exercises.find(e => e.id === value);

  const filtered = search
    ? exercises.filter(e => e.name.toLowerCase().includes(search.toLowerCase()))
    : exercises;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleOpen = () => {
    setOpen(o => !o);
    setTimeout(() => inputRef.current?.focus(), 60);
  };

  const handleSelect = (id: string) => {
    onChange(id);
    setSearch('');
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleOpen}
        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base bg-white text-left flex items-center justify-between"
      >
        <span className={selected ? 'text-gray-900' : 'text-gray-500'}>
          {selected ? selected.name : placeholder}
        </span>
        <span className="text-gray-400 text-sm">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-xl shadow-xl mt-1 overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Szukaj ćwiczenia..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-900 bg-gray-50"
            />
          </div>
          <div className="max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-center py-4 text-sm text-gray-500">Brak wyników</p>
            ) : (
              filtered.map((ex, i) => (
                <button
                  key={ex.id}
                  type="button"
                  onClick={() => handleSelect(ex.id)}
                  className={`w-full text-left px-4 py-3 text-sm transition-colors ${
                    i > 0 ? 'border-t border-gray-50' : ''
                  } ${
                    ex.id === value
                      ? 'bg-blue-50 text-blue-700 font-semibold'
                      : 'text-gray-900 hover:bg-gray-50 active:bg-gray-100'
                  }`}
                >
                  {ex.name}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Exercise } from '@/types';

interface Props {
  exercises: Exercise[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  onAddNew?: () => void; // callback gdy user kliknie "Dodaj nowe ćwiczenie"
}

export function ExerciseSearch({ exercises, value, onChange, placeholder = 'Wybierz ćwiczenie...', onAddNew }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = exercises.find(e => e.id === value);

  const filtered = search
    ? exercises.filter(e => e.name.toLowerCase().includes(search.toLowerCase()))
    : exercises;

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
    close();
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setSearch('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === 'ArrowDown') { setOpen(true); setTimeout(() => inputRef.current?.focus(), 60); }
      return;
    }
    if (e.key === 'Escape') { close(); return; }
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

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIdx >= 0 && listRef.current) {
      const item = listRef.current.children[focusedIdx] as HTMLElement;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [focusedIdx]);

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
          <div ref={listRef} className="max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
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
                  type="button"
                  onClick={() => handleSelect(ex.id)}
                  className={`w-full text-left px-4 py-3 text-sm transition-colors ${
                    i > 0 ? 'border-t border-gray-50' : ''
                  } ${
                    i === focusedIdx
                      ? 'bg-blue-100 text-blue-800'
                      : ex.id === value
                        ? 'bg-blue-50 text-blue-700 font-semibold'
                        : 'text-gray-900 hover:bg-gray-50 active:bg-gray-100'
                  }`}
                >
                  {ex.id === value && <span className="mr-2">✓</span>}{ex.name}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

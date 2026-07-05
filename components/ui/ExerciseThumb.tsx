'use client';

import { useEffect, useReducer } from 'react';
import { Exercise } from '@/types';

// ─── Współdzielony „tick" animacji ───────────────────────────────────────────
// Jeden timer dla wszystkich miniatur (zamiast setInterval per element) —
// wszystkie klatki przełączają się zgodnie, lista pozostaje wydajna.
let sharedFrame = 0;
const subscribers = new Set<() => void>();
let sharedTimer: ReturnType<typeof setInterval> | null = null;

function ensureTimer() {
  if (sharedTimer) return;
  sharedTimer = setInterval(() => {
    sharedFrame ^= 1;
    subscribers.forEach(fn => fn());
  }, 900);
}

function useFrameTick(active: boolean): number {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (!active) return;
    ensureTimer();
    subscribers.add(force);
    return () => {
      subscribers.delete(force);
      if (subscribers.size === 0 && sharedTimer) { clearInterval(sharedTimer); sharedTimer = null; }
    };
  }, [active]);
  return sharedFrame;
}

// (Kafelek-placeholder z grupą mięśniową usunięty — media i placeholdery wyłączone.)

// Miniatura ćwiczenia. Gdy są 2 klatki (start/koniec z free-exercise-db) —
// animuje je, co ułatwia rozpoznanie ruchu ćwiczenia bez czytania nazwy.
// Bez obrazka: kolorowy kafelek z 2-literowym skrótem grupy mięśniowej.
export function ExerciseThumb({ ex, className = 'w-14 h-14' }: { ex: Exercise; className?: string }) {
  const frames = (ex.images && ex.images.length > 0)
    ? ex.images
    : (ex.gifUrl ? [ex.gifUrl] : []);
  const animate = frames.length >= 2;
  const frame = useFrameTick(animate);

  // Media tymczasowo wyłączone — bez obrazka nie pokazujemy nic (żadnego placeholdera).
  if (frames.length === 0) return null;

  if (!animate) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={frames[0]}
        alt=""
        loading="lazy"
        className={`${className} rounded-lg object-cover bg-gray-100 shrink-0`}
        onError={e => { e.currentTarget.style.visibility = 'hidden'; }}
      />
    );
  }

  return (
    <span className={`${className} relative rounded-lg overflow-hidden bg-gray-100 shrink-0 block`}>
      {frames.slice(0, 2).map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt=""
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300"
          style={{ opacity: i === frame ? 1 : 0 }}
          onError={e => { e.currentTarget.style.visibility = 'hidden'; }}
        />
      ))}
    </span>
  );
}

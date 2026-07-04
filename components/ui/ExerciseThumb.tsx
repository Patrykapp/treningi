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

// ─── Kolor + skrót grupy mięśniowej (fallback, gdy brak obrazka) ──────────────
function groupBadge(muscleGroup: string | null | undefined): { cls: string; label: string } {
  const g = (muscleGroup || '').toLowerCase();
  const pick = (cls: string, label: string) => ({ cls, label });
  if (g.includes('klat') || g.includes('chest')) return pick('bg-blue-500', 'Kl');
  if (g.includes('plec') || g.includes('back'))  return pick('bg-emerald-500', 'Pl');
  if (g.includes('bark') || g.includes('ramion') || g.includes('shoulder')) return pick('bg-orange-500', 'Ba');
  if (g.includes('biceps')) return pick('bg-violet-500', 'Bi');
  if (g.includes('triceps')) return pick('bg-fuchsia-500', 'Tr');
  if (g.includes('nog') || g.includes('uda') || g.includes('leg')) return pick('bg-red-500', 'No');
  if (g.includes('brzuch') || g.includes('abs') || g.includes('core')) return pick('bg-amber-500', 'Br');
  if (g.includes('cardio')) return pick('bg-teal-500', 'Ca');
  if (g.includes('rozciąg') || g.includes('stretch')) return pick('bg-cyan-500', '🧘');
  if (g.includes('przedrami') || g.includes('forearm')) return pick('bg-lime-600', 'Pr');
  if (g.includes('kark') || g.includes('neck')) return pick('bg-slate-500', 'Ka');
  return pick('bg-gray-400', '🏋️');
}

// Miniatura ćwiczenia. Gdy są 2 klatki (start/koniec z free-exercise-db) —
// animuje je, co ułatwia rozpoznanie ruchu ćwiczenia bez czytania nazwy.
// Bez obrazka: kolorowy kafelek z 2-literowym skrótem grupy mięśniowej.
export function ExerciseThumb({ ex, className = 'w-14 h-14' }: { ex: Exercise; className?: string }) {
  const frames = (ex.images && ex.images.length > 0)
    ? ex.images
    : (ex.gifUrl ? [ex.gifUrl] : []);
  const animate = frames.length >= 2;
  const frame = useFrameTick(animate);

  if (frames.length === 0) {
    const { cls, label } = groupBadge(ex.muscleGroup);
    return (
      <span className={`${className} rounded-lg ${cls} flex items-center justify-center text-white text-sm font-bold shrink-0`}>
        {label}
      </span>
    );
  }

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

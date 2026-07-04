'use client';

import { Exercise } from '@/types';

// Miniatura ćwiczenia — obrazek (klatka 0) z free-exercise-db doklejany przez
// /api/exercises jako `gifUrl`. Stary host static.exercisedb.dev został wyłączony.
// Dla ćwiczeń bez dopasowanego obrazka pokazuje ikonę zastępczą.
export function ExerciseThumb({ ex, className = 'w-10 h-10' }: { ex: Exercise; className?: string }) {
  const src = ex.gifUrl || ex.images?.[0];
  if (!src) {
    return (
      <span className={`${className} rounded-lg bg-gray-100 flex items-center justify-center text-gray-300 text-base shrink-0`}>
        🏋️
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      className={`${className} rounded-lg object-cover bg-gray-100 shrink-0`}
      onError={e => { e.currentTarget.style.visibility = 'hidden'; }}
    />
  );
}

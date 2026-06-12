'use client';

import { Exercise } from '@/types';

// Miniatura ćwiczenia z ExerciseDB — URL deterministyczny względem exerciseDbId.
// Dla niepowiązanych ćwiczeń pokazuje ikonę zastępczą.
export function ExerciseThumb({ ex, className = 'w-10 h-10' }: { ex: Exercise; className?: string }) {
  if (!ex.exerciseDbId) {
    return (
      <span className={`${className} rounded-lg bg-gray-100 flex items-center justify-center text-gray-300 text-base shrink-0`}>
        🏋️
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://static.exercisedb.dev/media/${ex.exerciseDbId}.gif`}
      alt=""
      loading="lazy"
      className={`${className} rounded-lg object-cover bg-gray-100 shrink-0`}
      onError={e => { e.currentTarget.style.visibility = 'hidden'; }}
    />
  );
}

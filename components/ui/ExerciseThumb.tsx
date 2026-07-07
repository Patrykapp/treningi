'use client';

import { Exercise } from '@/types';

// Miniatura ćwiczenia — statyczny podgląd (pierwsza klatka z free-exercise-db).
// Wczesniej klatki start/koniec migały co 900ms co przy wielu miniaturach na
// liście (np. wyszukiwarka ćwiczeń) wygladało jak strobowanie — usunięte.
// Bez obrazka: nic nie pokazujemy (media tymczasowo wyłączone).
export function ExerciseThumb({ ex, className = 'w-14 h-14' }: { ex: Exercise; className?: string }) {
  const frame = (ex.images && ex.images.length > 0)
    ? ex.images[0]
    : (ex.gifUrl || null);

  if (!frame) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={frame}
      alt=""
      loading="lazy"
      className={`${className} rounded-lg object-cover skeleton shrink-0`}
      onError={e => { e.currentTarget.style.visibility = 'hidden'; }}
    />
  );
}

'use client';

import { Exercise } from '@/types';

// Miniatura ćwiczenia — prawdziwy, w pełni animowany plik .gif (samohostowany
// w public/exercise-gifs/), wyświetlany wprost, bez wycinania/podmiany klatek.
// Ustalone z Patrykiem 2026-07-07: żadnej syntetycznej statycznej klatki ani
// własnego crossfade — ma być realna animacja ćwiczenia, taka jak plik daje.
export function ExerciseThumb({ ex, className = 'w-14 h-14' }: { ex: Exercise; className?: string }) {
  const src = ex.gifUrl || (ex.images && ex.images.length > 0 ? ex.images[0] : null);
  if (!src) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      className={`${className} rounded-lg object-cover skeleton shrink-0`}
      onError={e => { e.currentTarget.style.visibility = 'hidden'; }}
    />
  );
}

'use client';

import { useState, useEffect } from 'react';

/**
 * Animacja ćwiczenia z klatek free-exercise-db (pozycja startowa i końcowa).
 * Przełącza klatki co ~800ms dając efekt gifa. Przy 1 klatce pokazuje ją
 * statycznie, przy braku klatek — ikonę zastępczą.
 */
export function ExerciseAnimation({
  images,
  alt = '',
  className = 'w-28 h-28',
}: {
  images?: string[];
  alt?: string;
  className?: string;
}) {
  const frames = (images ?? []).filter(Boolean);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (frames.length < 2) return;
    const t = setInterval(() => setIdx(i => (i + 1) % frames.length), 800);
    return () => clearInterval(t);
  }, [frames.length]);

  // Media tymczasowo wyłączone — bez klatek nie pokazujemy placeholdera.
  if (frames.length === 0) return null;

  return (
    <div className={`${className} relative rounded-xl border border-gray-200 bg-white overflow-hidden flex-shrink-0`}>
      {frames.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt={i === 0 ? alt : ''}
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300"
          style={{ opacity: i === idx ? 1 : 0 }}
        />
      ))}
    </div>
  );
}

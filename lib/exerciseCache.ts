/**
 * Module-level in-memory cache for exercises.
 * Krótki TTL (60 s) — po dodaniu ćwiczenia na innym urządzeniu lista
 * odświeży się przy następnym wejściu na stronę, a w obrębie jednej
 * nawigacji nadal unikamy zdublowanych requestów.
 */

import { Exercise } from '@/types';

const TTL_MS = 60 * 1000;

let cache: Exercise[] | null = null;
let cachedAt = 0;
let fetchPromise: Promise<Exercise[]> | null = null;

export async function fetchExercises(): Promise<Exercise[]> {
  if (cache && Date.now() - cachedAt < TTL_MS) return cache;

  // If a fetch is already in-flight, reuse it (avoids duplicate requests)
  if (fetchPromise) return fetchPromise;

  fetchPromise = fetch('/api/exercises', { cache: 'no-store' })
    .then(r => r.json())
    .then((data: Exercise[]) => {
      cache = Array.isArray(data) ? data : [];
      cachedAt = Date.now();
      fetchPromise = null;
      return cache;
    })
    .catch(() => {
      fetchPromise = null;
      return cache || [];
    });

  return fetchPromise;
}

export function invalidateExerciseCache() {
  cache = null;
  cachedAt = 0;
}

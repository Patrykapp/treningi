/**
 * Module-level in-memory cache for exercises.
 * Stays valid for the lifetime of the browser tab — exercises change rarely.
 * Shared across all components in the same page navigation.
 */

import { Exercise } from '@/types';

let cache: Exercise[] | null = null;
let fetchPromise: Promise<Exercise[]> | null = null;

export async function fetchExercises(): Promise<Exercise[]> {
  if (cache) return cache;

  // If a fetch is already in-flight, reuse it (avoids duplicate requests)
  if (fetchPromise) return fetchPromise;

  fetchPromise = fetch('/api/exercises')
    .then(r => r.json())
    .then((data: Exercise[]) => {
      cache = Array.isArray(data) ? data : [];
      fetchPromise = null;
      return cache;
    })
    .catch(() => {
      fetchPromise = null;
      return [];
    });

  return fetchPromise;
}

export function invalidateExerciseCache() {
  cache = null;
}

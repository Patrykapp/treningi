/**
 * Animacje ćwiczeń.
 *
 * Ćwiczenia z `exerciseDbId` używają GIF-ów ExerciseDB pobranych LOKALNIE do
 * public/exercise-gifs/<exerciseDbId>.gif (patrz prisma/download-gifs.ts).
 * Dzięki temu apka NIE zależy w runtime od zewnętrznego hosta — jeśli danego
 * pliku brak, <img onError> po prostu go ukryje (bez psucia układu).
 *
 * framesForName (używane przez przeglądarkę techniki w /api/exercisedb) korzysta
 * ze zdjęć free-exercise-db (yuhonas, jsDelivr) dopasowanych po nazwie.
 *
 * Media © AscendAPI / ExerciseDB — użytek niekomercyjny + atrybucja.
 */

const MEDIA_ENABLED = true;

const FREE_DB_URL = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/dist/exercises.json';
const IMG_BASE = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises';

interface FreeExercise {
  id: string;
  name: string;
  images: string[];
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  equipment?: string;
  category?: string;
  instructions?: string[];
}

interface IndexedFree {
  fe: FreeExercise;
  norm: string;
  tokens: string[];
}

const STOP_WORDS = new Set(['with', 'the', 'and', 'to', 'on', 'of', 'a', 'for', 'grip']);

function normalize(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(s: string): string[] {
  return normalize(s)
    .split(' ')
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w));
}

// ─── free-exercise-db (cache) ────────────────────────────────────────────────
let freeIndexPromise: Promise<IndexedFree[]> | null = null;

async function getFreeIndex(): Promise<IndexedFree[]> {
  if (!freeIndexPromise) {
    freeIndexPromise = fetch(FREE_DB_URL, { next: { revalidate: 86400 } })
      .then(r => (r.ok ? r.json() : []))
      .then((list: FreeExercise[]) =>
        (Array.isArray(list) ? list : [])
          .filter(fe => fe && Array.isArray(fe.images) && fe.images.length > 0)
          .map(fe => ({ fe, norm: normalize(fe.name), tokens: tokenize(fe.name) }))
      )
      .catch(() => [] as IndexedFree[]);
  }
  return freeIndexPromise;
}

function toUrls(fe: FreeExercise): string[] {
  return fe.images.map(img => `${IMG_BASE}/${img}`);
}

// ─── dopasowanie po angielskiej nazwie ───────────────────────────────────────
function scoreCandidate(qNorm: string, qTokens: string[], cand: IndexedFree): number {
  if (!qNorm) return 0;
  if (cand.norm === qNorm) return 100;
  if (cand.norm.includes(qNorm) || qNorm.includes(cand.norm)) return 85;
  if (qTokens.length === 0) return 0;
  const matched = qTokens.filter(t => cand.tokens.includes(t)).length;
  if (matched === 0) return 0;
  const coverage = matched / qTokens.length;
  const candCoverage = matched / Math.max(cand.tokens.length, 1);
  return Math.round(coverage * 60 + candCoverage * 15);
}

const nameFramesCache = new Map<string, string[] | null>();

/** Klatki animacji dla angielskiej nazwy ćwiczenia (zdjęcia free-exercise-db). */
export async function framesForName(name: string): Promise<string[] | null> {
  if (!MEDIA_ENABLED) return null;
  const key = normalize(name);
  if (!key) return null;
  if (nameFramesCache.has(key)) return nameFramesCache.get(key) ?? null;

  const index = await getFreeIndex();
  const qTokens = tokenize(name);
  let best: IndexedFree | null = null;
  let bestScore = 0;
  for (const cand of index) {
    const s = scoreCandidate(key, qTokens, cand);
    if (s > bestScore) { bestScore = s; best = cand; }
    if (bestScore === 100) break;
  }
  const result = bestScore >= 45 && best ? toUrls(best.fe) : null;
  nameFramesCache.set(key, result);
  return result;
}

/**
 * Lokalny GIF ExerciseDB po ID (samodzielnie hostowany w public/exercise-gifs/).
 * Zwraca ścieżkę względną — Next serwuje ją z public/. Zero zależności od hosta.
 */
export async function framesForDbId(dbId: string | null | undefined): Promise<string[] | null> {
  if (!MEDIA_ENABLED || !dbId) return null;
  return [`/exercise-gifs/${dbId}.gif`];
}

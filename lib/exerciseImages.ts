/**
 * Rozwiązywanie animacji ćwiczeń z free-exercise-db (yuhonas, licencja MIT).
 *
 * Kontekst: oryginalny host gifów `static.exercisedb.dev` został wyłączony
 * (DNS NXDOMAIN) przy rebrandingu ExerciseDB → AscendAPI, więc wszystkie
 * gify przestały się ładować. Dane (nazwy, instrukcje) z `oss.exercisedb.dev`
 * dalej działają — tutaj dokładamy tylko obrazki z darmowego, stabilnego
 * źródła hostowanego na jsDelivr.
 *
 * free-exercise-db daje 2 klatki na ćwiczenie (pozycja startowa i końcowa) w JPG.
 * Przełączanie ich w UI daje efekt animacji (patrz components/ui/ExerciseAnimation).
 *
 * Uwaga: wszystkie pobrania są cache'owane w scope modułu (jedna instancja
 * serwera pobiera dane raz) + revalidate 24h. Błędy sieci degradują się cicho
 * do braku obrazka — nic się nie wywala.
 */

const FREE_DB_URL = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/dist/exercises.json';
const IMG_BASE = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises';
const EDB_BASE = 'https://oss.exercisedb.dev';

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
  // proporcja trafionych tokenów zapytania (0-70) z lekką premią za pokrycie kandydata
  const coverage = matched / qTokens.length;
  const candCoverage = matched / Math.max(cand.tokens.length, 1);
  return Math.round(coverage * 60 + candCoverage * 15);
}

const nameFramesCache = new Map<string, string[] | null>();

/** Zwraca pełne URL-e klatek animacji dla angielskiej nazwy ćwiczenia (lub null). */
export async function framesForName(name: string): Promise<string[] | null> {
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

// ─── katalog ExerciseDB: exerciseDbId → angielska nazwa (cache) ───────────────
let catalogPromise: Promise<Map<string, string>> | null = null;

async function fetchCatalog(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let cursor: string | null = null;
  try {
    // API twardo ogranicza stronę do 25 rekordów (parametr `limit` jest ścinany),
    // więc pełny katalog ~1500 ćwiczeń to ok. 60 stron. Wcześniejszy limit 25 stron
    // katalogował tylko ~625 ćwiczeń → reszta nie rozwiązywała obrazka. Pętla i tak
    // kończy się wcześniej, gdy `hasNextPage` = false; 120 to bezpieczny zawór.
    for (let page = 0; page < 120; page++) {
      const url: string = cursor
        ? `${EDB_BASE}/api/v1/exercises?limit=100&after=${encodeURIComponent(cursor)}`
        : `${EDB_BASE}/api/v1/exercises?limit=100`;
      const res = await fetch(url, { next: { revalidate: 86400 }, headers: { Accept: 'application/json' } });
      if (!res.ok) break;
      const json = await res.json() as {
        meta?: { hasNextPage?: boolean; nextCursor?: string };
        data?: { exerciseId?: string; name?: string }[];
      };
      const data = json?.data ?? [];
      if (data.length === 0) break;
      for (const e of data) if (e?.exerciseId && e?.name) map.set(e.exerciseId, e.name);
      if (json?.meta?.hasNextPage && json?.meta?.nextCursor) cursor = json.meta.nextCursor;
      else break;
    }
  } catch {
    /* sieć/limit — zwróć to, co udało się pobrać */
  }
  return map;
}

async function getCatalog(): Promise<Map<string, string>> {
  if (!catalogPromise) {
    catalogPromise = fetchCatalog().then(map => {
      // Jeśli nic nie pobrano (np. rate limit), nie utrwalaj pustej mapy —
      // pozwól spróbować ponownie przy następnym żądaniu.
      if (map.size === 0) catalogPromise = null;
      return map;
    });
  }
  return catalogPromise;
}

/** Zwraca klatki animacji dla ExerciseDB id (przez angielską nazwę z katalogu). */
export async function framesForDbId(dbId: string | null | undefined): Promise<string[] | null> {
  if (!dbId) return null;
  const catalog = await getCatalog();
  const english = catalog.get(dbId);
  if (!english) return null;
  return framesForName(english);
}

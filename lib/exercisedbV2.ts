/**
 * Klient ExerciseDB V2 (przez RapidAPI).
 *
 * Stary host GIF-ów (static.exercisedb.dev) padł, a darmowe free-exercise-db
 * to tylko zdjęcia. V2 daje animowane demonstracje (MP4) + obrazy (webp/jpg)
 * na działającym CDN cdn.exercisedb.dev.
 *
 * Uwaga na limity: darmowy plan RapidAPI ma niski limit zapytań i nakłada
 * znak wodny (ścieżki /media/w/...). Dlatego wyniki cache'ujemy w bazie
 * (patrz prisma/link-v2-media.ts) — runtime aplikacji NIE woła tego API.
 *
 * Klucz czytany jest z env przy każdym wywołaniu (działa i w Next, i w skrypcie
 * ts-node, byle RAPIDAPI_KEY / RAPIDAPI_HOST były w .env).
 */

const DEFAULT_HOST = 'edb-with-videos-and-images-by-ascendapi.p.rapidapi.com';

/** Rzucane, gdy RapidAPI zwróci 429 — pozwala skryptowi zatrzymać się i wznowić później. */
export class V2RateLimitError extends Error {
  constructor() {
    super('RapidAPI rate limit (429)');
    this.name = 'V2RateLimitError';
  }
}

function cfg() {
  const host = process.env.RAPIDAPI_HOST || DEFAULT_HOST;
  const key = process.env.RAPIDAPI_KEY || '';
  return { host, key, base: `https://${host}` };
}

export function hasV2Key(): boolean {
  return !!(process.env.RAPIDAPI_KEY || '').trim();
}

export interface V2Hit {
  exerciseId: string;
  name: string;
  imageUrl?: string;
}

export interface V2Full extends V2Hit {
  imageUrls?: Record<string, string>;
  videoUrl?: string;
}

export interface V2Media {
  v2Id: string;
  imageUrl: string;
  videoUrl: string;
}

function normalize(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tylko pełne URL-e http(s) są bezpieczne do wyświetlenia. */
function safeUrl(u: string | undefined | null): string {
  return typeof u === 'string' && /^https?:\/\//i.test(u) ? u : '';
}

/** Niskopoziomowy GET. Rzuca V2RateLimitError na 429; inne błędy → null. */
async function v2Get(path: string): Promise<unknown | null> {
  const { key, base, host } = cfg();
  if (!key) return null;
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': host, Accept: 'application/json' },
    });
  } catch {
    return null; // błąd sieci — traktuj jak brak danych
  }
  if (res.status === 429) throw new V2RateLimitError();
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/** Wyszukiwanie rozmyte po nazwie → lista trafień (exerciseId, name, imageUrl). */
export async function searchV2(term: string): Promise<V2Hit[]> {
  if (!term.trim()) return [];
  const json = (await v2Get(`/api/v1/exercises/search?search=${encodeURIComponent(term)}`)) as
    | { data?: V2Hit[] }
    | null;
  return Array.isArray(json?.data) ? json!.data! : [];
}

/** Pełny rekord ćwiczenia (zawiera videoUrl + imageUrls). */
export async function getV2ById(id: string): Promise<V2Full | null> {
  if (!id) return null;
  const json = (await v2Get(`/api/v1/exercises/${encodeURIComponent(id)}`)) as
    | { data?: V2Full }
    | null;
  return json?.data ?? null;
}

/**
 * Dopasowuje ćwiczenie po angielskiej nazwie i zwraca komplet mediów.
 * Zwraca null, gdy brak trafienia lub brak klucza. Rzuca V2RateLimitError na 429.
 */
export async function resolveV2Media(englishName: string): Promise<V2Media | null> {
  const hits = await searchV2(englishName);
  if (hits.length === 0) return null;

  const norm = normalize(englishName);
  const best =
    hits.find(h => normalize(h.name) === norm) ??
    hits.find(h => normalize(h.name).includes(norm) || norm.includes(normalize(h.name))) ??
    hits[0];

  const full = await getV2ById(best.exerciseId);
  const imageUrl = safeUrl(full?.imageUrl) || safeUrl(best.imageUrl);
  const videoUrl = safeUrl(full?.videoUrl);

  if (!imageUrl && !videoUrl) return null;
  return { v2Id: best.exerciseId, imageUrl, videoUrl };
}

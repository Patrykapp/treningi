import { NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/auth';

/**
 * Wyszukiwanie produktów po nazwie — dla wszystkiego, czego nie da się
 * zeskanować: pieczywo na wagę, warzywa, mięso z lady, dania własne.
 *
 * Używa search.openfoodfacts.org (Search-a-licious, silnik Elasticsearch).
 * Sprawdzone 4 sie 2026: odpowiedzi w ~3-5 ms, obsługuje filtr kraju,
 * jest znacznie szybszy niż stary /cgi/search.pl.
 *
 * UWAGA na pokrycie: hasło "bułka" z filtrem na Polskę zwraca dosłownie 8
 * pozycji. Produkty bez opakowania praktycznie nie istnieją w OFF — dlatego
 * docelowy moduł musi mieć własną tabelę produktów, a OFF traktować jako
 * uzupełnienie dla towarów z kodem kreskowym.
 */

const TIMEOUT_MS = 8000;

export type FoodSearchHit = {
  code: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  kcal100: number | null;
  protein100: number | null;
  carbs100: number | null;
  fat100: number | null;
};

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : typeof v === 'number' ? v : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

export async function GET(request: Request) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  const plOnly = searchParams.get('pl') !== '0';
  if (q.length < 3) return NextResponse.json([]);

  // Cudzysłowy w zapytaniu psułyby składnię Lucene
  const safe = q.replace(/["\\]/g, ' ');
  const query = plOnly ? `${safe} AND countries_tags:"en:poland"` : safe;

  const url =
    'https://search.openfoodfacts.org/search' +
    `?q=${encodeURIComponent(query)}` +
    '&page_size=25' +
    '&fields=code,product_name,brands,image_url,nutriments';

  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return NextResponse.json([]);

    const json = await res.json();
    const hits: Record<string, unknown>[] = Array.isArray(json?.hits) ? json.hits : [];

    const out: FoodSearchHit[] = hits
      .map((p) => {
        const n = (p.nutriments || {}) as Record<string, unknown>;
        const kj = num(n['energy-kj_100g']) ?? num(n['energy_100g']);
        const brands = p.brands;
        return {
          code: String(p.code || ''),
          name: String(p.product_name || ''),
          brand: Array.isArray(brands) ? String(brands[0] ?? '') || null : (brands ? String(brands) : null),
          imageUrl: (p.image_url as string) || null,
          kcal100: num(n['energy-kcal_100g']) ?? (kj !== null ? Math.round(kj / 4.184) : null),
          protein100: num(n['proteins_100g']),
          carbs100: num(n['carbohydrates_100g']),
          fat100: num(n['fat_100g']),
        };
      })
      // Bez nazwy albo bez kalorii wpis jest w dzienniku bezużyteczny
      .filter((p) => p.name && p.kcal100 !== null);

    return NextResponse.json(out);
  } catch (e) {
    console.error('GET /api/food/search', e);
    return NextResponse.json([]);
  }
}

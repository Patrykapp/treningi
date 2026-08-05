import { NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/auth';

/**
 * Odczyt produktu z Open Food Facts po kodzie kreskowym.
 *
 * Dlaczego przez własny endpoint, a nie fetch prosto z przeglądarki:
 *  1) OFF wymaga własnego nagłówka User-Agent — przeglądarka nie pozwala go ustawić,
 *  2) limit OFF to 15 zapytań/min/IP — cache po stronie serwera go oszczędza,
 *  3) jedno miejsce na normalizację: dane w OFF są nierówne (raz energy-kcal_100g,
 *     raz tylko kJ; nazwa raz po polsku, raz po angielsku).
 *
 * Dane: Open Database License (ODbL) — do prywatnego użytku bez ograniczeń.
 * Sprawdzone 4 sie 2026: endpoint działa bez logowania (w odróżnieniu od stron
 * HTML z facetami, które dla anonimowych bywają odrzucane przy dużym ruchu).
 */

const UA = 'OzpartsWorkoutApp/1.0 (patryk@ozparts.eu)';
const TIMEOUT_MS = 8000;

export type FoodProduct = {
  code: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  quantity: string | null;      // np. "500 g" — całe opakowanie
  servingSizeG: number | null;  // porcja producenta (w jednostce `unit`)
  unit: 'g' | 'ml';             // napoje liczymy w mililitrach
  hasNutrition: boolean;        // czy wpis w OFF ma w ogóle wartości odżywcze
  per100g: {
    kcal: number | null;
    protein: number | null;
    carbs: number | null;
    sugars: number | null;
    fat: number | null;
    saturated: number | null;
    fiber: number | null;
    salt: number | null;
  };
  completeness: number;         // 0..1 — jak kompletny jest wpis w OFF
  source: 'openfoodfacts';
};

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : typeof v === 'number' ? v : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

// "30 g", "1 plasterek (25 g)", "250ml" → gramy (ml traktujemy 1:1)
function parseServingG(s: unknown): number | null {
  if (typeof s !== 'string') return null;
  const m = s.match(/(\d+(?:[.,]\d+)?)\s*(g|ml)\b/i);
  return m ? num(m[1]) : null;
}

/**
 * Napój czy nie. Rozstrzygamy po jednostce w gramaturze opakowania albo
 * w porcji — OFF prawie zawsze podaje tam „500 ml" dla płynów. Kategorie
 * bywają nieuzupełnione, więc traktujemy je jako drugą wskazówkę.
 */
function detectUnit(p: Record<string, unknown>): 'g' | 'ml' {
  const hay = [p.quantity, p.serving_size].filter((x) => typeof x === 'string').join(' ').toLowerCase();
  if (/\d\s*(ml|l\b|litr)/.test(hay)) return 'ml';
  const cats = Array.isArray(p.categories_tags) ? p.categories_tags.join(' ') : '';
  if (/beverage|drink|water|juice|soda|beer|napoj|napoje/i.test(cats)) return 'ml';
  return 'g';
}

function kcalPer100(n: Record<string, unknown>): number | null {
  const direct = num(n['energy-kcal_100g']);
  if (direct !== null) return direct;
  const kj = num(n['energy-kj_100g']) ?? num(n['energy_100g']); // część wpisów ma tylko kJ
  return kj !== null ? Math.round(kj / 4.184) : null;
}

export async function GET(request: Request) {
  // Endpoint tylko dla zalogowanych — inaczej byłby otwartym proxy i szybko
  // wyczerpałby limit OFF przypisany do IP Vercela.
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const raw = (searchParams.get('code') || '').replace(/\D/g, '');
  if (raw.length < 6 || raw.length > 14) {
    return NextResponse.json({ error: 'Nieprawidłowy kod kreskowy' }, { status: 400 });
  }

  const fields = [
    'code', 'product_name', 'product_name_pl', 'generic_name_pl', 'brands',
    'image_front_small_url', 'quantity', 'serving_size', 'nutriments', 'completeness',
    'categories_tags',
  ].join(',');

  // pl.* zwraca te same dane co world.*, ale preferuje polskie nazwy
  const url = `https://pl.openfoodfacts.org/api/v2/product/${raw}.json?fields=${fields}`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      next: { revalidate: 86400 }, // produkty zmieniają się rzadko
    });
    // UWAGA: OFF na nieznany produkt odpowiada HTTP 404 (z ciałem
    // {"status":0,"status_verbose":"product not found"}). To NIE jest awaria —
    // trzeba to odróżnić od realnego błędu, inaczej każdy produkt spoza bazy
    // wygląda jak zepsute API.
    if (res.status === 404) {
      return NextResponse.json({ error: 'not_found', code: raw }, { status: 404 });
    }
    if (!res.ok) {
      return NextResponse.json(
        { error: 'Baza produktów niedostępna', upstreamStatus: res.status },
        { status: 502 }
      );
    }

    const json = await res.json().catch(() => null);
    if (!json || json.status !== 1 || !json.product) {
      return NextResponse.json({ error: 'not_found', code: raw }, { status: 404 });
    }

    const p = json.product;
    const n: Record<string, unknown> = p.nutriments || {};
    const kcal = kcalPer100(n);

    const product: FoodProduct = {
      code: raw,
      name: p.product_name_pl || p.product_name || p.generic_name_pl || 'Produkt bez nazwy',
      brand: p.brands ? String(p.brands).split(',')[0].trim() : null,
      imageUrl: p.image_front_small_url || null,
      quantity: p.quantity || null,
      servingSizeG: parseServingG(p.serving_size),
      unit: detectUnit(p),
      // Sporo wpisów w OFF to sama nazwa i zdjęcie, bez tabeli wartości.
      // Front musi to odróżnić od produktu, który naprawdę ma 0 kcal.
      hasNutrition: kcal !== null && kcal > 0,
      per100g: {
        kcal,
        protein: num(n['proteins_100g']),
        carbs: num(n['carbohydrates_100g']),
        sugars: num(n['sugars_100g']),
        fat: num(n['fat_100g']),
        saturated: num(n['saturated-fat_100g']),
        fiber: num(n['fiber_100g']),
        salt: num(n['salt_100g']),
      },
      completeness: num(p.completeness) ?? 0,
      source: 'openfoodfacts',
    };

    return NextResponse.json(product);
  } catch (e) {
    console.error('GET /api/food/barcode', e);
    return NextResponse.json({ error: 'Błąd połączenia z bazą produktów' }, { status: 502 });
  }
}

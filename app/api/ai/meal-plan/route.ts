import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';
import { computeTargets, MEALS } from '@/lib/nutrition';
import { latestWeight } from '@/lib/calories';
import { GROQ_MODEL, AI_EXTRA, aiMaxTokens, aiContent } from '@/lib/ai';

/**
 * Generator dziennego jadłospisu (Groq / Llama 3.3 70B — darmowy plan, ten sam
 * klucz co reszta funkcji AI w aplikacji).
 *
 * Model językowy jest tu tylko pomysłodawcą. Wszystko, co da się sprawdzić,
 * sprawdzamy sami — bo modele mylą się w arytmetyce i lubią wymyślać
 * restauracyjne dania na godzinę roboty:
 *
 *  1. SUMY LICZY SERWER, nie model. Deklarowane przez model sumy są ignorowane.
 *  2. KONTROLA SPÓJNOŚCI składnika: kalorie muszą się zgadzać ze wzorem
 *     Atwatera (4·białko + 4·węgle + 9·tłuszcz). Przy dużej rozbieżności
 *     bierzemy wartość ze wzoru, bo makro model podaje trafniej niż kcal.
 *  3. DOPASOWANIE DO KATALOGU: składnik znaleziony w bazie dostaje prawdziwe
 *     wartości zamiast szacunku.
 *  4. LIMIT ROZBIEŻNOŚCI: jeśli dzień odbiega od celu o ponad 12%, robimy
 *     drugie podejście z informacją zwrotną i wybieramy trafniejsze.
 *  5. TWARDE OGRANICZENIA PROSTOTY w prompcie: czas, liczba składników,
 *     zwyczajne produkty z dyskontu.
 *
 * Nic nie zapisuje do bazy — zapis dopiero po akceptacji (POST /api/food/diary/plan).
 */

type AiIngredient = { nazwa?: string; gramy?: number; kcal?: number; bialko?: number; wegle?: number; tluszcz?: number };
type AiMeal = { posilek?: string; nazwa?: string; przepis?: string; skladniki?: AiIngredient[] };

export type PlannedIngredient = {
  name: string; grams: number; kcal: number; protein: number; carbs: number; fat: number;
  matchedProductId: string | null;
  matchedName: string | null;
  corrected: boolean; // true = kalorie poprawione, bo nie zgadzały się z makro
};

export type PlannedMeal = {
  meal: string; title: string; recipe: string;
  ingredients: PlannedIngredient[];
  kcal: number; protein: number; carbs: number; fat: number;
};

const num = (v: unknown, d = 0): number => {
  const x = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(x) && x >= 0 ? x : d;
};
const r1 = (x: number) => Math.round(x * 10) / 10;

/** Uproszczenie nazwy do porównań: bez ogonków i znaków interpunkcyjnych. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const DEFAULT_PROFILE = {
  heightCm: null, birthYear: null, sex: null,
  activityLevel: 'MODERATE', goalType: 'MAINTAIN', customKcal: null,
  proteinPct: 30, carbsPct: 40, fatPct: 30, addWorkoutKcal: false,
};

const STYLES: Record<string, string> = {
  PROSTE:
    'Gotowanie domowe, maksymalnie proste. Najwyżej 5 składników na posiłek. Żadnych sosów do zrobienia od zera, ' +
    'marynowania, pieczenia dłużej niż 25 minut ani składników spoza zwykłego dyskontu.',
  STANDARD:
    'Zwyczajne domowe obiady. Do 7 składników na posiłek. Wszystko do kupienia w Biedronce lub Lidlu.',
  UROZMAICONE:
    'Możesz proponować ciekawsze zestawienia, ale nadal z produktów dostępnych w polskich sklepach sieciowych.',
};

export async function POST(request: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({ error: 'Brak klucza GROQ_API_KEY' }, { status: 502 });
    }

    const body = await request.json().catch(() => ({}));
    const preferences = String(body?.preferences || '').slice(0, 400);
    const style = STYLES[String(body?.style || 'PROSTE')] ? String(body.style) : 'PROSTE';
    const maxMinutes = [10, 20, 30, 45].includes(Number(body?.maxMinutes)) ? Number(body.maxMinutes) : 20;

    const [profileRow, weights, catalog] = await Promise.all([
      prisma.nutritionProfile.findUnique({ where: { userId } }),
      prisma.bodyWeight.findMany({ where: { userId }, orderBy: { date: 'desc' }, take: 1 }),
      prisma.foodProduct.findMany({
        orderBy: [{ usageCount: 'desc' }, { updatedAt: 'desc' }],
        take: 150,
        select: { id: true, name: true, brand: true, kcal100: true, protein100: true, carbs100: true, fat100: true },
      }),
    ]);

    const profile = profileRow ?? DEFAULT_PROFILE;
    const weightKg = weights.length > 0 ? latestWeight(weights) : null;
    const targets = computeTargets(profile, weightKg, new Date());

    const known = catalog.slice(0, 60).map((c) => c.name).join(', ');
    const index = catalog.map((c) => ({ ...c, norm: normalize(c.name) }));
    const validMeals = new Set<string>(MEALS.map((m) => m.key));

    const systemPrompt = `Jesteś dietetykiem układającym jadłospis dla zapracowanej osoby w Polsce.

CEL NA DZIEŃ (trzymaj się z dokładnością do 5%):
- ${targets.kcal} kcal
- białko ${targets.protein} g
- węglowodany ${targets.carbs} g
- tłuszcz ${targets.fat} g

PROSTOTA — to jest ważniejsze niż oryginalność:
- ${STYLES[style]}
- Żaden posiłek nie może wymagać więcej niż ${maxMinutes} minut przygotowania.
- Tylko produkty, które zwykły człowiek kupi w Biedronce lub Lidlu.
- Zakazane: składniki egzotyczne i trudno dostępne, dania wieloetapowe, wszystko co wymaga
  specjalnego sprzętu. Lepiej nudno i wykonalnie niż ciekawie i nierealnie.
- Powtarzalność jest zaletą: śniadanie i przekąska mogą być banalne.

WARTOŚCI ODŻYWCZE:
- Dla KAŻDEGO składnika podaj gramaturę i wartości DLA TEJ GRAMATURY (nie na 100 g).
- Wartości muszą być realne: kalorie ≈ 4×białko + 4×węglowodany + 9×tłuszcz.
- Nie zaokrąglaj na oko — lepiej dobierz gramaturę tak, żeby suma dnia trafiła w cel.

POZOSTAŁE:
- Dokładnie 4 posiłki: SNIADANIE, OBIAD, KOLACJA, PRZEKASKA.
- Przepis: 2-4 zdania, same kroki, bez wstępów i zachwytów.
- Odpowiedz TYLKO w JSON, bez tekstu poza JSON.

FORMAT:
{"posilki":[{"posilek":"SNIADANIE","nazwa":"Owsianka z bananem","przepis":"...","skladniki":[{"nazwa":"Płatki owsiane","gramy":60,"kcal":228,"bialko":8,"wegle":40,"tluszcz":4}]}]}`;

    const baseMessage = [
      known ? `Produkty, które użytkownik ma już w bazie (używaj ich chętnie): ${known}.` : '',
      preferences ? `Preferencje i wykluczenia: ${preferences}.` : '',
      'Ułóż jadłospis na jeden dzień.',
    ]
      .filter(Boolean)
      .join('\n');

    /** Jedno wywołanie modelu + pełna walidacja po naszej stronie. */
    async function attempt(extra: string): Promise<{ meals: PlannedMeal[]; totals: { kcal: number; protein: number; carbs: number; fat: number } } | null> {
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: GROQ_MODEL,
          ...AI_EXTRA,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: extra ? `${baseMessage}\n\n${extra}` : baseMessage },
          ],
          max_tokens: aiMaxTokens(3500),
          temperature: 0.5,
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(45000),
      });
      if (!groqRes.ok) {
        console.error('Groq meal-plan', groqRes.status, await groqRes.text());
        return null;
      }

      const raw = aiContent(await groqRes.json()) || '{}';
      let parsed: { posilki?: AiMeal[] };
      try {
        parsed = JSON.parse(raw);
      } catch {
        return null;
      }

      const meals: PlannedMeal[] = [];
      for (const m of parsed.posilki ?? []) {
        const key = String(m.posilek || '').toUpperCase();
        if (!validMeals.has(key)) continue;

        const ingredients: PlannedIngredient[] = [];
        for (const s of m.skladniki ?? []) {
          const name = String(s.nazwa || '').trim();
          const grams = num(s.gramy);
          // Gramatura poza rozsądkiem = błąd modelu, nie posiłek.
          if (!name || grams <= 0 || grams > 2000) continue;

          // Dopasowanie do katalogu — zachowawcze: albo nazwa identyczna,
          // albo jedna zawiera się w drugiej. Lepiej nie trafić niż podmienić
          // makaron na majonez.
          const norm = normalize(name);
          const hit =
            index.find((c) => c.norm === norm) ??
            index.find((c) => norm.length >= 4 && (c.norm.includes(norm) || norm.includes(c.norm)));

          if (hit) {
            const f = grams / 100;
            ingredients.push({
              name,
              grams,
              kcal: Math.round(hit.kcal100 * f),
              protein: r1(hit.protein100 * f),
              carbs: r1(hit.carbs100 * f),
              fat: r1(hit.fat100 * f),
              matchedProductId: hit.id,
              matchedName: hit.brand ? `${hit.brand} ${hit.name}` : hit.name,
              corrected: false,
            });
            continue;
          }

          // Brak w katalogu — bierzemy szacunek modelu, ale sprawdzamy go
          // wzorem Atwatera. Makro model podaje trafniej niż kalorie.
          const protein = num(s.bialko);
          const carbs = num(s.wegle);
          const fat = num(s.tluszcz);
          const declared = num(s.kcal);
          const fromMacros = 4 * protein + 4 * carbs + 9 * fat;
          const useMacros = fromMacros > 0 && Math.abs(declared - fromMacros) > Math.max(20, fromMacros * 0.25);

          ingredients.push({
            name,
            grams,
            kcal: Math.round(useMacros ? fromMacros : declared || fromMacros),
            protein: r1(protein),
            carbs: r1(carbs),
            fat: r1(fat),
            matchedProductId: null,
            matchedName: null,
            corrected: useMacros,
          });
        }

        if (ingredients.length === 0) continue;

        meals.push({
          meal: key,
          title: String(m.nazwa || 'Posiłek').slice(0, 120),
          recipe: String(m.przepis || '').slice(0, 1500),
          ingredients,
          kcal: Math.round(ingredients.reduce((s, i) => s + i.kcal, 0)),
          protein: r1(ingredients.reduce((s, i) => s + i.protein, 0)),
          carbs: r1(ingredients.reduce((s, i) => s + i.carbs, 0)),
          fat: r1(ingredients.reduce((s, i) => s + i.fat, 0)),
        });
      }

      if (meals.length === 0) return null;

      return {
        meals,
        totals: {
          kcal: Math.round(meals.reduce((s, m) => s + m.kcal, 0)),
          protein: r1(meals.reduce((s, m) => s + m.protein, 0)),
          carbs: r1(meals.reduce((s, m) => s + m.carbs, 0)),
          fat: r1(meals.reduce((s, m) => s + m.fat, 0)),
        },
      };
    }

    const miss = (kcal: number) => (targets.kcal > 0 ? Math.abs(kcal - targets.kcal) / targets.kcal : 1);

    let best = await attempt('');
    if (!best) {
      return NextResponse.json({ error: 'AI nie odpowiedziało poprawnie. Spróbuj ponownie.' }, { status: 502 });
    }

    // Drugie podejście tylko wtedy, gdy pierwsze wyraźnie chybiło celu.
    let retried = false;
    if (miss(best.totals.kcal) > 0.12) {
      retried = true;
      const diff = best.totals.kcal - targets.kcal;
      const second = await attempt(
        `Poprzednia próba dała ${best.totals.kcal} kcal, czyli ${diff > 0 ? 'za dużo' : 'za mało'} o ${Math.abs(diff)} kcal ` +
          `(białko ${best.totals.protein} g, węgle ${best.totals.carbs} g, tłuszcz ${best.totals.fat} g). ` +
          `Popraw gramatury tak, żeby trafić w ${targets.kcal} kcal. Zachowaj prostotę posiłków.`
      );
      if (second && miss(second.totals.kcal) < miss(best.totals.kcal)) best = second;
    }

    const shoppingMap = new Map<string, number>();
    for (const m of best.meals) {
      for (const i of m.ingredients) {
        shoppingMap.set(i.name.trim(), (shoppingMap.get(i.name.trim()) ?? 0) + i.grams);
      }
    }
    const shopping = [...shoppingMap.entries()]
      .map(([name, grams]) => ({ name, grams: Math.round(grams) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pl'));

    const allIngredients = best.meals.flatMap((m) => m.ingredients);

    return NextResponse.json({
      meals: best.meals,
      totals: best.totals,
      targets,
      shopping,
      matched: allIngredients.filter((i) => i.matchedProductId).length,
      corrected: allIngredients.filter((i) => i.corrected).length,
      totalIngredients: allIngredients.length,
      accuracy: Math.round((1 - miss(best.totals.kcal)) * 100),
      retried,
    });
  } catch (e) {
    console.error('POST /api/ai/meal-plan', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

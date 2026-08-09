import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';
import { computeTargets, MEALS } from '@/lib/nutrition';
import { latestWeight } from '@/lib/calories';
import { GROQ_MODEL, AI_EXTRA, aiMaxTokens, aiContent } from '@/lib/ai';

/**
 * Generator dziennego jadłospisu — wybór z bazy dań.
 *
 * DRUGA ZMIANA PODEJŚCIA. Pierwsza wersja pozwalała modelowi podawać liczby
 * i trafiała w cel w połowie przypadków. Druga odebrała mu liczby, ale kazała
 * składać posiłki z surowców — i wtedy trzeba było pilnować promptem rzeczy
 * oczywistych dla człowieka („sucha kasza to 60-90 g na osobę"), a i tak
 * wychodziły porcje nie do zjedzenia.
 *
 * Teraz model wybiera GOTOWE DANIA z bazy przepisów: schabowy, ziemniaki,
 * surówka. Każde danie ma zapisaną przez człowieka typową porcję, przepis
 * i listę składników, a model podaje wyłącznie NUMER dania i liczbę porcji
 * (0,5-2). Skutki:
 *
 *  1. porcja nie może wyjść absurdalna, bo jej wielkość zdefiniował człowiek,
 *  2. przepis pochodzi z bazy, nie z modelu — jest zawsze wykonalny,
 *  3. zapytanie zeszło z ~8000 tokenów do ~3000, więc mieści się w limicie Groqa,
 *  4. model odpowiada kilkoma liczbami zamiast czterema przepisami, czyli
 *     ma dużo mniej okazji, żeby coś popsuć.
 *
 * Rola modelu sprowadza się do jednej rzeczy, w której jest naprawdę dobry:
 * ułożenia sensownego zestawu na dany dzień.
 */

type Rec = Record<string, unknown>;

type Dish = {
  id: string;
  name: string;
  brand: string | null;
  kcal100: number;
  protein100: number;
  carbs100: number;
  fat100: number;
  servingG: number | null;
  recipe: string | null;
  ingredients: unknown;
  mealSlots: string | null;
};

export type PlannedIngredient = {
  productId: string;
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type PlannedMeal = {
  meal: string;
  title: string;
  recipe: string;
  ingredients: PlannedIngredient[];
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
};

const r1 = (x: number) => Math.round(x * 10) / 10;
const num = (v: unknown): number => {
  const x = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(x) && x > 0 ? x : 0;
};

/** Gramatury zaokrąglane po ludzku: grubo dla dużych porcji, dokładnie dla dodatków. */
function tidyGrams(g: number): number {
  if (g >= 100) return Math.round(g / 10) * 10;
  if (g >= 20) return Math.round(g / 5) * 5;
  return Math.max(5, Math.round(g));
}

/** Ile porcji dania wolno zaplanować. Poniżej 0,5 to już nie jest posiłek, powyżej 2 — nie do zjedzenia. */
const MIN_PORTIONS = 0.5;
const MAX_PORTIONS = 2;

/** Orientacyjny udział posiłków w dniu — po polsku obiad jest głównym posiłkiem. */
const MEAL_SHARE: Record<string, number> = {
  SNIADANIE: 0.25,
  OBIAD: 0.35,
  KOLACJA: 0.25,
  PRZEKASKA: 0.15,
};

const DEFAULT_PROFILE = {
  heightCm: null, birthYear: null, sex: null,
  activityLevel: 'MODERATE', goalType: 'MAINTAIN', customKcal: null,
  proteinPct: 30, carbsPct: 40, fatPct: 30, addWorkoutKcal: false,
};

const STYLES: Record<string, string> = {
  PROSTE: 'Wybieraj dania najprostsze: jeden składnik główny plus dodatek.',
  STANDARD: 'Zwyczajne domowe zestawy: białko, skrobia i warzywo na obiad.',
  UROZMAICONE: 'Możesz łączyć ciekawsze zestawy i sięgać po rzadziej wybierane dania.',
};

/**
 * Nazwa posiłku od modelu → nasz klucz. Model odpisuje po polsku, więc
 * „ŚNIADANIE" i „PRZEKĄSKA" trafiają się na okrągło; samo `toUpperCase()`
 * ich nie zrówna ze stałą bez ogonków i posiłek wypadał z planu.
 */
function mealKey(raw: unknown): string {
  const bare = String(raw ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/gi, 'l')
    .toUpperCase()
    .trim();
  const ALIASES: Record<string, string> = {
    SNIADANIE: 'SNIADANIE', 'PIERWSZE SNIADANIE': 'SNIADANIE', BREAKFAST: 'SNIADANIE',
    OBIAD: 'OBIAD', LUNCH: 'OBIAD', DINNER: 'OBIAD',
    KOLACJA: 'KOLACJA', SUPPER: 'KOLACJA',
    PRZEKASKA: 'PRZEKASKA', PRZEKASKI: 'PRZEKASKA', 'DRUGIE SNIADANIE': 'PRZEKASKA',
    PODWIECZOREK: 'PRZEKASKA', SNACK: 'PRZEKASKA',
  };
  return ALIASES[bare] ?? bare;
}

/** Pierwsza tablica pod jednym z kluczy, a jak żaden nie pasuje — pierwsza tablica w ogóle. */
function pickList(node: unknown, keys: string[]): Rec[] {
  const isList = (v: unknown): v is Rec[] =>
    Array.isArray(v) && v.length > 0 && v.every((x) => x !== null && typeof x === 'object');
  if (isList(node)) return node;
  if (!node || typeof node !== 'object') return [];
  const rec = node as Rec;
  for (const k of keys) if (isList(rec[k])) return rec[k] as Rec[];
  for (const v of Object.values(rec)) if (isList(v)) return v;
  return [];
}

/** Pierwsza niepusta wartość spośród możliwych nazw pola. */
function pickField(o: Rec, keys: string[]): unknown {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k];
  return undefined;
}

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

    const [profileRow, weights, dishRows] = await Promise.all([
      prisma.nutritionProfile.findUnique({ where: { userId } }),
      prisma.bodyWeight.findMany({ where: { userId }, orderBy: { date: 'desc' }, take: 1 }),
      // Do planu biorą się wyłącznie pozycje przypisane do posiłku — czyli baza
      // dań (`npm run db:recipes`) plus własne dania zapisane z „Opisz" i importu.
      prisma.foodProduct.findMany({
        where: { mealSlots: { not: null }, kcal100: { gt: 0 } },
        orderBy: [{ usageCount: 'desc' }, { name: 'asc' }],
        select: {
          id: true, name: true, brand: true, kcal100: true, protein100: true,
          carbs100: true, fat100: true, servingG: true, recipe: true,
          ingredients: true, mealSlots: true,
        },
      }),
    ]);

    const dishes: Dish[] = dishRows.filter((d) => d.servingG && d.servingG > 0);

    if (dishes.length < 12) {
      return NextResponse.json(
        {
          error: 'Baza przepisów jest pusta. Uruchom „npm run db:recipes", żeby wgrać dania i przypisać je do posiłków.',
          stage: `dań z przypisanym posiłkiem: ${dishes.length}`,
        },
        { status: 400 }
      );
    }

    const profile = profileRow ?? DEFAULT_PROFILE;
    const weightKg = weights.length > 0 ? latestWeight(weights) : null;
    const targets = computeTargets(profile, weightKg, new Date());

    const slotsOf = (d: Dish) => (d.mealSlots ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const byId = new Map(dishes.map((d) => [d.id, d]));

    // Numeracja jest GLOBALNA (jeden numer = jedno danie w całej odpowiedzi),
    // ale listę pokazujemy w podziale na posiłki — model ma wtedy od razu
    // widoczne, co pasuje o której porze i nie musi tego wnioskować z nazwy.
    const index = new Map(dishes.map((d, i) => [d.id, i]));
    const line = (d: Dish) =>
      `${index.get(d.id)} ${d.brand ? d.brand + ' ' : ''}${d.name} · porcja ${Math.round(d.servingG!)}g = ` +
      `${Math.round((d.kcal100 * d.servingG!) / 100)}kcal B${r1((d.protein100 * d.servingG!) / 100)}`;

    const menu = MEALS.map((m) => {
      const list = dishes.filter((d) => slotsOf(d).includes(m.key));
      return `\n[${m.key}] — ${Math.round(targets.kcal * (MEAL_SHARE[m.key] ?? 0.25))} kcal\n${list.map(line).join('\n')}`;
    }).join('\n');

    const systemPrompt = `Układasz jadłospis na jeden dzień, wybierając GOTOWE DANIA z listy poniżej.

Każde danie ma numer, typową porcję i wartości TEJ PORCJI. Podajesz wyłącznie numer dania
i liczbę porcji (od ${MIN_PORTIONS} do ${MAX_PORTIONS}, dozwolone połówki). Nic nie liczysz i nic nie wymyślasz —
przepisy i wartości są już w bazie, system dostroi gramatury do celu.

CEL NA DZIEŃ: ${targets.kcal} kcal, w tym białko ${targets.protein} g.
Trzymaj się kalorii podanych przy każdym posiłku (to orientacyjny podział dnia).

JAK SKŁADAĆ POSIŁKI:
- OBIAD po polsku to zestaw: danie z mięsem lub rybą + dodatek skrobiowy (ziemniaki, ryż,
  kasza, makaron) + surówka albo warzywo. Wybierz 2-3 pozycje. Wyjątek: dania jednogarnkowe
  i mączne (spaghetti, pierogi, gołąbki, zapiekanka) wystarczają same, najwyżej z surówką.
- ŚNIADANIE i KOLACJA: 1-2 pozycje.
- PRZEKĄSKA: dokładnie jedna pozycja.
- Nie powtarzaj tego samego dania dwa razy w ciągu dnia.
- Białko jest najważniejsze: w każdym głównym posiłku ma być coś z mięsa, ryby, jajek
  lub nabiału.
- ${STYLES[style]}
- Pomijaj dania wymagające dłuższego przygotowania niż ${maxMinutes} minut, jeśli masz wybór.

FORMAT — tylko JSON, dokładnie 4 posiłki:
{"posilki":[{"posilek":"OBIAD","pozycje":[{"id":12,"porcje":1},{"id":45,"porcje":1.5}]}]}

DANIA DO WYBORU:${menu}`;

    const baseMessage = [
      preferences ? `Preferencje i wykluczenia użytkownika: ${preferences}.` : '',
      'Ułóż jadłospis na jeden dzień.',
    ]
      .filter(Boolean)
      .join('\n');

    let lastReason = '';

    /** Jedno wywołanie modelu → posiłki złożone z dań z bazy. */
    async function attempt(extra: string): Promise<PlannedMeal[] | null> {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: GROQ_MODEL,
          ...AI_EXTRA,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: extra ? `${baseMessage}\n\n${extra}` : baseMessage },
          ],
          // Odpowiedź to kilkanaście liczb — nie ma już czterech przepisów do napisania.
          max_tokens: aiMaxTokens(700),
          temperature: 0.6,
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(45000),
      });

      if (!res.ok) {
        console.error('Groq meal-plan', res.status, await res.text());
        lastReason = res.status === 413
          ? `zapytanie za duże dla limitu Groqa (HTTP 413, ${dishes.length} dań)`
          : `model odpowiedział błędem HTTP ${res.status}`;
        return null;
      }

      const json = await res.json();
      const finish = (json as { choices?: { finish_reason?: string }[] })?.choices?.[0]?.finish_reason;
      const content = aiContent(json);
      if (!content) {
        lastReason = finish === 'length' ? 'odpowiedź urwała się na limicie tokenów' : 'model odesłał pustą treść';
        return null;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        lastReason = finish === 'length'
          ? 'odpowiedź urwała się w połowie (limit tokenów)'
          : 'model odesłał coś, co nie jest JSON-em';
        return null;
      }

      const meals: PlannedMeal[] = [];
      const usedSlots = new Set<string>();
      const usedDishes = new Set<string>();
      const rawMeals = pickList(parsed, ['posilki', 'posiłki', 'meals', 'plan', 'jadlospis', 'jadłospis']);

      for (const m of rawMeals) {
        const key = mealKey(pickField(m, ['posilek', 'posiłek', 'meal', 'typ', 'pora']));
        if (!MEAL_SHARE[key] || usedSlots.has(key)) continue;

        const chosen: { dish: Dish; grams: number }[] = [];
        for (const item of pickList(m, ['pozycje', 'dania', 'skladniki', 'składniki', 'items', 'produkty'])) {
          const idx = Math.trunc(Number(pickField(item, ['id', 'nr', 'numer', 'index', 'idx'])));
          if (!Number.isInteger(idx) || idx < 0 || idx >= dishes.length) continue;
          const dish = dishes[idx];
          // Danie spoza tej pory dnia albo powtórzone — pomijamy zamiast
          // przyjmować, bo to psuje sens planu (naleśniki drugi raz tego dnia).
          if (!slotsOf(dish).includes(key) || usedDishes.has(dish.id)) continue;
          if (chosen.length >= 4) break;

          const portions = Math.min(MAX_PORTIONS, Math.max(MIN_PORTIONS, num(pickField(item, ['porcje', 'porcji', 'portions', 'ilosc', 'ilość'])) || 1));
          usedDishes.add(dish.id);
          chosen.push({ dish, grams: tidyGrams(dish.servingG! * portions) });
        }
        if (chosen.length === 0) continue;

        usedSlots.add(key);
        meals.push({
          meal: key,
          title: chosen.map((c) => c.dish.name).join(' + '),
          recipe: chosen.map((c) => c.dish.recipe).filter(Boolean).join(' | '),
          ingredients: chosen.map((c) => ({
            productId: c.dish.id,
            name: c.dish.brand ? `${c.dish.brand} ${c.dish.name}` : c.dish.name,
            grams: c.grams,
            kcal: 0, protein: 0, carbs: 0, fat: 0, // liczone po dostrojeniu
          })),
          kcal: 0, protein: 0, carbs: 0, fat: 0,
        });
      }

      if (meals.length >= 3) return meals;
      lastReason = rawMeals.length === 0
        ? 'w odpowiedzi nie było listy posiłków'
        : `rozpoznałem ${meals.length} z ${rawMeals.length} posiłków (za mało)`;
      return null;
    }

    /** Makro liczone wyłącznie z bazy — model nie podaje żadnych liczb. */
    function recompute(meals: PlannedMeal[]) {
      for (const m of meals) {
        for (const i of m.ingredients) {
          const d = byId.get(i.productId);
          if (!d) continue;
          const f = i.grams / 100;
          i.kcal = Math.round(d.kcal100 * f);
          i.protein = r1(d.protein100 * f);
          i.carbs = r1(d.carbs100 * f);
          i.fat = r1(d.fat100 * f);
        }
        m.kcal = Math.round(m.ingredients.reduce((s, i) => s + i.kcal, 0));
        m.protein = r1(m.ingredients.reduce((s, i) => s + i.protein, 0));
        m.carbs = r1(m.ingredients.reduce((s, i) => s + i.carbs, 0));
        m.fat = r1(m.ingredients.reduce((s, i) => s + i.fat, 0));
      }
      return {
        kcal: Math.round(meals.reduce((s, m) => s + m.kcal, 0)),
        protein: r1(meals.reduce((s, m) => s + m.protein, 0)),
        carbs: r1(meals.reduce((s, m) => s + m.carbs, 0)),
        fat: r1(meals.reduce((s, m) => s + m.fat, 0)),
      };
    }

    /**
     * Dostrojenie dnia do celu kalorycznego. Gramatury ruszają się wyłącznie
     * w widełkach ${MIN_PORTIONS}-${MAX_PORTIONS} porcji, więc żadna pozycja nie może wyjść poza to,
     * co człowiek uznał za sensowną wielkość. Jeśli w tych widełkach nie da się
     * dobić do celu, dzień zostaje poniżej — i to widać w podsumowaniu.
     */
    function fitToTarget(meals: PlannedMeal[]) {
      let totals = recompute(meals);
      if (totals.kcal <= 0 || targets.kcal <= 0) return totals;

      const all = () => meals.flatMap((m) => m.ingredients);
      const minOf = (i: PlannedIngredient) => (byId.get(i.productId)?.servingG ?? i.grams) * MIN_PORTIONS;
      const maxOf = (i: PlannedIngredient) => (byId.get(i.productId)?.servingG ?? i.grams) * MAX_PORTIONS;

      for (let pass = 0; pass < 5; pass++) {
        const diff = targets.kcal - totals.kcal;
        if (Math.abs(diff) <= targets.kcal * 0.03) break;

        const adjustable = all().filter((i) => {
          const d = byId.get(i.productId);
          if (!d || d.kcal100 <= 0) return false;
          return diff > 0 ? i.grams < maxOf(i) - 1 : i.grams > minOf(i) + 1;
        });
        if (adjustable.length === 0) break;

        // Różnicę rozkładamy po równo — jedno danie nie ma puchnąć za wszystkie.
        const share = diff / adjustable.length;
        for (const i of adjustable) {
          const d = byId.get(i.productId)!;
          const next = i.grams + (share / d.kcal100) * 100;
          i.grams = tidyGrams(Math.min(maxOf(i), Math.max(minOf(i), next)));
        }
        totals = recompute(meals);
      }
      return totals;
    }

    let meals = await attempt('');
    if (!meals) {
      meals = await attempt('Odpowiedz wyłącznie poprawnym JSON-em w podanym formacie, bez żadnego tekstu obok.');
    }
    if (!meals) {
      return NextResponse.json(
        { error: 'AI nie ułożyło poprawnego planu. Spróbuj ponownie.', stage: lastReason || 'nieznany powód' },
        { status: 502 }
      );
    }

    let totals = fitToTarget(meals);

    // Powtórka ma sens tylko przy błędzie DOBORU dań — kalorie i białko poza
    // zakresem oznaczają, że zestaw jest źle dobrany, a nie źle wyskalowany.
    const missOf = (v: number, t: number) => (t > 0 ? Math.abs(v - t) / t : 0);
    const scoreOf = (t: { kcal: number; protein: number }) =>
      missOf(t.kcal, targets.kcal) * 2 + missOf(t.protein, targets.protein);

    let retried = false;
    if (missOf(totals.kcal, targets.kcal) > 0.1 || missOf(totals.protein, targets.protein) > 0.25) {
      retried = true;
      const light = totals.kcal < targets.kcal;
      const second = await attempt(
        `Poprzedni zestaw dał ${totals.kcal} kcal i ${totals.protein} g białka przy celu ` +
          `${targets.kcal} kcal i ${targets.protein} g. ${
            light
              ? 'Dobierz dania bardziej sycące albo dołóż pozycję do posiłku.'
              : 'Wybierz lżejsze dania albo mniej pozycji.'
          } Zadbaj o białko: mięso, ryby, jajka, twaróg, skyr.`
      );
      if (second) {
        const secondTotals = fitToTarget(second);
        if (scoreOf(secondTotals) < scoreOf(totals)) {
          meals = second;
          totals = secondTotals;
        }
      }
    }

    // Lista zakupów: dania rozbijamy na składniki z przepisu, przeskalowane
    // proporcjonalnie do zaplanowanej porcji. W sklepie kupuje się mięso
    // i ziemniaki, nie „kotlet schabowy".
    const shoppingMap = new Map<string, number>();
    for (const m of meals) {
      for (const i of m.ingredients) {
        const d = byId.get(i.productId);
        const raw = Array.isArray(d?.ingredients) ? (d!.ingredients as { nazwa?: string; gramy?: number }[]) : [];
        const factor = d?.servingG ? i.grams / d.servingG : 1;
        if (raw.length > 0) {
          for (const part of raw) {
            if (!part?.nazwa) continue;
            const grams = (Number(part.gramy) || 0) * factor;
            shoppingMap.set(part.nazwa, (shoppingMap.get(part.nazwa) ?? 0) + grams);
          }
        } else {
          shoppingMap.set(i.name, (shoppingMap.get(i.name) ?? 0) + i.grams);
        }
      }
    }
    const shopping = [...shoppingMap.entries()]
      .map(([name, grams]) => ({ name, grams: Math.round(grams) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pl'));

    const count = meals.flatMap((m) => m.ingredients).length;

    return NextResponse.json({
      meals,
      totals,
      targets,
      shopping,
      accuracy: Math.max(0, Math.round((1 - missOf(totals.kcal, targets.kcal)) * 100)),
      retried,
      catalogSize: dishes.length,
      matched: count,
      totalIngredients: count,
    });
  } catch (e) {
    console.error('POST /api/ai/meal-plan', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

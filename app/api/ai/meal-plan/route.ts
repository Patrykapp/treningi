import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';
import { computeTargets, MEALS } from '@/lib/nutrition';
import { latestWeight } from '@/lib/calories';
import { GROQ_MODEL, AI_EXTRA, aiMaxTokens, aiContent } from '@/lib/ai';

/**
 * Generator dziennego jadłospisu.
 *
 * WAŻNA ZMIANA PODEJŚCIA (pierwsza wersja trafiała w cel kaloryczny w ~50%).
 * Model NIE PODAJE ŻADNYCH LICZB odżywczych. Dostaje zamkniętą listę produktów
 * z prawdziwymi wartościami z naszej bazy i może wybierać wyłącznie z niej,
 * podając numer produktu i gramaturę. Całą arytmetykę robi serwer:
 *
 *  1. makro liczone z bazy — model nie ma jak się pomylić, bo nic nie liczy,
 *  2. gramatury są SKALOWANE tak, żeby suma dnia trafiła w cel kaloryczny,
 *  3. resztkowa różnica dobierana na najbardziej kalorycznym składniku,
 *  4. jedno powtórzenie, jeśli rozkład białka wyraźnie odbiega od celu
 *     (tego skalowanie nie naprawi — to kwestia doboru produktów).
 *
 * Rola modelu sprowadza się do tego, w czym jest dobry: dobrania sensownych
 * zestawień i napisania przepisu.
 */

type Rec = Record<string, unknown>;

/**
 * Nazwa posiłku od modelu → nasz klucz.
 *
 * Model potrafi odpisać „ŚNIADANIE" albo „przekąska" — z polskimi znakami,
 * choć w prompcie stoi „SNIADANIE". Samo `toUpperCase()` tego nie zrówna,
 * więc posiłek wypadał z planu, a przy trzech odrzuconych cały plan lądował
 * w koszu z komunikatem „AI nie ułożyło poprawnego planu".
 */
function mealKey(raw: unknown): string {
  const bare = String(raw ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // ś → s, ą → a
    .replace(/ł/gi, 'l')              // ł nie rozkłada się w NFD
    .toUpperCase()
    .trim();
  const ALIASES: Record<string, string> = {
    SNIADANIE: 'SNIADANIE',
    'PIERWSZE SNIADANIE': 'SNIADANIE',
    BREAKFAST: 'SNIADANIE',
    OBIAD: 'OBIAD',
    LUNCH: 'OBIAD',
    DINNER: 'OBIAD',
    KOLACJA: 'KOLACJA',
    SUPPER: 'KOLACJA',
    PRZEKASKA: 'PRZEKASKA',
    PRZEKASKI: 'PRZEKASKA',
    'DRUGIE SNIADANIE': 'PRZEKASKA',
    PODWIECZOREK: 'PRZEKASKA',
    SNACK: 'PRZEKASKA',
  };
  return ALIASES[bare] ?? bare;
}

/**
 * Pierwsza tablica pod jednym z podanych kluczy — a jak żaden nie pasuje,
 * pierwsza tablica w ogóle. Model bywa uczynny i odsyła „posiłki" z ogonkami
 * albo „ingredients" po angielsku; sztywne czytanie jednej nazwy kończyło się
 * pustym planem mimo poprawnej odpowiedzi.
 */
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

type Catalog = {
  id: string; name: string; brand: string | null;
  kcal100: number; protein100: number; carbs100: number; fat100: number;
  servingG: number | null; source: string;
  category: string | null; usageCount: number;
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

const DEFAULT_PROFILE = {
  heightCm: null, birthYear: null, sex: null,
  activityLevel: 'MODERATE', goalType: 'MAINTAIN', customKcal: null,
  proteinPct: 30, carbsPct: 40, fatPct: 30, addWorkoutKcal: false,
};

const STYLES: Record<string, string> = {
  PROSTE: 'Maksymalna prostota. Najwyżej 5 składników na posiłek, bez sosów od zera i bez marynowania.',
  STANDARD: 'Zwyczajne domowe jedzenie. Do 7 składników na posiłek.',
  UROZMAICONE: 'Możesz proponować ciekawsze zestawienia, ale nadal domowe i wykonalne.',
};

// Polskie zwyczaje żywieniowe. Bez tego model potrafi zaproponować na śniadanie
// jogurt grecki z miodem albo sałatkę z komosą — technicznie poprawnie,
// życiowo nie tak, jak się je w Polsce.
const MEAL_RULES = `
SNIADANIE — typowo polskie: kanapki z wędliną, serem lub twarożkiem i warzywem;
  jajecznica lub jajka na twardo z pieczywem; owsianka na mleku z owocem;
  płatki z mlekiem; twaróg ze szczypiorkiem i rzodkiewką. NIE proponuj na śniadanie
  sałatek obiadowych, ryżu, makaronu, kaszy, dań smażonych ani samego jogurtu z dodatkami.
OBIAD — schemat: źródło białka (mięso lub ryba) + skrobia (ziemniaki, ryż, kasza,
  makaron) + warzywa lub surówka. To główny posiłek dnia.
KOLACJA — lekka i szybka: kanapki, twaróg, jajka, sałatka z pieczywem albo odgrzane
  resztki obiadu. Bez pieczenia i długiego gotowania.
PRZEKASKA — jedna prosta rzecz: owoc, jogurt, garść orzechów, kanapka, baton.
  Maksymalnie 3 składniki.`;

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

    const select = {
      id: true, name: true, brand: true, kcal100: true, protein100: true,
      carbs100: true, fat100: true, servingG: true, source: true,
      category: true, usageCount: true,
    };

    const [profileRow, weights, seedRows, ownRows] = await Promise.all([
      prisma.nutritionProfile.findUnique({ where: { userId } }),
      prisma.bodyWeight.findMany({ where: { userId }, orderBy: { date: 'desc' }, take: 1 }),
      prisma.foodProduct.findMany({ where: { source: 'SEED' }, orderBy: { name: 'asc' }, select }),
      prisma.foodProduct.findMany({
        where: { source: { not: 'SEED' } },
        orderBy: [{ usageCount: 'desc' }, { updatedAt: 'desc' }],
        take: 40,
        select,
      }),
    ]);

    const catalog: Catalog[] = [...seedRows, ...ownRows].filter((p) => p.kcal100 > 0);

    if (catalog.length < 20) {
      return NextResponse.json(
        { error: 'Za mało produktów w bazie. Uruchom „npm run db:food", żeby wgrać listę podstawową.' },
        { status: 400 }
      );
    }

    const profile = profileRow ?? DEFAULT_PROFILE;
    const weightKg = weights.length > 0 ? latestWeight(weights) : null;
    const targets = computeTargets(profile, weightKg, new Date());

    const validMeals = new Set<string>(MEALS.map((m) => m.key));

    /**
     * Pula produktów wysyłana do modelu.
     *
     * Cały katalog (ponad 250 pozycji) to około 5000 tokenów w samym prompcie.
     * Groq liczy do limitu na minutę SUMĘ promptu i zarezerwowanego `max_tokens`,
     * a darmowy plan dla gpt-oss-120b daje 8000 — całe zapytanie po prostu się
     * nie mieściło i wracało jako HTTP 413. Do ułożenia czterech posiłków
     * wystarcza kilkadziesiąt produktów, byle z każdego działu.
     *
     * Dobór: najpierw to, co użytkownik faktycznie jada, potem karuzela po
     * działach sklepu — dzięki temu w puli zawsze jest i mięso, i nabiał,
     * i warzywa, zamiast stu rodzajów pieczywa z początku alfabetu.
     */
    function pickPool(all: Catalog[], limit: number): Catalog[] {
      const chosen: Catalog[] = [];
      const seen = new Set<string>();
      const add = (p: Catalog) => {
        if (seen.has(p.id) || chosen.length >= limit) return;
        seen.add(p.id);
        chosen.push(p);
      };

      // 1. produkty z historii — te, które w tym domu naprawdę się jada
      [...all]
        .filter((p) => p.usageCount > 0)
        .sort((a, b) => b.usageCount - a.usageCount)
        .slice(0, Math.floor(limit * 0.25))
        .forEach(add);

      // 2. karuzela po działach, w każdym najpierw popularne
      const byCategory = new Map<string, Catalog[]>();
      for (const p of all) {
        const key = p.category ?? 'Inne';
        const list = byCategory.get(key);
        if (list) list.push(p);
        else byCategory.set(key, [p]);
      }
      const queues = [...byCategory.values()].map((list) =>
        [...list].sort((a, b) => b.usageCount - a.usageCount || a.name.localeCompare(b.name, 'pl'))
      );
      for (let round = 0; chosen.length < limit && round < 60; round++) {
        let addedInRound = false;
        for (const q of queues) {
          const p = q[round];
          if (!p) continue;
          add(p);
          addedInRound = true;
          if (chosen.length >= limit) break;
        }
        if (!addedInRound) break;
      }
      return chosen;
    }

    // Numerowana lista dla modelu — numery zamiast nazw eliminują literówki
    // i produkty wzięte z powietrza.
    const menuOf = (pool: Catalog[]) =>
      pool
        .map(
          (p, i) =>
            `${i} ${p.brand ? p.brand + ' ' : ''}${p.name} ${Math.round(p.kcal100)}k B${r1(p.protein100)} W${r1(p.carbs100)} T${r1(p.fat100)}`
        )
        .join('\n');

    const promptFor = (pool: Catalog[]) => `Jesteś dietetykiem układającym jadłospis dla zapracowanej osoby w Polsce.

Dostajesz ZAMKNIĘTĄ LISTĘ produktów. Każdy ma numer i wartości na 100 g.
Wolno ci używać WYŁĄCZNIE produktów z tej listy, podając ich numer i gramaturę w gramach.
NIE podawaj kalorii ani makroskładników — policzy je system. Twoje zadanie to dobrać
sensowne zestawienia i napisać przepis.

CEL NA DZIEŃ (orientacyjnie — system doprecyzuje gramatury):
${targets.kcal} kcal · białko ${targets.protein} g · węglowodany ${targets.carbs} g · tłuszcz ${targets.fat} g
Najważniejsze: dobierz produkty tak, żeby BIAŁKA było dużo — tego jako jedynego
nie da się naprawić samą zmianą gramatur.

ZWYCZAJE POSIŁKÓW:${MEAL_RULES}

PROSTOTA:
- ${STYLES[style]}
- Maksymalnie ${maxMinutes} minut przygotowania na posiłek.
- Powtarzalność jest zaletą. Lepiej nudno i wykonalnie niż oryginalnie i nierealnie.

FORMAT — tylko JSON, dokładnie 4 posiłki (SNIADANIE, OBIAD, KOLACJA, PRZEKASKA):
{"posilki":[{"posilek":"SNIADANIE","nazwa":"Kanapki z szynką i pomidorem","przepis":"Chleb posmaruj masłem. Ułóż szynkę i plastry pomidora.","skladniki":[{"id":3,"gramy":70},{"id":41,"gramy":10}]}]}

LISTA PRODUKTÓW (numer, nazwa, wartości na 100 g: kcal, Białko, Węglowodany, Tłuszcz):
${menuOf(pool)}`;

    const baseMessage = [
      preferences ? `Preferencje i wykluczenia użytkownika: ${preferences}.` : '',
      'Ułóż jadłospis na jeden dzień.',
    ]
      .filter(Boolean)
      .join('\n');

    // Powód niepowodzenia wraca do interfejsu — bez tego każda usterka wygląda
    // tak samo („AI nie ułożyło poprawnego planu") i nie ma z czego wnioskować.
    let lastReason = '';

    /**
     * Jedno wywołanie modelu → posiłki złożone wyłącznie z produktów z bazy.
     * `pool` to lista wysłana w prompcie; numery od modelu indeksują właśnie ją.
     */
    async function attempt(extra: string, pool: Catalog[], answerTokens: number): Promise<PlannedMeal[] | null> {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: GROQ_MODEL,
          ...AI_EXTRA,
          messages: [
            { role: 'system', content: promptFor(pool) },
            { role: 'user', content: extra ? `${baseMessage}\n\n${extra}` : baseMessage },
          ],
          max_tokens: aiMaxTokens(answerTokens),
          temperature: 0.5,
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(45000),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error('Groq meal-plan', res.status, text);
        lastReason = res.status === 413
          ? `zapytanie za duże dla limitu Groqa (HTTP 413, lista ${pool.length} produktów)`
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
        // Urwany JSON to najczęściej wyczerpany limit tokenów, nie zła składnia.
        lastReason = finish === 'length'
          ? 'odpowiedź urwała się w połowie (limit tokenów)'
          : 'model odesłał coś, co nie jest JSON-em';
        return null;
      }

      const meals: PlannedMeal[] = [];
      const usedMeals = new Set<string>();
      const rawMeals = pickList(parsed, ['posilki', 'posiłki', 'meals', 'plan', 'jadlospis', 'jadłospis']);

      for (const m of rawMeals) {
        const key = mealKey(pickField(m, ['posilek', 'posiłek', 'meal', 'typ', 'pora']));
        if (!validMeals.has(key) || usedMeals.has(key)) continue;

        const ingredients: PlannedIngredient[] = [];
        for (const s of pickList(m, ['skladniki', 'składniki', 'ingredients', 'produkty'])) {
          const idx = Math.trunc(Number(pickField(s, ['id', 'nr', 'numer', 'index', 'idx'])));
          const grams = num(pickField(s, ['gramy', 'gram', 'grams', 'g', 'ilosc', 'ilość']));
          // Numer spoza listy = zmyślony produkt. Pomijamy.
          if (!Number.isInteger(idx) || idx < 0 || idx >= pool.length || grams <= 0 || grams > 1500) continue;

          const p = pool[idx];
          if (ingredients.some((i) => i.productId === p.id)) continue; // bez duplikatów w posiłku
          ingredients.push({
            productId: p.id,
            name: p.brand ? `${p.brand} ${p.name}` : p.name,
            grams: tidyGrams(grams),
            kcal: 0, protein: 0, carbs: 0, fat: 0, // liczone po skalowaniu
          });
        }
        if (ingredients.length === 0) continue;

        usedMeals.add(key);
        meals.push({
          meal: key,
          title: String(pickField(m, ['nazwa', 'name', 'title', 'tytul', 'tytuł']) ?? 'Posiłek').slice(0, 120),
          recipe: String(pickField(m, ['przepis', 'recipe', 'instrukcja', 'opis', 'sposob', 'sposób']) ?? '').slice(0, 1200),
          ingredients,
          kcal: 0, protein: 0, carbs: 0, fat: 0,
        });
      }

      if (meals.length >= 3) return meals;
      lastReason = rawMeals.length === 0
        ? 'w odpowiedzi nie było listy posiłków'
        : `rozpoznałem ${meals.length} z ${rawMeals.length} posiłków (za mało)`;
      return null;
    }

    const byId = new Map(catalog.map((p) => [p.id, p]));

    /** Przelicza makro składników i sumy — wyłącznie z danych z bazy. */
    function recompute(meals: PlannedMeal[]) {
      for (const m of meals) {
        for (const i of m.ingredients) {
          const p = byId.get(i.productId);
          if (!p) continue;
          const f = i.grams / 100;
          i.kcal = Math.round(p.kcal100 * f);
          i.protein = r1(p.protein100 * f);
          i.carbs = r1(p.carbs100 * f);
          i.fat = r1(p.fat100 * f);
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
     * Dociągnięcie dnia do celu kalorycznego: najpierw proporcjonalne
     * przeskalowanie wszystkich gramatur, potem domiar resztkowy na
     * najbardziej kalorycznym składniku — końcówka schodzi wtedy niemal do
     * zera bez rozjeżdżania proporcji między posiłkami.
     */
    function fitToTarget(meals: PlannedMeal[]) {
      let totals = recompute(meals);
      if (totals.kcal <= 0 || targets.kcal <= 0) return totals;

      // Skrajne odchylenie oznacza zupełnie nietrafione porcje — bez
      // ograniczenia skalowanie dałoby absurdy w rodzaju 900 g ryżu.
      const clamped = Math.min(1.8, Math.max(0.5, targets.kcal / totals.kcal));
      for (const m of meals) {
        for (const i of m.ingredients) i.grams = tidyGrams(i.grams * clamped);
      }
      totals = recompute(meals);

      const diff = targets.kcal - totals.kcal;
      if (Math.abs(diff) > targets.kcal * 0.02) {
        let biggest: PlannedIngredient | null = null;
        for (const m of meals) {
          for (const i of m.ingredients) if (!biggest || i.kcal > biggest.kcal) biggest = i;
        }
        const p = biggest ? byId.get(biggest.productId) : null;
        if (biggest && p && p.kcal100 > 0) {
          const next = tidyGrams(Math.max(5, biggest.grams + (diff / p.kcal100) * 100));
          // Porcja nie może urosnąć ponad dwukrotnie — lepiej zostawić małą
          // rozbieżność niż wpisać 400 g masła orzechowego.
          if (next <= biggest.grams * 2 + 50) biggest.grams = next;
        }
        totals = recompute(meals);
      }
      return totals;
    }

    // Dwa podejścia. Drugie jest mniejsze pod każdym względem: krótsza lista
    // produktów i ciaśniejszy limit odpowiedzi. Ratuje zarówno przekroczony
    // limit zapytania, jak i zwykłe kaprysy modelu przy długiej odpowiedzi.
    const POOL_MAIN = 110;
    const POOL_FALLBACK = 70;
    let pool = pickPool(catalog, POOL_MAIN);
    let meals = await attempt('', pool, 1800);
    if (!meals) {
      pool = pickPool(catalog, POOL_FALLBACK);
      meals = await attempt(
        'Odpowiedz wyłącznie poprawnym JSON-em w podanym formacie. Przepisy skróć do dwóch zdań.',
        pool,
        1400
      );
    }
    if (!meals) {
      return NextResponse.json(
        { error: 'AI nie ułożyło poprawnego planu. Spróbuj ponownie.', stage: lastReason || 'nieznany powód' },
        { status: 502 }
      );
    }
    let totals = fitToTarget(meals);

    // Skalowanie ratuje kalorie, ale nie rozkład makro. Jeśli białko wyraźnie
    // nie trafia, problem jest w doborze produktów — dajemy drugą szansę.
    let retried = false;
    const missOf = (v: number, t: number) => (t > 0 ? Math.abs(v - t) / t : 0);
    const proteinMiss = missOf(totals.protein, targets.protein);
    if (proteinMiss > 0.25) {
      retried = true;
      const tooLow = totals.protein < targets.protein;
      const second = await attempt(
        `Poprzednia próba dała ${totals.protein} g białka przy celu ${targets.protein} g — ${tooLow ? 'za mało' : 'za dużo'}. ` +
          `Dobierz produkty ${tooLow ? 'bogatsze' : 'uboższe'} w białko ` +
          `(np. twaróg, skyr, pierś z kurczaka, ryby, odżywka białkowa). Zachowaj prostotę i polskie zwyczaje posiłków.`,
        pool,
        1800
      );
      if (second) {
        const secondTotals = fitToTarget(second);
        if (missOf(secondTotals.protein, targets.protein) < proteinMiss) {
          meals = second;
          totals = secondTotals;
        }
      }
    }

    // Lista zakupów — te same produkty z różnych posiłków sumujemy.
    const shoppingMap = new Map<string, number>();
    for (const m of meals) {
      for (const i of m.ingredients) shoppingMap.set(i.name, (shoppingMap.get(i.name) ?? 0) + i.grams);
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
      catalogSize: pool.length,
      // Wszystkie wartości pochodzą z bazy — nic nie jest szacunkiem modelu.
      matched: count,
      totalIngredients: count,
    });
  } catch (e) {
    console.error('POST /api/ai/meal-plan', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

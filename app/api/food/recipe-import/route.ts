import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';
import { GROQ_MODEL, AI_EXTRA, aiMaxTokens, aiContent } from '@/lib/ai';

/**
 * Import przepisu z adresu strony kulinarnej.
 *
 * Blogi kulinarne opisują przepisy w schema.org/Recipe — albo jako JSON-LD,
 * albo jako mikrodane w HTML. Sporo polskich stron (m.in. aniagotuje.pl)
 * publikuje przy tym gotową tabelę wartości odżywczych. Wtedy nie ma czego
 * liczyć ani zgadywać: bierzemy liczby od autora przepisu.
 *
 * Kolejność prób:
 *   1. wartości odżywcze podane na 100 g   → używamy wprost (najdokładniejsze),
 *   2. wartości na porcję + liczba porcji + masa całości → przeliczamy,
 *   3. sama lista składników + masa całości → mapujemy składniki na produkty
 *      z naszej bazy i liczymy sami (jak w pozostałych funkcjach AI),
 *   4. nic z powyższych → uczciwy komunikat, że się nie da.
 *
 * Zwraca propozycję produktu — zapis robi front przez POST /api/food/products.
 */

const UA = 'OzpartsWorkoutApp/1.0 (patryk@ozparts.eu)';
const MAX_HTML = 900_000; // większych stron nie ma sensu parsować

const r1 = (x: number) => Math.round(x * 10) / 10;

/** Liczba z tekstu w rodzaju „309 kcal", „5 g", „1,5 szklanki". */
function num(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = String(s).replace(/ /g, ' ').match(/(-?\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** Wartość mikrodanych: albo z atrybutu content, albo z treści znacznika. */
function microValue(html: string, prop: string): string | null {
  const attr = new RegExp(`<[^>]*itemprop=["']${prop}["'][^>]*content=["']([^"']+)["']`, 'i').exec(html);
  if (attr) return decodeEntities(attr[1]).trim();
  const attr2 = new RegExp(`<[^>]*content=["']([^"']+)["'][^>]*itemprop=["']${prop}["']`, 'i').exec(html);
  if (attr2) return decodeEntities(attr2[1]).trim();
  const tag = new RegExp(`<(\\w+)[^>]*itemprop=["']${prop}["'][^>]*>([\\s\\S]*?)</\\1>`, 'i').exec(html);
  return tag ? stripTags(tag[2]) : null;
}

function microValues(html: string, prop: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<(\\w+)[^>]*itemprop=["']${prop}["'][^>]*>([\\s\\S]*?)</\\1>`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const v = stripTags(m[2]);
    if (v) out.push(v);
  }
  if (out.length === 0) {
    const reAttr = new RegExp(`<[^>]*itemprop=["']${prop}["'][^>]*content=["']([^"']+)["']`, 'gi');
    while ((m = reAttr.exec(html)) !== null) out.push(decodeEntities(m[1]).trim());
  }
  return out;
}

type Extracted = {
  name: string | null;
  yieldText: string | null;
  ingredients: string[];
  instructions: string | null;
  nutrition: { kcal: number | null; protein: number | null; carbs: number | null; fat: number | null };
  nutritionText: string;
};

/** Najpierw JSON-LD (najpewniejszy), potem mikrodane. */
function extract(html: string): Extracted {
  const empty: Extracted = {
    name: null, yieldText: null, ingredients: [], instructions: null,
    nutrition: { kcal: null, protein: null, carbs: null, fat: null }, nutritionText: '',
  };

  // --- JSON-LD ---
  const scripts = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)];
  const findRecipe = (node: unknown): Record<string, unknown> | null => {
    if (!node || typeof node !== 'object') return null;
    if (Array.isArray(node)) {
      for (const n of node) {
        const r = findRecipe(n);
        if (r) return r;
      }
      return null;
    }
    const o = node as Record<string, unknown>;
    const t = o['@type'];
    if (t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'))) return o;
    if (o['@graph']) return findRecipe(o['@graph']);
    return null;
  };

  for (const s of scripts) {
    try {
      const rec = findRecipe(JSON.parse(s[1]));
      if (!rec) continue;
      const n = (rec.nutrition || {}) as Record<string, unknown>;
      const instr = rec.recipeInstructions;
      return {
        name: typeof rec.name === 'string' ? rec.name : null,
        yieldText: Array.isArray(rec.recipeYield) ? String(rec.recipeYield[0]) : rec.recipeYield ? String(rec.recipeYield) : null,
        ingredients: Array.isArray(rec.recipeIngredient) ? rec.recipeIngredient.map(String) : [],
        instructions: Array.isArray(instr)
          ? instr.map((x) => (typeof x === 'string' ? x : (x as { text?: string })?.text || '')).filter(Boolean).join(' ')
          : typeof instr === 'string'
            ? instr
            : null,
        nutrition: {
          kcal: num(n.calories as string),
          protein: num(n.proteinContent as string),
          carbs: num(n.carbohydrateContent as string),
          fat: num(n.fatContent as string),
        },
        nutritionText: JSON.stringify(n),
      };
    } catch {
      /* niepoprawny JSON-LD — próbujemy dalej */
    }
  }

  // --- mikrodane ---
  if (!/itemtype=["'][^"']*schema\.org\/Recipe/i.test(html)) return empty;

  const nutBlock =
    /<[^>]*itemprop=["']nutrition["'][\s\S]{0,4000}?<\/(?:span|div|section|ul)>/i.exec(html)?.[0] ?? html;

  return {
    name: microValue(html, 'name'),
    yieldText: microValue(html, 'recipeYield'),
    ingredients: microValues(html, 'recipeIngredient'),
    instructions: microValues(html, 'recipeInstructions').join(' ') || null,
    nutrition: {
      kcal: num(microValue(nutBlock, 'calories')),
      protein: num(microValue(nutBlock, 'proteinContent')),
      carbs: num(microValue(nutBlock, 'carbohydrateContent')),
      fat: num(microValue(nutBlock, 'fatContent')),
    },
    nutritionText: stripTags(nutBlock).slice(0, 400),
  };
}

/** Blokada adresów wewnętrznych — endpoint pobiera dowolny URL od użytkownika. */
function safeUrl(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const h = u.hostname.toLowerCase();
  if (
    h === 'localhost' ||
    h.endsWith('.local') ||
    /^\d+\.\d+\.\d+\.\d+$/.test(h) &&
      (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(h))
  ) {
    return null;
  }
  return u;
}

export async function POST(request: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const url = safeUrl(String(body?.url || ''));
    if (!url) return NextResponse.json({ error: 'Podaj poprawny adres przepisu' }, { status: 400 });

    let html: string;
    try {
      const res = await fetch(url.toString(), {
        headers: { 'User-Agent': UA, Accept: 'text/html' },
        signal: AbortSignal.timeout(15000),
        redirect: 'follow',
      });
      if (!res.ok) return NextResponse.json({ error: `Strona odpowiedziała błędem ${res.status}` }, { status: 502 });
      html = (await res.text()).slice(0, MAX_HTML);
    } catch {
      return NextResponse.json({ error: 'Nie udało się pobrać strony' }, { status: 502 });
    }

    const rec = extract(html);
    if (!rec.name && rec.ingredients.length === 0) {
      return NextResponse.json(
        { error: 'Na tej stronie nie znalazłem przepisu w formacie, który umiem odczytać.' },
        { status: 422 }
      );
    }

    const yieldGrams = rec.yieldText ? num(rec.yieldText) : null;
    // „820 g ciasta" to masa całości; „6 porcji" to liczba porcji — rozróżniamy po jednostce.
    const yieldIsWeight = Boolean(rec.yieldText && /\d\s*(g|gram|kg)\b/i.test(rec.yieldText));
    const totalWeight = yieldIsWeight ? (/(kg)/i.test(rec.yieldText!) ? (yieldGrams ?? 0) * 1000 : yieldGrams) : null;
    const servings = !yieldIsWeight && yieldGrams && yieldGrams > 0 && yieldGrams < 100 ? yieldGrams : null;

    const n = rec.nutrition;
    const per100Declared = /w\s*100\s*g|na\s*100\s*g|100\s*g\b/i.test(rec.nutritionText);

    // ── Ścieżka 1: autor podał wartości na 100 g ──────────────────────────
    if (n.kcal && per100Declared) {
      return NextResponse.json({
        source: 'strona (na 100 g)',
        name: rec.name,
        kcal100: Math.round(n.kcal),
        protein100: r1(n.protein ?? 0),
        carbs100: r1(n.carbs ?? 0),
        fat100: r1(n.fat ?? 0),
        servingLabel: rec.yieldText,
        servingG: null,
        totalWeight,
        ingredients: rec.ingredients,
        recipe: rec.instructions?.slice(0, 2000) ?? null,
        note: 'Wartości pochodzą wprost z przepisu, podane na 100 g.',
      });
    }

    // ── Ścieżka 2: wartości na porcję + znana masa całości ────────────────
    if (n.kcal && servings && totalWeight && totalWeight > 0) {
      const portionG = totalWeight / servings;
      const k = 100 / portionG;
      return NextResponse.json({
        source: 'strona (na porcję, przeliczone)',
        name: rec.name,
        kcal100: Math.round(n.kcal * k),
        protein100: r1((n.protein ?? 0) * k),
        carbs100: r1((n.carbs ?? 0) * k),
        fat100: r1((n.fat ?? 0) * k),
        servingLabel: rec.yieldText,
        servingG: Math.round(portionG),
        totalWeight,
        ingredients: rec.ingredients,
        recipe: rec.instructions?.slice(0, 2000) ?? null,
        note: `Przeliczone z wartości na porcję (${Math.round(portionG)} g).`,
      });
    }

    // ── Ścieżka 3: liczymy sami ze składników ─────────────────────────────
    if (rec.ingredients.length === 0 || !process.env.GROQ_API_KEY) {
      return NextResponse.json(
        { error: 'Przepis nie ma tabeli wartości odżywczych, a składników nie udało się odczytać.' },
        { status: 422 }
      );
    }

    const catalog = await prisma.foodProduct.findMany({
      where: { OR: [{ source: 'SEED' }, { source: 'OWN' }] },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, kcal100: true, protein100: true, carbs100: true, fat100: true },
    });
    if (catalog.length < 20) {
      return NextResponse.json({ error: 'Za mało produktów w bazie — uruchom „npm run db:food".' }, { status: 400 });
    }

    const menu = catalog.map((p, i) => `${i} ${p.name}`).join('\n');
    const systemPrompt = `Zamieniasz listę składników przepisu na pozycje z ZAMKNIĘTEJ LISTY produktów.

ZASADY:
1. Tylko numery z listy. Nic nie wymyślaj.
2. Przelicz miary domowe na gramy (szklanka mąki ~120 g, szklanka cukru ~200 g, łyżka oleju ~10 g,
   łyżka masła ~15 g, jajko ~55 g, szczypta ~1 g). Jeśli w składniku podano gramaturę, użyj jej.
3. Składniki bez znaczenia kalorycznego (woda, sól, soda, przyprawy) pomiń.
4. NIE podawaj kalorii — policzy je system.
5. Odpowiedz tylko w JSON: {"skladniki":[{"id":3,"gramy":240}]}

LISTA PRODUKTÓW:
${menu}`;

    const aiRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GROQ_MODEL,
        ...AI_EXTRA,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Składniki przepisu „${rec.name ?? ''}":\n${rec.ingredients.join('\n')}` },
        ],
        max_tokens: aiMaxTokens(800),
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!aiRes.ok) return NextResponse.json({ error: 'AI nie odpowiedziało przy przeliczaniu składników.' }, { status: 502 });

    let parsed: { skladniki?: { id?: number; gramy?: number }[] };
    try {
      parsed = JSON.parse(aiContent(await aiRes.json()) || '{}');
    } catch {
      return NextResponse.json({ error: 'AI zwróciło niepoprawny format.' }, { status: 502 });
    }

    let kcal = 0, protein = 0, carbs = 0, fat = 0, weight = 0;
    for (const s of parsed.skladniki ?? []) {
      const idx = Math.trunc(Number(s.id));
      const g = Number(s.gramy);
      if (!Number.isInteger(idx) || idx < 0 || idx >= catalog.length) continue;
      if (!Number.isFinite(g) || g <= 0 || g > 5000) continue;
      const p = catalog[idx];
      const f = g / 100;
      kcal += p.kcal100 * f;
      protein += p.protein100 * f;
      carbs += p.carbs100 * f;
      fat += p.fat100 * f;
      weight += g;
    }
    if (weight <= 0) {
      return NextResponse.json({ error: 'Nie udało się dopasować składników do bazy.' }, { status: 422 });
    }

    // Masa gotowego dania bywa mniejsza od sumy składników (odparowanie przy
    // pieczeniu). Jeśli autor podał masę całości, ufamy jej.
    const finalWeight = totalWeight && totalWeight > 0 ? totalWeight : weight;
    const k = 100 / finalWeight;

    return NextResponse.json({
      source: 'wyliczone ze składników',
      name: rec.name,
      kcal100: Math.round(kcal * k),
      protein100: r1(protein * k),
      carbs100: r1(carbs * k),
      fat100: r1(fat * k),
      servingLabel: rec.yieldText,
      servingG: servings && finalWeight ? Math.round(finalWeight / servings) : null,
      totalWeight: Math.round(finalWeight),
      ingredients: rec.ingredients,
      recipe: rec.instructions?.slice(0, 2000) ?? null,
      note:
        totalWeight && totalWeight > 0
          ? `Policzone ze składników, podzielone przez podaną masę ${Math.round(totalWeight)} g.`
          : `Policzone ze składników. Masa całości oszacowana na ${Math.round(weight)} g — jeśli danie się piecze i odparowuje, realna kaloryczność na 100 g będzie wyższa.`,
    });
  } catch (e) {
    console.error('POST /api/food/recipe-import', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';
import { GROQ_MODEL, AI_EXTRA, aiMaxTokens, aiContent } from '@/lib/ai';

/**
 * Rozpoznanie posiłku opisanego zwykłym zdaniem.
 *
 * Wpisujesz „pulpety, puree i surówka" albo „dwie kanapki z szynką", a model
 * rozbija to na pozycje z naszego katalogu i proponuje gramatury. Tak samo jak
 * w generatorze jadłospisu: model NIE podaje żadnych kalorii, wybiera tylko
 * numery produktów z zamkniętej listy. Makro liczy serwer z bazy.
 *
 * Zwraca propozycję do zatwierdzenia — nic nie zapisuje. Zapis idzie przez
 * POST /api/food/diary/plan (jedna pozycja w dzienniku, ze składem i przepisem).
 */

type AiOut = {
  nazwa?: string;
  skladniki?: { id?: number | string; gramy?: number }[];
  nierozpoznane?: string[];
};

const r1 = (x: number) => Math.round(x * 10) / 10;

function tidyGrams(g: number): number {
  if (g >= 100) return Math.round(g / 10) * 10;
  if (g >= 20) return Math.round(g / 5) * 5;
  return Math.max(1, Math.round(g));
}

export async function POST(request: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({ error: 'Brak klucza GROQ_API_KEY' }, { status: 502 });
    }

    const body = await request.json().catch(() => ({}));
    const text = String(body?.text || '').trim().slice(0, 300);
    if (text.length < 3) return NextResponse.json({ error: 'Opisz posiłek w kilku słowach' }, { status: 400 });

    const select = {
      id: true, name: true, brand: true, kcal100: true, protein100: true,
      carbs100: true, fat100: true, servingG: true,
    };

    const [seedRows, ownRows] = await Promise.all([
      prisma.foodProduct.findMany({ where: { source: 'SEED' }, orderBy: { name: 'asc' }, select }),
      prisma.foodProduct.findMany({
        where: { source: { not: 'SEED' } },
        orderBy: [{ usageCount: 'desc' }, { updatedAt: 'desc' }],
        take: 60,
        select,
      }),
    ]);

    const catalog = [...seedRows, ...ownRows].filter((p) => p.kcal100 > 0);
    if (catalog.length < 20) {
      return NextResponse.json(
        { error: 'Za mało produktów w bazie. Uruchom „npm run db:food".' },
        { status: 400 }
      );
    }

    // Typowa porcja w liście pomaga modelowi trafić z gramaturą, gdy użytkownik
    // jej nie podał („zjadłem pulpety" → 200 g, a nie 100 g z sufitu).
    const menu = catalog
      .map((p, i) => `${i} ${p.brand ? p.brand + ' ' : ''}${p.name}${p.servingG ? ` (porcja ~${Math.round(p.servingG)}g)` : ''}`)
      .join('\n');

    const systemPrompt = `Rozbijasz opis posiłku na składniki z ZAMKNIĘTEJ LISTY produktów.

ZASADY:
1. Używaj wyłącznie numerów z listy. Nie wymyślaj produktów.
2. Jeśli użytkownik podał ilość („dwie kanapki", „150 g ryżu", „trzy jajka"), przelicz ją na gramy.
3. Jeśli nie podał, przyjmij typową porcję podaną w nawiasie przy produkcie.
4. Dobieraj najbliższy sensowny odpowiednik: „pulpety" to gotowe danie z listy, nie mielone mięso.
   „Surówka" bez doprecyzowania to surówka z marchewki. „Puree" to puree ziemniaczane.
5. Czego naprawdę nie ma na liście, wpisz do "nierozpoznane" jako tekst.
6. "nazwa" to krótka nazwa całego posiłku po polsku, np. „Pulpety z puree i surówką".
7. NIE podawaj kalorii ani makroskładników — policzy je system.
8. Odpowiedz tylko w JSON.

FORMAT:
{"nazwa":"Pulpety z puree i surówką","skladniki":[{"id":12,"gramy":200},{"id":45,"gramy":200}],"nierozpoznane":[]}

LISTA PRODUKTÓW:
${menu}`;

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GROQ_MODEL,
        ...AI_EXTRA,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Posiłek: ${text}` },
        ],
        max_tokens: aiMaxTokens(700),
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      console.error('Groq parse-meal', res.status, await res.text());
      return NextResponse.json({ error: 'AI nie odpowiedziało. Spróbuj ponownie.' }, { status: 502 });
    }

    let parsed: AiOut;
    try {
      parsed = JSON.parse(aiContent(await res.json()) || '{}');
    } catch {
      return NextResponse.json({ error: 'AI zwróciło niepoprawny format.' }, { status: 502 });
    }

    const ingredients = [];
    for (const s of parsed.skladniki ?? []) {
      const idx = Math.trunc(Number(s.id));
      const gramsRaw = Number(s.gramy);
      if (!Number.isInteger(idx) || idx < 0 || idx >= catalog.length) continue;
      if (!Number.isFinite(gramsRaw) || gramsRaw <= 0 || gramsRaw > 2000) continue;

      const p = catalog[idx];
      const grams = tidyGrams(gramsRaw);
      const f = grams / 100;
      ingredients.push({
        productId: p.id,
        name: p.brand ? `${p.brand} ${p.name}` : p.name,
        grams,
        kcal: Math.round(p.kcal100 * f),
        protein: r1(p.protein100 * f),
        carbs: r1(p.carbs100 * f),
        fat: r1(p.fat100 * f),
      });
    }

    if (ingredients.length === 0) {
      return NextResponse.json(
        { error: 'Nie rozpoznałem żadnego składnika. Spróbuj prościej, np. „pulpety, puree, surówka".' },
        { status: 422 }
      );
    }

    const unmatched = Array.isArray(parsed.nierozpoznane)
      ? parsed.nierozpoznane.map((x) => String(x)).filter(Boolean).slice(0, 8)
      : [];

    return NextResponse.json({
      title: String(parsed.nazwa || text).slice(0, 120),
      ingredients,
      unmatched,
      kcal: Math.round(ingredients.reduce((s, i) => s + i.kcal, 0)),
      protein: r1(ingredients.reduce((s, i) => s + i.protein, 0)),
      carbs: r1(ingredients.reduce((s, i) => s + i.carbs, 0)),
      fat: r1(ingredients.reduce((s, i) => s + i.fat, 0)),
    });
  } catch (e) {
    console.error('POST /api/ai/parse-meal', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

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

/**
 * Nagłówki jak z przeglądarki. Polskie serwisy kulinarne żyją z reklam
 * i nieznanym klientom potrafią oddać zupełnie inną stronę: ścianę zgód
 * albo pustkę do dorenderowania w JavaScripcie. Wtedy przepisu w HTML-u
 * po prostu nie ma i parser nie ma czego szukać. To nie jest obchodzenie
 * żadnej blokady — strona jest publiczna, a pobranie ręczne, jedno na raz.
 */
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pl-PL,pl;q=0.9',
};
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

/** Sam tekst strony — bez znaczników, bez skryptów i styli. */
function pageText(html: string): string {
  return stripTags(
    html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  );
}

/**
 * Tytuł bez nazwy serwisu i bez ogona w rodzaju „przepis | Ania Gotuje".
 * Z członów rozdzielonych myślnikiem albo pionową kreską wybieramy ten, który
 * NIE jest nazwą serwisu — a przy remisie najdłuższy, bo nazwa dania jest
 * zwykle dłuższa niż nazwa strony.
 */
function cleanTitle(raw: string | null, siteName?: string | null): string | null {
  const text = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const site = (siteName ?? '').trim().toLowerCase();
  const parts = text.split(/\s+[-–—|]\s+/).map((x) => x.trim()).filter(Boolean);
  if (parts.length <= 1) return text.slice(0, 120);
  const candidates = parts.filter((x) => {
    const low = x.toLowerCase();
    if (site && low === site) return false;
    // Same słowa serwisowe też odpadają: „przepis", „przepisy", „blog kulinarny".
    return !/^(przepis\w*|blog\w*|kuchnia|gotowanie)$/i.test(low);
  });
  const pool = candidates.length > 0 ? candidates : parts;
  return pool.reduce((a, b) => (b.length > a.length ? b : a)).slice(0, 120);
}

/** Słowa z adresu przepisu: /przepis/jak-zrobic-ciasto-na-nalesniki → [jak, zrobic, ...]. */
function slugWords(url: string): string[] {
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop() ?? '';
    return last
      .split('-')
      .map((w) => w.toLowerCase())
      .filter((w) => w.length >= 4); // krótkie spójniki nic nie wnoszą
  } catch {
    return [];
  }
}

/**
 * Wybór tytułu spośród kandydatów ze strony.
 *
 * Samo „pierwsze <h1>" nie wystarcza: w wielu szablonach pierwszy nagłówek to
 * logo serwisu, a nazwa przepisu jest dopiero w kolejnym. Rozstrzyga ADRES —
 * slug zawiera nazwę dania, więc wybieramy kandydata, który pokrywa się z nim
 * najbardziej. Przy zerowym pokryciu zostaje pierwszy sensowny.
 */
function pickTitle(html: string, url: string, siteName?: string | null): string | null {
  const raw: string[] = [];
  for (const m of html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)) raw.push(stripTags(m[1]));
  const og = /<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i.exec(html)
    ?? /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:title["']/i.exec(html);
  if (og) raw.push(decodeEntities(og[1]));
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (title) raw.push(stripTags(title[1]));

  const site = (siteName ?? '').trim().toLowerCase();
  const candidates = raw
    .slice(0, 6)
    .map((t) => cleanTitle(t, siteName))
    .filter((t): t is string => Boolean(t && t.length >= 3))
    .filter((t) => !site || t.toLowerCase() !== site);
  if (candidates.length === 0) return null;

  const words = slugWords(url);
  const score = (t: string) => {
    const n = t
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ł/gi, 'l')
      .toLowerCase();
    return words.filter((w) => n.includes(w.slice(0, Math.max(4, w.length - 2)))).length;
  };
  return candidates.reduce((best, t) => (score(t) > score(best) ? t : best));
}

/**
 * Odczyt z samego TEKSTU strony — ostatnia deska ratunku, gdy nie ma ani
 * JSON-LD, ani mikrodanych.
 *
 * Blogi kulinarne przebudowują szablony i dane strukturalne bywają wtedy
 * gubione, ale tabela wartości odżywczych zostaje na stronie tam, gdzie była,
 * bo czyta ją człowiek. Etykiety są w polskich przepisach powtarzalne
 * („Wartość energetyczna", „Białko", „Tłuszcze", „Węglowodany"), więc da się je
 * odczytać nie zgadując niczego: bierzemy pierwszą liczbę po każdej etykiecie,
 * w oknie tuż za nagłówkiem tabeli.
 */
function fromText(html: string, url: string): Extracted {
  const out: Extracted = {
    name: null, yieldText: null, ingredients: [], instructions: null,
    nutrition: { kcal: null, protein: null, carbs: null, fat: null }, nutritionText: '',
  };

  const siteName = /<meta[^>]+property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i.exec(html)?.[1];
  out.name = pickTitle(html, url, siteName);

  const text = pageText(html);

  // Wydajność — „4 porcje", „Liczba porcji: 4", „ok. 1200 g"
  const y = /(?:liczba\s+porcji|wydajno[śs][cć]|porcje?)\s*:?\s*([^.;]{0,50})/i.exec(text);
  // Ucinamy na nagłówku następnej sekcji — bez tego do etykiety porcji wpada
  // początek tabeli wartości odżywczych i wygląda to jak śmieć.
  if (y) out.yieldText = y[0].split(/warto[śs][cć]|sk[łl]adnik/i)[0].slice(0, 60).trim();

  // Tabela wartości odżywczych. Nagłówek „Wartości odżywcze" potrafi wystąpić
  // na stronie kilka razy (menu, spis treści, dopiero potem tabela), więc
  // przechodzimy WSZYSTKIE wystąpienia i bierzemy pierwsze, w którym faktycznie
  // są liczby. Wcześniejsza wersja patrzyła tylko na pierwsze trafienie
  // i przy takim układzie strony uznawała, że tabeli nie ma — a potem liczyła
  // wartości ze składników, choć autor podał je wprost.
  const heading = /warto[śs][cć](?:i|)\s*(?:energetyczn|od[żz]ywcz)/gi;
  let m: RegExpExecArray | null;
  while ((m = heading.exec(text)) !== null) {
    const win = text.slice(m.index, m.index + 600);
    // Samo „w 100 g" jest liczbą stojącą tuż za etykietą i bez usunięcia go
    // z tekstu roboczego „Białko w 100 g: 12" odczytałoby się jako 100.
    // Oryginalne okno zostaje w nutritionText — to po nim poznajemy, że tabela
    // dotyczy 100 g.
    const clean = win.replace(/(?:w|na)\s*100\s*(?:g|ml|gram\w*)/gi, ' ');

    // Pierwsza liczba PO etykiecie. „Tłuszcze 15 g, w tym nasycone 6 g" → 15.
    const after = (re: RegExp): number | null => {
      const mm = re.exec(clean);
      return mm ? num(mm[1]) : null;
    };
    const kcal =
      after(/(?:warto[śs][cć]\s+energetyczn\w*|kaloryczno[śs][cć]|energia)\D{0,12}([\d.,]+)/i)
      ?? num(/([\d.,]+)\s*kcal/i.exec(clean)?.[1] ?? null);
    if (!kcal) continue; // nagłówek bez liczb — to nie ta sekcja

    out.nutrition = {
      kcal,
      protein: after(/bia[łl]ko\D{0,12}([\d.,]+)/i),
      carbs: after(/w[ęe]glowodan\w*\D{0,12}([\d.,]+)/i),
      fat: after(/t[łl]uszcz\w*\D{0,12}([\d.,]+)/i),
    };
    out.nutritionText = win.slice(0, 400);
    break;
  }
  return out;
}

/** Najpierw JSON-LD (najpewniejszy), potem mikrodane, na końcu goły tekst. */
function extract(html: string, url: string): Extracted {
  const structured = extractStructured(html);
  // Tekst uzupełnia tylko to, czego dane strukturalne nie dały — nie nadpisuje.
  const t = fromText(html, url);
  const hasNutrition = structured.nutrition.kcal !== null;
  return {
    // Tytuł ze strony ma pierwszeństwo: w mikrodanych `name` bywa nazwą serwisu.
    name: t.name ?? structured.name,
    yieldText: structured.yieldText ?? t.yieldText,
    ingredients: structured.ingredients.length > 0 ? structured.ingredients : t.ingredients,
    instructions: structured.instructions ?? t.instructions,
    nutrition: hasNutrition ? structured.nutrition : t.nutrition,
    nutritionText: hasNutrition ? structured.nutritionText : t.nutritionText,
  };
}

function extractStructured(html: string): Extracted {
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

/**
 * Wydajność przepisu. Pole `recipeYield` bywa jednym zdaniem zawierającym
 * OBIE informacje naraz: „4 porcje - około 1200 g". Wcześniejsza wersja brała
 * po prostu pierwszą liczbę z tekstu i sprawdzała, czy gdziekolwiek dalej
 * stoi „g" — przy takim zapisie wychodziło, że całe danie waży 4 gramy,
 * a liczby na 100 g robiły się 25 razy za duże.
 *
 * Teraz masa i liczba porcji są wyłuskiwane niezależnie, każda po swojej
 * jednostce, i obie przechodzą test zdrowego rozsądku.
 */
function parseYield(text: string | null): { servings: number | null; totalWeight: number | null } {
  if (!text) return { servings: null, totalWeight: null };
  const t = text.replace(/ /g, ' ').toLowerCase();
  const val = (m: RegExpExecArray | null) => (m ? parseFloat(m[1].replace(',', '.')) : null);

  // Masa całości — kilogramy mają pierwszeństwo, bo „1,2 kg" zawiera też „g".
  const kg = val(/(\d+(?:[.,]\d+)?)\s*kg\b/.exec(t));
  const g = val(/(\d+(?:[.,]\d+)?)\s*g(?:ram(?:ów|y|a)?)?\b/.exec(t));
  const l = val(/(\d+(?:[.,]\d+)?)\s*l\b/.exec(t));
  const ml = val(/(\d+(?:[.,]\d+)?)\s*ml\b/.exec(t));
  let totalWeight =
    kg !== null ? kg * 1000 : ml !== null ? ml : g !== null ? g : l !== null ? l * 1000 : null;

  // Liczba porcji — po słowie, a nie po pozycji w zdaniu.
  let servings = val(/(\d+(?:[.,]\d+)?)\s*(?:porcj\w*|kawałk\w*|sztuk\w*|osob\w*|plastr\w*|plack\w*)/.exec(t));
  // „porcje: 4" albo samo „4" — jedyna liczba w tekście bez jednostki masy.
  if (servings === null && totalWeight === null) servings = val(/(\d{1,2})/.exec(t));

  // Danie ważące 4 g albo mające 200 porcji to błąd odczytu, nie przepis.
  if (servings !== null && !(servings >= 1 && servings <= 60)) servings = null;
  if (totalWeight !== null && !(totalWeight >= 50 && totalWeight <= 20000)) totalWeight = null;

  return { servings, totalWeight };
}

/** Czy strona sama pisze, że tabela dotyczy 100 g (nagłówek bywa poza blokiem). */
function per100InPage(html: string): boolean {
  const text = pageText(html);
  // Nagłówek i dopisek „w 100 g" bywają oddzielone całą komórką tabeli, więc
  // okno musi być szersze niż jedno zdanie. Dopuszczamy też „na 100 gramów".
  return /warto[śs][cć]\w*\s+(?:od[żz]ywcz|energetyczn)\w*[\s\S]{0,200}?(?:w|na)\s*100\s*(?:g\b|ml\b|gram)/i.test(text);
}

type AiItem = Record<string, unknown>;

/**
 * Wyłuskanie listy składników z odpowiedzi modelu.
 *
 * Prompt prosi o `{"skladniki":[…]}`, ale model bywa uczynny i odsyła
 * `{"składniki":…}` z polskimi znakami, `{"ingredients":…}`, albo od razu samą
 * tablicę. Wcześniej liczyło się tylko dosłowne `skladniki`, więc każda z tych
 * odpowiedzi kończyła się komunikatem „nie udało się dopasować składników" —
 * mimo że model odpowiedział poprawnie.
 *
 * Bierzemy pierwszą tablicę obiektów, jaka jest w odpowiedzi. To bezpieczne:
 * liczby i tak przechodzą walidację, a `id` musi trafić w zamkniętą listę.
 */
function pickItems(parsed: unknown): AiItem[] {
  const isList = (v: unknown): v is AiItem[] =>
    Array.isArray(v) && v.length > 0 && v.every((x) => x !== null && typeof x === 'object');

  if (isList(parsed)) return parsed;
  if (!parsed || typeof parsed !== 'object') return [];
  for (const v of Object.values(parsed as Record<string, unknown>)) {
    if (isList(v)) return v;
  }
  return [];
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
        headers: HEADERS,
        signal: AbortSignal.timeout(15000),
        redirect: 'follow',
      });
      if (!res.ok) return NextResponse.json({ error: `Strona odpowiedziała błędem ${res.status}` }, { status: 502 });
      html = (await res.text()).slice(0, MAX_HTML);
    } catch {
      return NextResponse.json({ error: 'Nie udało się pobrać strony' }, { status: 502 });
    }

    const rec = extract(html, url.toString());
    if (!rec.name && rec.ingredients.length === 0 && rec.nutrition.kcal === null) {
      // Diagnostyka w komunikacie: bez niej każdy nieudany import wygląda tak
      // samo i nie wiadomo, czy zawiodło pobranie, czy odczyt.
      const has = (re: RegExp) => (re.test(html) ? 'tak' : 'nie');
      return NextResponse.json(
        {
          error: 'Na tej stronie nie znalazłem przepisu w formacie, który umiem odczytać.',
          stage:
            `odczyt strony · ${Math.round(html.length / 1024)} kB · ` +
            `ld+json: ${has(/application\/ld\+json/i)} · ` +
            `mikrodane: ${has(/schema\.org\/Recipe/i)} · ` +
            `tabela w tekście: ${has(/warto[śs][cć]\w*\s+(?:od[żz]ywcz|energetyczn)/i)}`,
        },
        { status: 422 }
      );
    }

    const { servings, totalWeight } = parseYield(rec.yieldText);

    const n = rec.nutrition;
    // Nagłówek „Wartości odżywcze (w 100 g)" bardzo często stoi OBOK bloku
    // z liczbami, a nie w środku — dlatego szukamy go też w treści strony.
    const per100Declared =
      /w\s*100\s*(?:g|ml)|na\s*100\s*(?:g|ml)|100\s*(?:g|ml)\b|100\s*gram/i.test(rec.nutritionText) || per100InPage(html);

    // Autor podał tabelę, ale nie napisał, czego dotyczy — i nie ma jak tego
    // przeliczyć (brak liczby porcji albo masy całości). Polskie blogi kulinarne
    // podają wartości na 100 g praktycznie zawsze, a liczenie ze składników ma
    // systematyczne błędy (woda w cieście, okrasa do podania), więc przyjmujemy
    // 100 g i mówimy o tym wprost — wartości i tak są do sprawdzenia w formularzu.
    const assumePer100 =
      !per100Declared && n.kcal !== null && n.kcal > 0 && n.kcal <= 900 && !(servings && totalWeight);

    // ── Ścieżka 1: autor podał wartości na 100 g ──────────────────────────
    if (n.kcal && (per100Declared || assumePer100)) {
      // Gdy znamy i masę całości, i liczbę porcji, od razu wyliczamy porcję —
      // dzięki temu przy dodawaniu do dziennika jest gotowy przycisk „porcja".
      const portionG = servings && totalWeight ? Math.round(totalWeight / servings) : null;
      return NextResponse.json({
        source: 'strona (na 100 g)',
        name: rec.name,
        kcal100: Math.round(n.kcal),
        protein100: r1(n.protein ?? 0),
        carbs100: r1(n.carbs ?? 0),
        fat100: r1(n.fat ?? 0),
        servingLabel: rec.yieldText,
        servingG: portionG,
        totalWeight,
        ingredients: rec.ingredients,
        recipe: rec.instructions?.slice(0, 2000) ?? null,
        note: assumePer100
          ? 'Wartości wprost z przepisu. Autor nie napisał, czego dotyczy tabela — przyjąłem, że 100 g, bo tak podaje się je na polskich blogach. Sprawdź je przed zapisaniem.'
          : portionG
            ? `Wartości wprost z przepisu, podane na 100 g. Porcja wychodzi ${portionG} g.`
            : 'Wartości pochodzą wprost z przepisu, podane na 100 g.',
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
        {
          error: 'Przepis nie ma tabeli wartości odżywczych, a składników nie udało się odczytać.',
          stage: n.kcal ? 'tabela jest, ale bez informacji, czego dotyczy' : 'brak tabeli i składników',
        },
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

    let parsed: unknown;
    try {
      parsed = JSON.parse(aiContent(await aiRes.json()) || '{}');
    } catch {
      return NextResponse.json({ error: 'AI zwróciło niepoprawny format.', stage: 'odpowiedź AI' }, { status: 502 });
    }

    const items = pickItems(parsed);

    // Co dokładnie policzyliśmy — wraca do interfejsu, żeby dało się to
    // sprawdzić okiem. Przy liczeniu ze składników to jedyny sposób, by zauważyć
    // złe dopasowanie; sama liczba na końcu niczego nie zdradza.
    const used: { name: string; grams: number }[] = [];
    let kcal = 0, protein = 0, carbs = 0, fat = 0, weight = 0;
    for (const s of items) {
      const idx = Math.trunc(Number(s.id ?? s.nr ?? s.index ?? s.numer));
      const g = Number(s.gramy ?? s.grams ?? s.g ?? s.ilosc ?? s.ilość);
      if (!Number.isInteger(idx) || idx < 0 || idx >= catalog.length) continue;
      if (!Number.isFinite(g) || g <= 0 || g > 5000) continue;
      const p = catalog[idx];
      const f = g / 100;
      kcal += p.kcal100 * f;
      protein += p.protein100 * f;
      carbs += p.carbs100 * f;
      fat += p.fat100 * f;
      weight += g;
      used.push({ name: p.name, grams: Math.round(g) });
    }
    if (weight <= 0) {
      return NextResponse.json(
        {
          error:
            'Nie udało się dopasować składników do bazy. Przepisz wartości z przepisu ręcznie albo dodaj brakujące produkty do katalogu.',
          stage: `mapowanie składników · pozycji od AI: ${items.length} · składników w przepisie: ${rec.ingredients.length}`,
        },
        { status: 422 }
      );
    }

    // Masa gotowego dania bywa mniejsza od sumy składników (odparowanie przy
    // pieczeniu). Jeśli autor podał masę całości, ufamy jej — ale tylko wtedy,
    // gdy nie kłóci się rażąco z tym, co daje suma składników. Odczytana z błędem
    // masa całości potrafiła podnieść wynik kilkunastokrotnie.
    const declaredIsSane =
      totalWeight !== null && totalWeight > 0 && totalWeight >= weight * 0.4 && totalWeight <= weight * 1.6;
    const finalWeight = declaredIsSane ? totalWeight! : weight;
    const k = 100 / finalWeight;

    // Nic naturalnego nie ma powyżej 900 kcal/100 g (czysty tłuszcz to 884).
    // Lepszy uczciwy komunikat niż propozycja, która wygląda na wynik obliczeń.
    const kcal100 = Math.round(kcal * k);
    if (kcal100 > 900) {
      return NextResponse.json(
        {
          error: `Z tego przepisu wychodzi ${kcal100} kcal na 100 g, co jest niemożliwe — coś odczytałem źle. Wpisz wartości ręcznie.`,
          stage: 'kontrola sensowności wyniku',
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      source: 'wyliczone ze składników',
      name: rec.name,
      kcal100,
      protein100: r1(protein * k),
      carbs100: r1(carbs * k),
      fat100: r1(fat * k),
      servingLabel: rec.yieldText,
      servingG: servings ? Math.round(finalWeight / servings) : null,
      totalWeight: Math.round(finalWeight),
      ingredients: rec.ingredients,
      used,
      recipe: rec.instructions?.slice(0, 2000) ?? null,
      note:
        (declaredIsSane
          ? `Policzone ze składników, podzielone przez podaną masę ${Math.round(finalWeight)} g.`
          : `Policzone ze składników. Masa całości oszacowana na ${Math.round(weight)} g — jeśli danie się piecze i odparowuje, realna kaloryczność na 100 g będzie wyższa.`) +
        // Typowa pułapka: przepis podaje wydajność samego dania („1 kg klusek"),
        // ale lista składników obejmuje też okrasę albo sos do podania. Wtedy
        // dzielimy kalorie całości przez masę samego dania i wynik jest zawyżony.
        (declaredIsSane && weight > finalWeight * 1.25
          ? ` UWAGA: składniki ważą razem ${Math.round(weight)} g, a wydajność podano jako ${Math.round(finalWeight)} g — w przepisie są prawdopodobnie dodatki do podania (okrasa, sos), które zawyżają wynik. Sprawdź wartości przed zapisaniem.`
          : ''),
    });
  } catch (e) {
    console.error('POST /api/food/recipe-import', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

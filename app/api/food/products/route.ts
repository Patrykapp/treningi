import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';

/**
 * Katalog produktów w naszej bazie — pierwsza warstwa wyszukiwania.
 * Dopiero gdy tu nic nie ma, front pyta Open Food Facts (/api/food/search).
 *
 * Kolejność wyników: najczęściej używane na górze. Po dwóch tygodniach
 * codziennego wpisywania to załatwia większość wyszukiwań jednym kliknięciem.
 */

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(request: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').trim();
    const barcode = (searchParams.get('barcode') || '').replace(/\D/g, '');
    // dishes=1 → tylko dania złożone (mają przepis): biblioteka gotowych posiłków
    const onlyDishes = searchParams.get('dishes') === '1';
    const onlyFavorites = searchParams.get('favorites') === '1';

    if (barcode) {
      const p = await prisma.foodProduct.findUnique({ where: { barcode } });
      return NextResponse.json(p ? [p] : []);
    }

    const filters: Record<string, unknown>[] = [];
    if (q) {
      filters.push({
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { brand: { contains: q, mode: 'insensitive' } },
        ],
      });
    }
    if (onlyDishes) filters.push({ recipe: { not: null } });
    if (onlyFavorites) filters.push({ isFavorite: true });

    const products = await prisma.foodProduct.findMany({
      where: filters.length > 0 ? { AND: filters } : undefined,
      // Ulubione zawsze na górze — to one skracają codzienne wpisywanie.
      orderBy: [{ isFavorite: 'desc' }, { usageCount: 'desc' }, { updatedAt: 'desc' }],
      take: q || onlyDishes || onlyFavorites ? 40 : 20,
    });

    return NextResponse.json(products);
  } catch (e) {
    console.error('GET /api/food/products', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });

    const b = await request.json();
    const name = String(b?.name || '').trim();
    if (!name) return NextResponse.json({ error: 'Podaj nazwę' }, { status: 400 });

    const kcal100 = num(b?.kcal100, -1);
    if (kcal100 < 0) return NextResponse.json({ error: 'Podaj kalorie na 100 g' }, { status: 400 });

    const barcode = b?.barcode ? String(b.barcode).replace(/\D/g, '') || null : null;

    const data = {
      name,
      brand: b?.brand ? String(b.brand).trim() || null : null,
      kcal100,
      protein100: num(b?.protein100),
      carbs100: num(b?.carbs100),
      fat100: num(b?.fat100),
      fiber100: b?.fiber100 != null ? num(b.fiber100) : null,
      sugars100: b?.sugars100 != null ? num(b.sugars100) : null,
      salt100: b?.salt100 != null ? num(b.salt100) : null,
      servingG: b?.servingG != null ? num(b.servingG) || null : null,
      servingLabel: b?.servingLabel ? String(b.servingLabel).trim() || null : null,
      category: b?.category ? String(b.category).trim() || null : null,
      unit: b?.unit === 'ml' ? 'ml' : 'g',
      source: b?.source === 'OFF' || b?.source === 'SEED' ? String(b.source) : 'OWN',
      createdById: userId,
    };

    // Ten sam kod kreskowy = ten sam produkt. Ręczna poprawka ma nadpisać to,
    // co wcześniej wpadło automatycznie z Open Food Facts.
    const product = barcode
      ? await prisma.foodProduct.upsert({
          where: { barcode },
          update: data,
          create: { ...data, barcode },
        })
      : await prisma.foodProduct.create({ data });

    return NextResponse.json(product, { status: 201 });
  } catch (e) {
    console.error('POST /api/food/products', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

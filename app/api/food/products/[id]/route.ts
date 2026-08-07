import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Zmiana produktu w katalogu: gwiazdka ulubionego albo poprawka wartości.
 *
 * Poprawiać można KAŻDY produkt, także wbudowany (SEED) i pobrany z Open Food
 * Facts — katalog jest wspólny dla dwóch kont i to są dane referencyjne, a nie
 * prawda objawiona. Etykieta konkretnej piekarni bije wartość uśrednioną.
 *
 * Poprawiony wpis dostaje `edited = true`, dzięki czemu kolejne uruchomienie
 * `npm run db:food` go omija i korekta nie znika przy najbliższym wgraniu bazy.
 * Wpisy w dzienniku mają własny snapshot makro, więc historia zostaje taka,
 * jaka była w chwili jedzenia — poprawka działa od teraz w przód.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();

    // Ulubione są wspólne dla obu kont — aplikacja ma dwóch użytkowników
    // i wspólny katalog, więc osobna tabela byłaby tu przerostem formy.
    if (typeof body?.isFavorite === 'boolean') {
      const updated = await prisma.foodProduct.update({
        where: { id },
        data: { isFavorite: body.isFavorite },
      });
      return NextResponse.json(updated);
    }

    const hasValues = ['name', 'kcal100', 'protein100', 'carbs100', 'fat100', 'servingG', 'servingLabel', 'unit']
      .some((k) => body?.[k] !== undefined);
    if (!hasValues) return NextResponse.json({ error: 'Nic do zmiany' }, { status: 400 });

    const current = await prisma.foodProduct.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 });

    const name = body?.name !== undefined ? String(body.name).trim() : current.name;
    if (!name) return NextResponse.json({ error: 'Podaj nazwę' }, { status: 400 });

    const kcal100 = body?.kcal100 !== undefined ? num(body.kcal100, -1) : current.kcal100;
    if (!(kcal100 >= 0) || kcal100 > 900) {
      // 900 kcal/100 g to czysty tłuszcz — powyżej tego to na pewno pomyłka
      // (np. wartość na całe opakowanie wpisana jako wartość na 100 g).
      return NextResponse.json({ error: 'Kalorie na 100 g muszą mieścić się w 0–900' }, { status: 400 });
    }

    const updated = await prisma.foodProduct.update({
      where: { id },
      data: {
        name,
        kcal100,
        protein100: body?.protein100 !== undefined ? Math.max(0, num(body.protein100)) : current.protein100,
        carbs100: body?.carbs100 !== undefined ? Math.max(0, num(body.carbs100)) : current.carbs100,
        fat100: body?.fat100 !== undefined ? Math.max(0, num(body.fat100)) : current.fat100,
        servingG: body?.servingG !== undefined ? num(body.servingG) || null : current.servingG,
        servingLabel:
          body?.servingLabel !== undefined ? String(body.servingLabel).trim() || null : current.servingLabel,
        unit: body?.unit !== undefined ? (body.unit === 'ml' ? 'ml' : 'g') : current.unit,
        edited: true,
      },
    });

    return NextResponse.json(updated);
  } catch (e) {
    console.error('PATCH /api/food/products/[id]', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

// Usunięcie produktu z katalogu. Wpisy w dzienniku zostają nietknięte —
// mają własny snapshot nazwy i makro, a relacja jest SetNull.
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });

    const { id } = await params;
    const p = await prisma.foodProduct.findUnique({ where: { id }, select: { createdById: true, source: true } });
    if (!p) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 });
    // Produkty wbudowane (SEED) i pobrane automatycznie (OFF) są wspólne —
    // kasować można tylko własne wpisy.
    if (p.source !== 'OWN' || p.createdById !== userId) {
      return NextResponse.json({ error: 'Można usuwać tylko własne produkty' }, { status: 403 });
    }

    await prisma.foodProduct.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/food/products/[id]', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

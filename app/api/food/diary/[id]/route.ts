import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';

// Usunięcie wpisu z dziennika. Sprawdzamy właściciela — nikt nie kasuje
// cudzych posiłków, nawet znając id.
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });

    const { id } = await params;
    const entry = await prisma.mealEntry.findUnique({ where: { id }, select: { userId: true } });
    if (!entry) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 });
    if (entry.userId !== userId) return NextResponse.json({ error: 'Brak dostępu' }, { status: 403 });

    await prisma.mealEntry.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/food/diary/[id]', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

// Zmiana gramatury — przelicza snapshot makro z aktualnego produktu.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });

    const { id } = await params;
    const { grams } = await request.json();
    const g = typeof grams === 'number' ? grams : parseFloat(String(grams));
    if (!Number.isFinite(g) || g <= 0) return NextResponse.json({ error: 'Podaj gramaturę' }, { status: 400 });

    const entry = await prisma.mealEntry.findUnique({ where: { id }, include: { product: true } });
    if (!entry) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 });
    if (entry.userId !== userId) return NextResponse.json({ error: 'Brak dostępu' }, { status: 403 });

    // Jeśli produkt zniknął z katalogu, skalujemy stary snapshot proporcjonalnie.
    const f = g / 100;
    const scale = entry.grams > 0 ? g / entry.grams : 1;
    const updated = await prisma.mealEntry.update({
      where: { id },
      data: entry.product
        ? {
            grams: g,
            kcal: Math.round(entry.product.kcal100 * f * 10) / 10,
            protein: Math.round(entry.product.protein100 * f * 10) / 10,
            carbs: Math.round(entry.product.carbs100 * f * 10) / 10,
            fat: Math.round(entry.product.fat100 * f * 10) / 10,
          }
        : {
            grams: g,
            kcal: Math.round(entry.kcal * scale * 10) / 10,
            protein: Math.round(entry.protein * scale * 10) / 10,
            carbs: Math.round(entry.carbs * scale * 10) / 10,
            fat: Math.round(entry.fat * scale * 10) / 10,
          },
    });

    return NextResponse.json(updated);
  } catch (e) {
    console.error('PATCH /api/food/diary/[id]', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

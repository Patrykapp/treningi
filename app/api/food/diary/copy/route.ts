import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';
import { isMealKey } from '@/lib/nutrition';

/**
 * Skopiowanie wpisów z jednego dnia na inny — cały dzień albo pojedynczy
 * posiłek. Zjadamy w kółko podobne rzeczy, więc to zdejmuje większość
 * codziennego klikania.
 *
 * Kopiujemy snapshoty makro, nie przeliczamy ich od nowa: jeśli produkt
 * zmienił się w katalogu, skopiowany wpis ma zostać taki, jaki był.
 */

function dayUTC(s: unknown): Date | null {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00.000Z`) : null;
}

export async function POST(request: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });

    const body = await request.json();
    const from = dayUTC(body?.from);
    const to = dayUTC(body?.to);
    if (!from || !to) return NextResponse.json({ error: 'Podaj poprawne daty' }, { status: 400 });
    if (from.getTime() === to.getTime()) {
      return NextResponse.json({ error: 'To ten sam dzień' }, { status: 400 });
    }

    // Pusty meal = cały dzień
    const meal = typeof body?.meal === 'string' && body.meal ? String(body.meal) : null;
    if (meal && !isMealKey(meal)) return NextResponse.json({ error: 'Nieznany posiłek' }, { status: 400 });

    const source = await prisma.mealEntry.findMany({
      where: { userId, date: from, ...(meal ? { meal } : {}) },
      orderBy: { createdAt: 'asc' },
    });
    if (source.length === 0) {
      return NextResponse.json({ error: 'W dniu źródłowym nie ma nic do skopiowania' }, { status: 404 });
    }

    // Nadpisanie celu, żeby dwukrotne kliknięcie nie zdublowało posiłków.
    if (body?.replace) {
      await prisma.mealEntry.deleteMany({ where: { userId, date: to, ...(meal ? { meal } : {}) } });
    }

    await prisma.mealEntry.createMany({
      data: source.map((e) => ({
        userId,
        date: to,
        meal: e.meal,
        productId: e.productId,
        name: e.name,
        grams: e.grams,
        kcal: e.kcal,
        protein: e.protein,
        carbs: e.carbs,
        fat: e.fat,
      })),
    });

    return NextResponse.json({ ok: true, copied: source.length }, { status: 201 });
  } catch (e) {
    console.error('POST /api/food/diary/copy', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

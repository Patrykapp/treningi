import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { MEALS } from '@/lib/nutrition';

/**
 * Eksport dziennika do CSV — jeden wiersz na pozycję.
 *
 * Format pod polski Excel, bo tam ten plik trafi: średnik jako separator pól
 * (Excel w polskiej lokalizacji tak właśnie czyta CSV), przecinek jako znak
 * dziesiętny i BOM na początku, bez którego „ż" i „ł" wychodzą krzaczkami.
 *
 * Sens tego eksportu jest jeden: dane mają dać się wyjąć. Dziennik żywieniowy
 * prowadzi się latami i nie powinien być zakładnikiem jednej aplikacji.
 */

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function dayUTC(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}
const isDate = (s: string | null): s is string => Boolean(s && /^\d{4}-\d{2}-\d{2}$/.test(s));

/** Liczba po polsku: 12,5 zamiast 12.5. */
function pl(n: number, digits = 1): string {
  return n.toFixed(digits).replace('.', ',');
}

/**
 * Pole CSV. Cudzysłów zawsze, bo nazwy produktów bywają z przecinkiem
 * („Ryba smażona, panierowana"), a wewnętrzny cudzysłów podwajamy.
 */
function cell(v: string | number): string {
  return `"${String(v).replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const endParam = searchParams.get('end');
    const startParam = searchParams.get('start');

    const end = isDate(endParam) ? dayUTC(endParam) : dayUTC(iso(new Date()));
    const start = isDate(startParam) ? dayUTC(startParam) : new Date(end.getTime() - 29 * 86400000);
    if (start > end) return NextResponse.json({ error: 'Zły zakres dat' }, { status: 400 });

    const spanDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    if (spanDays > 400) return NextResponse.json({ error: 'Maksymalnie 400 dni naraz' }, { status: 400 });

    const entries = await prisma.mealEntry.findMany({
      where: { userId, date: { gte: start, lte: end } },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });

    const mealLabel = new Map<string, string>(MEALS.map((m) => [m.key, m.label]));

    const header = ['Data', 'Posiłek', 'Produkt', 'Ilość', 'Jednostka', 'kcal', 'Białko (g)', 'Węglowodany (g)', 'Tłuszcz (g)'];
    const lines = [header.map(cell).join(';')];

    for (const e of entries) {
      lines.push(
        [
          cell(iso(e.date)),
          cell(mealLabel.get(e.meal) ?? e.meal),
          cell(e.name),
          cell(pl(e.grams, 0)),
          cell(e.unit === 'ml' ? 'ml' : 'g'),
          cell(pl(e.kcal, 0)),
          cell(pl(e.protein)),
          cell(pl(e.carbs)),
          cell(pl(e.fat)),
        ].join(';')
      );
    }

    // BOM — bez niego Excel czyta plik jako Windows-1250 i psuje polskie znaki.
    const csv = '﻿' + lines.join('\r\n') + '\r\n';

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="dziennik-${iso(start)}_${iso(end)}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    console.error('GET /api/food/export', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

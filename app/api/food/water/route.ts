import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';

/**
 * Nawodnienie — jeden wiersz na dzień, dopisywany przyrostowo.
 *
 * Woda celowo nie idzie przez dziennik posiłków: nie ma makroskładników,
 * a wpadając do tych samych sum zaśmiecałaby podsumowania i listę zakupów.
 */

function dayStart(dateStr: unknown): Date {
  const s = typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
    ? dateStr
    : new Date().toISOString().slice(0, 10);
  return new Date(`${s}T00:00:00.000Z`);
}

const MAX_ML = 10000; // ponad to bardziej prawdopodobna jest literówka niż picie

export async function GET(request: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const date = dayStart(searchParams.get('date'));

    const [log, profile] = await Promise.all([
      prisma.waterLog.findUnique({ where: { userId_date: { userId, date } } }),
      prisma.nutritionProfile.findUnique({ where: { userId }, select: { waterGoalMl: true } }),
    ]);

    return NextResponse.json({ ml: log?.ml ?? 0, goalMl: profile?.waterGoalMl ?? 2500 });
  } catch (e) {
    console.error('GET /api/food/water', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

/**
 * `delta` dopisuje (także ujemnie — cofnięcie omyłkowego kliknięcia),
 * `ml` ustawia wartość wprost. Wynik nigdy nie schodzi poniżej zera.
 */
export async function POST(request: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });

    const body = await request.json();
    const date = dayStart(body?.date);

    const current = await prisma.waterLog.findUnique({ where: { userId_date: { userId, date } } });
    const base = current?.ml ?? 0;

    let next: number;
    if (typeof body?.delta === 'number' && Number.isFinite(body.delta)) {
      next = base + Math.round(body.delta);
    } else if (typeof body?.ml === 'number' && Number.isFinite(body.ml)) {
      next = Math.round(body.ml);
    } else {
      return NextResponse.json({ error: 'Podaj delta albo ml' }, { status: 400 });
    }

    next = Math.max(0, Math.min(MAX_ML, next));

    const saved = await prisma.waterLog.upsert({
      where: { userId_date: { userId, date } },
      update: { ml: next },
      create: { userId, date, ml: next },
    });

    return NextResponse.json({ ml: saved.ml });
  } catch (e) {
    console.error('POST /api/food/water', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

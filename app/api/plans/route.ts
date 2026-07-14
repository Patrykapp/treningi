import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';

const DAY_COUNT = 7;

function isValidDays(v: unknown): v is (string | null)[] {
  return Array.isArray(v) && v.length === DAY_COUNT && v.every(d => d === null || typeof d === 'string');
}

export async function GET() {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });

    const plans = await prisma.trainingPlan.findMany({
      where: { userId },
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
    });
    if (plans.length === 0) return NextResponse.json([]);

    const templateIds = Array.from(new Set(
      plans.flatMap(p => (p.days as (string | null)[]).filter((d): d is string => !!d))
    ));
    const templates = templateIds.length > 0
      ? await prisma.workoutTemplate.findMany({ where: { id: { in: templateIds } }, select: { id: true, name: true } })
      : [];
    const nameById = new Map(templates.map(t => [t.id, t.name]));

    const payload = plans.map(p => ({
      ...p,
      dayTemplateNames: (p.days as (string | null)[]).map(d => (d ? (nameById.get(d) ?? '(usunięty szablon)') : null)),
    }));

    return NextResponse.json(payload);
  } catch (e) {
    console.error('GET /api/plans', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    const body = await req.json();
    const { name, startDate, numWeeks, repeat, days } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Podaj nazwę planu' }, { status: 400 });
    }
    if (!startDate || isNaN(new Date(startDate).getTime())) {
      return NextResponse.json({ error: 'Podaj poprawną datę startu' }, { status: 400 });
    }
    const weeks = typeof numWeeks === 'number' ? numWeeks : parseInt(numWeeks);
    if (!Number.isFinite(weeks) || weeks < 1 || weeks > 52) {
      return NextResponse.json({ error: 'Liczba tygodni musi być między 1 a 52' }, { status: 400 });
    }
    if (!isValidDays(days)) {
      return NextResponse.json({ error: 'Nieprawidłowy układ dni (wymagane 7)' }, { status: 400 });
    }
    if (days.every(d => d === null)) {
      return NextResponse.json({ error: 'Przypisz przynajmniej jeden dzień treningowy' }, { status: 400 });
    }

    // Tylko jeden aktywny plan naraz — starsze archiwizujemy (nie usuwamy, zostają w historii)
    await prisma.trainingPlan.updateMany({ where: { userId, active: true }, data: { active: false } });

    const plan = await prisma.trainingPlan.create({
      data: {
        userId,
        name: name.trim(),
        startDate: new Date(startDate),
        numWeeks: weeks,
        repeat: repeat !== false,
        active: true,
        days,
      },
    });

    return NextResponse.json(plan, { status: 201 });
  } catch (e) {
    console.error('POST /api/plans', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

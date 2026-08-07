import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';
import { computeTargets } from '@/lib/nutrition';
import { latestWeight } from '@/lib/calories';

/**
 * Profil żywieniowy: dane do wyliczenia zapotrzebowania + wynik wyliczenia.
 * Waga nie jest tu przechowywana — bierzemy najnowszy wpis z modułu Waga,
 * żeby cel sam się aktualizował, gdy Patryk się zważy.
 */

const DEFAULTS = {
  heightCm: null as number | null,
  birthYear: null as number | null,
  sex: null as string | null,
  activityLevel: 'MODERATE',
  goalType: 'MAINTAIN',
  customKcal: null as number | null,
  proteinPct: 30,
  carbsPct: 40,
  fatPct: 30,
  addWorkoutKcal: false,
  waterGoalMl: 2500,
};

function intOrNull(v: unknown, min: number, max: number): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  return n >= min && n <= max ? Math.round(n) : null;
}

function floatOrNull(v: unknown, min: number, max: number): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  return n >= min && n <= max ? n : null;
}

async function loadTargets(userId: string, profile: typeof DEFAULTS) {
  const weights = await prisma.bodyWeight.findMany({
    where: { userId },
    orderBy: { date: 'desc' },
    take: 1,
  });
  const weightKg = weights.length > 0 ? latestWeight(weights) : null;
  return { weightKg, targets: computeTargets(profile, weightKg, new Date()) };
}

export async function GET() {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });

    const row = await prisma.nutritionProfile.findUnique({ where: { userId } });
    const profile = row ?? { ...DEFAULTS };
    const { weightKg, targets } = await loadTargets(userId, profile as typeof DEFAULTS);

    return NextResponse.json({ profile, targets, weightKg });
  } catch (e) {
    console.error('GET /api/food/profile', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });

    const b = await request.json();
    const sex = b?.sex === 'M' || b?.sex === 'K' ? b.sex : null;

    const data = {
      heightCm: floatOrNull(b?.heightCm, 100, 250),
      birthYear: intOrNull(b?.birthYear, 1920, new Date().getFullYear() - 5),
      sex,
      activityLevel: String(b?.activityLevel || 'MODERATE'),
      goalType: String(b?.goalType || 'MAINTAIN'),
      customKcal: intOrNull(b?.customKcal, 800, 8000),
      proteinPct: intOrNull(b?.proteinPct, 5, 70) ?? 30,
      carbsPct: intOrNull(b?.carbsPct, 5, 80) ?? 40,
      fatPct: intOrNull(b?.fatPct, 5, 70) ?? 30,
      addWorkoutKcal: Boolean(b?.addWorkoutKcal),
      waterGoalMl: intOrNull(b?.waterGoalMl, 500, 8000) ?? 2500,
    };

    const profile = await prisma.nutritionProfile.upsert({
      where: { userId },
      update: data,
      create: { ...data, userId },
    });

    const { weightKg, targets } = await loadTargets(userId, profile as unknown as typeof DEFAULTS);
    return NextResponse.json({ profile, targets, weightKg });
  } catch (e) {
    console.error('PUT /api/food/profile', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

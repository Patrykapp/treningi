import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';
import { computeTargets } from '@/lib/nutrition';
import { latestWeight } from '@/lib/calories';

/**
 * Podsumowanie zakresu dni (domyślnie ostatnie 7) + lista zakupów.
 *
 * Lista zakupów sumuje gramaturę tych samych produktów w całym zakresie,
 * więc ustawiając zakres na nadchodzące dni dostajesz gotową listę na zakupy.
 */

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function dayUTC(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}
function isDate(s: string | null): s is string {
  return Boolean(s && /^\d{4}-\d{2}-\d{2}$/.test(s));
}

const DEFAULT_PROFILE = {
  heightCm: null, birthYear: null, sex: null,
  activityLevel: 'MODERATE', goalType: 'MAINTAIN', customKcal: null,
  proteinPct: 30, carbsPct: 40, fatPct: 30, addWorkoutKcal: false,
};

export async function GET(request: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const endParam = searchParams.get('end');
    const startParam = searchParams.get('start');

    const end = isDate(endParam) ? dayUTC(endParam) : dayUTC(iso(new Date()));
    const start = isDate(startParam) ? dayUTC(startParam) : new Date(end.getTime() - 6 * 86400000);
    if (start > end) return NextResponse.json({ error: 'Zły zakres dat' }, { status: 400 });

    // Bezpiecznik: bez limitu ktoś mógłby poprosić o 10 lat naraz.
    const spanDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    if (spanDays > 62) return NextResponse.json({ error: 'Maksymalnie 62 dni' }, { status: 400 });

    const [entries, profileRow, weights] = await Promise.all([
      prisma.mealEntry.findMany({
        where: { userId, date: { gte: start, lte: end } },
        orderBy: { date: 'asc' },
      }),
      prisma.nutritionProfile.findUnique({ where: { userId } }),
      prisma.bodyWeight.findMany({ where: { userId }, orderBy: { date: 'desc' }, take: 1 }),
    ]);

    const profile = profileRow ?? DEFAULT_PROFILE;
    const weightKg = weights.length > 0 ? latestWeight(weights) : null;
    const targets = computeTargets(profile, weightKg, new Date());

    // Szkielet wszystkich dni zakresu — także pustych, żeby wykres nie miał dziur.
    const days: { date: string; kcal: number; protein: number; carbs: number; fat: number; logged: boolean }[] = [];
    for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
      days.push({ date: iso(new Date(t)), kcal: 0, protein: 0, carbs: 0, fat: 0, logged: false });
    }
    const byDate = new Map(days.map((d) => [d.date, d]));

    const shoppingMap = new Map<string, number>();
    for (const e of entries) {
      const key = iso(e.date);
      const d = byDate.get(key);
      if (d) {
        d.kcal += e.kcal;
        d.protein += e.protein;
        d.carbs += e.carbs;
        d.fat += e.fat;
        d.logged = true;
      }
      shoppingMap.set(e.name, (shoppingMap.get(e.name) ?? 0) + e.grams);
    }

    for (const d of days) {
      d.kcal = Math.round(d.kcal);
      d.protein = Math.round(d.protein);
      d.carbs = Math.round(d.carbs);
      d.fat = Math.round(d.fat);
    }

    const logged = days.filter((d) => d.logged);
    const n = Math.max(1, logged.length);
    const avg = {
      kcal: Math.round(logged.reduce((s, d) => s + d.kcal, 0) / n),
      protein: Math.round(logged.reduce((s, d) => s + d.protein, 0) / n),
      carbs: Math.round(logged.reduce((s, d) => s + d.carbs, 0) / n),
      fat: Math.round(logged.reduce((s, d) => s + d.fat, 0) / n),
    };

    // Ile dni zmieściło się w celu (±10% to w praktyce trafienie)
    const withinTarget = logged.filter(
      (d) => targets.kcal > 0 && Math.abs(d.kcal - targets.kcal) <= targets.kcal * 0.1
    ).length;

    const shopping = [...shoppingMap.entries()]
      .map(([name, grams]) => ({ name, grams: Math.round(grams) }))
      .sort((a, b) => b.grams - a.grams);

    return NextResponse.json({
      start: iso(start),
      end: iso(end),
      days,
      avg,
      targets,
      daysLogged: logged.length,
      withinTarget,
      shopping,
    });
  } catch (e) {
    console.error('GET /api/food/week', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

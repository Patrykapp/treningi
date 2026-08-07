import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';
import { computeTargets, isMealKey } from '@/lib/nutrition';
import { runCalories, sessionCalories, latestWeight } from '@/lib/calories';

/**
 * Dziennik żywieniowy — jeden dzień.
 *
 * Data jest trzymana jako północ UTC (`2026-08-04T00:00:00.000Z`), żeby
 * przy porównaniach nie było przesunięć przez strefę czasową. Wszędzie
 * używamy tego samego pomocnika, więc zapis i odczyt zawsze się zgadzają.
 */

function dayStart(dateStr: string | null): Date {
  const s = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : new Date().toISOString().slice(0, 10);
  return new Date(`${s}T00:00:00.000Z`);
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : fallback;
}

const DEFAULT_PROFILE = {
  heightCm: null,
  birthYear: null,
  sex: null,
  activityLevel: 'MODERATE',
  goalType: 'MAINTAIN',
  customKcal: null,
  proteinPct: 30,
  carbsPct: 40,
  fatPct: 30,
  addWorkoutKcal: false,
};

export async function GET(request: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const date = dayStart(searchParams.get('date'));
    const dayEnd = new Date(date.getTime() + 24 * 3600 * 1000);

    const [entries, profileRow, weights, water] = await Promise.all([
      prisma.mealEntry.findMany({
        where: { userId, date },
        orderBy: { createdAt: 'asc' },
        // Przepis dołączamy od razu — dania z generatora mają go zapisany
        // przy produkcie i chcemy je pokazać bez dodatkowego zapytania.
        include: { product: { select: { recipe: true, ingredients: true, servingG: true, unit: true } } },
      }),
      prisma.nutritionProfile.findUnique({ where: { userId } }),
      prisma.bodyWeight.findMany({ where: { userId }, orderBy: { date: 'desc' }, take: 1 }),
      prisma.waterLog.findUnique({ where: { userId_date: { userId, date } } }),
    ]);

    const profile = profileRow ?? { ...DEFAULT_PROFILE, userId };
    const weightKg = weights.length > 0 ? latestWeight(weights) : null;
    const targets = computeTargets(profile, weightKg, new Date());

    // Kalorie spalone tego dnia — doliczane do budżetu tylko na życzenie.
    let workoutKcal = 0;
    if (profile.addWorkoutKcal) {
      const [sessions, runs, activities] = await Promise.all([
        prisma.workoutSession.findMany({
          where: { userId, date: { gte: date, lt: dayEnd } },
          include: { entries: { select: { sets: true, setsData: true } } },
        }),
        prisma.runSession.findMany({ where: { userId, date: { gte: date, lt: dayEnd } } }),
        prisma.otherActivity.findMany({ where: { userId, date: { gte: date, lt: dayEnd } } }),
      ]);
      const w = weightKg ?? 75;
      workoutKcal =
        sessions.reduce((s, x) => s + sessionCalories(x, w).kcal, 0) +
        runs.reduce((s, x) => s + (x.kcal && x.kcal > 0 ? x.kcal : runCalories(w, x.distance)), 0) +
        activities.reduce((s, x) => s + (x.kcal ?? 0), 0);
    }

    const totals = entries.reduce(
      (a, e) => ({
        kcal: a.kcal + e.kcal,
        protein: a.protein + e.protein,
        carbs: a.carbs + e.carbs,
        fat: a.fat + e.fat,
      }),
      { kcal: 0, protein: 0, carbs: 0, fat: 0 }
    );

    return NextResponse.json({
      date: date.toISOString().slice(0, 10),
      entries,
      totals,
      targets,
      workoutKcal: Math.round(workoutKcal),
      weightKg,
      water: { ml: water?.ml ?? 0, goalMl: (profile as { waterGoalMl?: number }).waterGoalMl ?? 2500 },
      profile,
    });
  } catch (e) {
    console.error('GET /api/food/diary', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });

    const body = await request.json();
    const date = dayStart(body?.date);
    const meal = body?.meal;
    const grams = num(body?.grams);

    if (!isMealKey(meal)) return NextResponse.json({ error: 'Nieznany posiłek' }, { status: 400 });
    if (grams <= 0) return NextResponse.json({ error: 'Podaj gramaturę' }, { status: 400 });

    // Produkt: albo wskazany z katalogu, albo przysłany w całości
    // (z Open Food Facts / ręcznie) — wtedy zapisujemy go, żeby następnym
    // razem nie odpytywać zewnętrznego API.
    let product = body?.productId
      ? await prisma.foodProduct.findUnique({ where: { id: String(body.productId) } })
      : null;

    if (!product && body?.product) {
      const p = body.product;
      const name = String(p.name || '').trim();
      if (!name) return NextResponse.json({ error: 'Produkt bez nazwy' }, { status: 400 });

      const barcode = p.barcode ? String(p.barcode).replace(/\D/g, '') || null : null;
      const data = {
        name,
        brand: p.brand ? String(p.brand) : null,
        kcal100: num(p.kcal100),
        protein100: num(p.protein100),
        carbs100: num(p.carbs100),
        fat100: num(p.fat100),
        fiber100: p.fiber100 != null ? num(p.fiber100) : null,
        sugars100: p.sugars100 != null ? num(p.sugars100) : null,
        salt100: p.salt100 != null ? num(p.salt100) : null,
        servingG: p.servingG != null ? num(p.servingG) : null,
        source: p.source === 'OFF' || p.source === 'SEED' ? p.source : 'OWN',
        unit: p.unit === 'ml' ? 'ml' : 'g',
        createdById: p.source === 'OFF' ? null : userId,
      };

      product = barcode
        ? await prisma.foodProduct.upsert({
            where: { barcode },
            update: {}, // istniejącego wpisu nie nadpisujemy — mógł być ręcznie poprawiony
            create: { ...data, barcode },
          })
        : await prisma.foodProduct.create({ data });
    }

    if (!product) return NextResponse.json({ error: 'Brak produktu' }, { status: 400 });

    const f = grams / 100;
    const [entry] = await prisma.$transaction([
      prisma.mealEntry.create({
        data: {
          userId,
          date,
          meal,
          productId: product.id,
          name: product.brand ? `${product.brand} ${product.name}` : product.name,
          grams,
          unit: product.unit === 'ml' ? 'ml' : 'g',
          // snapshot — korekta produktu nie zmieni historii
          kcal: Math.round(product.kcal100 * f * 10) / 10,
          protein: Math.round(product.protein100 * f * 10) / 10,
          carbs: Math.round(product.carbs100 * f * 10) / 10,
          fat: Math.round(product.fat100 * f * 10) / 10,
        },
      }),
      prisma.foodProduct.update({
        where: { id: product.id },
        data: { usageCount: { increment: 1 } },
      }),
    ]);

    return NextResponse.json(entry, { status: 201 });
  } catch (e) {
    console.error('POST /api/food/diary', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

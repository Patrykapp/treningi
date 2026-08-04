import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';
import { isMealKey } from '@/lib/nutrition';

/**
 * Zapis zaakceptowanego jadłospisu do dziennika (dowolny dzień — także
 * przyszły, po to żeby dało się zaplanować zakupy).
 *
 * Każde danie zapisuje się jako jeden produkt w katalogu (z przepisem
 * i składem) plus jeden wpis w dzienniku. Dzięki temu „Owsianka z bananem"
 * jest później do dodania jednym kliknięciem, bez ponownego generowania.
 */

function dayStart(dateStr: unknown): Date {
  const s = typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
    ? dateStr
    : new Date().toISOString().slice(0, 10);
  return new Date(`${s}T00:00:00.000Z`);
}

const num = (v: unknown): number => {
  const x = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(x) && x >= 0 ? x : 0;
};

type IncomingIngredient = { name?: string; grams?: number };
type IncomingMeal = {
  meal?: string; title?: string; recipe?: string;
  ingredients?: IncomingIngredient[];
  kcal?: number; protein?: number; carbs?: number; fat?: number;
};

export async function POST(request: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });

    const body = await request.json();
    const date = dayStart(body?.date);
    const incoming: IncomingMeal[] = Array.isArray(body?.meals) ? body.meals : [];
    const replace = Boolean(body?.replace);

    if (incoming.length === 0) return NextResponse.json({ error: 'Pusty plan' }, { status: 400 });

    // Nadpisanie dnia: kasujemy to, co już było, żeby nie dublować posiłków.
    if (replace) {
      await prisma.mealEntry.deleteMany({ where: { userId, date } });
    }

    let created = 0;
    for (const m of incoming) {
      const meal = String(m.meal || '').toUpperCase();
      if (!isMealKey(meal)) continue;

      const title = String(m.title || '').trim();
      const ingredients = (m.ingredients ?? [])
        .map((i) => ({ nazwa: String(i.name || '').trim(), gramy: num(i.grams) }))
        .filter((i) => i.nazwa && i.gramy > 0);

      const grams = ingredients.reduce((s, i) => s + i.gramy, 0);
      const kcal = num(m.kcal);
      if (!title || grams <= 0 || kcal <= 0) continue;

      const protein = num(m.protein);
      const carbs = num(m.carbs);
      const fat = num(m.fat);
      const f = 100 / grams; // danie zapisujemy w katalogu jako wartości na 100 g

      const product = await prisma.foodProduct.create({
        data: {
          name: title,
          brand: null,
          kcal100: Math.round(kcal * f * 10) / 10,
          protein100: Math.round(protein * f * 10) / 10,
          carbs100: Math.round(carbs * f * 10) / 10,
          fat100: Math.round(fat * f * 10) / 10,
          servingG: Math.round(grams),
          servingLabel: '1 porcja',
          recipe: String(m.recipe || '').slice(0, 2000) || null,
          ingredients,
          source: 'OWN',
          createdById: userId,
        },
      });

      await prisma.mealEntry.create({
        data: {
          userId,
          date,
          meal,
          productId: product.id,
          name: title,
          grams: Math.round(grams),
          kcal: Math.round(kcal * 10) / 10,
          protein: Math.round(protein * 10) / 10,
          carbs: Math.round(carbs * 10) / 10,
          fat: Math.round(fat * 10) / 10,
        },
      });
      created++;
    }

    if (created === 0) return NextResponse.json({ error: 'Nie udało się zapisać żadnego posiłku' }, { status: 400 });

    return NextResponse.json({ ok: true, created }, { status: 201 });
  } catch (e) {
    console.error('POST /api/food/diary/plan', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

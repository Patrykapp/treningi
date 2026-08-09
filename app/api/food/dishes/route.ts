import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';
import { isMealKey } from '@/lib/nutrition';

/**
 * Zapisanie posiłku z dziennika jako własnego dania.
 *
 * Sens: ten sam obiad wraca co tydzień. Zamiast wpisywać ryż, filet i warzywa
 * po kolei za każdym razem, zapisujesz raz gotowe danie i potem dodajesz je
 * jednym kliknięciem z zakładki „Moje dania".
 *
 * Wszystko liczy serwer z wpisów, które już są w dzienniku — nic nie przychodzi
 * z klienta poza nazwą. Wartości na 100 g wychodzą z sum: kcal / gramy × 100,
 * a łączna gramatura staje się typową porcją, więc następnym razem danie
 * proponuje się w tej samej wielkości.
 *
 * Danie dostaje też `mealSlots` z posiłku, z którego powstało — dzięki temu
 * od razu wchodzi do puli generatora jadłospisu.
 */

function dayStart(dateStr: unknown): Date {
  const s = typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
    ? dateStr
    : new Date().toISOString().slice(0, 10);
  return new Date(`${s}T00:00:00.000Z`);
}

const r1 = (x: number) => Math.round(x * 10) / 10;

export async function POST(request: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const date = dayStart(body?.date);
    const meal = body?.meal;
    const name = String(body?.name ?? '').trim();

    if (!isMealKey(meal)) return NextResponse.json({ error: 'Nieznany posiłek' }, { status: 400 });
    if (name.length < 2 || name.length > 80) {
      return NextResponse.json({ error: 'Nazwa musi mieć od 2 do 80 znaków' }, { status: 400 });
    }

    const entries = await prisma.mealEntry.findMany({
      where: { userId, date, meal },
      orderBy: { createdAt: 'asc' },
      include: { product: { select: { ingredients: true, servingG: true, unit: true } } },
    });

    if (entries.length === 0) {
      return NextResponse.json({ error: 'Ten posiłek jest pusty' }, { status: 400 });
    }

    const totalGrams = entries.reduce((s, e) => s + e.grams, 0);
    if (totalGrams <= 0) return NextResponse.json({ error: 'Posiłek nie ma gramatury' }, { status: 400 });

    const exists = await prisma.foodProduct.findFirst({ where: { name }, select: { id: true } });
    if (exists) {
      return NextResponse.json({ error: `Danie „${name}" już istnieje — nadaj inną nazwę` }, { status: 409 });
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

    // Składniki na potrzeby listy zakupów. Jeśli któraś pozycja sama jest daniem
    // złożonym, rozbijamy ją na jej własne składniki — w sklepie kupuje się
    // pieczywo i ser, nie „tost z serem".
    const ingredients: { nazwa: string; gramy: number }[] = [];
    for (const e of entries) {
      const parts = Array.isArray(e.product?.ingredients)
        ? (e.product!.ingredients as { nazwa?: string; gramy?: number }[])
        : [];
      const serving = e.product?.servingG ?? 0;
      if (parts.length > 0 && serving > 0) {
        const factor = e.grams / serving;
        for (const p of parts) {
          if (!p?.nazwa) continue;
          ingredients.push({ nazwa: String(p.nazwa), gramy: Math.round((Number(p.gramy) || 0) * factor) });
        }
      } else {
        ingredients.push({ nazwa: e.name, gramy: Math.round(e.grams) });
      }
    }

    const f = 100 / totalGrams;
    // Jednostka dania: mililitry tylko wtedy, gdy WSZYSTKO było płynne
    // (zupa tak, ale obiad z sokiem to nadal danie ważone w gramach).
    const unit = entries.every((e) => e.unit === 'ml') ? 'ml' : 'g';

    const dish = await prisma.foodProduct.create({
      data: {
        name,
        brand: null,
        kcal100: Math.round(totals.kcal * f),
        protein100: r1(totals.protein * f),
        carbs100: r1(totals.carbs * f),
        fat100: r1(totals.fat * f),
        servingG: Math.round(totalGrams),
        servingLabel: '1 porcja',
        unit,
        source: 'OWN',
        createdById: userId,
        mealSlots: meal,
        // Skład wystarcza za przepis — to zestaw, a nie danie do ugotowania.
        recipe: entries.map((e) => `${e.name} ${Math.round(e.grams)} ${e.unit === 'ml' ? 'ml' : 'g'}`).join(', '),
        ingredients,
        // Wpis powstał z realnie zjedzonego posiłku, więc wartości są już
        // „poprawione ręcznie" — skrypty bazy nie mają czego tu nadpisywać.
        edited: true,
      },
      select: { id: true, name: true, kcal100: true, servingG: true, unit: true },
    });

    return NextResponse.json(
      { ...dish, components: entries.length, portionKcal: Math.round(totals.kcal) },
      { status: 201 }
    );
  } catch (e) {
    console.error('POST /api/food/dishes', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

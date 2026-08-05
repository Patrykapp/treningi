import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';

/**
 * Trwała lista zakupów. W odróżnieniu od podsumowania tygodnia, które tylko
 * pokazuje wyliczone produkty, ta lista żyje w bazie: odhaczone pozycje
 * zostają odhaczone po zamknięciu aplikacji, więc da się z niej korzystać
 * w sklepie.
 *
 * Pozycje trafiają tu z zaplanowanych dni (POST z zakresem dat), z generatora
 * jadłospisu albo z ręcznego dopisania.
 */

function dayUTC(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}
const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function GET() {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });

    const items = await prisma.shoppingItem.findMany({
      where: { userId },
      orderBy: [{ checked: 'asc' }, { category: 'asc' }, { name: 'asc' }],
    });
    return NextResponse.json(items);
  } catch (e) {
    console.error('GET /api/food/shopping', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

/**
 * Dodanie pozycji. Trzy tryby:
 *  { name, grams? }            — jedna rzecz dopisana ręcznie
 *  { items: [{name, grams?}] } — paczka (np. z generatora jadłospisu)
 *  { from, to }                — wszystko z zaplanowanych posiłków w zakresie dat
 *
 * Powtórzenia sumujemy zamiast dublować wiersze — w sklepie interesuje nas
 * łączna ilość, a nie to, w ilu posiłkach coś występuje.
 */
export async function POST(request: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });

    const body = await request.json();
    const incoming: { name: string; grams: number | null }[] = [];

    if (isDate(body?.from) && isDate(body?.to)) {
      const from = dayUTC(body.from);
      const to = dayUTC(body.to);
      if (from > to) return NextResponse.json({ error: 'Zły zakres dat' }, { status: 400 });

      const entries = await prisma.mealEntry.findMany({
        where: { userId, date: { gte: from, lte: to } },
        select: { name: true, grams: true, productId: true },
      });

      // Dania złożone rozbijamy na składniki — w sklepie kupuje się mięso
      // i ziemniaki, nie „pulpety z puree".
      const dishIds = [...new Set(entries.map((e) => e.productId).filter(Boolean) as string[])];
      const dishes = dishIds.length
        ? await prisma.foodProduct.findMany({
            where: { id: { in: dishIds } },
            select: { id: true, ingredients: true },
          })
        : [];
      const ingredientsById = new Map(dishes.map((d) => [d.id, d.ingredients]));

      for (const e of entries) {
        const raw = e.productId ? ingredientsById.get(e.productId) : null;
        if (Array.isArray(raw) && raw.length > 0) {
          for (const i of raw as { nazwa?: string; gramy?: number }[]) {
            if (i?.nazwa) incoming.push({ name: String(i.nazwa), grams: Number(i.gramy) || null });
          }
        } else {
          incoming.push({ name: e.name, grams: e.grams });
        }
      }
    } else if (Array.isArray(body?.items)) {
      for (const i of body.items) {
        const name = String(i?.name || '').trim();
        if (name) incoming.push({ name, grams: Number(i?.grams) || null });
      }
    } else {
      const name = String(body?.name || '').trim();
      if (!name) return NextResponse.json({ error: 'Podaj nazwę' }, { status: 400 });
      incoming.push({ name, grams: Number(body?.grams) || null });
    }

    if (incoming.length === 0) return NextResponse.json({ error: 'Nic do dodania' }, { status: 400 });

    // Kategorie bierzemy z katalogu, żeby lista grupowała się po działach sklepu.
    const names = [...new Set(incoming.map((i) => i.name))];
    const known = await prisma.foodProduct.findMany({
      where: { name: { in: names } },
      select: { name: true, category: true },
    });
    const categoryByName = new Map(known.map((k) => [k.name, k.category]));

    const existing = await prisma.shoppingItem.findMany({ where: { userId } });
    const existingByName = new Map(existing.map((e) => [e.name.toLowerCase(), e]));

    const merged = new Map<string, { name: string; grams: number | null }>();
    for (const i of incoming) {
      const key = i.name.toLowerCase();
      const prev = merged.get(key);
      merged.set(key, {
        name: prev?.name ?? i.name,
        grams: i.grams === null && prev?.grams == null ? null : (prev?.grams ?? 0) + (i.grams ?? 0),
      });
    }

    let added = 0;
    let updated = 0;
    for (const [key, item] of merged) {
      const hit = existingByName.get(key);
      if (hit) {
        await prisma.shoppingItem.update({
          where: { id: hit.id },
          data: { grams: (hit.grams ?? 0) + (item.grams ?? 0) || null, checked: false },
        });
        updated++;
      } else {
        await prisma.shoppingItem.create({
          data: {
            userId,
            name: item.name,
            grams: item.grams,
            category: categoryByName.get(item.name) ?? null,
          },
        });
        added++;
      }
    }

    return NextResponse.json({ ok: true, added, updated }, { status: 201 });
  } catch (e) {
    console.error('POST /api/food/shopping', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

/** Czyszczenie listy: ?checked=1 usuwa tylko odhaczone, bez parametru — wszystko. */
export async function DELETE(request: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const onlyChecked = searchParams.get('checked') === '1';

    const result = await prisma.shoppingItem.deleteMany({
      where: onlyChecked ? { userId, checked: true } : { userId },
    });
    return NextResponse.json({ ok: true, deleted: result.count });
  } catch (e) {
    console.error('DELETE /api/food/shopping', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

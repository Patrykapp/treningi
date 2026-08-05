import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';

async function owned(id: string, userId: string) {
  const item = await prisma.shoppingItem.findUnique({ where: { id }, select: { userId: true } });
  return Boolean(item && item.userId === userId);
}

/** Odhaczenie pozycji albo zmiana ilości. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });

    const { id } = await params;
    if (!(await owned(id, userId))) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 });

    const body = await request.json();
    const data: { checked?: boolean; grams?: number | null } = {};
    if (typeof body?.checked === 'boolean') data.checked = body.checked;
    if (body?.grams !== undefined) {
      const g = Number(body.grams);
      data.grams = Number.isFinite(g) && g > 0 ? g : null;
    }
    if (Object.keys(data).length === 0) return NextResponse.json({ error: 'Nic do zmiany' }, { status: 400 });

    return NextResponse.json(await prisma.shoppingItem.update({ where: { id }, data }));
  } catch (e) {
    console.error('PATCH /api/food/shopping/[id]', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });

    const { id } = await params;
    if (!(await owned(id, userId))) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 });

    await prisma.shoppingItem.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/food/shopping/[id]', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

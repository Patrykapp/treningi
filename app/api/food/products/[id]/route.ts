import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';

/** Przełączenie ulubionego (gwiazdka przy produkcie). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    if (typeof body?.isFavorite !== 'boolean') {
      return NextResponse.json({ error: 'Nic do zmiany' }, { status: 400 });
    }

    // Ulubione są wspólne dla obu kont — aplikacja ma dwóch użytkowników
    // i wspólny katalog, więc osobna tabela byłaby tu przerostem formy.
    const updated = await prisma.foodProduct.update({
      where: { id },
      data: { isFavorite: body.isFavorite },
    });
    return NextResponse.json(updated);
  } catch (e) {
    console.error('PATCH /api/food/products/[id]', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

// Usunięcie produktu z katalogu. Wpisy w dzienniku zostają nietknięte —
// mają własny snapshot nazwy i makro, a relacja jest SetNull.
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });

    const { id } = await params;
    const p = await prisma.foodProduct.findUnique({ where: { id }, select: { createdById: true, source: true } });
    if (!p) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 });
    // Produkty wbudowane (SEED) i pobrane automatycznie (OFF) są wspólne —
    // kasować można tylko własne wpisy.
    if (p.source !== 'OWN' || p.createdById !== userId) {
      return NextResponse.json({ error: 'Można usuwać tylko własne produkty' }, { status: 403 });
    }

    await prisma.foodProduct.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/food/products/[id]', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

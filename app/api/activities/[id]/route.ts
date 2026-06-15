import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    const { id } = await params;
    const existing = await prisma.otherActivity.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 });
    }
    const { date, type, durationMin, distanceKm, kcal, notes } = await request.json();
    const updated = await prisma.otherActivity.update({
      where: { id },
      data: {
        date: date ? new Date(date) : existing.date,
        type: type ? String(type).trim() : existing.type,
        durationMin: durationMin != null ? Number(durationMin) : existing.durationMin,
        distanceKm: distanceKm != null ? (distanceKm ? Number(distanceKm) : null) : existing.distanceKm,
        kcal: kcal != null ? (kcal ? Number(kcal) : null) : existing.kcal,
        notes: notes != null ? (notes?.trim() || null) : existing.notes,
      },
    });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: 'Błąd zapisu' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    const { id } = await params;
    const existing = await prisma.otherActivity.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 });
    }
    await prisma.otherActivity.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Błąd usuwania' }, { status: 500 });
  }
}

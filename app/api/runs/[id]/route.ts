import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUserId = await getAuthUserId();
    if (!authUserId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    const { id } = await params;
    const existing = await prisma.runSession.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 });

    const { date, distance, duration, splits, notes } = await request.json();
    if (!date || !distance || !duration) {
      return NextResponse.json({ error: 'Wymagane: data, dystans, czas' }, { status: 400 });
    }

    const run = await prisma.runSession.update({
      where: { id },
      data: {
        date: new Date(date),
        distance: parseFloat(distance),
        duration: Math.round(Number(duration)),
        splits: Array.isArray(splits) ? splits : [],
        notes: notes || null,
      },
    });
    return NextResponse.json(run);
  } catch (e) {
    console.error('PUT /api/runs/[id]', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUserId = await getAuthUserId();
    if (!authUserId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    const { id } = await params;
    const existing = await prisma.runSession.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 });
    await prisma.runSession.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('DELETE /api/runs/[id]', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

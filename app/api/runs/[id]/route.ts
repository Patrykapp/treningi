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

// PATCH /api/runs/[id] — przypięcie/odpięcie biegu do treningu (np. bieg + challenge tego samego dnia)
// Body: { sessionId: string | null }
// Walidacja: trening należy do tego samego usera i jest z tego samego dnia co bieg.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUserId = await getAuthUserId();
    if (!authUserId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    const { id } = await params;
    const existing = await prisma.runSession.findUnique({ where: { id } });
    if (!existing || existing.userId !== authUserId) {
      return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 });
    }
    const { sessionId } = await request.json();

    if (sessionId) {
      const session = await prisma.workoutSession.findUnique({ where: { id: String(sessionId) } });
      if (!session || session.userId !== authUserId) {
        return NextResponse.json({ error: 'Nie znaleziono treningu' }, { status: 404 });
      }
      const sameDay = new Date(session.date).toISOString().slice(0, 10) === new Date(existing.date).toISOString().slice(0, 10);
      if (!sameDay) {
        return NextResponse.json({ error: 'Trening musi być z tego samego dnia' }, { status: 400 });
      }
    }

    const updated = await prisma.runSession.update({
      where: { id },
      data: { sessionId: sessionId ? String(sessionId) : null },
    });
    return NextResponse.json(updated);
  } catch (e) {
    console.error('PATCH /api/runs/[id]', e);
    return NextResponse.json({ error: 'Błąd zapisu' }, { status: 500 });
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

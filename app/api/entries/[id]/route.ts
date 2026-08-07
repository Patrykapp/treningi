import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUserId = await getAuthUserId();
    if (!authUserId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    const { id } = await params;
    const { sets, reps, weight, durationSec, rpe, comment } = await request.json();

    // Ćwiczenia mierzone czasem (bieżnia, stepmill, ergometr) nie mają serii
    // ani ciężaru — przy nich edytuje się minuty, reszta zostaje wypełniaczem.
    const n = Math.round(Number(durationSec));
    const dur = Number.isFinite(n) && n >= 10 && n <= 21600 ? n : null;

    const entry = await prisma.workoutEntry.update({
      where: { id },
      data: {
        sets: dur ? 1 : Number(sets),
        reps: dur ? 1 : Number(reps),
        weight: dur ? 0 : Number(weight),
        // `durationSec: undefined` w kliencie oznacza „nie ruszaj tego pola",
        // więc zwykła edycja ciężaru nie kasuje czasu.
        ...(durationSec === undefined ? {} : { durationSec: dur }),
        rpe: rpe ? Number(rpe) : null,
        comment: comment || null,
      },
      include: { exercise: true, session: { include: { user: true } } },
    });
    return NextResponse.json(entry);
  } catch (e) {
    console.error('PUT /api/entries/[id]', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUserId = await getAuthUserId();
    if (!authUserId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    const { id } = await params;
    await prisma.workoutEntry.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('DELETE /api/entries/[id]', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await prisma.workoutSession.findUnique({
      where: { id },
      include: { user: true, entries: { include: { exercise: true } } },
    });
    if (!session) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 });
    return NextResponse.json(session);
  } catch {
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { date, userId, notes, entries } = await request.json();
    // Delete old entries, insert new
    await prisma.workoutEntry.deleteMany({ where: { sessionId: id } });
    const session = await prisma.workoutSession.update({
      where: { id },
      data: {
        date: new Date(date),
        userId,
        notes: notes || null,
        entries: {
          create: entries.map((e: { exerciseId: string; sets: number; reps: number; weight: number; rpe?: number; comment?: string }) => ({
            exerciseId: e.exerciseId,
            sets: Number(e.sets),
            reps: Number(e.reps),
            weight: Number(e.weight),
            rpe: e.rpe ? Number(e.rpe) : null,
            comment: e.comment || null,
          })),
        },
      },
      include: { user: true, entries: { include: { exercise: true } } },
    });
    return NextResponse.json(session);
  } catch {
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.workoutSession.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

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
          create: entries.map((e: { exerciseId: string; sets: number; reps: number; weight: number; rpe?: number; comment?: string; setsData?: { reps: number; weight: number }[] }) => {
            const sd = e.setsData && e.setsData.length > 0 ? e.setsData : [];
            return {
              exerciseId: e.exerciseId,
              sets: sd.length > 0 ? sd.length : Number(e.sets),
              reps: sd.length > 0 ? Math.max(...sd.map(s => s.reps)) : Number(e.reps),
              weight: sd.length > 0 ? Math.max(...sd.map(s => s.weight)) : Number(e.weight),
              rpe: e.rpe ? Number(e.rpe) : null,
              comment: e.comment || null,
              setsData: sd,
            };
          }),
        },
      },
      include: { user: true, entries: { include: { exercise: true } } },
    });
    return NextResponse.json(session);
  } catch {
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

// PATCH – dodaj jedno ćwiczenie do istniejącej sesji
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { entry } = await request.json();
    if (!entry) return NextResponse.json({ error: 'Brak ćwiczenia' }, { status: 400 });
    const sd = entry.setsData && entry.setsData.length > 0 ? entry.setsData : [];
    const created = await prisma.workoutEntry.create({
      data: {
        sessionId: id,
        exerciseId: entry.exerciseId,
        sets: sd.length > 0 ? sd.length : Number(entry.sets),
        reps: sd.length > 0 ? Math.max(...sd.map((s: { reps: number }) => s.reps)) : Number(entry.reps),
        weight: sd.length > 0 ? Math.max(...sd.map((s: { weight: number }) => s.weight)) : Number(entry.weight),
        rpe: entry.rpe ? Number(entry.rpe) : null,
        comment: entry.comment || null,
        setsData: sd,
      },
      include: { exercise: true },
    });
    return NextResponse.json(created);
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

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { sets, reps, weight, rpe, comment } = await request.json();
    const entry = await prisma.workoutEntry.update({
      where: { id },
      data: {
        sets: Number(sets),
        reps: Number(reps),
        weight: Number(weight),
        rpe: rpe ? Number(rpe) : null,
        comment: comment || null,
      },
      include: { exercise: true, session: { include: { user: true } } },
    });
    return NextResponse.json(entry);
  } catch {
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.workoutEntry.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

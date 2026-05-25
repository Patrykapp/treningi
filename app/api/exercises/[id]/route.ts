import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { name, muscleGroup } = await request.json();
    if (!name?.trim()) return NextResponse.json({ error: 'Nazwa jest wymagana' }, { status: 400 });
    const exercise = await prisma.exercise.update({
      where: { id },
      data: { name: name.trim(), muscleGroup: muscleGroup?.trim() || null },
    });
    return NextResponse.json(exercise);
  } catch {
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.exercise.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, muscleGroup, exerciseDbId } = body;
    const data: { name?: string; muscleGroup?: string | null; exerciseDbId?: string | null } = {};
    if (name !== undefined) {
      if (!name?.trim()) return NextResponse.json({ error: 'Nazwa jest wymagana' }, { status: 400 });
      data.name = name.trim();
      data.muscleGroup = muscleGroup?.trim() || null;
    }
    if (exerciseDbId !== undefined) {
      data.exerciseDbId = exerciseDbId || null;
    }
    const exercise = await prisma.exercise.update({ where: { id }, data });
    return NextResponse.json(exercise);
  } catch {
    return NextResponse.json({ error: 'Blad serwera' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.exercise.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Blad serwera' }, { status: 500 });
  }
}

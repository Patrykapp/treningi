import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUserId = await getAuthUserId();
    if (!authUserId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
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
  } catch (e) {
    console.error('PUT /api/exercises/[id]', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUserId = await getAuthUserId();
    if (!authUserId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    const { id } = await params;
    // Czytelny błąd zamiast naruszenia klucza obcego
    const entryCount = await prisma.workoutEntry.count({ where: { exerciseId: id } });
    if (entryCount > 0) {
      return NextResponse.json(
        { error: `Nie można usunąć — ćwiczenie ma ${entryCount} wpisów w historii` },
        { status: 409 }
      );
    }
    await prisma.exercise.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('DELETE /api/exercises/[id]', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

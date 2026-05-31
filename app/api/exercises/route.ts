import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const exercises = await prisma.exercise.findMany({ orderBy: { name: 'asc' } });
    return NextResponse.json(exercises, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { name, muscleGroup } = await request.json();
    if (!name?.trim()) return NextResponse.json({ error: 'Nazwa jest wymagana' }, { status: 400 });
    const exercise = await prisma.exercise.create({
      data: { name: name.trim(), muscleGroup: muscleGroup?.trim() || null },
    });
    return NextResponse.json(exercise, { status: 201 });
  } catch (e: unknown) {
    const error = e as { code?: string };
    if (error.code === 'P2002') return NextResponse.json({ error: 'Ćwiczenie już istnieje' }, { status: 409 });
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';
import { framesForDbId } from '@/lib/exerciseImages';

export async function GET() {
  try {
    const exercises = await prisma.exercise.findMany({ orderBy: { name: 'asc' } });
    // Dokleja miniaturę (klatka 0) z free-exercise-db — stary host gifów padł.
    // Rozwiązywanie jest cache'owane; błędy sieci degradują się do braku obrazka.
    const withImgs = await Promise.all(exercises.map(async ex => {
      const frames = await framesForDbId(ex.exerciseDbId);
      return { ...ex, gifUrl: frames?.[0] ?? null, images: frames ?? [] };
    }));
    return NextResponse.json(withImgs, {
      // no-store: nowe ćwiczenia muszą być widoczne natychmiast.
      // Wcześniejsze s-maxage=300 + stale-while-revalidate=600 powodowało
      // do ~10 minut opóźnienia na CDN zanim lista się odświeżyła.
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    console.error('GET /api/exercises', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authUserId = await getAuthUserId();
    if (!authUserId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    const { name, muscleGroup } = await request.json();
    if (!name?.trim()) return NextResponse.json({ error: 'Nazwa jest wymagana' }, { status: 400 });

    // Sprawdź duplikat bez względu na wielkość liter — zwróć istniejące ćwiczenie,
    // żeby klient mógł je od razu wybrać zamiast tworzyć bliźniaczy wpis.
    const existing = await prisma.exercise.findFirst({
      where: { name: { equals: name.trim(), mode: 'insensitive' } },
    });
    if (existing) {
      return NextResponse.json(
        { error: `Ćwiczenie "${existing.name}" już istnieje`, existing },
        { status: 409 }
      );
    }

    const exercise = await prisma.exercise.create({
      data: { name: name.trim(), muscleGroup: muscleGroup?.trim() || null },
    });
    return NextResponse.json(exercise, { status: 201 });
  } catch (e: unknown) {
    const error = e as { code?: string };
    if (error.code === 'P2002') return NextResponse.json({ error: 'Ćwiczenie już istnieje' }, { status: 409 });
    console.error('POST /api/exercises', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

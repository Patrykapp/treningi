import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';

// Zwraca wszystkie wpisy-challenge (session.notes zaczyna się od "Challenge:"),
// z rozpakowanymi danymi (serie, czasy, łączne powtórzenia). Sortowane rosnąco
// po dacie, żeby na froncie łatwo liczyć przerwy i porównania między próbami.
export async function GET(request: Request) {
  try {
    const authUserId = await getAuthUserId();
    if (!authUserId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || undefined;

    const entries = await prisma.workoutEntry.findMany({
      where: {
        session: {
          notes: { startsWith: 'Challenge:' },
          ...(userId ? { userId } : {}),
        },
      },
      include: {
        exercise: { select: { id: true, name: true, muscleGroup: true } },
        session: { select: { id: true, date: true, user: { select: { id: true, name: true } } } },
      },
      orderBy: { session: { date: 'asc' } },
    });

    const data = entries.map(e => {
      const setsData = Array.isArray(e.setsData) ? (e.setsData as unknown as { reps?: number }[]) : [];
      const reps = setsData.map(s => s?.reps ?? 0);
      let durations: number[] | null = null;
      let restSeconds: number | null = null;
      try {
        const p = JSON.parse(e.comment || '');
        if (p?.challenge) {
          if (Array.isArray(p.durations)) durations = p.durations;
          if (typeof p.restSeconds === 'number') restSeconds = p.restSeconds;
        }
      } catch { /* stary format bez JSON */ }
      return {
        sessionId: e.session.id,
        date: e.session.date,
        exerciseId: e.exercise?.id ?? e.exerciseId,
        exerciseName: e.exercise?.name ?? '—',
        muscleGroup: e.exercise?.muscleGroup ?? null,
        userId: e.session.user?.id ?? '',
        userName: e.session.user?.name ?? '',
        reps,
        durations,
        restSeconds,
        totalReps: reps.reduce((a, b) => a + b, 0),
        setsCount: reps.length,
      };
    });

    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('GET /api/challenges', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

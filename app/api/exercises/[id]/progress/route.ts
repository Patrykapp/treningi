import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });

    const { id: exerciseId } = await params;
    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get('userId') || userId;

    const entries = await prisma.workoutEntry.findMany({
      where: { exerciseId, session: { userId: targetUserId } },
      include: { session: { select: { date: true } } },
      orderBy: { session: { date: 'asc' } },
    });

    // Grupuj po dacie sesji — jeden punkt per dzień (max 1RM w danym dniu)
    const byDate = new Map<string, { maxWeight: number; bestReps: number; best1RM: number; volume: number }>();

    for (const e of entries) {
      const dateKey = (e.session.date as Date).toISOString().slice(0, 10);
      const setsData = Array.isArray(e.setsData) && e.setsData.length > 0
        ? (e.setsData as { reps: number; weight: number }[])
        : Array.from({ length: e.sets }, () => ({ reps: e.reps, weight: e.weight }));

      let maxWeight = 0;
      let bestReps = 0;
      let best1RM = 0;
      let volume = 0;

      for (const s of setsData) {
        const orm = s.weight > 0 && s.reps > 0
          ? (s.reps === 1 ? s.weight : Math.round(s.weight * (1 + s.reps / 30) * 10) / 10)
          : 0;
        if (s.weight > maxWeight) { maxWeight = s.weight; bestReps = s.reps; }
        if (orm > best1RM) best1RM = orm;
        volume += s.reps * s.weight;
      }

      const prev = byDate.get(dateKey);
      if (!prev || best1RM > prev.best1RM) {
        byDate.set(dateKey, { maxWeight, bestReps, best1RM, volume: (prev?.volume || 0) + volume });
      } else {
        byDate.set(dateKey, { ...prev, volume: prev.volume + volume });
      }
    }

    const points = Array.from(byDate.entries()).map(([date, d]) => ({
      date,
      maxWeight: d.maxWeight,
      bestReps: d.bestReps,
      best1RM: d.best1RM,
      volume: Math.round(d.volume),
    }));

    return NextResponse.json(points);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

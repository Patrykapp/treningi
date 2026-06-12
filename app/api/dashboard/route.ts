import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';

// GET /api/dashboard — wszystkie dane pulpitu w JEDNYM zapytaniu
// (wcześniej pulpit robił ~8 osobnych requestów: users, sesje ×2, biegi ×2, wagi ×2).
export async function GET() {
  try {
    const authUserId = await getAuthUserId();
    if (!authUserId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });

    const users = await prisma.user.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });

    const perUser = await Promise.all(users.map(async (u) => {
      const [sessions, runs, weight] = await Promise.all([
        prisma.workoutSession.findMany({
          where: { userId: u.id },
          include: { user: { select: { id: true, name: true } }, entries: { include: { exercise: true } } },
          orderBy: { date: 'desc' },
          take: 100,
        }),
        prisma.runSession.findMany({
          where: { userId: u.id },
          orderBy: { date: 'desc' },
          take: 100,
        }),
        prisma.bodyWeight.findFirst({
          where: { userId: u.id },
          orderBy: { date: 'desc' },
          select: { weight: true },
        }),
      ]);
      return { id: u.id, sessions, runs, weightKg: weight?.weight || 0 };
    }));

    const sessionsByUser: Record<string, unknown> = {};
    const runsByUser: Record<string, unknown> = {};
    const weightByUser: Record<string, number> = {};
    for (const p of perUser) {
      sessionsByUser[p.id] = p.sessions;
      runsByUser[p.id] = p.runs;
      weightByUser[p.id] = p.weightKg;
    }

    return NextResponse.json(
      { users, sessionsByUser, runsByUser, weightByUser },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (e) {
    console.error('GET /api/dashboard', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

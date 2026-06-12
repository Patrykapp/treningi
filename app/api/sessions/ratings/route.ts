import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';
import { computeRating } from '@/lib/rating';

// POST /api/sessions/ratings  Body: { ids: string[] }
// Zbiorcze oceny — 2 zapytania do bazy zamiast 2 na każdą sesję,
// 1 request HTTP zamiast 10 przy wejściu w historię.
export async function POST(request: Request) {
  try {
    const authUserId = await getAuthUserId();
    if (!authUserId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });

    const { ids } = await request.json();
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 30) {
      return NextResponse.json({ error: 'Podaj 1-30 id sesji' }, { status: 400 });
    }

    const sessions = await prisma.workoutSession.findMany({
      where: { id: { in: ids } },
      include: { entries: { include: { exercise: true } } },
    });
    if (sessions.length === 0) return NextResponse.json({});

    // Historia per użytkownik — jedno zapytanie na użytkownika (zwykle 1)
    const userIds = [...new Set(sessions.map(s => s.userId))];
    const maxDate = new Date(Math.max(...sessions.map(s => s.date.getTime())));
    const historyByUser = new Map<string, { date: Date; entries: typeof sessions[number]['entries'] }[]>();
    for (const uid of userIds) {
      const history = await prisma.workoutSession.findMany({
        where: { userId: uid, date: { lt: maxDate } },
        include: { entries: { include: { exercise: true } } },
        orderBy: { date: 'desc' },
        take: 60,
      });
      historyByUser.set(uid, history);
    }

    const result: Record<string, ReturnType<typeof computeRating>> = {};
    for (const session of sessions) {
      const allHistory = historyByUser.get(session.userId) || [];
      const history = allHistory.filter(h => h.date < session.date).slice(0, 30);
      result[session.id] = computeRating(session, history);
    }

    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('POST /api/sessions/ratings', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

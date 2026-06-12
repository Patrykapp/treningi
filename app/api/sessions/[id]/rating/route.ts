import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';
import { computeRating } from '@/lib/rating';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUserId = await getAuthUserId();
    if (!authUserId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });

    const { id } = await params;
    const session = await prisma.workoutSession.findUnique({
      where: { id },
      include: { entries: { include: { exercise: true } } },
    });
    if (!session) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 });

    // Historia poprzednich sesji tego użytkownika (przed tą sesją)
    const history = await prisma.workoutSession.findMany({
      where: { userId: session.userId, date: { lt: session.date } },
      include: { entries: { include: { exercise: true } } },
      orderBy: { date: 'desc' },
      take: 30,
    });

    return NextResponse.json(computeRating(session, history), {
      headers: {
        // no-store: ocena zależy od edytowalnych danych sesji i historii PR —
        // cache CDN pokazywał nieaktualne gwiazdki/PR nawet godzinę po edycji
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Blad serwera' }, { status: 500 });
  }
}

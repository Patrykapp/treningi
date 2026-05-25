import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { format } from 'date-fns';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    const entries = await prisma.workoutEntry.findMany({
      where: userId ? { session: { userId } } : {},
      include: {
        exercise: true,
        session: { include: { user: true } },
      },
      orderBy: { session: { date: 'asc' } },
    });

    const headers = ['data', 'uzytkownik', 'cwiczenie', 'grupa_miesniowa', 'serie', 'powt', 'ciezar_kg', 'rpe', 'komentarz', 'id_sesji'];
    const rows = entries.map(e => [
      format(e.session.date, 'yyyy-MM-dd'),
      e.session.user.name,
      e.exercise.name,
      e.exercise.muscleGroup || '',
      e.sets,
      e.reps,
      e.weight,
      e.rpe || '',
      (e.comment || '').replace(/,/g, ';'),
      e.session.id,
    ]);

    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="treningi_${format(new Date(), 'yyyyMMdd')}.csv"`,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Błąd eksportu' }, { status: 500 });
  }
}

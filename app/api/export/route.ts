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

    // 'serie'/'powt'/'ciezar_kg' to pola zbiorcze (nieprecyzyjne, gdy serie mają różne
    // ciężary/powtórzenia — np. rozgrzewka + serie robocze). Prawdziwe dane per-seria
    // siedzą w setsData, więc dokładamy kolumnę 'serie_szczegoly' z realnym rozbiciem
    // (np. "8x40kg;7x65kg;7x65kg;7x65kg") — to jej używa algorytm oceny (calcVolume).
    const headers = ['data', 'uzytkownik', 'cwiczenie', 'id_cwiczenia', 'grupa_miesniowa', 'serie', 'powt', 'ciezar_kg', 'serie_szczegoly', 'rpe', 'komentarz', 'id_sesji'];
    const rows = entries.map((e: { exerciseId: string; sets: number; reps: number; weight: number; rpe: number | null; comment: string | null; setsData: unknown; session: { date: Date; user: { name: string }; id: string }; exercise: { name: string; muscleGroup: string | null } }) => {
      const sd = Array.isArray(e.setsData) ? (e.setsData as { reps: number; weight: number }[]) : [];
      const setDetails = sd.length > 0 ? sd.map(s => `${s.reps}x${s.weight}kg`).join(';') : '';
      return [
        format(e.session.date, 'yyyy-MM-dd'),
        e.session.user.name,
        e.exercise.name,
        e.exerciseId,
        e.exercise.muscleGroup || '',
        e.sets,
        e.reps,
        e.weight,
        setDetails,
        e.rpe || '',
        (e.comment || '').replace(/,/g, ';'),
        e.session.id,
      ];
    });

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

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const authUserId = await getAuthUserId();
    if (!authUserId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const exerciseId = searchParams.get('exerciseId');
    const userId = searchParams.get('userId');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const limitParam = parseInt(searchParams.get('limit') || '0');

    // userId param dozwolony — używany do porównania z innymi użytkownikami w wykresach,
    // ale tylko zalogowany użytkownik może w ogóle przeglądać dane.
    const entries = await prisma.workoutEntry.findMany({
      where: {
        ...(exerciseId ? { exerciseId } : {}),
        session: {
          ...(userId ? { userId } : {}),
          ...(from || to ? {
            date: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          } : {}),
        },
      },
      include: {
        exercise: true,
        session: { include: { user: true } },
      },
      orderBy: { session: { date: 'desc' } },
      ...(limitParam > 0 ? { take: limitParam } : {}),
    });
    return NextResponse.json(entries);
  } catch {
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

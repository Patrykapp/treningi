import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const exerciseId = searchParams.get('exerciseId');
    const userId = searchParams.get('userId');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

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
    });
    return NextResponse.json(entries);
  } catch {
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

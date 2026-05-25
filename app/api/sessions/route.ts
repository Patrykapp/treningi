import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const limit = parseInt(searchParams.get('limit') || '50');
    const sessions = await prisma.workoutSession.findMany({
      where: {
        userId,
        ...(from || to ? { date: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
      },
      include: { user: true, entries: { include: { exercise: true } } },
      orderBy: { date: 'desc' },
      take: limit,
    });
    return NextResponse.json(sessions);
  } catch {
    return NextResponse.json({ error: 'Blad serwera' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    const { date, notes, entries } = await request.json();
    if (!date) return NextResponse.json({ error: 'Data jest wymagana' }, { status: 400 });
    if (!entries?.length) return NextResponse.json({ error: 'Dodaj co najmniej jedno cwiczenie' }, { status: 400 });
    const session = await prisma.workoutSession.create({
      data: {
        date: new Date(date),
        userId,
        notes: notes || null,
        entries: {
          create: entries.map((e: { exerciseId: string; sets: number; reps: number; weight: number; rpe?: number; comment?: string; setsData?: { reps: number; weight: number }[] }) => {
            const sd = e.setsData && e.setsData.length > 0 ? e.setsData : [];
            return {
              exerciseId: e.exerciseId,
              sets: sd.length > 0 ? sd.length : Number(e.sets),
              reps: sd.length > 0 ? Math.max(...sd.map(s => s.reps)) : Number(e.reps),
              weight: sd.length > 0 ? Math.max(...sd.map(s => s.weight)) : Number(e.weight),
              rpe: e.rpe ? Number(e.rpe) : null,
              comment: e.comment || null,
              setsData: sd,
            };
          }),
        },
      },
      include: { user: true, entries: { include: { exercise: true } } },
    });
    return NextResponse.json(session, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Blad serwera' }, { status: 500 });
  }
}

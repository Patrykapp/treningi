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
    const date = searchParams.get('date');
    const targetUserId = searchParams.get('userId');
    const limit = parseInt(searchParams.get('limit') || '50');

    let dateFilter = {};
    if (date) {
      const dayStart = new Date(date + 'T00:00:00.000Z');
      const dayEnd = new Date(date + 'T23:59:59.999Z');
      dateFilter = { date: { gte: dayStart, lte: dayEnd } };
    } else if (from || to) {
      dateFilter = { date: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } };
    }

    const sessions = await prisma.workoutSession.findMany({
      where: {
        userId: targetUserId || userId,
        ...dateFilter,
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
    const authUserId = await getAuthUserId();
    if (!authUserId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    const { date, notes, entries, targetUserId } = await request.json();
    const userId = targetUserId || authUserId;
    if (!date) return NextResponse.json({ error: 'Data jest wymagana' }, { status: 400 });
    if (!entries?.length) return NextResponse.json({ error: 'Dodaj co najmniej jedno ćwiczenie' }, { status: 400 });
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

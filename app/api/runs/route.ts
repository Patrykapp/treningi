import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || user.userId;
    const limit = parseInt(searchParams.get('limit') || '50');

    const runs = await prisma.runSession.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      take: limit,
    });

    return NextResponse.json(runs, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    console.error('GET /api/runs error:', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { date, distance, duration, splits, notes, userId } = await request.json();

    if (!date || distance === undefined || !duration) {
      return NextResponse.json({ error: 'Wymagane: data, dystans, czas' }, { status: 400 });
    }

    const targetUserId = userId || user.userId;

    const run = await prisma.runSession.create({
      data: {
        userId: targetUserId,
        date: new Date(date),
        distance: parseFloat(distance),
        duration: Math.round(Number(duration)),
        splits: Array.isArray(splits) ? splits : [],
        notes: notes || null,
      },
    });

    return NextResponse.json(run, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('POST /api/runs error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

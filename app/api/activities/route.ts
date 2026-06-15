import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get('userId') || userId;
    const limit = parseInt(searchParams.get('limit') || '100');
    const from = searchParams.get('from');

    const activities = await prisma.otherActivity.findMany({
      where: {
        userId: targetUserId,
        ...(from ? { date: { gte: new Date(from) } } : {}),
      },
      orderBy: { date: 'desc' },
      take: limit,
      include: { user: { select: { id: true, name: true } } },
    });
    return NextResponse.json(activities);
  } catch {
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    const { date, type, durationMin, distanceKm, kcal, notes } = await request.json();
    if (!date || !type || !durationMin) {
      return NextResponse.json({ error: 'Data, typ i czas są wymagane' }, { status: 400 });
    }
    const activity = await prisma.otherActivity.create({
      data: {
        userId,
        date: new Date(date),
        type: String(type).trim(),
        durationMin: Number(durationMin),
        distanceKm: distanceKm ? Number(distanceKm) : null,
        kcal: kcal ? Number(kcal) : null,
        notes: notes?.trim() || null,
      },
      include: { user: { select: { id: true, name: true } } },
    });
    return NextResponse.json(activity, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Błąd zapisu' }, { status: 500 });
  }
}

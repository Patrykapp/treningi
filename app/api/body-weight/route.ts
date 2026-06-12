import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    const { searchParams } = new URL(request.url);
    // Odczyt wagi innego użytkownika dozwolony (wspólna aplikacja, potrzebne do kcal)
    const targetUserId = searchParams.get('userId') || userId;
    const limit = parseInt(searchParams.get('limit') || '200');
    const entries = await prisma.bodyWeight.findMany({
      where: { userId: targetUserId },
      include: { user: true },
      orderBy: { date: 'desc' },
      take: limit,
    });
    return NextResponse.json(entries);
  } catch {
    return NextResponse.json({ error: 'Blad serwera' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    const { date, weight, notes } = await req.json();
    if (!date || !weight) {
      return NextResponse.json({ error: 'Brakuje pol' }, { status: 400 });
    }
    const entry = await prisma.bodyWeight.create({
      data: {
        userId,
        date: new Date(date),
        weight: parseFloat(weight),
        notes: notes || null,
      },
      include: { user: true },
    });
    return NextResponse.json(entry, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Blad serwera' }, { status: 500 });
  }
}

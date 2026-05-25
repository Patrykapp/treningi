import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const entries = await prisma.bodyWeight.findMany({
      where: userId ? { userId } : {},
      include: { user: true },
      orderBy: { date: 'desc' },
      take: 200,
    });
    return NextResponse.json(entries);
  } catch {
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { userId, date, weight, notes } = await req.json();
    if (!userId || !date || !weight) {
      return NextResponse.json({ error: 'Brakuje pól' }, { status: 400 });
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
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

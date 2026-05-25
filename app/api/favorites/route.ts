import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';

export async function GET() {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    const favorites = await prisma.userFavorite.findMany({
      where: { userId },
      select: { exerciseId: true },
    });
    return NextResponse.json(favorites.map((f: { exerciseId: string }) => f.exerciseId));
  } catch {
    return NextResponse.json({ error: 'Blad serwera' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    const { exerciseId } = await req.json();
    if (!exerciseId) return NextResponse.json({ error: 'Brakuje exerciseId' }, { status: 400 });
    await prisma.userFavorite.upsert({
      where: { userId_exerciseId: { userId, exerciseId } },
      create: { userId, exerciseId },
      update: {},
    });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Blad serwera' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    const { exerciseId } = await req.json();
    if (!exerciseId) return NextResponse.json({ error: 'Brakuje exerciseId' }, { status: 400 });
    await prisma.userFavorite.deleteMany({ where: { userId, exerciseId } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Blad serwera' }, { status: 500 });
  }
}

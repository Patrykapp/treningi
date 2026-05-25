import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const templates = await prisma.workoutTemplate.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(templates);
  } catch {
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { name, entries } = await req.json();
    if (!name || !entries) {
      return NextResponse.json({ error: 'Brakuje pól' }, { status: 400 });
    }
    const tpl = await prisma.workoutTemplate.create({
      data: { name, entries },
    });
    return NextResponse.json(tpl, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

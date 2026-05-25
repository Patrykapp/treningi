import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const users = await prisma.user.findMany({ orderBy: { name: 'asc' } });
    return NextResponse.json(users);
  } catch {
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { name } = await request.json();
    if (!name?.trim()) return NextResponse.json({ error: 'Imię jest wymagane' }, { status: 400 });
    const user = await prisma.user.create({ data: { name: name.trim() } });
    return NextResponse.json(user, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

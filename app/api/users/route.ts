import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';

export async function GET() {
  try {
    // Tylko bezpieczne pola — NIE wystawiamy passwordHash ani accessCode.
    // isolated potrzebne, by front odróżnił konta "z boku" (ukryć je z list
    // interaktywnych: zapisz-jako, przełącznik profilu, zachęty).
    const users = await prisma.user.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true, isolated: true },
    });
    return NextResponse.json(users);
  } catch {
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authUserId = await getAuthUserId();
    if (!authUserId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    const { name } = await request.json();
    if (!name?.trim()) return NextResponse.json({ error: 'Imię jest wymagane' }, { status: 400 });
    const user = await prisma.user.create({ data: { name: name.trim() } });
    return NextResponse.json(user, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

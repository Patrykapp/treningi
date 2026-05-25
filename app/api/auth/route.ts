import { NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth';
import bcrypt from 'bcryptjs';

const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET!);

// GET /api/auth — sprawdź czy zalogowany, zwróć info o użytkowniku
export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ authenticated: false });
    return NextResponse.json({ authenticated: true, userId: user.userId, email: user.email, name: user.name });
  } catch {
    return NextResponse.json({ authenticated: false });
  }
}

// POST /api/auth — logowanie emailem i hasłem
export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Podaj email i hasło' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!user || !user.passwordHash) {
      return NextResponse.json({ error: 'Nieprawidłowy email lub hasło' }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: 'Nieprawidłowy email lub hasło' }, { status: 401 });
    }

    const token = await new SignJWT({ userId: user.id, email: user.email, name: user.name })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(secret());

    const res = NextResponse.json({ success: true, userId: user.id, name: user.name });
    res.cookies.set('workout_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
      sameSite: 'lax',
    });
    return res;
  } catch {
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

// DELETE /api/auth — wylogowanie
export async function DELETE() {
  const res = NextResponse.json({ success: true });
  res.cookies.set('workout_token', '', { maxAge: 0, path: '/' });
  return res;
}

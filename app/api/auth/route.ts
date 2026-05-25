import { NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth';
import bcrypt from 'bcryptjs';

const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET!);

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ authenticated: false });
    return NextResponse.json({ authenticated: true, userId: user.userId, email: user.email, name: user.name });
  } catch {
    return NextResponse.json({ authenticated: false });
  }
}

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ error: 'Podaj email i haslo' }, { status: 400 });
    }
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!user || !user.passwordHash) {
      return NextResponse.json({ error: 'Nieprawidlowy email lub haslo' }, { status: 401 });
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: 'Nieprawidlowy email lub haslo' }, { status: 401 });
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
    return NextResponse.json({ error: 'Blad serwera' }, { status: 500 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ success: true });
  res.cookies.set('workout_token', '', { maxAge: 0, path: '/' });
  return res;
}

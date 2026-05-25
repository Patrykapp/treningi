import { NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth';
import bcrypt from 'bcryptjs';

const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET!);

async function makeToken(userId: string, email: string, name: string) {
  return new SignJWT({ userId, email, name })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .sign(secret());
}

function tokenResponse(token: string) {
  const res = NextResponse.json({ success: true });
  res.cookies.set('workout_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });
  return res;
}

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
    const body = await request.json();
    const { email, password, code } = body as { email?: string; password?: string; code?: string };

    // Tryb: kod dostepu
    if (code !== undefined) {
      const adminCode = process.env.ADMIN_CODE;
      if (!adminCode || code !== adminCode) {
        return NextResponse.json({ error: 'Nieprawidlowy kod dostepu' }, { status: 401 });
      }
      // Znajdz pierwszego uzytkownika lub stworz admina
      let user = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
      if (!user) {
        user = await prisma.user.create({ data: { name: 'Admin' } });
      }
      const token = await makeToken(user.id, user.email ?? '', user.name);
      return tokenResponse(token);
    }

    // Tryb: email + haslo
    if (!email || !password) {
      return NextResponse.json({ error: 'Podaj email i haslo' }, { status: 400 });
    }
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      return NextResponse.json({ error: 'Nieprawidlowy email lub haslo' }, { status: 401 });
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: 'Nieprawidlowy email lub haslo' }, { status: 401 });
    }
    const token = await makeToken(user.id, user.email ?? '', user.name);
    return tokenResponse(token);

  } catch {
    return NextResponse.json({ error: 'Blad serwera' }, { status: 500 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ success: true });
  res.cookies.set('workout_token', '', { maxAge: 0, path: '/' });
  return res;
}

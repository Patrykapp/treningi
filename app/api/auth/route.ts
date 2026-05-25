import { NextResponse } from 'next/server';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

// GET /api/auth — sprawdź czy zalogowany
export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('workout_token')?.value;
    if (!token) return NextResponse.json({ authenticated: false });
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET!);
    await jwtVerify(token, secret);
    return NextResponse.json({ authenticated: true });
  } catch {
    return NextResponse.json({ authenticated: false });
  }
}

// POST /api/auth — logowanie
export async function POST(request: Request) {
  try {
    const { password } = await request.json();

    if (!password || password !== process.env.APP_PASSWORD) {
      return NextResponse.json({ error: 'Nieprawidłowy kod dostępu' }, { status: 401 });
    }

    const secret = new TextEncoder().encode(process.env.AUTH_SECRET!);
    const token = await new SignJWT({ ok: true })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(secret);

    const res = NextResponse.json({ success: true });
    res.cookies.set('workout_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 30, // 30 dni
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

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const PUBLIC = ['/login', '/api/auth'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Przepuść publiczne ścieżki
  if (PUBLIC.some(p => pathname.startsWith(p))) {
    // Jeśli zalogowany i idzie na /login — przekieruj na start
    if (pathname.startsWith('/login')) {
      const token = request.cookies.get('workout_token')?.value;
      if (token) {
        try {
          const secret = new TextEncoder().encode(process.env.AUTH_SECRET!);
          await jwtVerify(token, secret);
          return NextResponse.redirect(new URL('/', request.url));
        } catch { /* token nieważny */ }
      }
    }
    return NextResponse.next();
  }

  // Sprawdź token
  const token = request.cookies.get('workout_token')?.value;
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET!);
    await jwtVerify(token, secret);
    return NextResponse.next();
  } catch {
    const res = NextResponse.redirect(new URL('/login', request.url));
    res.cookies.delete('workout_token');
    return res;
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)'],
};

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

// Tylko te ścieżki wymagają logowania
const PROTECTED = ['/trening', '/ustawienia', '/cwiczenia', '/cwiczenie', '/waga', '/historia'];

async function isAuthenticated(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get('workout_token')?.value;
  if (!token) return false;
  try {
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET!);
    await jwtVerify(token, secret);
    return true;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Jeśli zalogowany i idzie na /login — przekieruj na start
  if (pathname.startsWith('/login')) {
    if (await isAuthenticated(request)) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // Chroń strony aplikacji
  if (PROTECTED.some(p => pathname.startsWith(p))) {
    if (!await isAuthenticated(request)) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)'],
};

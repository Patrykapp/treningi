import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/access';

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

/**
 * Założenie nowego konta — wyłącznie przez administratora.
 *
 * Wcześniej wystarczyło być zalogowanym, więc konto boczne mogło założyć sobie
 * konto GŁÓWNE i obejść całą izolację. Teraz decyduje o tym jedna osoba, a nowe
 * konto zawsze powstaje jako boczne (`isolated: true`) — tak jak konto Maćka:
 * bez rywalizacji na pulpicie, bez zapisu ćwiczeń za innych, bez przełącznika
 * profilu. Podgląd historii i porównania zostają.
 *
 * Logowanie odbywa się osobistym kodem dostępu, więc kod jest wymagany.
 */
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status });

    const body = await request.json().catch(() => ({}));
    const name = String(body?.name ?? '').trim();
    const accessCode = String(body?.accessCode ?? '').replace(/\D/g, '');

    if (name.length < 2 || name.length > 30) {
      return NextResponse.json({ error: 'Imię musi mieć od 2 do 30 znaków' }, { status: 400 });
    }
    if (accessCode.length < 4 || accessCode.length > 8) {
      return NextResponse.json({ error: 'Kod dostępu musi mieć od 4 do 8 cyfr' }, { status: 400 });
    }
    // Kod osobisty jest sprawdzany PRZED wspólnym kodem administracyjnym
    // (patrz /api/auth), więc taki sam kod przejąłby logowanie administratora.
    if (process.env.ADMIN_CODE && accessCode === process.env.ADMIN_CODE.trim()) {
      return NextResponse.json({ error: 'Ten kod jest zajęty — wybierz inny' }, { status: 409 });
    }

    const [nameTaken, codeTaken] = await Promise.all([
      prisma.user.findFirst({ where: { name }, select: { id: true } }),
      prisma.user.findFirst({ where: { accessCode }, select: { id: true } }),
    ]);
    if (nameTaken) return NextResponse.json({ error: `Konto „${name}" już istnieje` }, { status: 409 });
    if (codeTaken) return NextResponse.json({ error: 'Ten kod jest już przypisany do innego konta' }, { status: 409 });

    const user = await prisma.user.create({
      data: { name, accessCode, isolated: true },
      select: { id: true, name: true, accessCode: true, isolated: true, createdAt: true },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (e) {
    console.error('POST /api/users', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

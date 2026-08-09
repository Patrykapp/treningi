import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, getAdminUserId } from '@/lib/access';

/**
 * Usunięcie konta — wyłącznie administrator.
 *
 * Wcześniej wystarczyło być zalogowanym: konto boczne mogło skasować konto
 * właściciela razem z całą historią. Do tego kasujemy tylko konta puste —
 * treningi trzymają twardą referencję do użytkownika, więc usunięcie konta
 * z historią i tak skończyłoby się błędem bazy, tyle że nieczytelnym.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status });

    const { id } = await params;
    const adminId = await getAdminUserId();
    if (id === adminId) {
      return NextResponse.json({ error: 'Nie można usunąć konta administratora' }, { status: 400 });
    }

    const target = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!target) return NextResponse.json({ error: 'Nie znaleziono konta' }, { status: 404 });

    const [sessions, runs, activities, weights] = await Promise.all([
      prisma.workoutSession.count({ where: { userId: id } }),
      prisma.runSession.count({ where: { userId: id } }),
      prisma.otherActivity.count({ where: { userId: id } }),
      prisma.bodyWeight.count({ where: { userId: id } }),
    ]);
    const total = sessions + runs + activities + weights;
    if (total > 0) {
      return NextResponse.json(
        {
          error: `Konto „${target.name}" ma zapisane dane (${sessions} treningów, ${runs} biegów, ` +
            `${activities} aktywności, ${weights} pomiarów wagi). Usuń je najpierw albo zostaw konto w spokoju.`,
        },
        { status: 409 }
      );
    }

    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('DELETE /api/users/[id]', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

/** Zmiana imienia albo kodu dostępu — wyłącznie administrator. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status });

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const data: { name?: string; accessCode?: string } = {};

    if (body?.name !== undefined) {
      const name = String(body.name).trim();
      if (name.length < 2 || name.length > 30) {
        return NextResponse.json({ error: 'Imię musi mieć od 2 do 30 znaków' }, { status: 400 });
      }
      const taken = await prisma.user.findFirst({ where: { name, NOT: { id } }, select: { id: true } });
      if (taken) return NextResponse.json({ error: `Konto „${name}" już istnieje` }, { status: 409 });
      data.name = name;
    }

    if (body?.accessCode !== undefined) {
      const accessCode = String(body.accessCode).replace(/\D/g, '');
      if (accessCode.length < 4 || accessCode.length > 8) {
        return NextResponse.json({ error: 'Kod dostępu musi mieć od 4 do 8 cyfr' }, { status: 400 });
      }
      if (process.env.ADMIN_CODE && accessCode === process.env.ADMIN_CODE.trim()) {
        return NextResponse.json({ error: 'Ten kod jest zajęty — wybierz inny' }, { status: 409 });
      }
      const taken = await prisma.user.findFirst({ where: { accessCode, NOT: { id } }, select: { id: true } });
      if (taken) return NextResponse.json({ error: 'Ten kod jest już przypisany do innego konta' }, { status: 409 });
      data.accessCode = accessCode;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nic do zmiany' }, { status: 400 });
    }

    const user = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, name: true, accessCode: true, isolated: true },
    });
    return NextResponse.json(user);
  } catch (e) {
    console.error('PUT /api/users/[id]', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';
import { isAdminUser } from '@/lib/access';

/**
 * Widok zarządzania kontami dla administratora.
 *
 * Osobna trasa, bo zwraca rzeczy, których publiczna lista użytkowników zwracać
 * nie może: kody dostępu i liczbę zapisanych treningów. Kody widzi wyłącznie
 * administrator — to on je nadaje i musi mieć jak je komuś podać.
 *
 * Nieadministratorowi oddajemy `isAdmin: false` i pustą listę zamiast błędu:
 * ekran ustawień po prostu nie pokaże wtedy tej sekcji.
 */
export async function GET() {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });

    if (!(await isAdminUser(userId))) {
      return NextResponse.json({ isAdmin: false, users: [] });
    }

    const users = await prisma.user.findMany({
      orderBy: [{ isolated: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, name: true, accessCode: true, isolated: true, createdAt: true },
    });

    const counts = await prisma.workoutSession.groupBy({
      by: ['userId'],
      _count: { userId: true },
    });
    const byUser = new Map(counts.map((c) => [c.userId, c._count.userId]));

    return NextResponse.json({
      isAdmin: true,
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        accessCode: u.accessCode,
        isolated: u.isolated,
        isAdmin: u.id === userId,
        sessions: byUser.get(u.id) ?? 0,
      })),
    });
  } catch (e) {
    console.error('GET /api/users/manage', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

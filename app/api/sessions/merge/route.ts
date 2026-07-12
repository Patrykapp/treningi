import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';

// POST /api/sessions/merge
// Body: { keepId: string, deleteId: string }
// Moves all entries from deleteId into keepId, then deletes deleteId.
export async function POST(request: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });

    const { keepId, deleteId } = await request.json();
    if (!keepId || !deleteId || keepId === deleteId) {
      return NextResponse.json({ error: 'Nieprawidłowe parametry' }, { status: 400 });
    }

    const [keep, del] = await Promise.all([
      prisma.workoutSession.findUnique({ where: { id: keepId } }),
      prisma.workoutSession.findUnique({ where: { id: deleteId }, include: { entries: true } }),
    ]);

    if (!keep || !del) return NextResponse.json({ error: 'Nie znaleziono sesji' }, { status: 404 });
    if (keep.userId !== userId || del.userId !== userId) {
      return NextResponse.json({ error: 'Brak dostępu' }, { status: 403 });
    }

    await prisma.$transaction([
      prisma.workoutEntry.updateMany({
        where: { sessionId: deleteId },
        data: { sessionId: keepId },
      }),
      // Aktywności i biegi przypięte do usuwanej sesji — bez tego onDelete: SetNull
      // po prostu odpinał je po cichu zamiast przenieść pod sesję, którą zachowujemy.
      prisma.otherActivity.updateMany({
        where: { sessionId: deleteId },
        data: { sessionId: keepId },
      }),
      prisma.runSession.updateMany({
        where: { sessionId: deleteId },
        data: { sessionId: keepId },
      }),
      prisma.workoutSession.delete({ where: { id: deleteId } }),
    ]);

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

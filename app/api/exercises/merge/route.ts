import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';

// POST /api/exercises/merge  Body: { keepId, deleteId }
// Przenosi wpisy historii, ulubione i odwołania w szablonach z deleteId do keepId,
// po czym usuwa ćwiczenie deleteId. Całość w jednej transakcji.
export async function POST(request: Request) {
  try {
    const authUserId = await getAuthUserId();
    if (!authUserId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });

    const { keepId, deleteId } = await request.json();
    if (!keepId || !deleteId || keepId === deleteId) {
      return NextResponse.json({ error: 'Wybierz dwa różne ćwiczenia' }, { status: 400 });
    }

    const [keep, del] = await Promise.all([
      prisma.exercise.findUnique({ where: { id: keepId } }),
      prisma.exercise.findUnique({ where: { id: deleteId } }),
    ]);
    if (!keep || !del) return NextResponse.json({ error: 'Nie znaleziono ćwiczenia' }, { status: 404 });

    const moved = await prisma.$transaction(async (tx) => {
      // 1. Wpisy treningowe
      const { count } = await tx.workoutEntry.updateMany({
        where: { exerciseId: deleteId },
        data: { exerciseId: keepId },
      });

      // 2. Ulubione — usuń te, które po zmianie byłyby duplikatem (user ma już keepId)
      const keepFavUserIds = (await tx.userFavorite.findMany({
        where: { exerciseId: keepId }, select: { userId: true },
      })).map(f => f.userId);
      await tx.userFavorite.deleteMany({
        where: { exerciseId: deleteId, userId: { in: keepFavUserIds } },
      });
      await tx.userFavorite.updateMany({
        where: { exerciseId: deleteId },
        data: { exerciseId: keepId },
      });

      // 3. Szablony (entries w Json) — podmień odwołania
      const templates = await tx.workoutTemplate.findMany();
      for (const tpl of templates) {
        const entries = Array.isArray(tpl.entries) ? (tpl.entries as { exerciseId: string }[]) : [];
        if (entries.some(e => e.exerciseId === deleteId)) {
          await tx.workoutTemplate.update({
            where: { id: tpl.id },
            data: { entries: entries.map(e => e.exerciseId === deleteId ? { ...e, exerciseId: keepId } : e) },
          });
        }
      }

      // 4. Usuń scalone ćwiczenie
      await tx.exercise.delete({ where: { id: deleteId } });

      return count;
    });

    return NextResponse.json({ success: true, movedEntries: moved, keptName: keep.name, deletedName: del.name });
  } catch (e) {
    console.error('POST /api/exercises/merge', e);
    return NextResponse.json({ error: 'Błąd scalania — nic nie zostało zmienione' }, { status: 500 });
  }
}

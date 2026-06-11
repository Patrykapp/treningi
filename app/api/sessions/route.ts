import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const date = searchParams.get('date');
    const targetUserId = searchParams.get('userId');
    const limit = parseInt(searchParams.get('limit') || '50');

    let dateFilter = {};
    if (date) {
      const dayStart = new Date(date + 'T00:00:00.000Z');
      const dayEnd = new Date(date + 'T23:59:59.999Z');
      dateFilter = { date: { gte: dayStart, lte: dayEnd } };
    } else if (from || to) {
      dateFilter = { date: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } };
    }

    const sessions = await prisma.workoutSession.findMany({
      where: {
        userId: targetUserId || userId,
        ...dateFilter,
      },
      include: { user: true, entries: { include: { exercise: true } } },
      orderBy: { date: 'desc' },
      take: limit,
    });
    return NextResponse.json(sessions);
  } catch {
    return NextResponse.json({ error: 'Blad serwera' }, { status: 500 });
  }
}

type EntryInput = {
  exerciseId: string; sets: number; reps: number; weight: number;
  rpe?: number; comment?: string; setsData?: { reps: number; weight: number }[];
};

function mapEntry(e: EntryInput) {
  const sd = e.setsData && e.setsData.length > 0 ? e.setsData : [];
  return {
    exerciseId: e.exerciseId,
    sets: sd.length > 0 ? sd.length : Number(e.sets),
    reps: sd.length > 0 ? Math.max(...sd.map(s => s.reps)) : Number(e.reps),
    weight: sd.length > 0 ? Math.max(...sd.map(s => s.weight)) : Number(e.weight),
    rpe: e.rpe ? Number(e.rpe) : null,
    comment: e.comment || null,
    setsData: sd,
  };
}

// POST /api/sessions
// Body: { date, notes, entries, targetUserIds?: string[], targetUserId?: string, appendToExisting?: boolean }
// Zapis dla wielu użytkowników odbywa się w JEDNEJ transakcji — albo zapisze się
// dla wszystkich, albo dla nikogo (wcześniej osobne requesty mogły zapisać częściowo
// i pokazać błąd mimo zapisania ćwiczenia w historii).
// appendToExisting: dopisuje ćwiczenia do istniejącej sesji z tego dnia zamiast tworzyć nową.
export async function POST(request: Request) {
  try {
    const authUserId = await getAuthUserId();
    if (!authUserId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    const { date, notes, entries, targetUserId, targetUserIds, appendToExisting } = await request.json();
    if (!date) return NextResponse.json({ error: 'Data jest wymagana' }, { status: 400 });
    if (!entries?.length) return NextResponse.json({ error: 'Dodaj co najmniej jedno ćwiczenie' }, { status: 400 });

    const userIds: string[] = Array.isArray(targetUserIds) && targetUserIds.length > 0
      ? [...new Set<string>(targetUserIds)]
      : [targetUserId || authUserId];

    // Zweryfikuj użytkowników przed zapisem — czytelny błąd zamiast naruszenia FK
    const found = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true } });
    if (found.length !== userIds.length) {
      return NextResponse.json({ error: 'Nieprawidłowy użytkownik docelowy' }, { status: 400 });
    }

    const mapped = (entries as EntryInput[]).map(mapEntry);
    const dayStart = new Date(date + 'T00:00:00.000Z');
    const dayEnd = new Date(date + 'T23:59:59.999Z');

    const sessions = await prisma.$transaction(async (tx) => {
      const results = [];
      for (const uid of userIds) {
        const existing = appendToExisting
          ? await tx.workoutSession.findFirst({
              where: { userId: uid, date: { gte: dayStart, lte: dayEnd } },
              orderBy: { createdAt: 'asc' },
            })
          : null;

        if (existing) {
          results.push(await tx.workoutSession.update({
            where: { id: existing.id },
            data: {
              notes: existing.notes || notes || null,
              entries: { create: mapped },
            },
            include: { user: true, entries: { include: { exercise: true } } },
          }));
        } else {
          results.push(await tx.workoutSession.create({
            data: {
              date: new Date(date),
              userId: uid,
              notes: notes || null,
              entries: { create: mapped },
            },
            include: { user: true, entries: { include: { exercise: true } } },
          }));
        }
      }
      return results;
    });

    return NextResponse.json(userIds.length === 1 ? sessions[0] : sessions, { status: 201 });
  } catch (e) {
    console.error('POST /api/sessions', e);
    return NextResponse.json({ error: 'Błąd zapisu treningu — żadne dane nie zostały zapisane, spróbuj ponownie' }, { status: 500 });
  }
}

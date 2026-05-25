import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface CsvRow {
  data?: string;
  uzytkownik?: string;
  cwiczenie?: string;
  grupa_miesniowa?: string;
  serie?: string;
  powt?: string;
  ciezar_kg?: string;
  rpe?: string;
  komentarz?: string;
  id_sesji?: string;
}

export async function POST(request: Request) {
  try {
    const { rows } = await request.json() as { rows: CsvRow[] };
    if (!rows?.length) return NextResponse.json({ error: 'Brak danych' }, { status: 400 });

    let imported = 0;
    let skipped = 0;

    // Group by session id or (date + user)
    const sessionMap = new Map<string, { date: string; userName: string; entries: CsvRow[] }>();

    for (const row of rows) {
      const key = row.id_sesji || `${row.data}_${row.uzytkownik}`;
      if (!sessionMap.has(key)) {
        sessionMap.set(key, { date: row.data || '', userName: row.uzytkownik || '', entries: [] });
      }
      sessionMap.get(key)!.entries.push(row);
    }

    for (const [, sessionData] of sessionMap) {
      try {
        // Find or create user
        let user = await prisma.user.findFirst({ where: { name: sessionData.userName } });
        if (!user) {
          user = await prisma.user.create({ data: { name: sessionData.userName } });
        }

        // Create session
        const session = await prisma.workoutSession.create({
          data: {
            date: new Date(sessionData.date),
            userId: user.id,
          },
        });

        // Create entries
        for (const row of sessionData.entries) {
          try {
            let exercise = await prisma.exercise.findFirst({ where: { name: row.cwiczenie } });
            if (!exercise) {
              exercise = await prisma.exercise.create({
                data: { name: row.cwiczenie || 'Nieznane', muscleGroup: row.grupa_miesniowa || null },
              });
            }

            await prisma.workoutEntry.create({
              data: {
                sessionId: session.id,
                exerciseId: exercise.id,
                sets: parseInt(row.serie || '1'),
                reps: parseInt(row.powt || '1'),
                weight: parseFloat(row.ciezar_kg || '0'),
                rpe: row.rpe ? parseFloat(row.rpe) : null,
                comment: row.komentarz || null,
              },
            });
            imported++;
          } catch {
            skipped++;
          }
        }
      } catch {
        skipped += sessionData.entries.length;
      }
    }

    return NextResponse.json({ imported, skipped });
  } catch {
    return NextResponse.json({ error: 'Błąd importu' }, { status: 500 });
  }
}

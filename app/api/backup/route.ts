import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/backup?token=...
// Pełny zrzut danych (JSON) do automatycznego backupu przez GitHub Actions.
// Zabezpieczone tokenem z env BACKUP_TOKEN (ustaw w Vercel), nie cookie —
// żeby cron mógł go wywołać bez logowania.
export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get('token');
    if (!process.env.BACKUP_TOKEN || token !== process.env.BACKUP_TOKEN) {
      return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    }

    const [users, exercises, sessions, entries, bodyWeights, favorites, templates, runs] = await Promise.all([
      prisma.user.findMany({ select: { id: true, name: true, email: true, createdAt: true } }), // bez hashy haseł
      prisma.exercise.findMany(),
      prisma.workoutSession.findMany(),
      prisma.workoutEntry.findMany(),
      prisma.bodyWeight.findMany(),
      prisma.userFavorite.findMany(),
      prisma.workoutTemplate.findMany(),
      prisma.runSession.findMany(),
    ]);

    return NextResponse.json({
      exportedAt: new Date().toISOString(),
      counts: {
        users: users.length, exercises: exercises.length, sessions: sessions.length,
        entries: entries.length, bodyWeights: bodyWeights.length, favorites: favorites.length,
        templates: templates.length, runs: runs.length,
      },
      data: { users, exercises, sessions, entries, bodyWeights, favorites, templates, runs },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('GET /api/backup', e);
    return NextResponse.json({ error: 'Błąd backupu' }, { status: 500 });
  }
}

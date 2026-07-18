import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';
import { computeRating } from '@/lib/rating';

type SetData = { reps: number; weight: number };

function asSetsData(v: unknown): SetData[] {
  return Array.isArray(v) ? (v as SetData[]) : [];
}

// Dokładny kształt zapytania z POST — używany też przez helpery poniżej, żeby
// typy zawsze były zgodne z tym, co faktycznie zwraca Prisma (bez ręcznych,
// mogących rozjechać się z zapytaniem interfejsów).
type SessionWithEntries = Prisma.WorkoutSessionGetPayload<{
  include: { entries: { include: { exercise: true } }; user: { select: { name: true } } };
}>;
type SessionEntry = SessionWithEntries['entries'][number];

async function callGroq(system: string, user: string): Promise<string | null> {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: 100,
        temperature: 0.7,
      }),
    });
    if (!res.ok) {
      console.error('Groq error:', await res.text());
      return null;
    }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim() || null;
    // Groq czasem owija odpowiedź w cudzysłowy mimo instrukcji — zdejmij je.
    return text ? text.replace(/^["'"]+|["'"]+$/g, '') : null;
  } catch (e) {
    console.error('Groq fetch failed:', e);
    return null;
  }
}

// Komentarz trenera pod podsumowaniem zwykłego treningu — bazuje na tej samej
// ocenie (lib/rating.ts), co gwiazdki/wskazówki widoczne na tej samej stronie.
async function buildTrainerComment(session: SessionWithEntries): Promise<string | null> {
  const history = await prisma.workoutSession.findMany({
    where: { userId: session.userId, date: { lt: session.date } },
    include: { entries: { include: { exercise: true } } },
    orderBy: { date: 'desc' },
    take: 30,
  });

  const rating = computeRating(session, history);

  const system = `Jesteś doświadczonym, wspierającym trenerem personalnym. Napisz JEDNO krótkie zdanie po polsku (max 30 słów) komentujące ten konkretny trening, zwracając się bezpośrednio do zawodnika. Odnieś się do przynajmniej jednego konkretnego faktu z danych (wolumen, PR, progres, typ sesji) — nie pisz ogólników w stylu "świetna robota". Odpowiedz WYŁĄCZNIE treścią komentarza, bez cudzysłowów i bez wstępu.`;

  const user = `Zawodnik: ${session.user.name}
Ocena: ${rating.score}/10 (${rating.label})
Typ sesji: ${rating.sessionType ?? 'nieznany'}
Wolumen: ${rating.currentVolume}kg${rating.avgVolume > 0 ? ` (średnia: ${rating.avgVolume}kg)` : ''}
Nowe rekordy: ${rating.prCount}
Szczegóły progresu: ${rating.details.length > 0 ? rating.details.join('; ') : 'brak historii porównawczej'}`;

  return callGroq(system, user);
}

// Komentarz do Wyzwania (sety do upadku) — porównuje wynik do własnej historii
// i do rywala (druga osoba w aplikacji), bazując na tych samych danych co
// /api/challenges (WorkoutEntry z session.notes zaczynającym się od "Challenge:").
async function buildChallengeComment(
  session: { id: string; userId: string },
  entry: SessionEntry
): Promise<string | null> {
  const setsData = asSetsData(entry.setsData);
  const reps = setsData.map(s => s.reps);
  const totalReps = reps.reduce((a, b) => a + b, 0);
  const maxSet = reps.length > 0 ? Math.max(...reps) : 0;
  const minSet = reps.length > 0 ? Math.min(...reps) : 0;

  const others = await prisma.workoutEntry.findMany({
    where: {
      exerciseId: entry.exerciseId,
      session: { notes: { startsWith: 'Challenge:' }, NOT: { id: session.id } },
    },
    select: { setsData: true, session: { select: { userId: true, user: { select: { name: true } } } } },
  });

  let previousBest = 0;
  let rivalBest = 0;
  let rivalName: string | null = null;
  for (const o of others) {
    const total = asSetsData(o.setsData).reduce((s, x) => s + x.reps, 0);
    if (o.session.userId === session.userId) {
      if (total > previousBest) previousBest = total;
    } else {
      if (total > rivalBest) rivalBest = total;
      rivalName = o.session.user.name;
    }
  }
  const isNewPR = previousBest > 0 && totalReps > previousBest;
  const isFirstAttempt = !others.some(o => o.session.userId === session.userId);

  const system = `Jesteś energicznym komentatorem rywalizacji w aplikacji fitness dla dwóch zawodników. Napisz JEDNO krótkie, żywe zdanie po polsku (max 30 słów) podsumowujące wynik tego Wyzwania (serie do upadku mięśniowego). Jeśli dane pozwalają, nawiąż do rywalizacji lub poprzedniego wyniku. Odpowiedz WYŁĄCZNIE treścią komentarza, bez cudzysłowów i bez wstępu.`;

  const user = `Ćwiczenie: ${entry.exercise.name}
Wynik: ${totalReps} powtórzeń łącznie w ${reps.length} seriach (najlepsza seria: ${maxSet}, najsłabsza: ${minSet})
${isFirstAttempt ? 'To pierwsza próba w tym ćwiczeniu — brak historii porównawczej.' : isNewPR ? `Nowy rekord życiowy (poprzedni: ${previousBest} powt.).` : previousBest > 0 ? `Poprzedni rekord własny: ${previousBest} powt. (bez poprawy).` : ''}
${rivalName ? `Rekord rywala (${rivalName}) w tym ćwiczeniu: ${rivalBest} powt. — różnica: ${totalReps - rivalBest > 0 ? '+' : ''}${totalReps - rivalBest}.` : 'Rywal nie ma jeszcze wyniku w tym ćwiczeniu.'}`;

  return callGroq(system, user);
}

export async function POST(request: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });

    const { sessionId } = await request.json();
    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json({ error: 'Brak sessionId' }, { status: 400 });
    }

    const session = await prisma.workoutSession.findUnique({
      where: { id: sessionId },
      include: { entries: { include: { exercise: true } }, user: { select: { name: true } } },
    });
    if (!session) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 });

    if (session.aiComment) {
      return NextResponse.json({ comment: session.aiComment, cached: true });
    }
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({ error: 'AI niedostępne (brak klucza)' }, { status: 502 });
    }

    const isChallenge = session.notes?.startsWith('Challenge:') ?? false;
    let comment: string | null = null;

    if (isChallenge) {
      const entry = session.entries[0];
      if (!entry) return NextResponse.json({ error: 'Brak danych Wyzwania' }, { status: 400 });
      comment = await buildChallengeComment({ id: session.id, userId: session.userId }, entry);
    } else {
      comment = await buildTrainerComment(session);
    }

    if (!comment) return NextResponse.json({ error: 'AI zwróciło pustą odpowiedź' }, { status: 502 });

    await prisma.workoutSession.update({ where: { id: sessionId }, data: { aiComment: comment } });
    return NextResponse.json({ comment, cached: false });
  } catch (e) {
    console.error('POST /api/ai/session-comment', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

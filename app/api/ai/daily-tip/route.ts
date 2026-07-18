import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';

function normalizeMuscle(raw?: string | null): string | null {
  if (!raw) return null;
  return raw.replace(/\s*\(.*?\)/g, '').trim() || null;
}

// Porada/ciekawostka dnia — bez cache'a w bazie (celowo: to treść "na dziś", nie
// dotyczy konkretnego rekordu). Klient cache'uje wynik w localStorage na 24h
// (ten sam wzorzec co /insighty), więc mimo braku cache'a serwerowego to i tak
// jedno zapytanie do Groq na użytkownika dziennie.
export async function GET() {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({ error: 'AI niedostępne (brak klucza)' }, { status: 502 });
    }

    const lastSession = await prisma.workoutSession.findFirst({
      where: { userId },
      orderBy: { date: 'desc' },
      include: { entries: { include: { exercise: true } } },
    });

    const muscleGroups = lastSession
      ? [...new Set(
          lastSession.entries
            .map(e => normalizeMuscle(e.exercise.muscleGroup))
            .filter((m): m is string => !!m)
        )]
      : [];

    const system = `Jesteś doświadczonym trenerem personalnym i dietetykiem sportowym. Podaj JEDNĄ krótką (max 30 słów), konkretną i praktyczną ciekawostkę lub poradę treningową/żywieniową/regeneracyjną po polsku. Unikaj oczywistości typu "pij wodę" czy "śpij dużo" — daj coś konkretnego, najlepiej z liczbą albo mechanizmem działania. Różnicuj temat i formę za każdym razem. Odpowiedz WYŁĄCZNIE treścią, bez wstępu, bez cudzysłowów.`;
    const user = muscleGroups.length > 0
      ? `Użytkownik ostatnio trenował: ${muscleGroups.join(', ')}. Możesz (nie musisz) się do tego odnieść.`
      : 'Brak dodatkowego kontekstu — podaj uniwersalną poradę lub ciekawostkę.';

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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
        max_tokens: 90,
        temperature: 0.95,
      }),
    });

    if (!groqRes.ok) {
      console.error('Groq error:', await groqRes.text());
      return NextResponse.json({ error: 'Błąd AI' }, { status: 502 });
    }

    const data = await groqRes.json();
    const raw = data.choices?.[0]?.message?.content?.trim() || '';
    const tip = raw.replace(/^["'"]+|["'"]+$/g, '');
    if (!tip) return NextResponse.json({ error: 'AI zwróciło pustą odpowiedź' }, { status: 502 });

    return NextResponse.json({ tip, generatedAt: new Date().toISOString() });
  } catch (e) {
    console.error('GET /api/ai/daily-tip', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

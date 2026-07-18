import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';

// Wskazówka techniczna AI dla ćwiczenia — generowana RAZ i cache'owana w bazie
// (Exercise.aiTip), więc kolejne wejścia na stronę ćwiczenia (przez dowolnego
// z 2 użytkowników) nie odpytują już Groq. Kontekst to sama nazwa/partia —
// wystarcza modelowi do sensownego, ogólnego cue technicznego.
export async function POST(request: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });

    const { exerciseId } = await request.json();
    if (!exerciseId || typeof exerciseId !== 'string') {
      return NextResponse.json({ error: 'Brak exerciseId' }, { status: 400 });
    }

    const exercise = await prisma.exercise.findUnique({ where: { id: exerciseId } });
    if (!exercise) return NextResponse.json({ error: 'Nie znaleziono ćwiczenia' }, { status: 404 });

    if (exercise.aiTip) {
      return NextResponse.json({ tip: exercise.aiTip, cached: true });
    }
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({ error: 'AI niedostępne (brak klucza)' }, { status: 502 });
    }

    const system = `Jesteś doświadczonym trenerem personalnym. Dla podanego ćwiczenia siłowego podaj JEDNĄ krótką, konkretną wskazówkę techniczną po polsku (max 25 słów) — kluczowy cue wykonania albo najczęstszy błąd, którego trzeba unikać. Odpowiedz WYŁĄCZNIE treścią wskazówki, bez wstępu, bez cudzysłowów, bez numeracji.`;
    const user = `Ćwiczenie: ${exercise.name}${exercise.muscleGroup ? ` (partia: ${exercise.muscleGroup})` : ''}`;

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
        max_tokens: 80,
        temperature: 0.6,
      }),
    });

    if (!groqRes.ok) {
      console.error('Groq error:', await groqRes.text());
      return NextResponse.json({ error: 'Błąd AI' }, { status: 502 });
    }

    const groqData = await groqRes.json();
    const raw = groqData.choices?.[0]?.message?.content?.trim() || '';
    const tip = raw.replace(/^["'"]+|["'"]+$/g, '');
    if (!tip) return NextResponse.json({ error: 'AI zwróciło pustą odpowiedź' }, { status: 502 });

    await prisma.exercise.update({ where: { id: exerciseId }, data: { aiTip: tip } });
    return NextResponse.json({ tip, cached: false });
  } catch (e) {
    console.error('POST /api/ai/exercise-tip', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

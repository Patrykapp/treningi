import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth';

interface SuggestedExercise {
  exerciseId: string;
  name: string;
  setsData: { reps: number; weight: number }[];
  note: string;
}

interface GroqResponse {
  intro: string;
  exercises: SuggestedExercise[];
}

function normalizeMuscle(raw: string | null | undefined): string {
  if (!raw) return 'Inne';
  return raw.replace(/\s*\(.*?\)/g, '').trim() || 'Inne';
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });

    const { muscleGroups }: { muscleGroups: string[] } = await request.json();
    if (!muscleGroups?.length) {
      return NextResponse.json({ error: 'Wybierz co najmniej jedną partię' }, { status: 400 });
    }

    const eightWeeksAgo = new Date();
    eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);

    // Pobierz wszystkie ćwiczenia z wybranych grup mięśniowych
    const exercises = await prisma.exercise.findMany({
      where: {
        muscleGroup: { in: muscleGroups.flatMap(g => [g, `${g} (uda)`, `${g} (łydki)`]) },
      },
    });

    // Pobierz historię wpisów dla tych ćwiczeń (ostatnie 8 tygodni)
    const exerciseIds = exercises.map(e => e.id);
    const entries = await prisma.workoutEntry.findMany({
      where: {
        exerciseId: { in: exerciseIds },
        session: { userId: user.userId, date: { gte: eightWeeksAgo } },
      },
      include: { session: { select: { date: true } }, exercise: true },
      orderBy: { session: { date: 'desc' } },
    });

    // Oblicz PR i ostatni wynik per ćwiczenie
    const exerciseStats: Record<string, {
      id: string; name: string; muscleGroup: string;
      lastWeight: number; lastReps: number; lastSets: number;
      prWeight: number; pr1RM: number; sessionCount: number;
      lastDate: string; lastSetsData: { reps: number; weight: number }[];
    }> = {};

    for (const entry of entries) {
      const id = entry.exerciseId;
      const setsData = Array.isArray(entry.setsData) && entry.setsData.length > 0
        ? (entry.setsData as { reps: number; weight: number }[])
        : Array.from({ length: entry.sets }, () => ({ reps: entry.reps, weight: entry.weight }));

      const maxW = Math.max(...setsData.map(s => s.weight));
      const best1RM = Math.max(...setsData.map(s =>
        s.weight > 0 && s.reps > 0
          ? (s.reps === 1 ? s.weight : Math.round(s.weight * (1 + s.reps / 30) * 10) / 10)
          : 0
      ));

      if (!exerciseStats[id]) {
        exerciseStats[id] = {
          id, name: entry.exercise.name,
          muscleGroup: normalizeMuscle(entry.exercise.muscleGroup),
          lastWeight: maxW, lastReps: entry.reps, lastSets: entry.sets,
          prWeight: maxW, pr1RM: best1RM,
          sessionCount: 1,
          lastDate: (entry.session.date as Date).toISOString().slice(0, 10),
          lastSetsData: setsData,
        };
      } else {
        exerciseStats[id].sessionCount++;
        if (maxW > exerciseStats[id].prWeight) exerciseStats[id].prWeight = maxW;
        if (best1RM > exerciseStats[id].pr1RM) exerciseStats[id].pr1RM = best1RM;
      }
    }

    // Ćwiczenia bez historii (nigdy nie robione) — dodaj jako opcje z wagą 0
    for (const ex of exercises) {
      if (!exerciseStats[ex.id]) {
        exerciseStats[ex.id] = {
          id: ex.id, name: ex.name,
          muscleGroup: normalizeMuscle(ex.muscleGroup),
          lastWeight: 0, lastReps: 0, lastSets: 3,
          prWeight: 0, pr1RM: 0, sessionCount: 0,
          lastDate: '', lastSetsData: [],
        };
      }
    }

    const stats = Object.values(exerciseStats);
    if (stats.length === 0) {
      return NextResponse.json({ error: 'Brak ćwiczeń dla wybranych partii w bazie' }, { status: 404 });
    }

    // Ostatni trening użytkownika — kiedy trenował
    const lastSession = await prisma.workoutSession.findFirst({
      where: { userId: user.userId },
      orderBy: { date: 'desc' },
      select: { date: true },
    });
    const daysSinceLastSession = lastSession
      ? Math.floor((Date.now() - new Date(lastSession.date).getTime()) / 86400000)
      : null;

    // Buduj listę ćwiczeń dla promptu
    const exerciseList = stats.map(s => {
      const history = s.sessionCount > 0
        ? `${s.sessionCount}x w historii, ostatnio ${s.lastDate}: ${s.lastSetsData.slice(0, 3).map(x => `${x.reps}×${x.weight}kg`).join(' · ')}${s.pr1RM > 0 ? `, 1RM≈${s.pr1RM}kg` : ''}`
        : 'nigdy nie robione';
      return `- ID:"${s.id}" | ${s.name} (${s.muscleGroup}) | ${history}`;
    }).join('\n');

    const systemPrompt = `Jesteś doświadczonym trenerem siłowym. Tworzysz plan treningu dla konkretnego użytkownika na podstawie jego historii.

ZASADY:
1. Wybierz 3-6 ćwiczeń z podanej listy (nie wymyślaj nowych)
2. Priorytetyzuj ćwiczenia które user już zna (ma historię) — łatwiej śledzić progresję
3. Zaproponuj konkretne serie i powtórzenia z konkretnymi ciężarami kg
4. Dla ćwiczeń z historią: zaproponuj ciężar nieco wyższy niż ostatnio (progresja) lub taki sam jeśli ostatni RPE był wysoki
5. Dla nieznanych ćwiczeń: lekki ciężar startowy
6. Odpowiedz TYLKO w JSON, bez żadnego tekstu poza JSON

FORMAT JSON (zwróć TYLKO to):
{
  "intro": "1-2 zdania po polsku o planie dnia",
  "exercises": [
    {
      "exerciseId": "dokładne ID z listy",
      "name": "nazwa ćwiczenia",
      "setsData": [{"reps": 5, "weight": 85}, {"reps": 5, "weight": 85}],
      "note": "krótka wskazówka 1 zdanie"
    }
  ]
}`;

    const userMessage = `Użytkownik: ${user.name}
Partie do treningu: ${muscleGroups.join(', ')}
${daysSinceLastSession !== null ? `Ostatni trening: ${daysSinceLastSession} ${daysSinceLastSession === 1 ? 'dzień' : 'dni'} temu` : ''}

Dostępne ćwiczenia z historią:
${exerciseList}

Ułóż plan treningu.`;

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 800,
        temperature: 0.5,
        response_format: { type: 'json_object' },
      }),
    });

    if (!groqRes.ok) {
      const err = await groqRes.text();
      console.error('Groq error:', err);
      return NextResponse.json({ error: 'Błąd AI. Sprawdź klucz GROQ_API_KEY.' }, { status: 502 });
    }

    const groqData = await groqRes.json();
    const raw = groqData.choices?.[0]?.message?.content?.trim() || '{}';

    let plan: GroqResponse;
    try {
      plan = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'AI zwróciło nieprawidłową odpowiedź, spróbuj ponownie.' }, { status: 502 });
    }

    // Walidacja — upewnij się że exerciseId istnieje w naszej bazie
    const validIds = new Set(stats.map(s => s.id));
    plan.exercises = (plan.exercises || []).filter(e => validIds.has(e.exerciseId));

    return NextResponse.json(plan);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

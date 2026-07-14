import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';

export const maxDuration = 60;

interface TemplateEntry { exerciseId: string; sets: number; reps: number; weight: number }
interface DayPlanDef { name: string; groups: string[] }

interface GroqExercise {
  exerciseId: string;
  setsData: { reps: number; weight: number }[];
}
interface GroqResponse { exercises: GroqExercise[] }

function normalizeMuscle(raw: string | null | undefined): string {
  if (!raw) return 'Inne';
  return raw.replace(/\s*\(.*?\)/g, '').trim() || 'Inne';
}

// Podział tygodnia wg liczby dni treningowych — od prostego Full Body po PPL x2.
const SPLITS: Record<number, { label: string; days: DayPlanDef[] }> = {
  1: { label: 'Full Body', days: [
    { name: 'Full Body', groups: ['Klatka piersiowa', 'Plecy', 'Nogi', 'Barki'] },
  ] },
  2: { label: 'Full Body A/B', days: [
    { name: 'Full Body A', groups: ['Klatka piersiowa', 'Plecy', 'Nogi', 'Barki'] },
    { name: 'Full Body B', groups: ['Klatka piersiowa', 'Plecy', 'Nogi', 'Barki'] },
  ] },
  3: { label: 'Push / Pull / Legs', days: [
    { name: 'Push', groups: ['Klatka piersiowa', 'Barki', 'Triceps'] },
    { name: 'Pull', groups: ['Plecy', 'Biceps'] },
    { name: 'Legs', groups: ['Nogi'] },
  ] },
  4: { label: 'Upper / Lower', days: [
    { name: 'Upper A', groups: ['Klatka piersiowa', 'Plecy', 'Barki', 'Biceps', 'Triceps'] },
    { name: 'Lower A', groups: ['Nogi'] },
    { name: 'Upper B', groups: ['Klatka piersiowa', 'Plecy', 'Barki', 'Biceps', 'Triceps'] },
    { name: 'Lower B', groups: ['Nogi'] },
  ] },
  5: { label: 'Push/Pull/Legs + Upper/Lower', days: [
    { name: 'Push', groups: ['Klatka piersiowa', 'Barki', 'Triceps'] },
    { name: 'Pull', groups: ['Plecy', 'Biceps'] },
    { name: 'Legs', groups: ['Nogi'] },
    { name: 'Upper', groups: ['Klatka piersiowa', 'Plecy', 'Barki', 'Biceps', 'Triceps'] },
    { name: 'Lower', groups: ['Nogi'] },
  ] },
  6: { label: 'Push/Pull/Legs x2', days: [
    { name: 'Push A', groups: ['Klatka piersiowa', 'Barki', 'Triceps'] },
    { name: 'Pull A', groups: ['Plecy', 'Biceps'] },
    { name: 'Legs A', groups: ['Nogi'] },
    { name: 'Push B', groups: ['Klatka piersiowa', 'Barki', 'Triceps'] },
    { name: 'Pull B', groups: ['Plecy', 'Biceps'] },
    { name: 'Legs B', groups: ['Nogi'] },
  ] },
};

// Dzień tygodnia (0=Pon..6=Nd), na które rozkładamy N dni treningowych — z odpoczynkiem między blokami.
const WEEKDAY_SPREAD: Record<number, number[]> = {
  1: [0],
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 1, 3, 4],
  5: [0, 1, 2, 3, 4],
  6: [0, 1, 2, 3, 4, 5],
};

async function suggestEntriesForDay(
  userId: string,
  dayName: string,
  groups: string[],
): Promise<{ templateName: string; entries: TemplateEntry[] } | null> {
  try {
    const eightWeeksAgo = new Date();
    eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);

    const exercises = await prisma.exercise.findMany({
      where: { muscleGroup: { in: groups.flatMap(g => [g, `${g} (uda)`, `${g} (łydki)`]) } },
    });
    if (exercises.length === 0) return null;

    const exerciseIds = exercises.map(e => e.id);
    const entries = await prisma.workoutEntry.findMany({
      where: { exerciseId: { in: exerciseIds }, session: { userId, date: { gte: eightWeeksAgo } } },
      include: { session: { select: { date: true } }, exercise: true },
      orderBy: { session: { date: 'desc' } },
    });

    const stats: Record<string, {
      id: string; name: string; muscleGroup: string;
      lastWeight: number; sessionCount: number; lastDate: string;
      lastSetsData: { reps: number; weight: number }[]; pr1RM: number;
    }> = {};

    for (const entry of entries) {
      const id = entry.exerciseId;
      const setsData = Array.isArray(entry.setsData) && entry.setsData.length > 0
        ? (entry.setsData as { reps: number; weight: number }[])
        : Array.from({ length: entry.sets }, () => ({ reps: entry.reps, weight: entry.weight }));
      const maxW = Math.max(...setsData.map(s => s.weight));
      const best1RM = Math.max(...setsData.map(s =>
        s.weight > 0 && s.reps > 0 ? (s.reps === 1 ? s.weight : Math.round(s.weight * (1 + s.reps / 30) * 10) / 10) : 0
      ));
      if (!stats[id]) {
        stats[id] = {
          id, name: entry.exercise.name, muscleGroup: normalizeMuscle(entry.exercise.muscleGroup),
          lastWeight: maxW, sessionCount: 1,
          lastDate: (entry.session.date as Date).toISOString().slice(0, 10),
          lastSetsData: setsData, pr1RM: best1RM,
        };
      } else {
        stats[id].sessionCount++;
        if (best1RM > stats[id].pr1RM) stats[id].pr1RM = best1RM;
      }
    }
    for (const ex of exercises) {
      if (!stats[ex.id]) {
        stats[ex.id] = {
          id: ex.id, name: ex.name, muscleGroup: normalizeMuscle(ex.muscleGroup),
          lastWeight: 0, sessionCount: 0, lastDate: '', lastSetsData: [], pr1RM: 0,
        };
      }
    }

    const statList = Object.values(stats);
    const exerciseList = statList.map(s => {
      const history = s.sessionCount > 0
        ? `${s.sessionCount}x w historii, ostatnio ${s.lastDate}: ${s.lastSetsData.slice(0, 3).map(x => `${x.reps}×${x.weight}kg`).join(' · ')}${s.pr1RM > 0 ? `, 1RM≈${s.pr1RM}kg` : ''}`
        : 'nigdy nie robione';
      return `- ID:"${s.id}" | ${s.name} (${s.muscleGroup}) | ${history}`;
    }).join('\n');

    const systemPrompt = `Jesteś doświadczonym trenerem siłowym. Układasz JEDEN dzień treningowy (nazwa: "${dayName}") jako część cotygodniowego planu użytkownika.

ZASADY:
1. Wybierz 4-7 ćwiczeń z podanej listy (nie wymyślaj nowych, nie duplikuj)
2. Priorytetyzuj ćwiczenia które user już zna (ma historię)
3. Zaproponuj konkretne serie i powtórzenia z konkretnymi ciężarami kg (te same w każdej serii danego ćwiczenia)
4. Dla ćwiczeń z historią: ciężar zbliżony do ostatniego lub lekko wyższy (progresja)
5. Dla nieznanych ćwiczeń: lekki, bezpieczny ciężar startowy
6. Odpowiedz TYLKO w JSON, bez tekstu poza JSON

FORMAT JSON:
{"exercises":[{"exerciseId":"dokładne ID z listy","setsData":[{"reps":8,"weight":60},{"reps":8,"weight":60},{"reps":8,"weight":60}]}]}`;

    const userMessage = `Dostępne ćwiczenia:\n${exerciseList}\n\nUłóż trening "${dayName}".`;

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
        max_tokens: 800,
        temperature: 0.5,
        response_format: { type: 'json_object' },
      }),
    });
    if (!groqRes.ok) {
      console.error('Groq error dla dnia', dayName, await groqRes.text());
      return null;
    }
    const groqData = await groqRes.json();
    const raw = groqData.choices?.[0]?.message?.content?.trim() || '{}';
    let parsed: GroqResponse;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }

    const validIds = new Set(statList.map(s => s.id));
    const seen = new Set<string>();
    const templateEntries: TemplateEntry[] = [];
    for (const e of parsed.exercises || []) {
      if (!validIds.has(e.exerciseId) || seen.has(e.exerciseId)) continue;
      const sd = Array.isArray(e.setsData) && e.setsData.length > 0 ? e.setsData : null;
      if (!sd) continue;
      seen.add(e.exerciseId);
      templateEntries.push({
        exerciseId: e.exerciseId,
        sets: sd.length,
        reps: sd[0].reps || 10,
        weight: sd[0].weight || 0,
      });
    }
    if (templateEntries.length === 0) return null;

    return { templateName: `${dayName} (AI)`, entries: templateEntries };
  } catch (e) {
    console.error('suggestEntriesForDay błąd', dayName, e);
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });

    const body = await req.json();
    const { name, startDate, numWeeks, repeat } = body;
    const daysPerWeek = parseInt(body.daysPerWeek, 10);

    if (!Number.isFinite(daysPerWeek) || daysPerWeek < 1 || daysPerWeek > 6) {
      return NextResponse.json({ error: 'Liczba dni treningowych: 1-6' }, { status: 400 });
    }
    if (!startDate || isNaN(new Date(startDate).getTime())) {
      return NextResponse.json({ error: 'Podaj poprawną datę startu' }, { status: 400 });
    }
    const weeks = typeof numWeeks === 'number' ? numWeeks : parseInt(numWeeks, 10);
    if (!Number.isFinite(weeks) || weeks < 1 || weeks > 52) {
      return NextResponse.json({ error: 'Liczba tygodni musi być między 1 a 52' }, { status: 400 });
    }
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({ error: 'Błąd AI. Sprawdź klucz GROQ_API_KEY.' }, { status: 502 });
    }

    const split = SPLITS[daysPerWeek];

    // Generuj wszystkie dni równolegle (każdy to niezależne wywołanie Groq).
    const results = await Promise.all(split.days.map(d => suggestEntriesForDay(userId, d.name, d.groups)));

    const created: { weekday: number; name: string; id: string }[] = [];
    const skipped: string[] = [];
    const weekdays = WEEKDAY_SPREAD[daysPerWeek];

    for (let i = 0; i < split.days.length; i++) {
      const result = results[i];
      if (!result) { skipped.push(split.days[i].name); continue; }
      const tpl = await prisma.workoutTemplate.create({
        data: { name: result.templateName, entries: result.entries, userId },
      });
      created.push({ weekday: weekdays[i], name: result.templateName, id: tpl.id });
    }

    if (created.length === 0) {
      return NextResponse.json({ error: 'Nie udało się wygenerować żadnego dnia — brak ćwiczeń w bazie lub błąd AI.' }, { status: 502 });
    }

    const days: (string | null)[] = Array(7).fill(null);
    for (const c of created) days[c.weekday] = c.id;

    const planName = (typeof name === 'string' && name.trim()) ? name.trim() : `Plan AI (${split.label})`;

    await prisma.trainingPlan.updateMany({ where: { userId, active: true }, data: { active: false } });
    const plan = await prisma.trainingPlan.create({
      data: {
        userId,
        name: planName,
        startDate: new Date(startDate),
        numWeeks: weeks,
        repeat: repeat !== false,
        active: true,
        days,
      },
    });

    return NextResponse.json({ plan, created: created.map(c => c.name), skipped }, { status: 201 });
  } catch (e) {
    console.error('POST /api/ai/generate-plan', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

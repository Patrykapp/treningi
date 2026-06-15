import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth';

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

function weekLabel(from: Date): string {
  const to = new Date(from);
  to.setDate(to.getDate() + 6);
  return `${from.getDate()}.${from.getMonth() + 1} – ${to.getDate()}.${to.getMonth() + 1}`;
}

export async function POST() {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });

    const now = new Date();
    const twoWeeksAgo = new Date(now);
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    const thisWeekStart = new Date(now);
    thisWeekStart.setHours(0, 0, 0, 0);
    thisWeekStart.setDate(thisWeekStart.getDate() - ((thisWeekStart.getDay() + 6) % 7));

    const prevWeekStart = new Date(thisWeekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);

    // Pobierz dane obu tygodni równolegle
    const [sessions, runs, activities, bodyWeights] = await Promise.all([
      prisma.workoutSession.findMany({
        where: { userId: user.userId, date: { gte: twoWeeksAgo } },
        include: { entries: { include: { exercise: true } } },
        orderBy: { date: 'desc' },
      }),
      prisma.runSession.findMany({
        where: { userId: user.userId, date: { gte: twoWeeksAgo } },
        orderBy: { date: 'desc' },
      }),
      prisma.otherActivity.findMany({
        where: { userId: user.userId, date: { gte: twoWeeksAgo } },
        orderBy: { date: 'desc' },
      }),
      prisma.bodyWeight.findMany({
        where: { userId: user.userId },
        orderBy: { date: 'desc' },
        take: 2,
      }),
    ]);

    // Podziel na ten tydzień i poprzedni
    const isThisWeek = (d: Date | string) => new Date(d) >= thisWeekStart;
    const isPrevWeek = (d: Date | string) => new Date(d) >= prevWeekStart && new Date(d) < thisWeekStart;

    const thisSessions = sessions.filter(s => isThisWeek(s.date));
    const prevSessions = sessions.filter(s => isPrevWeek(s.date));
    const thisRuns = runs.filter(r => isThisWeek(r.date));
    const prevRuns = runs.filter(r => isPrevWeek(r.date));
    const thisActivities = activities.filter(a => isThisWeek(a.date));

    // Oblicz objętość
    function calcVolume(s: typeof sessions[0]) {
      return s.entries.reduce((sum, e) => {
        const sd = Array.isArray(e.setsData) && e.setsData.length > 0
          ? (e.setsData as { reps: number; weight: number }[])
          : Array(e.sets).fill({ reps: e.reps, weight: e.weight });
        return sum + sd.reduce((s2, x) => s2 + x.reps * x.weight, 0);
      }, 0);
    }

    const thisVolume = thisSessions.reduce((s, sess) => s + calcVolume(sess), 0);
    const prevVolume = prevSessions.reduce((s, sess) => s + calcVolume(sess), 0);

    // Grupy mięśniowe w tym tygodniu
    const muscleGroups: Record<string, number> = {};
    for (const sess of thisSessions) {
      for (const e of sess.entries) {
        const g = e.exercise?.muscleGroup?.replace(/\s*\(.*?\)/g, '').trim() || 'Inne';
        muscleGroups[g] = (muscleGroups[g] || 0) + 1;
      }
    }
    const topMuscles = Object.entries(muscleGroups).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([g]) => g);

    // Buduj prompt
    const lines: string[] = [];
    lines.push(`Użytkownik: ${user.name}`);
    lines.push(`Analizowany tydzień: ${weekLabel(thisWeekStart)}`);
    lines.push(`Poprzedni tydzień: ${weekLabel(prevWeekStart)}`);
    lines.push('');

    lines.push(`=== TEN TYDZIEŃ ===`);
    lines.push(`Treningi siłowe: ${thisSessions.length} (poprzedni: ${prevSessions.length})`);

    if (thisSessions.length > 0) {
      lines.push(`Objętość siłowa: ${Math.round(thisVolume).toLocaleString('pl-PL')} kg (poprzedni: ${Math.round(prevVolume).toLocaleString('pl-PL')} kg)`);
      lines.push(`Główne partie: ${topMuscles.join(', ') || '—'}`);
      for (const sess of thisSessions) {
        const d = new Date(sess.date).toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short' });
        const exercises = [...new Set(sess.entries.map(e => e.exercise?.name || '?'))].join(', ');
        const vol = Math.round(calcVolume(sess));
        lines.push(`  • ${d}: ${exercises}${vol > 0 ? ` | ${vol.toLocaleString('pl-PL')} kg` : ''}${sess.kcal ? ` | ${sess.kcal} kcal` : ''}`);
      }
    }

    lines.push(`Biegi: ${thisRuns.length} (poprzedni: ${prevRuns.length})`);
    if (thisRuns.length > 0) {
      const totalKm = thisRuns.reduce((s, r) => s + r.distance, 0);
      const prevKm = prevRuns.reduce((s, r) => s + r.distance, 0);
      lines.push(`Łącznie km: ${totalKm.toFixed(1)} (poprzedni: ${prevKm.toFixed(1)})`);
      for (const r of thisRuns) {
        const d = new Date(r.date).toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short' });
        const pace = r.distance > 0 ? r.duration / r.distance : 0;
        const paceStr = pace > 0 ? `${Math.floor(pace / 60)}'${String(Math.round(pace % 60)).padStart(2, '0')}"/km` : '';
        lines.push(`  • ${d}: ${r.distance} km${paceStr ? ` | tempo ${paceStr}` : ''}${r.kcal ? ` | ${r.kcal} kcal` : ''}`);
      }
    }

    if (thisActivities.length > 0) {
      lines.push(`Inne aktywności: ${thisActivities.length}`);
      for (const a of thisActivities) {
        const d = new Date(a.date).toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short' });
        const dur = a.durationMin >= 60 ? `${Math.floor(a.durationMin / 60)}h ${a.durationMin % 60}min` : `${a.durationMin}min`;
        lines.push(`  • ${d}: ${a.type} ${dur}${a.distanceKm ? ` | ${a.distanceKm} km` : ''}${a.kcal ? ` | ${a.kcal} kcal` : ''}`);
      }
    }

    const totalThisWeek = thisSessions.length + thisRuns.length + thisActivities.length;
    if (totalThisWeek === 0) {
      lines.push('Brak aktywności w tym tygodniu.');
    }

    if (bodyWeights.length > 0) {
      lines.push('');
      lines.push(`Masa ciała: ${bodyWeights[0].weight} kg (ostatni pomiar: ${new Date(bodyWeights[0].date).toLocaleDateString('pl-PL')})`);
      if (bodyWeights.length > 1) {
        const diff = bodyWeights[0].weight - bodyWeights[1].weight;
        lines.push(`Zmiana: ${diff > 0 ? '+' : ''}${diff.toFixed(1)} kg vs poprzedni pomiar`);
      }
    }

    const dataText = lines.join('\n');

    const systemPrompt = `Jesteś osobistym trenerem i analitykiem treningowym. Analizujesz dane treningowe użytkownika i dajesz konkretne, motywujące insighty po polsku.

Twój styl: bezpośredni, rzeczowy, motywujący — jak dobry trener, nie chatbot. Używaj danych liczbowych. Nie powtarzaj suchych danych, interpretuj je.

Struktura odpowiedzi (używaj emoji jako nagłówków, bez markdown headers):
📊 Krótkie podsumowanie tygodnia (2-3 zdania)
💪 Co poszło dobrze (1-2 punkty)
⚠️ Co wymaga uwagi (1 punkt — np. zaniedbana partia, brak regeneracji, za mały dystans)
🎯 Konkretna rekomendacja na następny tydzień (1 zdanie, bardzo konkretna)

Odpowiedź: max 200 słów. Zwróć się do użytkownika po imieniu.`;

    const userMessage = `Oto moje dane treningowe:\n\n${dataText}\n\nZrób mi analizę tygodnia.`;

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
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!groqRes.ok) {
      const err = await groqRes.text();
      console.error('Groq error:', err);
      return NextResponse.json({ error: 'Błąd AI. Sprawdź klucz GROQ_API_KEY.' }, { status: 502 });
    }

    const groqData = await groqRes.json();
    const insight = groqData.choices?.[0]?.message?.content?.trim() || '';

    return NextResponse.json({
      insight,
      generatedAt: now.toISOString(),
      weekLabel: weekLabel(thisWeekStart),
      stats: {
        workouts: totalThisWeek,
        sessions: thisSessions.length,
        runs: thisRuns.length,
        activities: thisActivities.length,
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

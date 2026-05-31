import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';

function calcVolume(setsData: { reps: number; weight: number }[], sets: number, reps: number, weight: number): number {
  if (setsData && setsData.length > 0) {
    return setsData.reduce((sum, s) => sum + s.reps * s.weight, 0);
  }
  return sets * reps * weight;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUserId = await getAuthUserId();
    if (!authUserId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });

    const { id } = await params;
    const session = await prisma.workoutSession.findUnique({
      where: { id },
      include: { entries: { include: { exercise: true } } },
    });
    if (!session) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 });

    // Historia wszystkich poprzednich sesji tego użytkownika (przed tą sesją)
    const history = await prisma.workoutSession.findMany({
      where: { userId: session.userId, date: { lt: session.date } },
      include: { entries: true },
      orderBy: { date: 'desc' },
      take: 30,
    });

    // ---- Wolumen bieżącej sesji ----
    const currentVolume = session.entries.reduce((sum, e) => {
      const sd = Array.isArray(e.setsData) ? (e.setsData as { reps: number; weight: number }[]) : [];
      return sum + calcVolume(sd, e.sets, e.reps, e.weight);
    }, 0);

    // ---- Średni wolumen z ostatnich 4 tygodni ----
    const recentSessions = history.slice(0, 8);
    const avgVolume = recentSessions.length > 0
      ? recentSessions.reduce((sum, s) => {
          return sum + s.entries.reduce((esum, e) => {
            const sd = Array.isArray(e.setsData) ? (e.setsData as { reps: number; weight: number }[]) : [];
            return esum + calcVolume(sd, e.sets, e.reps, e.weight);
          }, 0);
        }, 0) / recentSessions.length
      : 0;

    // ---- Progres vs ostatnia sesja z tymi samymi ćwiczeniami ----
    let progressScore = 5; // neutralny gdy brak historii
    let progressDetail: string[] = [];
    let prCount = 0;
    const prExerciseIds: string[] = [];

    for (const entry of session.entries) {
      // Znajdź poprzednie wpisy dla tego ćwiczenia
      const prevEntries = history
        .flatMap(s => s.entries)
        .filter(e => e.exerciseId === entry.exerciseId);

      if (prevEntries.length === 0) continue;

      const curSd = Array.isArray(entry.setsData) ? (entry.setsData as { reps: number; weight: number }[]) : [];
      const curVol = calcVolume(curSd, entry.sets, entry.reps, entry.weight);
      const curMaxWeight = curSd.length > 0 ? Math.max(...curSd.map(s => s.weight)) : entry.weight;

      const prevEntry = prevEntries[0];
      const prevSd = Array.isArray(prevEntry.setsData) ? (prevEntry.setsData as { reps: number; weight: number }[]) : [];
      const prevVol = calcVolume(prevSd, prevEntry.sets, prevEntry.reps, prevEntry.weight);
      const prevMaxWeight = prevSd.length > 0 ? Math.max(...prevSd.map(s => s.weight)) : prevEntry.weight;

      // PR: max waga kiedykolwiek
      const allMaxWeights = prevEntries.map(e => {
        const sd = Array.isArray(e.setsData) ? (e.setsData as { reps: number; weight: number }[]) : [];
        return sd.length > 0 ? Math.max(...sd.map(s => s.weight)) : e.weight;
      });
      const allTimeMax = Math.max(...allMaxWeights);
      if (curMaxWeight > allTimeMax && curMaxWeight > 0) {
        prCount++;
        prExerciseIds.push(entry.exerciseId);
        progressDetail.push(`🏆 PR: ${entry.exercise.name} (${curMaxWeight}kg)`);
      }

      // Progres wolumenu vs poprzedni
      if (prevVol > 0) {
        const pct = ((curVol - prevVol) / prevVol) * 100;
        if (pct > 5) progressDetail.push(`📈 ${entry.exercise.name}: +${pct.toFixed(0)}% wolumenu`);
        else if (pct < -5) progressDetail.push(`📉 ${entry.exercise.name}: ${pct.toFixed(0)}% wolumenu`);
      }
    }

    // ---- Wolumen score (0-10) ----
    let volumeScore = 5;
    if (avgVolume > 0) {
      const ratio = currentVolume / avgVolume;
      if (ratio >= 1.2) volumeScore = 9;
      else if (ratio >= 1.05) volumeScore = 7;
      else if (ratio >= 0.95) volumeScore = 5;
      else if (ratio >= 0.8) volumeScore = 3;
      else volumeScore = 1;
    }

    // ---- RPE score ----
    const rpeEntries = session.entries.filter(e => e.rpe != null);
    const avgRpe = rpeEntries.length > 0
      ? rpeEntries.reduce((s, e) => s + (e.rpe ?? 0), 0) / rpeEntries.length
      : null;
    let rpeScore = 5;
    if (avgRpe !== null) {
      // RPE 7-8 = idealny wysiłek → 7-8 pkt; <5 = za łatwy; >9 = przegrzanie
      if (avgRpe >= 7 && avgRpe <= 8.5) rpeScore = 8;
      else if (avgRpe > 8.5) rpeScore = 6;
      else if (avgRpe >= 6) rpeScore = 6;
      else rpeScore = 3;
    }

    // ---- Progres score na podstawie progressDetail ----
    const progressEntries = session.entries.filter(e =>
      history.flatMap(s => s.entries).some(h => h.exerciseId === e.exerciseId)
    );
    let progressPts = 5;
    if (progressEntries.length > 0) {
      const improvements = progressDetail.filter(d => d.includes('📈') || d.includes('🏆')).length;
      const regressions = progressDetail.filter(d => d.includes('📉')).length;
      progressPts = Math.min(10, Math.max(1, 5 + improvements * 1.5 - regressions * 1.5));
    }

    // ---- Wynik końcowy ----
    const weights = { volume: 0.3, progress: 0.4, rpe: avgRpe !== null ? 0.3 : 0 };
    const totalWeight = weights.volume + weights.progress + weights.rpe;
    const score = Math.round(
      ((volumeScore * weights.volume + progressPts * weights.progress + rpeScore * weights.rpe) / totalWeight) * 10
    ) / 10;

    const clampedScore = Math.min(10, Math.max(1, score));

    let label: string;
    let emoji: string;
    if (clampedScore >= 8) { label = 'Świetny'; emoji = '🔥'; }
    else if (clampedScore >= 6) { label = 'Dobry'; emoji = '💪'; }
    else if (clampedScore >= 4) { label = 'Normalny'; emoji = '👍'; }
    else { label = 'Słaby'; emoji = '😴'; }

    // ---- Wskazówki do poprawy ----
    const tips: string[] = [];

    if (volumeScore < 5) {
      if (avgVolume > 0) {
        tips.push(`📦 Wolumen był o ${Math.round((1 - currentVolume / avgVolume) * 100)}% niższy niż Twoja średnia — spróbuj dodać 1 serię do każdego ćwiczenia`);
      } else {
        tips.push('📦 Dodaj więcej serii lub powtórzeń aby zwiększyć wolumen');
      }
    }

    if (progressPts < 5 && progressEntries.length > 0) {
      tips.push('📈 W kilku ćwiczeniach wolumen był niższy niż ostatnio — spróbuj zwiększyć ciężar o 2.5kg lub dodaj 1 powtórzenie w każdej serii');
    }

    if (prCount === 0 && history.length >= 3) {
      tips.push('🏆 Brak nowych rekordów — wybierz jedno ćwiczenie i pobij PR nawet o 1kg');
    }

    if (avgRpe === null) {
      tips.push('⚡ Wpisuj RPE po każdym ćwiczeniu — pomoże to lepiej oceniać intensywność treningu');
    } else if (avgRpe < 6) {
      tips.push(`⚡ Średnie RPE wyniosło tylko ${avgRpe.toFixed(1)} — trening był za łatwy, zwiększ ciężar lub skróć przerwy`);
    } else if (avgRpe > 9) {
      tips.push(`⚡ Średnie RPE ${avgRpe.toFixed(1)} — bardzo wysokie, upewnij się że dobrze regenerujesz`);
    }

    if (tips.length === 0 && clampedScore >= 8) {
      tips.push('✅ Świetny trening! Utrzymaj ten poziom i spróbuj bić kolejne rekordy');
    }

    // Składowe score dla przejrzystości
    const breakdown = {
      volume: { score: volumeScore, label: 'Wolumen', current: Math.round(currentVolume), avg: Math.round(avgVolume) },
      progress: { score: Math.round(progressPts), label: 'Progres' },
      rpe: avgRpe !== null ? { score: rpeScore, label: 'Intensywność (RPE)', value: Math.round(avgRpe * 10) / 10 } : null,
    };

    return NextResponse.json({
      score: clampedScore,
      stars: Math.round(clampedScore / 2), // 1-5 gwiazdek
      label,
      emoji,
      currentVolume: Math.round(currentVolume),
      avgVolume: Math.round(avgVolume),
      avgRpe,
      prCount,
      prExerciseIds,
      details: progressDetail,
      tips,
      breakdown,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Blad serwera' }, { status: 500 });
  }
}

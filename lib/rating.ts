// Wspólna logika oceny treningu — używana przez /api/sessions/[id]/rating
// (pojedyncza) i /api/sessions/ratings (zbiorcza, 1 request dla historii).

type SetData = { reps: number; weight: number };

export interface RatingEntry {
  exerciseId: string;
  sets: number;
  reps: number;
  weight: number;
  rpe: number | null;
  setsData: unknown;
  exercise: { name: string; muscleGroup?: string | null };
}

export interface RatingSession {
  id: string;
  date: Date;
  userId: string;
  entries: RatingEntry[];
}

export interface RatingHistoryEntry {
  exerciseId: string;
  sets: number;
  reps: number;
  weight: number;
  setsData: unknown;
  exercise?: { muscleGroup?: string | null } | null;
}

export interface RatingHistorySession {
  date: Date;
  entries: RatingHistoryEntry[];
}

function calcVolume(setsData: SetData[], sets: number, reps: number, weight: number): number {
  if (setsData && setsData.length > 0) {
    return setsData.reduce((sum, s) => sum + s.reps * s.weight, 0);
  }
  return sets * reps * weight;
}

function asSetsData(v: unknown): SetData[] {
  return Array.isArray(v) ? (v as SetData[]) : [];
}

// history: sesje TEGO użytkownika sprzed daty ocenianej sesji, posortowane malejąco po dacie (max 30)
export function computeRating(session: RatingSession, history: RatingHistorySession[]) {
  // ---- Wolumen bieżącej sesji ----
  const currentVolume = session.entries.reduce((sum, e) => {
    return sum + calcVolume(asSetsData(e.setsData), e.sets, e.reps, e.weight);
  }, 0);

  // ---- Średni wolumen z ostatnich sesji ----
  // Do średniej liczymy TYLKO wolumen wpisów tych samych grup mięśniowych co dziś —
  // nie cały wolumen dopasowanej sesji. Wcześniejsza wersja brała pełen wolumen
  // każdej sesji dzielącej choć jedną grupę mięśniową, więc np. sesja "barki + nogi"
  // zawyżała/zaniżała średnią dla treningu barków całym swoim wolumenem z nóg.
  const currentMuscleGroups = new Set(
    session.entries
      .map(e => e.exercise?.muscleGroup)
      .filter((m): m is string => !!m)
  );

  const matchedVolume = (entries: RatingHistoryEntry[]): number =>
    entries
      .filter(e => !!e.exercise?.muscleGroup && currentMuscleGroups.has(e.exercise.muscleGroup))
      .reduce((sum, e) => sum + calcVolume(asSetsData(e.setsData), e.sets, e.reps, e.weight), 0);

  const matchedSessions = currentMuscleGroups.size > 0
    ? history.filter(s => matchedVolume(s.entries) > 0)
    : [];
  // przy zbyt małej próbie (<3) dopasowanych sesji średnia byłaby zbyt szumiąca —
  // wtedy wracamy do starego zachowania (cały wolumen ostatnich 8 sesji, bez filtra)
  const useMatched = matchedSessions.length >= 3;
  const recentSessions = (useMatched ? matchedSessions : history).slice(0, 8);

  const avgVolume = recentSessions.length > 0
    ? recentSessions.reduce((sum, s) => {
        return sum + (useMatched
          ? matchedVolume(s.entries)
          : s.entries.reduce((esum, e) => esum + calcVolume(asSetsData(e.setsData), e.sets, e.reps, e.weight), 0));
      }, 0) / recentSessions.length
    : 0;

  // ---- Progres vs ostatnia sesja z tymi samymi ćwiczeniami ----
  const progressDetail: string[] = [];
  let prCount = 0;
  const prExerciseIds: string[] = [];

  for (const entry of session.entries) {
    const prevEntries = history
      .flatMap(s => s.entries)
      .filter(e => e.exerciseId === entry.exerciseId);

    if (prevEntries.length === 0) continue;

    const curSd = asSetsData(entry.setsData);
    const curVol = calcVolume(curSd, entry.sets, entry.reps, entry.weight);
    const curMaxWeight = curSd.length > 0 ? Math.max(...curSd.map(s => s.weight)) : entry.weight;

    const prevEntry = prevEntries[0];
    const prevSd = asSetsData(prevEntry.setsData);
    const prevVol = calcVolume(prevSd, prevEntry.sets, prevEntry.reps, prevEntry.weight);

    // PR: max waga kiedykolwiek
    const allMaxWeights = prevEntries.map(e => {
      const sd = asSetsData(e.setsData);
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
    if (avgRpe >= 7 && avgRpe <= 8.5) rpeScore = 8;
    else if (avgRpe > 8.5) rpeScore = 6;
    else if (avgRpe >= 6) rpeScore = 6;
    else rpeScore = 3;
  }

  // ---- Progres score ----
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
  // RPE świadomie NIE wpływa na ocenę (gwiazdki) — trening jest blisko/do upadku,
  // a RPE nie jest wpisywane. Liczą się tylko wolumen i progres.
  const weights = { volume: 0.4, progress: 0.6 };
  const score = Math.round(
    (volumeScore * weights.volume + progressPts * weights.progress) * 10
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

  // RPE nie jest już wymagane — brak namolnej podpowiedzi o wpisywaniu RPE.
  // Wskazówki o RPE pokazujemy tylko, gdy RPE faktycznie zostało wpisane.
  if (avgRpe !== null && avgRpe < 6) {
    tips.push(`⚡ Średnie RPE wyniosło tylko ${avgRpe.toFixed(1)} — trening był za łatwy, zwiększ ciężar lub skróć przerwy`);
  } else if (avgRpe !== null && avgRpe > 9) {
    tips.push(`⚡ Średnie RPE ${avgRpe.toFixed(1)} — bardzo wysokie, upewnij się że dobrze regenerujesz`);
  }

  if (tips.length === 0 && clampedScore >= 8) {
    tips.push('✅ Świetny trening! Utrzymaj ten poziom i spróbuj bić kolejne rekordy');
  }

  const breakdown = {
    volume: { score: volumeScore, label: 'Wolumen', current: Math.round(currentVolume), avg: Math.round(avgVolume) },
    progress: { score: Math.round(progressPts), label: 'Progres' },
    rpe: avgRpe !== null ? { score: rpeScore, label: 'Intensywność (RPE)', value: Math.round(avgRpe * 10) / 10 } : null,
  };

  return {
    score: clampedScore,
    stars: Math.round(clampedScore / 2),
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
  };
}

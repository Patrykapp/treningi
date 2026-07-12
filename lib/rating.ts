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

// Ćwiczenia na masie własnej (podciąganie, pompki itp.) są zapisywane z weight=0.
// Bez tej poprawki ich wolumen zawsze wychodzi 0 (reps*0), niezależnie od liczby
// powtórzeń — sesje głównie na masie własnej (np. podciąganie na drążku) zawsze
// dostawały najgorszą możliwą ocenę wolumenu, mimo realnego progresu w powtórzeniach.
// Traktujemy 0kg jak "ciężar" 1, żeby liczyły się same powtórzenia.
function calcVolume(setsData: SetData[], sets: number, reps: number, weight: number): number {
  if (setsData && setsData.length > 0) {
    return setsData.reduce((sum, s) => sum + s.reps * Math.max(s.weight, 1), 0);
  }
  return sets * reps * Math.max(weight, 1);
}

function asSetsData(v: unknown): SetData[] {
  return Array.isArray(v) ? (v as SetData[]) : [];
}

// Szacowane 1RM (wzór Epleya) — te same liczby dają różny "wolumen" w zależności
// od schematu serii (5 serii po 5 vs 3 serie po 7), mimo że mogą reprezentować
// podobny albo wyższy poziom siły. e1RM stawia oba schematy na wspólnej skali
// "jak blisko maksimum", niezależnie od liczby serii/powtórzeń.
function estimate1RM(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  return weight * (1 + reps / 30);
}

function bestE1RM(setsData: SetData[], reps: number, weight: number): number {
  if (setsData && setsData.length > 0) {
    return Math.max(...setsData.map(s => estimate1RM(s.weight, s.reps)));
  }
  return estimate1RM(weight, reps);
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

  // Ćwiczenia na masie własnej (0kg) i te z zewnętrznym ciężarem mają zupełnie inną
  // skalę "wolumenu" (same powtórzenia vs kg×powtórzenia) — więc w obrębie tej samej
  // grupy mięśniowej trzymamy je w osobnych pulach porównawczych. Dzięki temu dzień
  // samego podciągania (Plecy, 0kg) nie jest już zestawiany ze średnią z ciężkich
  // wiosłowań/podciągań z obciążeniem tej samej grupy — i odwrotnie.
  const bodyweightGroups = new Set(
    session.entries.filter(e => e.weight === 0).map(e => e.exercise?.muscleGroup).filter((m): m is string => !!m)
  );
  const weightedGroups = new Set(
    session.entries.filter(e => e.weight > 0).map(e => e.exercise?.muscleGroup).filter((m): m is string => !!m)
  );
  const isRelevantEntry = (e: RatingHistoryEntry): boolean => {
    const mg = e.exercise?.muscleGroup;
    if (!mg || !currentMuscleGroups.has(mg)) return false;
    return e.weight === 0 ? bodyweightGroups.has(mg) : weightedGroups.has(mg);
  };

  const matchedVolume = (entries: RatingHistoryEntry[]): number =>
    entries
      .filter(isRelevantEntry)
      .reduce((sum, e) => sum + calcVolume(asSetsData(e.setsData), e.sets, e.reps, e.weight), 0);

  const matchedSessions = currentMuscleGroups.size > 0 ? history.filter(s => matchedVolume(s.entries) > 0) : [];

  // Przy zbyt małej próbie (<3 sesji tej samej grupy mięśniowej I tej samej modalności)
  // NIE porównujemy do niczego (zamiast do przypadkowych, niezwiązanych sesji) —
  // wolumen zostaje neutralny (5/10). Dawny fallback "ostatnie 8 sesji w ogóle"
  // (a nawet luźniejszy "ta sama grupa mięśniowa, dowolna modalność") wciąż mieszał
  // niekompatybilne skale — bodyweight (proxy 1kg) vs realny ciężar to inne jednostki,
  // więc lepiej brak porównania niż mylące.
  const recentSessions = matchedSessions.length >= 3 ? matchedSessions.slice(0, 8) : [];

  const avgVolume = recentSessions.length > 0
    ? recentSessions.reduce((sum, s) => sum + matchedVolume(s.entries), 0) / recentSessions.length
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
    const curE1RM = bestE1RM(curSd, entry.reps, entry.weight);

    const prevEntry = prevEntries[0];
    const prevSd = asSetsData(prevEntry.setsData);
    const prevVol = calcVolume(prevSd, prevEntry.sets, prevEntry.reps, prevEntry.weight);
    const prevE1RM = bestE1RM(prevSd, prevEntry.reps, prevEntry.weight);

    // PR: max waga kiedykolwiek LUB nowy najlepszy szacowany 1RM. Sam ciężar gubi
    // przypadki typu "5x5 zamiast 3x7 na tym samym ciężarze" — więcej powtórzeń
    // na tej samej wadze to realny progres siłowy, mimo że max waga się nie zmienia.
    const allMaxWeights = prevEntries.map(e => {
      const sd = asSetsData(e.setsData);
      return sd.length > 0 ? Math.max(...sd.map(s => s.weight)) : e.weight;
    });
    const allTimeMaxWeight = Math.max(...allMaxWeights);
    const allTimeBestE1RM = Math.max(...prevEntries.map(e => bestE1RM(asSetsData(e.setsData), e.reps, e.weight)));

    // Ćwiczenia na masie własnej (0kg) mają zawsze curMaxWeight=0 i curE1RM=0 —
    // PR wagowy i PR siły (e1RM) są więc dla nich matematycznie niemożliwe do zdobycia,
    // nawet przy realnym rekordzie powtórzeń (np. 30 pompek zamiast dotychczasowych 20).
    // Dla takich ćwiczeń liczymy PR po max powtórzeniach w jednej serii.
    const curMaxReps = curSd.length > 0 ? Math.max(...curSd.map(s => s.reps)) : entry.reps;
    const allTimeMaxReps = Math.max(...prevEntries.map(e => {
      const sd = asSetsData(e.setsData);
      return sd.length > 0 ? Math.max(...sd.map(s => s.reps)) : e.reps;
    }));

    const isWeightPR = curMaxWeight > allTimeMaxWeight && curMaxWeight > 0;
    const isE1RMPR = !isWeightPR && curE1RM > allTimeBestE1RM * 1.01 && curE1RM > 0;
    const isRepsPR = !isWeightPR && !isE1RMPR && entry.weight === 0 && curMaxReps > allTimeMaxReps && curMaxReps > 0;
    if (isWeightPR) {
      prCount++;
      prExerciseIds.push(entry.exerciseId);
      progressDetail.push(`🏆 PR: ${entry.exercise.name} (${curMaxWeight}kg)`);
    } else if (isE1RMPR) {
      prCount++;
      prExerciseIds.push(entry.exerciseId);
      progressDetail.push(`🏆 PR siły: ${entry.exercise.name} (szac. 1RM ${Math.round(curE1RM)}kg)`);
    } else if (isRepsPR) {
      prCount++;
      prExerciseIds.push(entry.exerciseId);
      progressDetail.push(`🏆 PR: ${entry.exercise.name} (${curMaxReps} powt.)`);
    }

    // Progres: wolumen ORAZ szacowany 1RM. Schemat serii (np. 3 serie po 7 zamiast
    // 5 po 5) zmienia wolumen, nawet gdy realna siła rośnie lub stoi w miejscu —
    // dlatego regres liczymy tylko, gdy OBIE miary spadają (albo e1RM jest
    // niedostępne, np. ćwiczenia na masie własnej), a poprawę - gdy rośnie
    // którakolwiek z nich.
    const volPct = prevVol > 0 ? ((curVol - prevVol) / prevVol) * 100 : null;
    const e1rmPct = prevE1RM > 0 ? ((curE1RM - prevE1RM) / prevE1RM) * 100 : null;
    const volImproved = volPct !== null && volPct > 5;
    const e1rmImproved = e1rmPct !== null && e1rmPct > 2;
    const volRegressed = volPct !== null && volPct < -5;
    const e1rmRegressed = e1rmPct !== null && e1rmPct < -2;

    if (volImproved) {
      progressDetail.push(`📈 ${entry.exercise.name}: +${(volPct as number).toFixed(0)}% wolumenu`);
    } else if (e1rmImproved) {
      progressDetail.push(`💪 ${entry.exercise.name}: +${(e1rmPct as number).toFixed(0)}% szac. siły (inny schemat serii)`);
    } else if (volRegressed && (e1rmRegressed || e1rmPct === null)) {
      progressDetail.push(`📉 ${entry.exercise.name}: ${(volPct as number).toFixed(0)}% wolumenu`);
    }
  }

  // ---- Typ sesji wg śr. powtórzeń na serię (informacyjne, nie wpływa na wynik) ----
  // 5 serii po 5 i 3 serie po 7 to różne bodźce treningowe (siła vs hipertrofia) —
  // ta etykieta pokazuje, jaki typ zarejestrował system, żeby wskazówki miały sens
  // (np. "dodaj serię" nie pasuje do czysto siłowego dnia niskopowtórzeniowego).
  const totalSets = session.entries.reduce((sum, e) => {
    const sd = asSetsData(e.setsData);
    return sum + (sd.length > 0 ? sd.length : e.sets);
  }, 0);
  const totalReps = session.entries.reduce((sum, e) => {
    const sd = asSetsData(e.setsData);
    return sum + (sd.length > 0 ? sd.reduce((s, x) => s + x.reps, 0) : e.sets * e.reps);
  }, 0);
  const avgRepsPerSet = totalSets > 0 ? totalReps / totalSets : 0;
  const sessionType: 'Siła' | 'Hipertrofia' | 'Wytrzymałość' | null =
    avgRepsPerSet <= 0 ? null : avgRepsPerSet <= 5 ? 'Siła' : avgRepsPerSet <= 12 ? 'Hipertrofia' : 'Wytrzymałość';

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
    const improvements = progressDetail.filter(d => d.includes('📈') || d.includes('🏆') || d.includes('💪')).length;
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

  if (volumeScore < 5 && sessionType === 'Siła') {
    // Niski wolumen na sesji niskopowtórzeniowej (np. 5x5) to często cecha schematu,
    // nie efekt słabszego treningu — "dodaj serię" byłoby tu mylącą podpowiedzią.
    tips.push('🏋️ To sesja siłowa (niskie powtórzenia) — niższy wolumen jest tu normalny, liczy się progres ciężaru/szac. 1RM, nie liczba serii');
  } else if (volumeScore < 5) {
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
    sessionType,
    avgRepsPerSet: Math.round(avgRepsPerSet * 10) / 10,
  };
}

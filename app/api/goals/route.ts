import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';
import {
  estimate1RM, inferDirection, goalProgress, formatPace, formatDuration, MEASUREMENT_FIELDS,
  GoalDirection, HistPoint, minPoint, maxPoint, latestByDate,
} from '@/lib/goals';

type SetData = { reps: number; weight: number };

function asSetsData(v: unknown): SetData[] {
  return Array.isArray(v) ? (v as SetData[]) : [];
}

const SHRINK_MEASUREMENT_KEYS = new Set(['waist', 'hips']);

// Powyżej ~12 powtórzeń wzór Epleya ekstrapoluje bardzo niemiarodajnie (np. seria
// 20 powtórzeń przy umiarkowanym ciężarze potrafi "oszacować" 1RM dużo wyższe niż
// realnie osiągalne) — takie serie pomijamy przy liczeniu celu siłowego, żeby
// cel nie odhaczał się sam z rozgrzewki/serii wytrzymałościowej.
const MAX_REPS_FOR_1RM_ESTIMATE = 12;

// Cała historia szacowanego 1RM dla ćwiczenia (wartość + data sesji) — z niej
// wyliczamy zarówno "teraz" (najlepszy wynik), jak i "start" paska postępu
// (najsłabszy historyczny wynik, żeby doliczyć postęp sprzed założenia celu).
async function e1rmSeries(userId: string, exerciseId: string): Promise<HistPoint[]> {
  const entries = await prisma.workoutEntry.findMany({
    where: { exerciseId, session: { userId } },
    select: { reps: true, weight: true, setsData: true, session: { select: { date: true } } },
  });
  const points: HistPoint[] = [];
  for (const e of entries) {
    const sd = asSetsData(e.setsData);
    const list = sd.length > 0 ? sd : [{ reps: e.reps, weight: e.weight }];
    for (const s of list) {
      if (s.reps > MAX_REPS_FOR_1RM_ESTIMATE) continue;
      const orm = estimate1RM(s.weight, s.reps);
      if (orm > 0) points.push({ value: orm, date: e.session.date });
    }
  }
  return points;
}

// Historia powtórzeń w pojedynczej serii BEZ dociążenia (masa własna, waga = 0) —
// np. podciąganie, pompki, dipy. Osobno od 1RM, bo tam liczy się siła z obciążeniem,
// tu czysta liczba powtórzeń.
async function repsSeries(userId: string, exerciseId: string): Promise<HistPoint[]> {
  const entries = await prisma.workoutEntry.findMany({
    where: { exerciseId, session: { userId } },
    select: { reps: true, weight: true, setsData: true, session: { select: { date: true } } },
  });
  const points: HistPoint[] = [];
  for (const e of entries) {
    const sd = asSetsData(e.setsData);
    const list = sd.length > 0 ? sd : [{ reps: e.reps, weight: e.weight }];
    for (const s of list) {
      if (s.weight !== 0) continue;
      if (s.reps > 0) points.push({ value: s.reps, date: e.session.date });
    }
  }
  return points;
}

function measurementSeries(
  measurements: { date: Date; waist: number | null; chest: number | null; biceps: number | null; thigh: number | null; hips: number | null; calf: number | null; forearm: number | null; custom: unknown }[],
  key: string
): HistPoint[] {
  const fixedKeys = new Set(MEASUREMENT_FIELDS.map(f => f.key));
  const points: HistPoint[] = [];
  for (const m of measurements) {
    if (fixedKeys.has(key)) {
      const v = (m as unknown as Record<string, unknown>)[key];
      if (typeof v === 'number') points.push({ value: v, date: m.date });
    } else {
      const custom = Array.isArray(m.custom) ? (m.custom as { label: string; value: number }[]) : [];
      const hit = custom.find(c => c.label.toLowerCase() === key.toLowerCase());
      if (hit) points.push({ value: hit.value, date: m.date });
    }
  }
  return points;
}

export async function GET() {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });

    const goals = await prisma.goal.findMany({
      where: { userId },
      include: { exercise: { select: { name: true } } },
    });
    if (goals.length === 0) return NextResponse.json([]);

    // Dane bazowe pobrane raz, współdzielone przez cele tego samego typu
    const [weights, measurements, runs] = await Promise.all([
      goals.some(g => g.type === 'WEIGHT')
        ? prisma.bodyWeight.findMany({ where: { userId }, select: { date: true, weight: true } })
        : Promise.resolve([]),
      goals.some(g => g.type === 'MEASUREMENT')
        ? prisma.bodyMeasurement.findMany({ where: { userId }, orderBy: { date: 'desc' }, take: 100 })
        : Promise.resolve([]),
      (goals.some(g => g.type === 'RUN_DISTANCE') || goals.some(g => g.type === 'RUN_PACE') || goals.some(g => g.type === 'RUN_TIME'))
        ? prisma.runSession.findMany({ where: { userId } })
        : Promise.resolve([]),
    ]);

    const weightPoints: HistPoint[] = weights.map(w => ({ value: w.weight, date: w.date }));
    const runPoints: HistPoint[] = runs.map(r => ({ value: r.distance, date: r.date }));
    const pacePoints: HistPoint[] = runs.filter(r => r.distance >= 1).map(r => ({ value: r.duration / r.distance, date: r.date }));

    const e1rmCache = new Map<string, HistPoint[]>();
    const repsCache = new Map<string, HistPoint[]>();

    const result = await Promise.all(goals.map(async (g) => {
      let current: number | null = null;
      let startPoint: HistPoint | null = null;
      // Domyślnie porównujemy do targetValue — RUN_TIME nadpisuje to niżej,
      // bo tam "current" to tempo (sek/km), a targetValue to sam dystans.
      let progressTarget = g.targetValue;
      switch (g.type) {
        case 'WEIGHT':
          current = latestByDate(weightPoints)?.value ?? null;
          startPoint = g.direction === 'decrease' ? maxPoint(weightPoints) : minPoint(weightPoints);
          break;
        case 'MEASUREMENT':
          if (g.measurementKey) {
            const series = measurementSeries(measurements, g.measurementKey);
            current = latestByDate(series)?.value ?? null;
            startPoint = g.direction === 'decrease' ? maxPoint(series) : minPoint(series);
          }
          break;
        case 'EXERCISE_1RM':
          if (g.exerciseId) {
            if (!e1rmCache.has(g.exerciseId)) {
              e1rmCache.set(g.exerciseId, await e1rmSeries(userId, g.exerciseId));
            }
            const series = e1rmCache.get(g.exerciseId)!;
            current = maxPoint(series)?.value ?? null;
            startPoint = minPoint(series);
          }
          break;
        case 'EXERCISE_REPS':
          if (g.exerciseId) {
            if (!repsCache.has(g.exerciseId)) {
              repsCache.set(g.exerciseId, await repsSeries(userId, g.exerciseId));
            }
            const series = repsCache.get(g.exerciseId)!;
            current = maxPoint(series)?.value ?? null;
            startPoint = minPoint(series);
          }
          break;
        case 'RUN_DISTANCE':
          current = maxPoint(runPoints)?.value ?? null;
          startPoint = minPoint(runPoints);
          break;
        case 'RUN_PACE':
          current = minPoint(pacePoints)?.value ?? null;
          startPoint = maxPoint(pacePoints);
          break;
        case 'RUN_TIME': {
          // Cel "dystans w czasie" (np. 5km w 25 min) — sprawdzamy najlepsze tempo
          // spośród biegów, które pokryły PRZYNAJMNIEJ tyle dystansu co cel (krótsze
          // biegi się nie liczą, bo nie da się z nich wywnioskować, czy dystans
          // docelowy zostałby pokonany w wymaganym czasie).
          if (g.targetSecondary != null && g.targetValue > 0) {
            const qualifying = runs.filter(r => r.distance >= g.targetValue);
            const qualPoints: HistPoint[] = qualifying.map(r => ({ value: r.duration / r.distance, date: r.date }));
            current = minPoint(qualPoints)?.value ?? null;
            startPoint = maxPoint(qualPoints);
            progressTarget = g.targetSecondary / g.targetValue;
          }
          break;
        }
      }
      const startValue = startPoint?.value ?? null;
      const progress = goalProgress(g.direction as GoalDirection, startValue, progressTarget, current);
      return { goal: g, current, progress, startValue, startDate: startPoint?.date ?? null };
    }));

    // Oznacz jako osiągnięte (raz osiągnięty cel zostaje osiągnięty, nawet po regresie)
    const toMark = result.filter(r => r.progress.achieved && !r.goal.achievedAt);
    if (toMark.length > 0) {
      await Promise.all(toMark.map(r => prisma.goal.update({ where: { id: r.goal.id }, data: { achievedAt: new Date() } })));
    }

    const payload = result.map(r => {
      // `goal` jest tu rzutowany na `any` przy rozpakowaniu, bo TS zgłasza
      // "specified more than once" gdy spread i jawny klucz (startValue/startDate)
      // nazywają się tak samo, mimo że jawny klucz nadpisuje poprawnie w runtime.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = r.goal as any;
      return {
        ...g,
        achievedAt: toMark.some(t => t.goal.id === r.goal.id) ? new Date().toISOString() : r.goal.achievedAt,
        exerciseName: r.goal.exercise?.name ?? null,
        currentValue: r.current,
        startValue: r.startValue,
        startDate: r.startDate,
        progressPct: r.progress.pct,
        achieved: r.progress.achieved,
      };
    });

    payload.sort((a, b) => {
      if (!!a.achievedAt !== !!b.achievedAt) return a.achievedAt ? 1 : -1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return NextResponse.json(payload);
  } catch (e) {
    console.error('GET /api/goals', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    const body = await req.json();
    const { type, targetValue, targetSecondary, exerciseId, measurementKey, targetDate, notes } = body;

    const target = typeof targetValue === 'number' ? targetValue : parseFloat(targetValue);
    if (!Number.isFinite(target) || target <= 0) {
      return NextResponse.json({ error: 'Podaj poprawną wartość docelową' }, { status: 400 });
    }
    if (type === 'EXERCISE_REPS' && !Number.isInteger(target)) {
      return NextResponse.json({ error: 'Liczba powtórzeń musi być liczbą całkowitą' }, { status: 400 });
    }

    let direction: GoalDirection;
    let start: number | null;
    let label: string;
    let finalExerciseId: string | null = null;
    let finalMeasurementKey: string | null = null;
    let finalTargetSecondary: number | null = null;

    if (type === 'WEIGHT') {
      const latest = await prisma.bodyWeight.findFirst({ where: { userId }, orderBy: { date: 'desc' } });
      start = latest?.weight ?? null;
      direction = start !== null ? inferDirection(target, start) : 'decrease';
      label = `Waga ciała: ${direction === 'decrease' ? 'schudnij do' : 'przytyj do'} ${target}kg`;
    } else if (type === 'MEASUREMENT') {
      if (!measurementKey || typeof measurementKey !== 'string') {
        return NextResponse.json({ error: 'Wybierz obwód' }, { status: 400 });
      }
      finalMeasurementKey = measurementKey;
      const fieldLabel = MEASUREMENT_FIELDS.find(f => f.key === measurementKey)?.label || measurementKey;
      const recent = await prisma.bodyMeasurement.findMany({ where: { userId }, orderBy: { date: 'desc' }, take: 100 });
      const series = measurementSeries(recent, measurementKey);
      start = latestByDate(series)?.value ?? null;
      direction = start !== null
        ? inferDirection(target, start)
        : (SHRINK_MEASUREMENT_KEYS.has(measurementKey) ? 'decrease' : 'increase');
      label = `${fieldLabel}: ${direction === 'decrease' ? 'zmniejsz do' : 'zwiększ do'} ${target}cm`;
    } else if (type === 'EXERCISE_1RM') {
      if (!exerciseId || typeof exerciseId !== 'string') {
        return NextResponse.json({ error: 'Wybierz ćwiczenie' }, { status: 400 });
      }
      const exercise = await prisma.exercise.findUnique({ where: { id: exerciseId }, select: { name: true } });
      if (!exercise) return NextResponse.json({ error: 'Nie znaleziono ćwiczenia' }, { status: 400 });
      finalExerciseId = exerciseId;
      start = maxPoint(await e1rmSeries(userId, exerciseId))?.value ?? null;
      direction = 'increase';
      label = `${exercise.name}: szacowane 1RM ${target}kg`;
    } else if (type === 'EXERCISE_REPS') {
      if (!exerciseId || typeof exerciseId !== 'string') {
        return NextResponse.json({ error: 'Wybierz ćwiczenie' }, { status: 400 });
      }
      const exercise = await prisma.exercise.findUnique({ where: { id: exerciseId }, select: { name: true } });
      if (!exercise) return NextResponse.json({ error: 'Nie znaleziono ćwiczenia' }, { status: 400 });
      finalExerciseId = exerciseId;
      start = maxPoint(await repsSeries(userId, exerciseId))?.value ?? null;
      direction = 'increase';
      label = `${exercise.name}: ${target} powtórzeń (masa własna)`;
    } else if (type === 'RUN_DISTANCE') {
      const runs = await prisma.runSession.findMany({ where: { userId }, select: { distance: true } });
      start = runs.length > 0 ? Math.max(...runs.map(r => r.distance)) : null;
      direction = 'increase';
      label = `Bieganie: przebiegnij ${target}km jednorazowo`;
    } else if (type === 'RUN_PACE') {
      const runs = await prisma.runSession.findMany({ where: { userId, distance: { gte: 1 } }, select: { distance: true, duration: true } });
      start = runs.length > 0 ? Math.min(...runs.map(r => r.duration / r.distance)) : null;
      direction = 'decrease';
      label = `Bieganie: tempo poniżej ${formatPace(target)}/km`;
    } else if (type === 'RUN_TIME') {
      const secondary = typeof targetSecondary === 'number' ? targetSecondary : parseFloat(targetSecondary);
      if (!Number.isFinite(secondary) || secondary <= 0) {
        return NextResponse.json({ error: 'Podaj docelowy czas' }, { status: 400 });
      }
      finalTargetSecondary = secondary;
      const runs = await prisma.runSession.findMany({ where: { userId, distance: { gte: target } }, select: { distance: true, duration: true } });
      start = runs.length > 0 ? Math.min(...runs.map(r => r.duration / r.distance)) : null;
      direction = 'decrease';
      label = `Bieganie: ${target}km w czasie poniżej ${formatDuration(secondary)}`;
    } else {
      return NextResponse.json({ error: 'Nieznany typ celu' }, { status: 400 });
    }

    const goal = await prisma.goal.create({
      data: {
        userId,
        type,
        direction,
        label,
        startValue: start,
        targetValue: target,
        targetSecondary: finalTargetSecondary,
        targetDate: targetDate ? new Date(targetDate) : null,
        exerciseId: finalExerciseId,
        measurementKey: finalMeasurementKey,
        notes: notes || null,
      },
      include: { exercise: { select: { name: true } } },
    });

    return NextResponse.json(goal, { status: 201 });
  } catch (e) {
    console.error('POST /api/goals', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

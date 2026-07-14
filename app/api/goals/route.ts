import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';
import { estimate1RM, inferDirection, goalProgress, formatPace, MEASUREMENT_FIELDS, GoalDirection } from '@/lib/goals';

type SetData = { reps: number; weight: number };

function asSetsData(v: unknown): SetData[] {
  return Array.isArray(v) ? (v as SetData[]) : [];
}

const SHRINK_MEASUREMENT_KEYS = new Set(['waist', 'hips']);

async function bestE1RMEver(userId: string, exerciseId: string): Promise<number | null> {
  const entries = await prisma.workoutEntry.findMany({
    where: { exerciseId, session: { userId } },
    select: { sets: true, reps: true, weight: true, setsData: true },
  });
  let best: number | null = null;
  for (const e of entries) {
    const sd = asSetsData(e.setsData);
    const list = sd.length > 0 ? sd : [{ reps: e.reps, weight: e.weight }];
    for (const s of list) {
      const orm = estimate1RM(s.weight, s.reps);
      if (orm > 0 && (best === null || orm > best)) best = orm;
    }
  }
  return best;
}

function latestMeasurementValue(
  measurements: { date: Date; waist: number | null; chest: number | null; biceps: number | null; thigh: number | null; hips: number | null; calf: number | null; forearm: number | null; custom: unknown }[],
  key: string
): number | null {
  const fixedKeys = new Set(MEASUREMENT_FIELDS.map(f => f.key));
  for (const m of measurements) {
    if (fixedKeys.has(key)) {
      const v = (m as unknown as Record<string, unknown>)[key];
      if (typeof v === 'number') return v;
    } else {
      const custom = Array.isArray(m.custom) ? (m.custom as { label: string; value: number }[]) : [];
      const hit = custom.find(c => c.label.toLowerCase() === key.toLowerCase());
      if (hit) return hit.value;
    }
  }
  return null;
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
    const [latestWeight, measurements, runs] = await Promise.all([
      prisma.bodyWeight.findFirst({ where: { userId }, orderBy: { date: 'desc' } }),
      goals.some(g => g.type === 'MEASUREMENT')
        ? prisma.bodyMeasurement.findMany({ where: { userId }, orderBy: { date: 'desc' }, take: 100 })
        : Promise.resolve([]),
      (goals.some(g => g.type === 'RUN_DISTANCE') || goals.some(g => g.type === 'RUN_PACE'))
        ? prisma.runSession.findMany({ where: { userId } })
        : Promise.resolve([]),
    ]);

    const maxRunDistance = runs.length > 0 ? Math.max(...runs.map(r => r.distance)) : null;
    const pacesRuns = runs.filter(r => r.distance >= 1);
    const minRunPace = pacesRuns.length > 0
      ? Math.min(...pacesRuns.map(r => r.duration / r.distance))
      : null;

    const e1rmCache = new Map<string, number | null>();

    const result = await Promise.all(goals.map(async (g) => {
      let current: number | null = null;
      switch (g.type) {
        case 'WEIGHT':
          current = latestWeight?.weight ?? null;
          break;
        case 'MEASUREMENT':
          current = g.measurementKey ? latestMeasurementValue(measurements, g.measurementKey) : null;
          break;
        case 'EXERCISE_1RM':
          if (g.exerciseId) {
            if (!e1rmCache.has(g.exerciseId)) {
              e1rmCache.set(g.exerciseId, await bestE1RMEver(userId, g.exerciseId));
            }
            current = e1rmCache.get(g.exerciseId) ?? null;
          }
          break;
        case 'RUN_DISTANCE':
          current = maxRunDistance;
          break;
        case 'RUN_PACE':
          current = minRunPace;
          break;
      }
      const progress = goalProgress(g.direction as GoalDirection, g.startValue, g.targetValue, current);
      return { goal: g, current, progress };
    }));

    // Oznacz jako osiągnięte (raz osiągnięty cel zostaje osiągnięty, nawet po regresie)
    const toMark = result.filter(r => r.progress.achieved && !r.goal.achievedAt);
    if (toMark.length > 0) {
      await Promise.all(toMark.map(r => prisma.goal.update({ where: { id: r.goal.id }, data: { achievedAt: new Date() } })));
    }

    const payload = result.map(r => ({
      ...r.goal,
      achievedAt: toMark.some(t => t.goal.id === r.goal.id) ? new Date().toISOString() : r.goal.achievedAt,
      exerciseName: r.goal.exercise?.name ?? null,
      currentValue: r.current,
      progressPct: r.progress.pct,
      achieved: r.progress.achieved,
    }));

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
    const { type, targetValue, exerciseId, measurementKey, targetDate, notes } = body;

    const target = typeof targetValue === 'number' ? targetValue : parseFloat(targetValue);
    if (!Number.isFinite(target) || target <= 0) {
      return NextResponse.json({ error: 'Podaj poprawną wartość docelową' }, { status: 400 });
    }

    let direction: GoalDirection;
    let start: number | null;
    let label: string;
    let finalExerciseId: string | null = null;
    let finalMeasurementKey: string | null = null;

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
      start = latestMeasurementValue(recent, measurementKey);
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
      start = await bestE1RMEver(userId, exerciseId);
      direction = 'increase';
      label = `${exercise.name}: 1RM ${target}kg`;
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

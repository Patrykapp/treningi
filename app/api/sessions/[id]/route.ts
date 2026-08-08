import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';

/**
 * Dane techniczne wpisu — tylko obiekt, nigdy tekst czy liczba.
 *
 * Typ zwracany musi być Prisma.InputJsonValue, a nie Record<string, unknown>:
 * kolumna Json przyjmuje wyłącznie wartości dające się zserializować, a
 * `unknown` tego nie gwarantuje i build się nie kompiluje.
 */
function metaOrNull(v: unknown): Prisma.InputJsonValue | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Prisma.InputJsonObject) : undefined;
}

/** Czas w sekundach, z sensownym zakresem: od 10 s do 6 godzin. */
function durationOrNull(v: unknown): number | null {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 10 && n <= 21600 ? n : null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    const { id } = await params;
    const session = await prisma.workoutSession.findUnique({
      where: { id },
      include: {
        user: true,
        entries: { include: { exercise: true } },
        activities: { include: { user: { select: { id: true, name: true } } } },
        runs: true,
      },
    });
    if (!session) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 });
    // Odczyt dostępny dla każdego zalogowanego — wspólna aplikacja, podgląd
    // treningów partnera jest pożądany. Edycja/usuwanie nadal tylko właściciel.
    return NextResponse.json(session);
  } catch {
    return NextResponse.json({ error: 'Blad serwera' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    const { id } = await params;
    const existing = await prisma.workoutSession.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 });
    if (existing.userId !== userId) return NextResponse.json({ error: 'Brak dostepu' }, { status: 403 });
    const { date, notes, entries } = await request.json();
    await prisma.workoutEntry.deleteMany({ where: { sessionId: id } });
    const session = await prisma.workoutSession.update({
      where: { id },
      data: {
        date: new Date(date),
        notes: notes || null,
        entries: {
          create: entries.map((e: { exerciseId: string; sets: number; reps: number; weight: number; durationSec?: number | null; rpe?: number; comment?: string; meta?: unknown; setsData?: { reps: number; weight: number }[] }) => {
            const durationSec = durationOrNull(e.durationSec);
            const sd = durationSec ? [] : e.setsData && e.setsData.length > 0 ? e.setsData : [];
            return {
              exerciseId: e.exerciseId,
              sets: durationSec ? 1 : sd.length > 0 ? sd.length : Number(e.sets),
              reps: durationSec ? 1 : sd.length > 0 ? Math.max(...sd.map(s => s.reps)) : Number(e.reps),
              weight: durationSec ? 0 : sd.length > 0 ? Math.max(...sd.map(s => s.weight)) : Number(e.weight),
              durationSec,
              rpe: e.rpe ? Number(e.rpe) : null,
              comment: e.comment || null,
              meta: metaOrNull(e.meta),
              setsData: sd,
            };
          }),
        },
      },
      include: { user: true, entries: { include: { exercise: true } } },
    });
    return NextResponse.json(session);
  } catch {
    return NextResponse.json({ error: 'Blad serwera' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    const { id } = await params;
    const existing = await prisma.workoutSession.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 });
    if (existing.userId !== userId) return NextResponse.json({ error: 'Brak dostepu' }, { status: 403 });
    const { entry, watch } = await request.json();

    // Aktualizacja danych z zegarka (import TCX w podsumowaniu)
    if (watch) {
      const updated = await prisma.workoutSession.update({
        where: { id },
        data: {
          durationSec: watch.durationSec ? Math.round(Number(watch.durationSec)) : null,
          kcal: watch.kcal ? Math.round(Number(watch.kcal)) : null,
          avgHr: watch.avgHr ? Math.round(Number(watch.avgHr)) : null,
          maxHr: watch.maxHr ? Math.round(Number(watch.maxHr)) : null,
          hrSeries: Array.isArray(watch.hrSeries) ? watch.hrSeries.map(Number) : [],
        },
        include: { user: true, entries: { include: { exercise: true } } },
      });
      return NextResponse.json(updated);
    }

    if (!entry) return NextResponse.json({ error: 'Brak cwiczenia' }, { status: 400 });
    const entryDuration = durationOrNull(entry.durationSec);
    const sd = entryDuration ? [] : entry.setsData && entry.setsData.length > 0 ? entry.setsData : [];
    const created = await prisma.workoutEntry.create({
      data: {
        sessionId: id,
        exerciseId: entry.exerciseId,
        sets: entryDuration ? 1 : sd.length > 0 ? sd.length : Number(entry.sets),
        reps: entryDuration ? 1 : sd.length > 0 ? Math.max(...sd.map((s: { reps: number }) => s.reps)) : Number(entry.reps),
        weight: entryDuration ? 0 : sd.length > 0 ? Math.max(...sd.map((s: { weight: number }) => s.weight)) : Number(entry.weight),
        durationSec: entryDuration,
        rpe: entry.rpe ? Number(entry.rpe) : null,
        comment: entry.comment || null,
        meta: metaOrNull(entry.meta),
        setsData: sd,
      },
      include: { exercise: true },
    });
    return NextResponse.json(created);
  } catch {
    return NextResponse.json({ error: 'Blad serwera' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    const { id } = await params;
    const existing = await prisma.workoutSession.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 });
    if (existing.userId !== userId) return NextResponse.json({ error: 'Brak dostepu' }, { status: 403 });
    await prisma.workoutSession.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Blad serwera' }, { status: 500 });
  }
}

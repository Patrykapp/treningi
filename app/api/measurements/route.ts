import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';

interface CustomInput { label?: unknown; value?: unknown }

function parseCustom(input: unknown): { label: string; value: number }[] {
  if (!Array.isArray(input)) return [];
  const out: { label: string; value: number }[] = [];
  for (const raw of input as CustomInput[]) {
    const label = typeof raw?.label === 'string' ? raw.label.trim() : '';
    const value = typeof raw?.value === 'number' ? raw.value : parseFloat(String(raw?.value));
    if (label && Number.isFinite(value)) out.push({ label, value });
  }
  return out;
}

export async function GET(request: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    const { searchParams } = new URL(request.url);
    // Odczyt pomiarów innego użytkownika dozwolony (wspólna aplikacja)
    const targetUserId = searchParams.get('userId') || userId;
    const limit = parseInt(searchParams.get('limit') || '200');
    const entries = await prisma.bodyMeasurement.findMany({
      where: { userId: targetUserId },
      include: { user: true },
      orderBy: { date: 'desc' },
      take: limit,
    });
    return NextResponse.json(entries);
  } catch {
    return NextResponse.json({ error: 'Blad serwera' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    const body = await req.json();
    const { date, waist, chest, biceps, thigh, hips, calf, forearm, notes } = body;
    if (!date) {
      return NextResponse.json({ error: 'Brakuje daty' }, { status: 400 });
    }

    const toFloat = (v: unknown): number | null => {
      if (v === undefined || v === null || v === '') return null;
      const n = typeof v === 'number' ? v : parseFloat(String(v));
      return Number.isFinite(n) ? n : null;
    };

    const fixed = {
      waist: toFloat(waist),
      chest: toFloat(chest),
      biceps: toFloat(biceps),
      thigh: toFloat(thigh),
      hips: toFloat(hips),
      calf: toFloat(calf),
      forearm: toFloat(forearm),
    };
    const custom = parseCustom(body.custom);

    const hasAnyValue = Object.values(fixed).some(v => v !== null) || custom.length > 0;
    if (!hasAnyValue) {
      return NextResponse.json({ error: 'Wpisz przynajmniej jeden pomiar' }, { status: 400 });
    }

    const entry = await prisma.bodyMeasurement.create({
      data: {
        userId,
        date: new Date(date),
        ...fixed,
        custom,
        notes: notes || null,
      },
      include: { user: true },
    });
    return NextResponse.json(entry, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Blad serwera' }, { status: 500 });
  }
}

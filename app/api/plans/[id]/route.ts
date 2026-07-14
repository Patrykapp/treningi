import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    const { id } = await params;
    const { active } = await req.json();
    if (typeof active !== 'boolean') {
      return NextResponse.json({ error: 'Brakuje pola active' }, { status: 400 });
    }
    // Wznawiając plan jako aktywny — archiwizuj pozostałe (tylko jeden aktywny naraz)
    if (active) {
      await prisma.trainingPlan.updateMany({ where: { userId, active: true }, data: { active: false } });
    }
    const plan = await prisma.trainingPlan.update({ where: { id }, data: { active } });
    return NextResponse.json(plan);
  } catch (e) {
    console.error('PATCH /api/plans/[id]', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUserId = await getAuthUserId();
    if (!authUserId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    const { id } = await params;
    await prisma.trainingPlan.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/plans/[id]', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

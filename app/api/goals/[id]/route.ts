import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';
// auth required

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUserId = await getAuthUserId();
    if (!authUserId) return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    const { id } = await params;
    await prisma.goal.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/goals/[id]', e);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

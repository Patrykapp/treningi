/**
 * Kopiuje trening Patryka z 30.05.2026 do Adriana (te same ćwiczenia, ciężary, serie).
 * Run: npx tsx prisma/copy-session-to-adrian.ts
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Znajdź wszystkich użytkowników
  const users = await prisma.user.findMany({ orderBy: { name: 'asc' } });
  console.log('Użytkownicy:');
  users.forEach(u => console.log(`  ${u.name} (${u.id})`));

  const patryk = users.find(u => u.name.toLowerCase().includes('patryk'));
  const adrian = users.find(u => u.name.toLowerCase().includes('adrian'));

  if (!patryk) { console.error('Nie znaleziono Patryka!'); return; }
  if (!adrian) { console.error('Nie znaleziono Adriana!'); return; }

  console.log(`\nPatryk: ${patryk.id}`);
  console.log(`Adrian: ${adrian.id}`);

  // Znajdź sesję Patryka z 30 maja
  const dayStart = new Date('2026-05-30T00:00:00.000Z');
  const dayEnd   = new Date('2026-05-30T23:59:59.999Z');

  const patrykSessions = await prisma.workoutSession.findMany({
    where: { userId: patryk.id, date: { gte: dayStart, lte: dayEnd } },
    include: { entries: { include: { exercise: true } } },
    orderBy: { date: 'desc' },
  });

  if (patrykSessions.length === 0) {
    console.error('Nie znaleziono treningu Patryka z 30.05.2026!');
    return;
  }

  // Jeśli jest więcej niż jedna sesja - użyj tej z największą liczbą ćwiczeń
  const patrykSession = patrykSessions.reduce((a, b) =>
    a.entries.length >= b.entries.length ? a : b
  );

  console.log(`\nSesja Patryka (${patrykSession.date.toISOString().slice(0,10)}):`);
  patrykSession.entries.forEach(e =>
    console.log(`  - ${e.exercise.name}: ${JSON.stringify(e.setsData)}`)
  );

  // Sprawdź czy Adrian ma już sesję z tego dnia
  const adrianExisting = await prisma.workoutSession.findFirst({
    where: { userId: adrian.id, date: { gte: dayStart, lte: dayEnd } },
    include: { entries: true },
  });

  if (adrianExisting) {
    console.log(`\nAdrian ma już sesję z tego dnia (${adrianExisting.entries.length} ćwiczeń). Usuwam i tworzę od nowa...`);
    await prisma.workoutSession.delete({ where: { id: adrianExisting.id } });
  }

  // Skopiuj sesję
  const newSession = await prisma.workoutSession.create({
    data: {
      userId: adrian.id,
      date: patrykSession.date,
      notes: patrykSession.notes,
      entries: {
        create: patrykSession.entries.map(e => ({
          exerciseId: e.exerciseId,
          sets: e.sets,
          reps: e.reps,
          weight: e.weight,
          rpe: e.rpe,
          comment: e.comment,
          setsData: e.setsData ?? [],
        })),
      },
    },
    include: { entries: { include: { exercise: true } } },
  });

  console.log(`\n✓ Skopiowano ${newSession.entries.length} ćwiczeń dla Adriana:`);
  newSession.entries.forEach(e =>
    console.log(`  - ${e.exercise.name}`)
  );
}

main().catch(console.error).finally(() => prisma.$disconnect());

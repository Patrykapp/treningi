/**
 * Uzupełnia czasy serii dla challengu Podciąganie nachwytem z 01.06.2026
 * S1: 8 powt / 46s, S2: 5 powt / 37s, S3: 4 powt / 39s
 * Run: npx tsx prisma/fix-challenge-times.ts
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Znajdź sesję challenge z podciąganiem
  const sessions = await prisma.workoutSession.findMany({
    where: { notes: { startsWith: 'Challenge:' } },
    include: { entries: { include: { exercise: true } } },
    orderBy: { date: 'desc' },
    take: 5,
  });

  console.log('Znalezione challenge sesje:');
  for (const s of sessions) {
    console.log(`  ${s.date.toISOString().slice(0,10)} — ${s.entries.map(e => e.exercise.name).join(', ')}`);
    console.log(`    comment: ${s.entries[0]?.comment}`);
  }

  // Znajdź konkretnie podciąganie nachwytem
  const target = sessions.find(s =>
    s.entries.some(e => e.exercise.name.toLowerCase().includes('podciąganie') && e.exercise.name.toLowerCase().includes('nachwytem'))
  );

  if (!target) {
    console.error('Nie znaleziono sesji z podciąganiem nachwytem!');
    return;
  }

  const entry = target.entries[0];
  console.log(`\nAktualizuję entry ${entry.id}...`);

  const newComment = JSON.stringify({
    challenge: true,
    totalReps: 17,
    durations: [46, 37, 39],
  });

  await prisma.workoutEntry.update({
    where: { id: entry.id },
    data: { comment: newComment },
  });

  console.log('✓ Gotowe! Czasy zapisane: S1=0:46, S2=0:37, S3=0:39');
}

main().catch(console.error).finally(() => prisma.$disconnect());

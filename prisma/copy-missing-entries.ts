/**
 * Dopisuje do treningu użytkownika docelowego ćwiczenia, których brakuje
 * względem treningu użytkownika źródłowego z tego samego dnia.
 *
 * Użycie:
 *   npm run db:copy-missing                  # wczorajszy dzień, Patryk -> Adrian
 *   npm run db:copy-missing -- 2026-06-11    # konkretna data
 *   npm run db:copy-missing -- 2026-06-11 Patryk Adrian
 *
 * RPE i komentarze nie są kopiowane (są indywidualne); serie/powtórzenia/ciężary tak.
 */
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const [dateArg, fromName = 'Patryk', toName = 'Adrian'] = process.argv.slice(2);

  let date: string;
  if (dateArg) {
    date = dateArg;
  } else {
    const d = new Date();
    d.setDate(d.getDate() - 1); // wczoraj
    date = d.toISOString().slice(0, 10);
  }

  const dayStart = new Date(date + 'T00:00:00.000Z');
  const dayEnd = new Date(date + 'T23:59:59.999Z');

  const [fromUser, toUser] = await Promise.all([
    prisma.user.findFirst({ where: { name: { contains: fromName, mode: 'insensitive' } } }),
    prisma.user.findFirst({ where: { name: { contains: toName, mode: 'insensitive' } } }),
  ]);
  if (!fromUser || !toUser) {
    console.error(`Nie znaleziono użytkownika: ${!fromUser ? fromName : toName}`);
    process.exit(1);
  }

  const [fromSession, toSession] = await Promise.all([
    prisma.workoutSession.findFirst({
      where: { userId: fromUser.id, date: { gte: dayStart, lte: dayEnd } },
      include: { entries: { include: { exercise: true } } },
    }),
    prisma.workoutSession.findFirst({
      where: { userId: toUser.id, date: { gte: dayStart, lte: dayEnd } },
      include: { entries: { include: { exercise: true } } },
    }),
  ]);

  if (!fromSession) {
    console.error(`${fromUser.name} nie ma treningu z dnia ${date} — nic do skopiowania.`);
    process.exit(1);
  }

  console.log(`\nTrening źródłowy (${fromUser.name}, ${date}):`);
  for (const e of fromSession.entries) console.log(`  - ${e.exercise.name}`);

  const existingExerciseIds = new Set((toSession?.entries || []).map(e => e.exerciseId));
  const missing = fromSession.entries.filter(e => !existingExerciseIds.has(e.exerciseId));

  console.log(`\nTrening docelowy (${toUser.name}, ${date}): ${toSession ? toSession.entries.length + ' ćwiczeń' : 'BRAK — zostanie utworzony'}`);
  for (const e of (toSession?.entries || [])) console.log(`  - ${e.exercise.name}`);

  if (missing.length === 0) {
    console.log('\nBrak brakujących ćwiczeń — nic do zrobienia.');
    return;
  }

  console.log(`\nDo dopisania dla ${toUser.name}:`);
  for (const e of missing) {
    const sd = Array.isArray(e.setsData) ? (e.setsData as { reps: number; weight: number }[]) : [];
    const desc = sd.length > 0
      ? sd.map(s => `${s.reps}x${s.weight}kg`).join(' · ')
      : `${e.sets}x${e.reps} @ ${e.weight}kg`;
    console.log(`  + ${e.exercise.name}  (${desc})`);
  }

  await prisma.$transaction(async (tx) => {
    let sessionId = toSession?.id;
    if (!sessionId) {
      const created = await tx.workoutSession.create({
        data: { userId: toUser.id, date: new Date(date) },
      });
      sessionId = created.id;
    }
    for (const e of missing) {
      await tx.workoutEntry.create({
        data: {
          sessionId,
          exerciseId: e.exerciseId,
          sets: e.sets,
          reps: e.reps,
          weight: e.weight,
          setsData: (Array.isArray(e.setsData) ? e.setsData : []) as Prisma.InputJsonValue,
          // RPE i komentarz pomijamy — są indywidualne
        },
      });
    }
  });

  console.log(`\n✓ Dopisano ${missing.length} ćwiczeń do treningu ${toUser.name} z dnia ${date}.`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

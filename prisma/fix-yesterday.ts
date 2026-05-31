/**
 * fix-yesterday.ts
 *
 * Uruchom lokalnie:
 *   npx ts-node --project tsconfig.scripts.json prisma/fix-yesterday.ts
 *
 * Co robi:
 * 1. Pokazuje sesje z ostatnich 2 dni dla każdego użytkownika
 * 2. Scala wszystkie sesje Patryka z danego dnia w jedną sesję
 * 3. Tworzy kopię tej scalonej sesji dla Adriana (jeśli Adrian nie ma nic tego dnia)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // ----- 1. Pobierz użytkowników -----
  const users = await prisma.user.findMany({ orderBy: { name: 'asc' } });
  console.log('\n👥 Użytkownicy:');
  users.forEach(u => console.log(`  ${u.id}  ${u.name}`));

  // ----- 2. Pobierz sesje z ostatnich 3 dni -----
  const since = new Date();
  since.setDate(since.getDate() - 3);

  const sessions = await prisma.workoutSession.findMany({
    where: { date: { gte: since } },
    include: {
      entries: { include: { exercise: true } },
      user: true,
    },
    orderBy: [{ userId: 'asc' }, { date: 'asc' }, { createdAt: 'asc' }],
  });

  console.log(`\n📋 Sesje z ostatnich 3 dni (${sessions.length} łącznie):`);
  for (const s of sessions) {
    const dateStr = s.date.toISOString().split('T')[0];
    console.log(`  [${s.user.name}] ${dateStr}  id=${s.id}  ćwiczenia: ${s.entries.map(e => e.exercise.name).join(', ')}`);
  }

  // ----- 3. Grupuj sesje po użytkowniku + dacie -----
  // Klucz: userId + data (YYYY-MM-DD)
  type GroupKey = string;
  const groups = new Map<GroupKey, typeof sessions>();

  for (const s of sessions) {
    const dateStr = s.date.toISOString().split('T')[0];
    const key: GroupKey = `${s.userId}__${dateStr}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }

  // ----- 4. Scala grupy z więcej niż jedną sesją -----
  let mergedCount = 0;
  const mergedByUserDate = new Map<GroupKey, string>(); // key -> nowe sessionId

  for (const [key, group] of groups.entries()) {
    const [userId, dateStr] = key.split('__');
    const user = users.find(u => u.id === userId)!;

    if (group.length === 1) {
      mergedByUserDate.set(key, group[0].id);
      continue; // nic do scalenia
    }

    console.log(`\n🔀 Scalanie ${group.length} sesji dla ${user.name} z dnia ${dateStr}...`);

    // Zbierz wszystkie entries z wszystkich sesji
    const allEntries = group.flatMap(s => s.entries);

    // Zachowaj pierwszą sesję, przenieś do niej entries z pozostałych, usuń resztę
    const keeper = group[0];
    const toDelete = group.slice(1);

    // Przenieś entries
    for (const s of toDelete) {
      await prisma.workoutEntry.updateMany({
        where: { sessionId: s.id },
        data: { sessionId: keeper.id },
      });
    }

    // Usuń puste sesje
    await prisma.workoutSession.deleteMany({
      where: { id: { in: toDelete.map(s => s.id) } },
    });

    console.log(`  ✅ Scalone w sesję ${keeper.id} (${allEntries.length} ćwiczeń: ${allEntries.map(e => e.exercise.name).join(', ')})`);
    mergedByUserDate.set(key, keeper.id);
    mergedCount++;
  }

  if (mergedCount === 0) {
    console.log('\nℹ️  Brak sesji wymagających scalenia.');
  }

  // ----- 5. Kopiuj sesje między użytkownikami jeśli jeden ma, drugi nie -----
  // Zbierz daty które wystąpiły
  const allDates = new Set<string>();
  for (const key of groups.keys()) {
    allDates.add(key.split('__')[1]);
  }

  for (const dateStr of allDates) {
    const usersWithSession = users.filter(u => mergedByUserDate.has(`${u.id}__${dateStr}`));
    const usersWithout = users.filter(u => !mergedByUserDate.has(`${u.id}__${dateStr}`));

    if (usersWithout.length === 0) continue;
    if (usersWithSession.length === 0) continue;

    // Weź sesję źródłową (pierwszego użytkownika który ma)
    const sourceSessionId = mergedByUserDate.get(`${usersWithSession[0].id}__${dateStr}`)!;
    const sourceSession = await prisma.workoutSession.findUnique({
      where: { id: sourceSessionId },
      include: { entries: true },
    });
    if (!sourceSession) continue;

    for (const targetUser of usersWithout) {
      console.log(`\n📋 Kopiuję sesję z ${usersWithSession[0].name} → ${targetUser.name} dla dnia ${dateStr}...`);

      const newSession = await prisma.workoutSession.create({
        data: {
          userId: targetUser.id,
          date: sourceSession.date,
          notes: sourceSession.notes,
          entries: {
            create: sourceSession.entries.map(e => ({
              exerciseId: e.exerciseId,
              sets: e.sets,
              reps: e.reps,
              weight: e.weight,
              rpe: e.rpe,
              comment: e.comment,
              setsData: e.setsData as object,
            })),
          },
        },
      });

      console.log(`  ✅ Utworzono sesję ${newSession.id} dla ${targetUser.name}`);
    }
  }

  // ----- 6. Podsumowanie -----
  const finalSessions = await prisma.workoutSession.findMany({
    where: { date: { gte: since } },
    include: { entries: { include: { exercise: true } }, user: true },
    orderBy: [{ userId: 'asc' }, { date: 'asc' }],
  });

  console.log('\n✅ WYNIK KOŃCOWY:');
  for (const s of finalSessions) {
    const dateStr = s.date.toISOString().split('T')[0];
    console.log(`  [${s.user.name}] ${dateStr}  ćwiczenia: ${s.entries.map(e => e.exercise.name).join(', ')}`);
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

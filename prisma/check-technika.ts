import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const all = await prisma.exercise.findMany({ orderBy: [{ muscleGroup: 'asc' }, { name: 'asc' }] });

  const linked   = all.filter(e => e.exerciseDbId && e.exerciseDbId.trim() !== '');
  const unlinked = all.filter(e => !e.exerciseDbId || e.exerciseDbId.trim() === '');

  console.log(`\n📊 STATYSTYKI TECHNIKI`);
  console.log(`${'─'.repeat(40)}`);
  console.log(`Łącznie ćwiczeń:      ${all.length}`);
  console.log(`✅ Powiązane:          ${linked.length} (${Math.round(linked.length / all.length * 100)}%)`);
  console.log(`❌ Bez techniki:       ${unlinked.length} (${Math.round(unlinked.length / all.length * 100)}%)`);

  console.log(`\n❌ ĆWICZENIA BEZ POWIĄZANEJ TECHNIKI (${unlinked.length}):`);
  console.log(`${'─'.repeat(50)}`);

  const groups: Record<string, typeof unlinked> = {};
  for (const ex of unlinked) {
    const g = ex.muscleGroup || 'Inne';
    if (!groups[g]) groups[g] = [];
    groups[g].push(ex);
  }

  for (const [group, exs] of Object.entries(groups)) {
    console.log(`\n  [${group}]`);
    for (const ex of exs) {
      const shortName = ex.name.includes(' - ') ? ex.name.split(' - ').slice(1).join(' - ') : ex.name;
      console.log(`    • ${shortName}`);
    }
  }

  if (linked.length > 0) {
    console.log(`\n✅ ĆWICZENIA Z TECHNIKĄ (${linked.length}):`);
    console.log(`${'─'.repeat(50)}`);
    for (const ex of linked) {
      const shortName = ex.name.includes(' - ') ? ex.name.split(' - ').slice(1).join(' - ') : ex.name;
      console.log(`  ✅ [${ex.muscleGroup}] ${shortName}  → ${ex.exerciseDbId}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());

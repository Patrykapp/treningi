import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const adrian = await prisma.user.findFirst({ where: { name: { contains: 'Adrian', mode: 'insensitive' } } });
  if (!adrian) { console.log('Nie znaleziono Adriana'); return; }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  const runs = await prisma.runSession.findMany({
    where: { userId: adrian.id, date: { gte: yesterday } },
    orderBy: { date: 'desc' },
  });

  if (runs.length === 0) {
    console.log('Adrian nie ma biegów z dziś ani wczoraj.');
  } else {
    runs.forEach(r => {
      console.log(`${r.date.toISOString().slice(0,10)} — ${r.distance}km, duration=${r.duration}s`);
      console.log(`  splits: ${JSON.stringify(r.splits)}`);
    });
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());

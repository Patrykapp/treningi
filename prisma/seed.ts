import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Users
  const patryk = await prisma.user.upsert({
    where: { id: 'user-patryk' },
    update: {},
    create: { id: 'user-patryk', name: 'Patryk' },
  });

  const adrian = await prisma.user.upsert({
    where: { id: 'user-adrian' },
    update: {},
    create: { id: 'user-adrian', name: 'Adrian' },
  });

  // Exercises
  const exercises = [
    { id: 'ex-bench', name: 'Wyciskanie sztangi', muscleGroup: 'Klatka piersiowa' },
    { id: 'ex-squat', name: 'Przysiad ze sztangą', muscleGroup: 'Nogi' },
    { id: 'ex-deadlift', name: 'Martwy ciąg', muscleGroup: 'Plecy / Nogi' },
    { id: 'ex-pullup', name: 'Podciąganie', muscleGroup: 'Plecy / Biceps' },
    { id: 'ex-ohp', name: 'OHP (wyciskanie nad głowę)', muscleGroup: 'Barki' },
    { id: 'ex-row', name: 'Wiosłowanie sztangą', muscleGroup: 'Plecy' },
  ];

  for (const ex of exercises) {
    await prisma.exercise.upsert({
      where: { id: ex.id },
      update: {},
      create: ex,
    });
  }

  // Sample sessions for Patryk
  const session1 = await prisma.workoutSession.create({
    data: {
      date: new Date('2025-01-10'),
      userId: patryk.id,
      notes: 'Dobry trening',
      entries: {
        create: [
          { exerciseId: 'ex-bench', sets: 4, reps: 8, weight: 80, rpe: 7 },
          { exerciseId: 'ex-ohp', sets: 3, reps: 10, weight: 50, rpe: 7 },
        ],
      },
    },
  });

  const session2 = await prisma.workoutSession.create({
    data: {
      date: new Date('2025-01-17'),
      userId: patryk.id,
      notes: '',
      entries: {
        create: [
          { exerciseId: 'ex-bench', sets: 4, reps: 8, weight: 82.5, rpe: 8 },
          { exerciseId: 'ex-squat', sets: 4, reps: 6, weight: 100, rpe: 8 },
        ],
      },
    },
  });

  // Sample sessions for Adrian
  const session3 = await prisma.workoutSession.create({
    data: {
      date: new Date('2025-01-12'),
      userId: adrian.id,
      entries: {
        create: [
          { exerciseId: 'ex-deadlift', sets: 3, reps: 5, weight: 120, rpe: 8 },
          { exerciseId: 'ex-row', sets: 4, reps: 10, weight: 70, rpe: 7 },
        ],
      },
    },
  });

  console.log('Seed zakończony:', { patryk, adrian, session1: session1.id, session2: session2.id, session3: session3.id });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

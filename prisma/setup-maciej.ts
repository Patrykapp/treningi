/**
 * Zakłada (lub aktualizuje) konto boczne "Maciej".
 *   - accessCode: "84297"  → logowanie kodem loguje konkretnie Macieja
 *   - isolated:  true       → konto "z boku": bez przełącznika profilu, zachęt
 *                             i zapisu "jako inny user". Podgląd historii i
 *                             porównania ćwiczeń z innymi pozostają.
 *
 * WYMAGA wcześniejszej migracji schematu:  npm run db:push
 * Uruchomienie:                            npm run db:setup-maciej
 *
 * Możesz nadpisać wartości domyślne zmiennymi środowiskowymi:
 *   MACIEJ_NAME, MACIEJ_CODE
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const name = process.env.MACIEJ_NAME || 'Maciej';
  const accessCode = process.env.MACIEJ_CODE || '84297';

  // Kolizja kodu z innym użytkownikiem?
  const codeOwner = await prisma.user.findFirst({ where: { accessCode } });
  if (codeOwner && codeOwner.name !== name) {
    console.error(`❌ Kod ${accessCode} jest już przypisany do użytkownika "${codeOwner.name}" [${codeOwner.id}]. Przerwano.`);
    process.exit(1);
  }

  const existing = await prisma.user.findFirst({ where: { name } });

  if (existing) {
    const user = await prisma.user.update({
      where: { id: existing.id },
      data: { accessCode, isolated: true },
    });
    console.log(`✅ Zaktualizowano konto boczne: ${user.name} (kod ${accessCode}, isolated=true) [${user.id}]`);
  } else {
    const user = await prisma.user.create({
      data: { name, accessCode, isolated: true },
    });
    console.log(`✅ Utworzono konto boczne: ${user.name} (kod ${accessCode}, isolated=true) [${user.id}]`);
  }
}

main()
  .catch((e) => { console.error('❌ Błąd:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });

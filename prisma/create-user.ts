/**
 * Skrypt do tworzenia lub aktualizacji użytkowników.
 * Użycie:
 *   npm run db:create-user -- --name "Patryk" --email "patryk@example.com" --password "silneHaslo123"
 *
 * Jeśli użytkownik o podanym emailu już istnieje, zaktualizuje jego hasło.
 * Jeśli podasz --existingName "Patryk", skrypt znajdzie istniejącego użytkownika po nazwie
 * i przypisze mu email + hasło (przydatne przy migracji z pierwszego systemu bez emaila).
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : undefined;
  };

  const name = get('--name');
  const email = get('--email');
  const password = get('--password');
  const existingName = get('--existingName');

  if (!name || !email || !password) {
    console.error('❌ Użycie: npm run db:create-user -- --name "Imię" --email "email@example.com" --password "hasło"');
    console.error('   Opcjonalnie: --existingName "Imię" (żeby zaktualizować istniejącego usera po nazwie)');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const emailLower = email.toLowerCase().trim();

  // Sprawdź czy istnieje już użytkownik o tej nazwie (migracja)
  const nameToFind = existingName || name;
  const existingByName = await prisma.user.findFirst({ where: { name: nameToFind } });

  if (existingByName) {
    // Zaktualizuj istniejącego użytkownika
    await prisma.user.update({
      where: { id: existingByName.id },
      data: { name, email: emailLower, passwordHash },
    });
    console.log(`✅ Zaktualizowano użytkownika: ${name} (${emailLower}) [ID: ${existingByName.id}]`);
  } else {
    // Sprawdź czy istnieje już po emailu
    const existingByEmail = await prisma.user.findUnique({ where: { email: emailLower } });
    if (existingByEmail) {
      await prisma.user.update({
        where: { id: existingByEmail.id },
        data: { name, passwordHash },
      });
      console.log(`✅ Zaktualizowano hasło dla: ${name} (${emailLower})`);
    } else {
      // Stwórz nowego
      const user = await prisma.user.create({
        data: { name, email: emailLower, passwordHash },
      });
      console.log(`✅ Stworzono nowego użytkownika: ${name} (${emailLower}) [ID: ${user.id}]`);
    }
  }

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});

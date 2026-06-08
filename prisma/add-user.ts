/**
 * Dodaje nowego użytkownika z logowaniem email+hasło.
 * Użycie: npx tsx prisma/add-user.ts <imię> <email> <hasło>
 * Przykład: npx tsx prisma/add-user.ts "Kasia" "kasia@example.com" "mojeHaslo123"
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const [,, name, email, password] = process.argv;

  if (!name || !email || !password) {
    console.error('Użycie: npx tsx prisma/add-user.ts <imię> <email> <hasło>');
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.error(`Użytkownik z emailem ${email} już istnieje.`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name, email, passwordHash },
  });

  console.log(`✓ Dodano użytkownika:`);
  console.log(`  Imię:  ${user.name}`);
  console.log(`  Email: ${user.email}`);
  console.log(`  ID:    ${user.id}`);
  console.log(`\nMoże się zalogować przez Email + hasło na stronie /login`);
}

main().catch(console.error).finally(() => prisma.$disconnect());

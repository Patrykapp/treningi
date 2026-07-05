/**
 * BACKUP historii ćwiczeń wszystkich użytkowników (read-only, nic nie zmienia).
 *
 * Eksportuje każdy wpis treningowy: data, użytkownik, nazwa ćwiczenia (+ grupa),
 * serie, powtórzenia, ciężar, RPE, rozpiska serii (setsData) i komentarz.
 *
 * Zapisuje 2 pliki w folderze backups/ (z datą w nazwie):
 *   • history-backup-<data>.json  — pełna wierność (do odtworzenia danych)
 *   • history-backup-<data>.csv   — do otwarcia w Excelu/arkuszu
 *
 * Uruchom:
 *   npx ts-node --project tsconfig.scripts.json prisma/backup-history.ts
 *
 * UWAGA: pliki zawierają dane osobowe (imiona, historia) — nie commituj ich.
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface SetRow { reps?: number; weight?: number }

function fmtDate(d: Date): string {
  // YYYY-MM-DD (lokalnie), stabilne do sortowania i czytelne
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtSets(setsData: unknown, sets: number, reps: number, weight: number): string {
  const arr = Array.isArray(setsData) ? (setsData as SetRow[]) : [];
  if (arr.length > 0) {
    return arr.map(s => `${s.reps ?? 0}×${s.weight ?? 0}kg`).join('; ');
  }
  // brak rozpiski — pokaż wartości zbiorcze
  return `${sets}×${reps}×${weight}kg`;
}

function csvEscape(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const entries = await prisma.workoutEntry.findMany({
    include: {
      exercise: { select: { name: true, muscleGroup: true } },
      session: { select: { date: true, user: { select: { id: true, name: true } } } },
    },
    orderBy: [{ session: { date: 'asc' } }],
  });

  const rows = entries.map(e => ({
    date: fmtDate(e.session.date),
    dateISO: e.session.date.toISOString(),
    user: e.session.user?.name ?? '',
    userId: e.session.user?.id ?? '',
    exercise: e.exercise?.name ?? '',
    muscleGroup: e.exercise?.muscleGroup ?? '',
    sets: e.sets,
    reps: e.reps,
    weight: e.weight,
    rpe: e.rpe ?? null,
    setsDetail: fmtSets(e.setsData, e.sets, e.reps, e.weight),
    comment: e.comment ?? '',
    setsData: e.setsData,
  }));

  const backupDir = path.resolve(process.cwd(), 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const jsonPath = path.join(backupDir, `history-backup-${stamp}.json`);
  const csvPath = path.join(backupDir, `history-backup-${stamp}.csv`);

  // JSON — pełna wierność
  fs.writeFileSync(
    jsonPath,
    JSON.stringify({ exportedAt: new Date().toISOString(), count: rows.length, entries: rows }, null, 2),
    'utf8'
  );

  // CSV — jeden wiersz na wpis; separator ; (przyjazny dla polskiego Excela)
  const header = ['Data', 'Uzytkownik', 'Cwiczenie', 'Grupa', 'Serie', 'Powtorzenia', 'Ciezar_kg', 'RPE', 'Serie_szczegoly', 'Komentarz'];
  const csvLines = [header.join(';')];
  for (const r of rows) {
    csvLines.push([
      csvEscape(r.date), csvEscape(r.user), csvEscape(r.exercise), csvEscape(r.muscleGroup),
      csvEscape(r.sets), csvEscape(r.reps), csvEscape(r.weight), csvEscape(r.rpe),
      csvEscape(r.setsDetail), csvEscape(r.comment),
    ].join(';'));
  }
  // BOM, żeby polskie znaki i separator ; ładnie otworzyły się w Excelu
  fs.writeFileSync(csvPath, '﻿' + csvLines.join('\r\n') + '\r\n', 'utf8');

  const users = new Set(rows.map(r => r.user)).size;
  console.log(`\n✓ Backup gotowy.`);
  console.log(`  wpisów:       ${rows.length}`);
  console.log(`  użytkowników: ${users}`);
  console.log(`  JSON: ${jsonPath}`);
  console.log(`  CSV:  ${csvPath}`);
  console.log(`\nUwaga: pliki zawierają dane osobowe — nie commituj ich do repo.`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

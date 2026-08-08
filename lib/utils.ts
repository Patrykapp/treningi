import { format, parseISO } from 'date-fns';
import { pl } from 'date-fns/locale';

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'd MMM yyyy', { locale: pl });
}

export function formatDateInput(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'yyyy-MM-dd');
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

/** Przerwa: „3:00" zamiast „180 s" — tak się o niej mówi na siłowni. */
export function formatRest(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Komentarz wpisu treningowego do pokazania człowiekowi.
 *
 * Challenge zapisywał kiedyś swoje dane techniczne (czasy serii, długość
 * przerwy) w polu komentarza jako JSON, bo nie było na nie osobnej kolumny.
 * W historii ćwiczenia wyglądało to jak przypadkowo wklejony fragment kodu.
 * Nowe wpisy trzymają te dane w `meta`, ale stare zostają w bazie na zawsze,
 * więc tłumaczymy je przy wyświetlaniu na zdanie po polsku.
 */
export function formatEntryComment(raw?: string | null): string | null {
  const text = (raw ?? '').trim();
  if (!text) return null;
  if (!text.startsWith('{')) return text;

  try {
    const p = JSON.parse(text) as { challenge?: boolean; totalReps?: number; restSeconds?: number };
    if (!p?.challenge) return null; // inny techniczny zapis — lepiej nie pokazywać nic
    const parts = ['Challenge'];
    if (typeof p.totalReps === 'number') parts.push(`${p.totalReps} powt. łącznie`);
    if (typeof p.restSeconds === 'number') parts.push(`przerwa ${formatRest(p.restSeconds)}`);
    return parts.join(' · ');
  } catch {
    // Nie JSON, tylko komentarz zaczynający się od klamry — pokazujemy jak jest.
    return text;
  }
}

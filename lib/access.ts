import { prisma } from '@/lib/prisma';

/**
 * Reguła izolacji kont bocznych (isolated):
 *  - każdy może zapisywać dane za siebie,
 *  - konto boczne (isolated) może zapisywać wyłącznie za siebie,
 *  - do konta bocznego nie może pisać nikt poza nim samym.
 *
 * Zwraca true, jeśli zalogowany użytkownik ma prawo zapisać dane dla WSZYSTKICH
 * podanych użytkowników docelowych. Używane jako zabezpieczenie po stronie
 * serwera (front i tak ukrywa konta boczne z list "zapisz jako").
 */
export async function canWriteForTargets(authUserId: string, targetIds: string[]): Promise<boolean> {
  const ids = [...new Set(targetIds.filter(Boolean))];
  if (ids.length === 0) return true;

  const relevant = await prisma.user.findMany({
    where: { id: { in: [...new Set([authUserId, ...ids])] } },
    select: { id: true, isolated: true },
  });
  const isolatedMap = new Map(relevant.map(u => [u.id, u.isolated]));
  const meIsolated = isolatedMap.get(authUserId) ?? false;

  for (const id of ids) {
    if (id === authUserId) continue;      // za siebie zawsze wolno
    if (meIsolated) return false;         // konto boczne — tylko za siebie
    if (isolatedMap.get(id)) return false; // nikt nie pisze do konta bocznego
  }
  return true;
}

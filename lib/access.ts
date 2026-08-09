import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth';

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

/**
 * Kto jest administratorem.
 *
 * Nie ma osobnej kolumny — administratorem jest NAJSTARSZE konto główne
 * (nieizolowane), czyli dokładnie to samo konto, na które loguje wspólny
 * ADMIN_CODE w `/api/auth`. Trzymamy się tej jednej reguły w całej aplikacji,
 * żeby nie powstały dwie różne definicje administratora.
 *
 * Gdyby kiedyś trzeba było wskazać inne konto, wystarczy ustawić zmienną
 * środowiskową ADMIN_USER_ID — ma pierwszeństwo.
 */
export async function getAdminUserId(): Promise<string | null> {
  const fromEnv = process.env.ADMIN_USER_ID?.trim();
  if (fromEnv) return fromEnv;
  const first = await prisma.user.findFirst({
    where: { isolated: false },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  return first?.id ?? null;
}

export async function isAdminUser(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  return (await getAdminUserId()) === userId;
}

/**
 * Strażnik tras administracyjnych. Zwraca id administratora albo gotową
 * odpowiedź błędu — sprawdzenie MUSI być po stronie serwera, bo ukrycie
 * przycisku w interfejsie niczego nie zabezpiecza.
 */
export async function requireAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; status: number; error: string }
> {
  const userId = await getAuthUserId();
  if (!userId) return { ok: false, status: 401, error: 'Nieautoryzowany' };
  if (!(await isAdminUser(userId))) {
    return { ok: false, status: 403, error: 'Tylko administrator może zarządzać kontami' };
  }
  return { ok: true, userId };
}

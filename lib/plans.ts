// Wspólna logika modułu Plan treningowy — używana przez /api/plans, dashboard i app/plan.

export const DAY_LABELS = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'];
export const DAY_LABELS_SHORT = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd'];

// Indeks dnia tygodnia licząc od poniedziałku (0) — ta sama konwencja co weekStart()
// w app/page.tsx (JS Date.getDay() liczy od niedzieli, więc trzeba przesunąć).
export function mondayBasedWeekday(date: Date): number {
  return (date.getDay() + 6) % 7;
}

export interface PlanLike {
  startDate: string | Date;
  numWeeks: number;
  repeat: boolean;
  days: (string | null)[];
}

export type PlanTodayResult =
  | { status: 'not_started'; startsInDays: number }
  | { status: 'finished' }
  | { status: 'active'; dayOfWeek: number; weekNumber: number; templateId: string | null };

// Który dzień planu obowiązuje "dziś" — dayOfWeek liczony wprost z DZISIEJSZEJ daty
// kalendarzowej (nie jako offset od startDate), bo wzorzec "days" jest tygodniowy
// i ma się powtarzać zgodnie z kalendarzem (np. "poniedziałek = nogi") niezależnie
// od tego, w jaki dzień tygodnia plan wystartował. startDate/numWeeks/repeat
// decydują tylko o TYM, czy plan już trwa / czy się skończył.
export function getPlanToday(plan: PlanLike, now: Date = new Date()): PlanTodayResult {
  const start = new Date(plan.startDate);
  start.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const daysSinceStart = Math.round((today.getTime() - start.getTime()) / 86400000);
  if (daysSinceStart < 0) return { status: 'not_started', startsInDays: -daysSinceStart };

  const totalDays = plan.numWeeks * 7;
  if (!plan.repeat && daysSinceStart >= totalDays) return { status: 'finished' };

  const dayOfWeek = mondayBasedWeekday(today);
  const weekNumber = Math.floor(daysSinceStart / 7) + 1;
  return { status: 'active', dayOfWeek, weekNumber, templateId: plan.days[dayOfWeek] ?? null };
}

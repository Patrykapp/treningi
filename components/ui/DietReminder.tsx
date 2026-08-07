'use client';

/**
 * Przypomnienie o wpisaniu posiłków — baner na stronie startowej.
 *
 * Ten sam wzorzec co przypomnienie o treningu: ustawienia w localStorage,
 * zero infrastruktury serwerowej. Dziennik żywieniowy porzuca się najszybciej,
 * gdy zapomni się wpisać dwa dni z rzędu, więc zaczepka pojawia się tam, gdzie
 * i tak zaglądasz, a nie na samej stronie diety (tam jest już za późno).
 *
 * Baner pokazuje się wieczorem i tylko wtedy, gdy dzień jest pusty. Odłożenie
 * chowa go do końca dnia.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Utensils, X } from 'lucide-react';

const SETTINGS_KEY = 'dietReminderSettings';
const SNOOZE_KEY = 'dietReminderSnoozed';

export type DietReminderSettings = { enabled: boolean; fromHour: number };

export function readDietReminderSettings(): DietReminderSettings {
  const fallback: DietReminderSettings = { enabled: true, fromHour: 18 };
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return fallback;
    const p = JSON.parse(raw);
    return {
      enabled: typeof p.enabled === 'boolean' ? p.enabled : true,
      fromHour: typeof p.fromHour === 'number' && p.fromHour >= 0 && p.fromHour <= 23 ? p.fromHour : 18,
    };
  } catch {
    return fallback;
  }
}

export function saveDietReminderSettings(next: DietReminderSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    /* pełny storage */
  }
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function DietReminder() {
  const [show, setShow] = useState(false);
  const [kcal, setKcal] = useState(0);

  useEffect(() => {
    const s = readDietReminderSettings();
    if (!s.enabled) return;
    if (new Date().getHours() < s.fromHour) return;

    let snoozed = '';
    try {
      snoozed = localStorage.getItem(SNOOZE_KEY) ?? '';
    } catch {
      /* brak dostępu do storage */
    }
    const today = todayISO();
    if (snoozed === today) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/food/diary?date=${today}`);
        if (!res.ok) return; // brak dostępu do modułu diety — nie zaczepiamy
        const body = await res.json();
        const total = Math.round(body?.totals?.kcal ?? 0);
        if (!cancelled && total === 0) {
          setKcal(total);
          setShow(true);
        }
      } catch {
        /* offline — cisza jest lepsza niż fałszywy alarm */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!show) return null;

  const snooze = () => {
    try {
      localStorage.setItem(SNOOZE_KEY, todayISO());
    } catch {
      /* pełny storage */
    }
    setShow(false);
  };

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
      <Utensils className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" strokeWidth={2} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-amber-900">Nie wpisałeś dziś nic do dziennika</p>
        <p className="text-xs text-amber-800 mt-0.5">
          {kcal === 0 && 'Uzupełnij, póki pamiętasz — jutro odtworzenie dnia z głowy nie ma już sensu.'}
        </p>
        <Link
          href="/dieta"
          className="inline-block mt-2 text-sm font-semibold text-amber-900 underline"
        >
          Otwórz dziennik
        </Link>
      </div>
      <button onClick={snooze} className="p-1 text-amber-600 shrink-0" aria-label="Odłóż do jutra">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

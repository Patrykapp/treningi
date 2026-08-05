'use client';

/**
 * Generator dziennego jadłospisu. Pokazuje propozycję do zatwierdzenia —
 * dopiero „Zapisz" tworzy wpisy w dzienniku.
 *
 * Wszystkie wartości odżywcze pochodzą z bazy produktów — model wybiera
 * wyłącznie z zamkniętej listy i nie podaje żadnych liczb. Gramatury
 * dostraja serwer, żeby dzień trafiał w cel kaloryczny.
 */

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Sparkles, ShoppingCart, Check, Copy, RefreshCw, AlertTriangle } from 'lucide-react';
import { MEALS } from '@/lib/nutrition';

type Ingredient = {
  productId: string; name: string; grams: number;
  kcal: number; protein: number; carbs: number; fat: number;
};
type Meal = {
  meal: string; title: string; recipe: string; ingredients: Ingredient[];
  kcal: number; protein: number; carbs: number; fat: number;
};
type Plan = {
  meals: Meal[];
  totals: { kcal: number; protein: number; carbs: number; fat: number };
  targets: { kcal: number; protein: number; carbs: number; fat: number };
  shopping: { name: string; grams: number }[];
  totalIngredients: number;
  catalogSize: number;
  accuracy: number;
  retried: boolean;
};

const STYLE_OPTIONS = [
  { value: 'PROSTE', label: 'Proste' },
  { value: 'STANDARD', label: 'Zwyczajne' },
  { value: 'UROZMAICONE', label: 'Urozmaicone' },
] as const;

const TIME_OPTIONS = [10, 20, 30, 45] as const;

const mealLabel = (k: string) => MEALS.find((m) => m.key === k)?.label ?? k;

function Diff({ value, target, unit }: { value: number; target: number; unit: string }) {
  const d = Math.round(value - target);
  const off = target > 0 && Math.abs(d) > target * 0.1;
  return (
    <span className={off ? 'text-amber-600' : 'text-green-700'}>
      {Math.round(value)} {unit} <span className="text-gray-400">/ {target}</span>
    </span>
  );
}

export function AiMealPlan({
  isOpen,
  date,
  dateLabel,
  hasEntries,
  onClose,
  onSaved,
}: {
  isOpen: boolean;
  date: string;
  dateLabel: string;
  hasEntries: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [preferences, setPreferences] = useState('');
  const [style, setStyle] = useState<string>('PROSTE');
  const [maxMinutes, setMaxMinutes] = useState<number>(20);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [showShopping, setShowShopping] = useState(false);

  const generate = async () => {
    setLoading(true);
    setError('');
    setPlan(null);
    try {
      const res = await fetch('/api/ai/meal-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences, style, maxMinutes }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error || 'Nie udało się wygenerować planu.');
        return;
      }
      setPlan(body);
    } catch {
      setError('Brak połączenia z serwerem.');
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (!plan) return;
    setSaving(true);
    try {
      const res = await fetch('/api/food/diary/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, meals: plan.meals, replace: hasEntries }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        setError(b?.error || 'Nie udało się zapisać.');
        return;
      }
      setPlan(null);
      setPreferences('');
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const copyShopping = async () => {
    if (!plan) return;
    const text = plan.shopping.map((s) => `${s.name} — ${s.grams} g`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Przeglądarka nie pozwoliła skopiować listy.');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Jadłospis AI — ${dateLabel}`}>
      <div className="space-y-4">
        {!plan && (
          <>
            <p className="text-sm text-gray-600">
              Ułożę cztery posiłki pod twój dzienny cel, z przepisami i listą zakupów. Wszystkie wartości
              biorę z bazy produktów, nie z głowy modelu. Nic się nie zapisze, dopóki nie zatwierdzisz.
            </p>

            <div>
              <span className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Styl</span>
              <div className="flex gap-2">
                {STYLE_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => setStyle(o.value)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium ${
                      style === o.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Maksymalny czas przygotowania posiłku
              </span>
              <div className="flex gap-2">
                {TIME_OPTIONS.map((t) => (
                  <button
                    key={t}
                    onClick={() => setMaxMinutes(t)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium ${
                      maxMinutes === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {t} min
                  </button>
                ))}
              </div>
            </div>

            <textarea
              value={preferences}
              onChange={(e) => setPreferences(e.target.value)}
              rows={2}
              placeholder="Preferencje, np. bez laktozy, lubię ryby, nie mam czasu gotować rano"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              onClick={generate}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 text-white py-3 font-semibold disabled:opacity-50"
            >
              <Sparkles className="w-5 h-5" />
              {loading ? 'Układam jadłospis…' : 'Wygeneruj jadłospis'}
            </button>
            {hasEntries && (
              <p className="text-xs text-amber-700 flex gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                Ten dzień ma już wpisy — zapisanie planu je zastąpi.
              </p>
            )}
          </>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        {plan && (
          <>
            {/* Zgodność z celem */}
            <div className="rounded-xl bg-gray-50 p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-600">Kalorie</span>
                <Diff value={plan.totals.kcal} target={plan.targets.kcal} unit="kcal" />
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Białko</span>
                <Diff value={plan.totals.protein} target={plan.targets.protein} unit="g" />
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Węglowodany</span>
                <Diff value={plan.totals.carbs} target={plan.targets.carbs} unit="g" />
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Tłuszcz</span>
                <Diff value={plan.totals.fat} target={plan.targets.fat} unit="g" />
              </div>
              <div className="text-xs text-gray-500 pt-1 space-y-0.5 border-t border-gray-200 mt-2">
                <p className="pt-1">
                  Trafienie w cel kaloryczny: <strong>{plan.accuracy}%</strong>
                  {plan.retried && ' (druga próba — w pierwszej było za mało białka)'}
                </p>
                <p className="text-gray-400">
                  {plan.totalIngredients} składników, wszystkie z bazy ({plan.catalogSize} produktów).
                  Gramatury dobrał serwer pod twój cel.
                </p>
              </div>
            </div>

            {/* Posiłki */}
            {plan.meals.map((m, idx) => (
              <div key={`${m.meal}-${idx}`} className="rounded-xl border border-gray-200 p-3 space-y-2">
                <div className="flex justify-between items-baseline gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{mealLabel(m.meal)}</p>
                    <p className="font-semibold">{m.title}</p>
                  </div>
                  <span className="text-sm font-medium shrink-0">{m.kcal} kcal</span>
                </div>

                <ul className="text-sm text-gray-700 space-y-0.5">
                  {m.ingredients.map((i, k) => (
                    <li key={k} className="flex justify-between gap-2">
                      <span className="min-w-0 truncate">{i.name}</span>
                      <span className="text-gray-500 shrink-0">{i.grams} g · {i.kcal} kcal</span>
                    </li>
                  ))}
                </ul>

                {m.recipe && <p className="text-sm text-gray-600 border-t border-gray-100 pt-2">{m.recipe}</p>}
                <p className="text-xs text-gray-400">B {m.protein} · W {m.carbs} · T {m.fat}</p>
              </div>
            ))}

            {/* Lista zakupów */}
            <div className="rounded-xl border border-gray-200">
              <button
                onClick={() => setShowShopping((s) => !s)}
                className="w-full flex items-center justify-between p-3 font-medium"
              >
                <span className="flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4" /> Lista zakupów ({plan.shopping.length})
                </span>
                <span className="text-gray-400 text-sm">{showShopping ? 'zwiń' : 'rozwiń'}</span>
              </button>
              {showShopping && (
                <div className="px-3 pb-3 space-y-2">
                  <ul className="text-sm divide-y divide-gray-100">
                    {plan.shopping.map((s) => (
                      <li key={s.name} className="py-1 flex justify-between gap-2">
                        <span className="min-w-0 truncate">{s.name}</span>
                        <span className="text-gray-500 shrink-0">{s.grams} g</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={copyShopping}
                    className="w-full flex items-center justify-center gap-2 rounded-lg border border-gray-300 py-2 text-sm"
                  >
                    {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Skopiowano' : 'Kopiuj listę'}
                  </button>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={generate}
                disabled={loading || saving}
                className="flex items-center justify-center gap-2 px-4 rounded-xl border border-gray-300 py-3 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Inny
              </button>
              <button
                onClick={save}
                disabled={saving || loading}
                className="flex-1 rounded-xl bg-green-600 text-white py-3 font-semibold disabled:opacity-50"
              >
                {saving ? 'Zapisuję…' : `Zapisz na ${dateLabel}`}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

'use client';

/**
 * Dziennik żywieniowy — jeden dzień na ekranie.
 *
 * Cel kaloryczny liczy się sam z profilu (wzór Mifflin-St Jeor) i najświeższej
 * wagi z modułu Waga. Można go nadpisać ręcznie w ustawieniach.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Modal } from '@/components/ui/Modal';
import { Toast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FoodPicker, type Candidate, type ComposedMeal } from '@/components/ui/FoodPicker';
import { WeekSummary } from '@/components/ui/WeekSummary';
import { AiMealPlan } from '@/components/ui/AiMealPlan';
import { ShoppingList } from '@/components/ui/ShoppingList';
import { MEALS, ACTIVITY_LEVELS, GOAL_TYPES } from '@/lib/nutrition';
import { formatDate } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Plus, Settings2, Flame, CalendarDays, Sparkles, ChefHat, CopyPlus } from 'lucide-react';

type Entry = {
  id: string; meal: string; name: string; grams: number; unit?: string;
  kcal: number; protein: number; carbs: number; fat: number;
  product?: { recipe: string | null; ingredients: unknown; servingG: number | null } | null;
};

type Targets = {
  kcal: number; protein: number; carbs: number; fat: number;
  bmr: number | null; tdee: number | null; estimated: boolean; missingProfile: boolean;
};

type Profile = {
  heightCm: number | null; birthYear: number | null; sex: string | null;
  activityLevel: string; goalType: string; customKcal: number | null;
  proteinPct: number; carbsPct: number; fatPct: number; addWorkoutKcal: boolean;
};

type DayData = {
  date: string;
  entries: Entry[];
  totals: { kcal: number; protein: number; carbs: number; fat: number };
  targets: Targets;
  workoutKcal: number;
  weightKg: number | null;
  profile: Profile;
};

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shiftDay(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function Bar({ label, value, target, unit, color }: { label: string; value: number; target: number; unit: string; color: string }) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  const over = target > 0 && value > target;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-600">{label}</span>
        <span className={over ? 'text-red-600 font-medium' : 'text-gray-500'}>
          {Math.round(value)} / {target} {unit}
        </span>
      </div>
      <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
        <div className={`h-full rounded-full ${over ? 'bg-red-500' : color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function DietaPage() {
  const { isLoggedIn } = useAuth();
  const [date, setDate] = useState(todayISO);
  const [data, setData] = useState<DayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const [view, setView] = useState<'day' | 'week' | 'shopping'>('day');
  const [copying, setCopying] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [openRecipe, setOpenRecipe] = useState<string | null>(null);
  const [pickerMeal, setPickerMeal] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editEntry, setEditEntry] = useState<Entry | null>(null);
  const [editGrams, setEditGrams] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [form, setForm] = useState<Profile | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const load = useCallback(async (iso: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/food/diary?date=${iso}`);
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      setToast({ msg: 'Nie udało się wczytać dziennika', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn) void load(date);
  }, [date, isLoggedIn, load]);

  const addFood = async (c: Candidate, grams: number) => {
    const res = await fetch('/api/food/diary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date,
        meal: pickerMeal,
        grams,
        productId: c.productId,
        product: c.productId
          ? undefined
          : {
              name: c.name, brand: c.brand, barcode: c.barcode,
              kcal100: c.kcal100, protein100: c.protein100, carbs100: c.carbs100, fat100: c.fat100,
              fiber100: c.fiber100, sugars100: c.sugars100, salt100: c.salt100,
              servingG: c.servingG, source: c.source,
            },
      }),
    });
    if (res.ok) {
      // Okno zostaje otwarte — FoodPicker sam wraca do listy, żeby dało się
      // dorzucić kolejny składnik bez otwierania wszystkiego od nowa.
      void load(date);
    } else {
      setToast({ msg: 'Nie udało się zapisać', type: 'error' });
    }
  };

  // Posiłek opisany zdaniem zapisujemy jako jedną pozycję — tą samą drogą
  // co zaakceptowany jadłospis AI.
  const addComposed = async (m: ComposedMeal) => {
    const res = await fetch('/api/food/diary/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, replace: false, meals: [{ ...m, meal: pickerMeal }] }),
    });
    if (res.ok) {
      void load(date);
    } else {
      setToast({ msg: 'Nie udało się zapisać', type: 'error' });
    }
  };

  const copyFromYesterday = async () => {
    setCopying(true);
    try {
      const res = await fetch('/api/food/diary/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: shiftDay(date, -1), to: date, replace: false }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok) {
        setToast({ msg: `Skopiowano ${body?.copied ?? 0} pozycji`, type: 'success' });
        void load(date);
      } else {
        setToast({ msg: body?.error || 'Nie udało się skopiować', type: 'error' });
      }
    } finally {
      setCopying(false);
    }
  };

  const openEdit = (e: Entry) => {
    setEditEntry(e);
    setEditGrams(String(Math.round(e.grams)));
  };

  /** Zmiana gramatury wpisu — serwer przelicza makro z aktualnego produktu. */
  const saveEdit = async () => {
    const g = parseInt(editGrams, 10);
    if (!editEntry || !Number.isFinite(g) || g <= 0) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/food/diary/${editEntry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grams: g }),
      });
      if (res.ok) {
        setEditEntry(null);
        void load(date);
      } else {
        setToast({ msg: 'Nie udało się zapisać zmiany', type: 'error' });
      }
    } finally {
      setSavingEdit(false);
    }
  };

  const doDelete = async () => {
    if (!deleteId) return;
    const res = await fetch(`/api/food/diary/${deleteId}`, { method: 'DELETE' });
    setDeleteId(null);
    if (res.ok) void load(date);
    else setToast({ msg: 'Nie udało się usunąć', type: 'error' });
  };

  const openSettings = () => {
    if (data) setForm({ ...data.profile });
    setSettingsOpen(true);
  };

  const saveProfile = async () => {
    if (!form) return;
    setSavingProfile(true);
    try {
      const res = await fetch('/api/food/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      setSettingsOpen(false);
      setToast({ msg: 'Zapisano cel', type: 'success' });
      void load(date);
    } catch {
      setToast({ msg: 'Nie udało się zapisać', type: 'error' });
    } finally {
      setSavingProfile(false);
    }
  };

  const byMeal = useMemo(() => {
    const map: Record<string, Entry[]> = {};
    for (const m of MEALS) map[m.key] = [];
    for (const e of data?.entries ?? []) (map[e.meal] ??= []).push(e);
    return map;
  }, [data]);

  if (isLoggedIn === false) {
    return <div className="max-w-2xl mx-auto p-4 pb-24 text-gray-600">Zaloguj się, żeby prowadzić dziennik.</div>;
  }

  const t = data?.targets;
  const budget = (t?.kcal ?? 0) + (data?.profile.addWorkoutKcal ? data.workoutKcal : 0);
  const eaten = data?.totals.kcal ?? 0;
  const left = Math.round(budget - eaten);
  const pct = budget > 0 ? Math.min(100, (eaten / budget) * 100) : 0;
  const inputCls = 'rounded-lg border border-gray-300 px-3 py-2 w-full';

  return (
    <div className="max-w-2xl mx-auto p-4 pb-24 space-y-4">
      {/* Nagłówek z datą */}
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => setDate(shiftDay(date, -1))} className="p-2 rounded-lg hover:bg-gray-100" aria-label="Poprzedni dzień">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="text-center relative">
          {/* Przezroczysty input na dacie — kliknięcie w napis otwiera kalendarz.
              Samymi strzałkami cofnięcie się o dwa tygodnie to 14 kliknięć. */}
          <label className="block cursor-pointer">
            <p className="font-bold">{date === todayISO() ? 'Dzisiaj' : formatDate(date)}</p>
            <input
              type="date"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
              aria-label="Wybierz datę"
            />
          </label>
          {date !== todayISO() && (
            <button onClick={() => setDate(todayISO())} className="text-xs text-blue-600 underline relative z-10">
              wróć do dzisiaj
            </button>
          )}
        </div>
        <div className="flex">
          <button onClick={() => setDate(shiftDay(date, 1))} className="p-2 rounded-lg hover:bg-gray-100" aria-label="Następny dzień">
            <ChevronRight className="w-5 h-5" />
          </button>
          <button onClick={openSettings} className="p-2 rounded-lg hover:bg-gray-100" aria-label="Ustawienia celu">
            <Settings2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Przełącznik widoku */}
      <div className="flex gap-2">
        {([['day', 'Dzień'], ['week', 'Tydzień'], ['shopping', 'Zakupy']] as const).map(([v, label]) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              view === v ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'week' && <WeekSummary anchorDate={date} />}

      {view === 'shopping' && <ShoppingList anchorDate={date} />}

      {view === 'day' && (
      <>
      {/* Podsumowanie dnia */}
      <section className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
        {loading && !data ? (
          <p className="text-gray-400 text-sm">Wczytuję…</p>
        ) : (
          <>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-3xl font-bold">{Math.round(eaten)}</p>
                <p className="text-xs text-gray-500">zjedzone kcal</p>
              </div>
              <div className="text-right">
                <p className={`text-2xl font-bold ${left < 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {left < 0 ? `+${Math.abs(left)}` : left}
                </p>
                <p className="text-xs text-gray-500">{left < 0 ? 'ponad cel' : 'zostało'}</p>
              </div>
            </div>

            <div className="h-3 rounded-full bg-gray-200 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${left < 0 ? 'bg-red-500' : 'bg-green-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>

            <p className="text-xs text-gray-500">
              Cel: <strong>{t?.kcal ?? '—'} kcal</strong>
              {data?.profile.addWorkoutKcal && data.workoutKcal > 0 && (
                <span className="inline-flex items-center gap-1 ml-1 text-orange-600">
                  <Flame className="w-3 h-3" /> +{data.workoutKcal} z treningu
                </span>
              )}
              {t?.missingProfile && (
                <button onClick={openSettings} className="ml-2 text-blue-600 underline">
                  uzupełnij profil, żeby policzyć dokładnie
                </button>
              )}
            </p>

            {t && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <Bar label="Białko" value={data?.totals.protein ?? 0} target={t.protein} unit="g" color="bg-blue-500" />
                <Bar label="Węglowodany" value={data?.totals.carbs ?? 0} target={t.carbs} unit="g" color="bg-amber-500" />
                <Bar label="Tłuszcz" value={data?.totals.fat ?? 0} target={t.fat} unit="g" color="bg-purple-500" />
              </div>
            )}
          </>
        )}
      </section>

      {/* Generator jadłospisu i kopiowanie */}
      <div className="flex gap-2">
        <button
          onClick={() => setAiOpen(true)}
          className="flex-1 flex items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 py-3 font-medium text-blue-700 hover:bg-blue-100"
        >
          <Sparkles className="w-5 h-5" />
          {(data?.entries.length ?? 0) > 0 ? 'Ułóż od nowa (AI)' : 'Zaplanuj z AI'}
        </button>
        <button
          onClick={copyFromYesterday}
          disabled={copying}
          className="flex items-center justify-center gap-2 px-4 rounded-2xl border border-gray-300 text-sm text-gray-700 disabled:opacity-50"
          title="Skopiuj wszystkie wpisy z poprzedniego dnia"
        >
          <CopyPlus className="w-5 h-5" />
          Z wczoraj
        </button>
      </div>

      {/* Posiłki */}
      {MEALS.map((m) => {
        const items = byMeal[m.key] ?? [];
        const sum = Math.round(items.reduce((s, e) => s + e.kcal, 0));
        return (
          <section key={m.key} className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold">{m.label}</h2>
              <span className="text-sm text-gray-500">{sum} kcal</span>
            </div>

            {items.length > 0 && (
              <ul className="divide-y divide-gray-100 mb-2">
                {items.map((e) => (
                  <li key={e.id} className="py-2">
                    <div className="flex items-center justify-between gap-2">
                      <button onClick={() => openEdit(e)} className="min-w-0 text-left flex-1">
                        <p className="truncate text-sm">{e.name}</p>
                        <p className="text-xs text-gray-500">
                          {Math.round(e.grams)} {e.unit === 'ml' ? 'ml' : 'g'} · B {e.protein} · W {e.carbs} · T {e.fat}
                        </p>
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        {e.product?.recipe && (
                          <button
                            onClick={() => setOpenRecipe(openRecipe === e.id ? null : e.id)}
                            className="p-2 text-gray-400 hover:text-blue-600"
                            aria-label="Przepis"
                          >
                            <ChefHat className="w-4 h-4" />
                          </button>
                        )}
                        <span className="text-sm font-medium">{Math.round(e.kcal)}</span>
                        {/* Kosz zdjęty z wiersza — sąsiadował z obszarem edycji
                            i na telefonie łatwo było trafić w niewłaściwy.
                            Usuwanie jest w oknie edycji. */}
                        <ChevronRight className="w-4 h-4 text-gray-300" />
                      </div>
                    </div>
                    {openRecipe === e.id && e.product?.recipe && (
                      <div className="mt-1 rounded-lg bg-gray-50 p-2 text-xs text-gray-600 space-y-1">
                        {Array.isArray(e.product.ingredients) && e.product.ingredients.length > 0 && (
                          <p>
                            <strong>Składniki:</strong>{' '}
                            {(e.product.ingredients as { nazwa: string; gramy: number }[])
                              .map((i) => `${i.nazwa} ${i.gramy} g`)
                              .join(', ')}
                          </p>
                        )}
                        <p>{e.product.recipe}</p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <button
              onClick={() => setPickerMeal(m.key)}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 py-2.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              <Plus className="w-4 h-4" /> Dodaj
            </button>
          </section>
        );
      })}

      </>
      )}

      <AiMealPlan
        isOpen={aiOpen}
        date={date}
        dateLabel={date === todayISO() ? 'dzisiaj' : formatDate(date)}
        hasEntries={(data?.entries.length ?? 0) > 0}
        onClose={() => setAiOpen(false)}
        onSaved={() => {
          setAiOpen(false);
          setToast({ msg: 'Jadłospis zapisany', type: 'success' });
          void load(date);
        }}
      />

      <FoodPicker
        isOpen={pickerMeal !== null}
        mealKey={pickerMeal}
        mealLabel={MEALS.find((m) => m.key === pickerMeal)?.label ?? ''}
        onClose={() => setPickerMeal(null)}
        onPick={addFood}
        onPickMeal={addComposed}
      />

      {/* Edycja gramatury wpisu */}
      <Modal isOpen={editEntry !== null} onClose={() => setEditEntry(null)} title="Zmień ilość">
        {editEntry && (
          <div className="space-y-4">
            <p className="font-semibold">{editEntry.name}</p>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="text"
                inputMode="numeric"
                value={editGrams}
                onChange={(ev) => setEditGrams(ev.target.value.replace(/\D/g, '').slice(0, 4))}
                className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-lg font-semibold"
                autoFocus
              />
              <span className="text-gray-600">{editEntry.unit === 'ml' ? 'ml' : 'g'}</span>
              {(editEntry.unit === 'ml' ? [200, 250, 330, 500] : [50, 100, 150, 200, 250]).map((g) => (
                <button key={g} onClick={() => setEditGrams(String(g))} className="px-3 py-1.5 rounded-lg bg-gray-100 text-sm">
                  {g}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500">
              Teraz: {Math.round(editEntry.grams)} {editEntry.unit === 'ml' ? 'ml' : 'g'} · {Math.round(editEntry.kcal)} kcal. Po zapisaniu przeliczę
              makro proporcjonalnie.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => { setEditEntry(null); setDeleteId(editEntry.id); }}
                className="px-4 rounded-xl border border-gray-300 text-red-600 py-3"
              >
                Usuń
              </button>
              <button
                onClick={saveEdit}
                disabled={savingEdit || !editGrams || parseInt(editGrams, 10) <= 0}
                className="flex-1 rounded-xl bg-blue-600 text-white py-3 font-semibold disabled:opacity-50"
              >
                {savingEdit ? 'Zapisuję…' : 'Zapisz'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={deleteId !== null}
        message="Usunąć ten wpis z dziennika?"
        onConfirm={doDelete}
        onCancel={() => setDeleteId(null)}
      />

      {/* Ustawienia celu */}
      <Modal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} title="Cel kaloryczny">
        {form && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Zapotrzebowanie liczę wzorem Mifflin-St Jeor. Waga bierze się automatycznie z modułu Waga
              {data?.weightKg ? ` (ostatnio ${data.weightKg} kg)` : ' — na razie brak pomiaru'}.
            </p>

            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm">
                <span className="block text-gray-600 mb-1">Wzrost (cm)</span>
                <input
                  value={form.heightCm ?? ''}
                  onChange={(e) => setForm({ ...form, heightCm: e.target.value === '' ? null : parseFloat(e.target.value) })}
                  inputMode="decimal"
                  className={inputCls}
                />
              </label>
              <label className="text-sm">
                <span className="block text-gray-600 mb-1">Rok urodzenia</span>
                <input
                  value={form.birthYear ?? ''}
                  onChange={(e) => setForm({ ...form, birthYear: e.target.value === '' ? null : parseInt(e.target.value) })}
                  inputMode="numeric"
                  className={inputCls}
                />
              </label>
            </div>

            <div>
              <span className="block text-sm text-gray-600 mb-1">Płeć</span>
              <div className="flex gap-2">
                {(['M', 'K'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setForm({ ...form, sex: s })}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium ${form.sex === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}
                  >
                    {s === 'M' ? 'Mężczyzna' : 'Kobieta'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="block text-sm text-gray-600 mb-1">Aktywność</span>
              <select
                value={form.activityLevel}
                onChange={(e) => setForm({ ...form, activityLevel: e.target.value })}
                className={inputCls}
              >
                {ACTIVITY_LEVELS.map((a) => (
                  <option key={a.value} value={a.value}>{a.label} — {a.hint}</option>
                ))}
              </select>
            </div>

            <div>
              <span className="block text-sm text-gray-600 mb-1">Cel</span>
              <div className="flex gap-2">
                {GOAL_TYPES.map((g) => (
                  <button
                    key={g.value}
                    onClick={() => setForm({ ...form, goalType: g.value })}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium ${form.goalType === g.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1">{GOAL_TYPES.find((g) => g.value === form.goalType)?.hint}</p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {([
                ['proteinPct', 'Białko %'],
                ['carbsPct', 'Węgle %'],
                ['fatPct', 'Tłuszcz %'],
              ] as const).map(([k, label]) => (
                <label key={k} className="text-sm">
                  <span className="block text-gray-600 mb-1">{label}</span>
                  <input
                    value={form[k] === 0 ? '' : String(form[k])}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '').slice(0, 3);
                      setForm({ ...form, [k]: v === '' ? 0 : parseInt(v, 10) });
                    }}
                    inputMode="numeric"
                    className={inputCls}
                  />
                </label>
              ))}
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.addWorkoutKcal}
                onChange={(e) => setForm({ ...form, addWorkoutKcal: e.target.checked })}
                className="w-4 h-4"
              />
              Doliczaj kalorie spalone na treningu do dziennego budżetu
            </label>

            <label className="text-sm block">
              <span className="block text-gray-600 mb-1">Własny cel kcal (zostaw puste, żeby liczyć automatycznie)</span>
              <input
                value={form.customKcal ?? ''}
                onChange={(e) => setForm({ ...form, customKcal: e.target.value === '' ? null : parseInt(e.target.value) })}
                inputMode="numeric"
                placeholder={t?.tdee ? `wyliczone: ${t.kcal}` : ''}
                className={inputCls}
              />
            </label>

            {t?.bmr && (
              <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600 flex items-start gap-2">
                <CalendarDays className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Podstawowa przemiana materii {t.bmr} kcal · z aktywnością {t.tdee} kcal · po korekcie celu{' '}
                  <strong>{t.kcal} kcal</strong>. To szacunek ±10% — po dwóch tygodniach porównaj z wagą i skoryguj.
                </span>
              </div>
            )}

            <button
              onClick={saveProfile}
              disabled={savingProfile}
              className="w-full rounded-xl bg-blue-600 text-white py-3 font-semibold disabled:opacity-50"
            >
              {savingProfile ? 'Zapisuję…' : 'Zapisz'}
            </button>
          </div>
        )}
      </Modal>

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

'use client';

/**
 * Podsumowanie zakresu dni: słupki kalorii na tle celu, średnie, licznik
 * trafionych dni i lista zakupów zsumowana z całego zakresu.
 *
 * Ta sama komponenta obsługuje spojrzenie wstecz („jak mi poszło") i w przód
 * („co kupić na zaplanowane dni") — różni je tylko wybrany zakres.
 */

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ShoppingCart, Copy, Check } from 'lucide-react';

type Day = { date: string; kcal: number; protein: number; carbs: number; fat: number; logged: boolean };
type WeekData = {
  start: string;
  end: string;
  days: Day[];
  avg: { kcal: number; protein: number; carbs: number; fat: number };
  targets: { kcal: number; protein: number; carbs: number; fat: number };
  daysLogged: number;
  withinTarget: number;
  shopping: { name: string; grams: number }[];
};

const DOW = ['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'so'];

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function shift(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return iso(d);
}

export function WeekSummary({ anchorDate }: { anchorDate: string }) {
  const [end, setEnd] = useState(anchorDate);
  const [data, setData] = useState<WeekData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showShopping, setShowShopping] = useState(false);

  const load = useCallback(async (e: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/food/week?end=${e}`);
      setData(res.ok ? await res.json() : null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(end);
  }, [end, load]);

  const copyShopping = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.shopping.map((s) => `${s.name} — ${s.grams} g`).join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* przeglądarka nie pozwoliła — trudno */
    }
  };

  if (loading && !data) return <p className="text-sm text-gray-400">Wczytuję…</p>;
  if (!data) return <p className="text-sm text-red-600">Nie udało się wczytać podsumowania.</p>;

  const target = data.targets.kcal || 1;
  const max = Math.max(target, ...data.days.map((d) => d.kcal)) * 1.1;
  const today = iso(new Date());

  return (
    <div className="space-y-4">
      {/* Zakres */}
      <div className="flex items-center justify-between">
        <button onClick={() => setEnd(shift(end, -7))} className="p-2 rounded-lg hover:bg-gray-100" aria-label="Wcześniejszy tydzień">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <p className="text-sm font-medium">
          {data.start.slice(8)}.{data.start.slice(5, 7)} – {data.end.slice(8)}.{data.end.slice(5, 7)}
        </p>
        <button onClick={() => setEnd(shift(end, 7))} className="p-2 rounded-lg hover:bg-gray-100" aria-label="Późniejszy tydzień">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Słupki */}
      <section className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="flex items-end justify-between gap-1 h-36">
          {data.days.map((d) => {
            const h = Math.max(2, (d.kcal / max) * 100);
            const over = data.targets.kcal > 0 && d.kcal > data.targets.kcal * 1.1;
            const near = data.targets.kcal > 0 && Math.abs(d.kcal - data.targets.kcal) <= data.targets.kcal * 0.1;
            const dow = DOW[new Date(`${d.date}T12:00:00`).getDay()];
            return (
              <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full gap-1">
                <span className="text-[10px] text-gray-500">{d.logged ? d.kcal : ''}</span>
                <div
                  className={`w-full rounded-t transition-all ${
                    !d.logged ? 'bg-gray-200' : over ? 'bg-red-400' : near ? 'bg-green-500' : 'bg-blue-400'
                  }`}
                  style={{ height: `${h}%` }}
                  title={`${d.date}: ${d.kcal} kcal`}
                />
                <span className={`text-[11px] ${d.date === today ? 'font-bold text-blue-600' : 'text-gray-500'}`}>{dow}</span>
              </div>
            );
          })}
        </div>
        {/* Linia celu jako podpis — rysowanie jej w słupkach byłoby mylące przy pustych dniach */}
        <p className="text-xs text-gray-500 mt-2 text-center">
          Cel dzienny: {data.targets.kcal} kcal · zielony słupek = w granicy ±10%
        </p>
      </section>

      {/* Liczby */}
      <section className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <p className="text-2xl font-bold">{data.avg.kcal}</p>
            <p className="text-xs text-gray-500">średnio kcal / dzień{data.daysLogged > 0 ? ` (z ${data.daysLogged} dni)` : ''}</p>
          </div>
          <div>
            <p className="text-2xl font-bold">
              {data.withinTarget}
              <span className="text-base text-gray-400">/{data.daysLogged || 0}</span>
            </p>
            <p className="text-xs text-gray-500">dni w celu (±10%)</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { l: 'Białko', v: data.avg.protein, t: data.targets.protein },
            { l: 'Węgle', v: data.avg.carbs, t: data.targets.carbs },
            { l: 'Tłuszcz', v: data.avg.fat, t: data.targets.fat },
          ].map((x) => (
            <div key={x.l} className="rounded-lg bg-gray-50 py-2">
              <p className="font-bold">{x.v} g</p>
              <p className="text-[11px] text-gray-500">{x.l} · cel {x.t}</p>
            </div>
          ))}
        </div>
        {data.daysLogged === 0 && (
          <p className="text-sm text-gray-500 mt-3">Brak wpisów w tym zakresie.</p>
        )}
      </section>

      {/* Lista zakupów z zakresu */}
      {data.shopping.length > 0 && (
        <section className="bg-white rounded-2xl shadow-sm">
          <button onClick={() => setShowShopping((s) => !s)} className="w-full flex items-center justify-between p-4 font-medium">
            <span className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" /> Produkty z tego zakresu ({data.shopping.length})
            </span>
            <span className="text-gray-400 text-sm">{showShopping ? 'zwiń' : 'rozwiń'}</span>
          </button>
          {showShopping && (
            <div className="px-4 pb-4 space-y-2">
              <p className="text-xs text-gray-500">
                Ustaw zakres na nadchodzące dni, a dostaniesz gotową listę zakupów.
              </p>
              <ul className="text-sm divide-y divide-gray-100">
                {data.shopping.map((s) => (
                  <li key={s.name} className="py-1 flex justify-between gap-2">
                    <span className="min-w-0 truncate">{s.name}</span>
                    <span className="text-gray-500 shrink-0">{s.grams} g</span>
                  </li>
                ))}
              </ul>
              <button onClick={copyShopping} className="w-full flex items-center justify-center gap-2 rounded-lg border border-gray-300 py-2 text-sm">
                {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Skopiowano' : 'Kopiuj listę'}
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

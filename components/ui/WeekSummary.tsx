'use client';

/**
 * Podsumowanie zakresu: kalorie na tle celu i waga na tle bilansu.
 *
 * Dlaczego DWA wykresy, a nie jeden z dwiema osiami: kalorie i kilogramy mają
 * zupełnie inne skale, a wykres z dwiema osiami pozwala dowolnie „ustawić"
 * korelację przesuwając jedną z nich. Dwa wykresy dzielące oś czasu pokazują
 * to samo, nie kłamiąc.
 *
 * Pojedynczy dzień wagi nic nie znaczy (woda potrafi ruszyć wagę o kilogram),
 * dlatego linią prowadzącą jest średnia z siedmiu dni, a same pomiary są tylko
 * punktami w tle.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';
import { ChevronLeft, ChevronRight, ShoppingCart, Copy, Check, TrendingDown, TrendingUp, Minus } from 'lucide-react';

type Day = {
  date: string; kcal: number; protein: number; carbs: number; fat: number; logged: boolean;
  weight: number | null; weightAvg: number | null; kcalAvg: number | null;
};
type WeekData = {
  start: string; end: string; days: Day[];
  weightTrend: number | null;
  avg: { kcal: number; protein: number; carbs: number; fat: number };
  targets: { kcal: number; protein: number; carbs: number; fat: number };
  daysLogged: number;
  withinTarget: number;
  shopping: { name: string; grams: number }[];
};

const DOW = ['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'so'];

// Paleta ze zwalidowanego zestawu (sprawdzona pod kątem daltonizmu i kontrastu
// osobno dla trybu jasnego i ciemnego — to nie jest odwrócenie tych samych barw).
const LIGHT = { bar: '#2a78d6', avg: '#eb6834', weight: '#1baf7a', grid: '#e1e0d9', ink: '#898781', dot: '#a8a69f' };
const DARK  = { bar: '#3987e5', avg: '#d95926', weight: '#199e70', grid: '#2c2c2a', ink: '#898781', dot: '#6b6a66' };

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function shift(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return iso(d);
}

/** Tryb ciemny siedzi na klasie `dark` w <html> — obserwujemy ją, bo kolory
 *  wykresu idą inline i same się nie przełączą. */
function useIsDark(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const read = () => setDark(document.documentElement.classList.contains('dark'));
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

export function WeekSummary({ anchorDate }: { anchorDate: string }) {
  const [end, setEnd] = useState(anchorDate);
  const [span, setSpan] = useState<7 | 30>(7);
  const [data, setData] = useState<WeekData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showShopping, setShowShopping] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const dark = useIsDark();
  const C = dark ? DARK : LIGHT;

  const load = useCallback(async (e: string, s: number) => {
    setLoading(true);
    try {
      const start = shift(e, -(s - 1));
      const res = await fetch(`/api/food/week?start=${start}&end=${e}`);
      setData(res.ok ? await res.json() : null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(end, span);
  }, [end, span, load]);

  const chart = useMemo(
    () =>
      (data?.days ?? []).map((d) => ({
        ...d,
        etykieta: span === 7 ? DOW[new Date(`${d.date}T12:00:00`).getDay()] : d.date.slice(8),
        kcalPokaz: d.logged ? d.kcal : null,
      })),
    [data, span]
  );

  const copyShopping = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.shopping.map((s) => `${s.name} — ${s.grams} g`).join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* przeglądarka nie pozwoliła */
    }
  };

  if (loading && !data) return <p className="text-sm text-gray-400">Wczytuję…</p>;
  if (!data) return <p className="text-sm text-red-600">Nie udało się wczytać podsumowania.</p>;

  const hasWeight = data.days.some((d) => d.weightAvg !== null);
  const trend = data.weightTrend;
  const TrendIcon = trend === null || Math.abs(trend) < 0.2 ? Minus : trend < 0 ? TrendingDown : TrendingUp;

  return (
    <div className="space-y-4">
      {/* Filtry w jednym rzędzie nad wykresami */}
      <div className="flex items-center gap-2">
        <button onClick={() => setEnd(shift(end, -span))} className="p-2 rounded-lg hover:bg-gray-100" aria-label="Wcześniej">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <p className="flex-1 text-center text-sm font-medium">
          {data.start.slice(8)}.{data.start.slice(5, 7)} – {data.end.slice(8)}.{data.end.slice(5, 7)}
        </p>
        <button onClick={() => setEnd(shift(end, span))} className="p-2 rounded-lg hover:bg-gray-100" aria-label="Później">
          <ChevronRight className="w-5 h-5" />
        </button>
        <div className="flex gap-1">
          {([7, 30] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSpan(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                span === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {s} dni
            </button>
          ))}
        </div>
      </div>

      {/* ── Wykres 1: kalorie ─────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="flex items-baseline justify-between mb-1">
          <h3 className="font-semibold text-sm">Kalorie</h3>
          <span className="text-xs text-gray-500">średnio {data.avg.kcal} kcal / dzień</span>
        </div>

        <div className="flex gap-3 text-[11px] text-gray-500 mb-2">
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-2 rounded-sm" style={{ background: C.bar }} /> dzień
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-0.5 rounded" style={{ background: C.avg }} /> średnia 7 dni
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-0 border-t-2 border-dashed" style={{ borderColor: C.ink }} /> cel
          </span>
        </div>

        <ResponsiveContainer width="100%" height={170}>
          <ComposedChart data={chart} margin={{ top: 4, right: 4, left: -18, bottom: 0 }} barCategoryGap="18%">
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis
              dataKey="etykieta"
              tick={{ fontSize: 11, fill: C.ink }}
              axisLine={false}
              tickLine={false}
              interval={span === 7 ? 0 : 4}
            />
            <YAxis tick={{ fontSize: 11, fill: C.ink }} axisLine={false} tickLine={false} width={44} />
            <Tooltip
              contentStyle={{
                background: dark ? '#1a1a19' : '#ffffff',
                border: `1px solid ${C.grid}`,
                borderRadius: 12,
                fontSize: 12,
              }}
              labelFormatter={(_: unknown, p: { payload?: { date?: string } }[] | undefined) => p?.[0]?.payload?.date ?? ''}
              formatter={(v: number, n: string) => [
                `${Math.round(v)} kcal`,
                n === 'kcalPokaz' ? 'zjedzone' : 'średnia 7 dni',
              ]}
            />
            {data.targets.kcal > 0 && (
              <ReferenceLine y={data.targets.kcal} stroke={C.ink} strokeDasharray="4 4" strokeWidth={1} />
            )}
            <Bar dataKey="kcalPokaz" fill={C.bar} radius={[4, 4, 0, 0]} maxBarSize={26} />
            <Line
              type="monotone"
              dataKey="kcalAvg"
              stroke={C.avg}
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </section>

      {/* ── Wykres 2: waga ────────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="flex items-baseline justify-between mb-1">
          <h3 className="font-semibold text-sm">Waga</h3>
          {trend !== null && (
            <span className={`text-xs inline-flex items-center gap-1 ${trend < -0.2 ? 'text-green-600' : trend > 0.2 ? 'text-amber-600' : 'text-gray-500'}`}>
              <TrendIcon className="w-3.5 h-3.5" />
              {trend > 0 ? '+' : ''}{trend} kg w tym okresie
            </span>
          )}
        </div>

        {hasWeight ? (
          <>
            <div className="flex gap-3 text-[11px] text-gray-500 mb-2">
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ background: C.dot }} /> pomiar
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-3 h-0.5 rounded" style={{ background: C.weight }} /> średnia 7 dni
              </span>
            </div>

            <ResponsiveContainer width="100%" height={150}>
              <ComposedChart data={chart} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis
                  dataKey="etykieta"
                  tick={{ fontSize: 11, fill: C.ink }}
                  axisLine={false}
                  tickLine={false}
                  interval={span === 7 ? 0 : 4}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: C.ink }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                  domain={['dataMin - 1', 'dataMax + 1']}
                  tickFormatter={(v: number) => v.toFixed(1)}
                />
                <Tooltip
                  contentStyle={{
                    background: dark ? '#1a1a19' : '#ffffff',
                    border: `1px solid ${C.grid}`,
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  labelFormatter={(_: unknown, p: { payload?: { date?: string } }[] | undefined) => p?.[0]?.payload?.date ?? ''}
                  formatter={(v: number, n: string) => [`${v} kg`, n === 'weight' ? 'pomiar' : 'średnia 7 dni']}
                />
                <Line dataKey="weight" stroke="none" dot={{ r: 4, fill: C.dot }} isAnimationActive={false} />
                <Line
                  type="monotone"
                  dataKey="weightAvg"
                  stroke={C.weight}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>

            <p className="text-xs text-gray-500 mt-2">
              Porównuj linię wagi z kaloriami wyżej — to jedyny sposób, żeby sprawdzić, czy przyjęty cel
              faktycznie działa. Reaguj dopiero po dwóch tygodniach.
            </p>
          </>
        ) : (
          <p className="text-sm text-gray-500">
            Brak pomiarów wagi w tym okresie. Wpisuj się regularnie w module Waga — bez tego nie da się
            ocenić, czy cel kaloryczny jest dobrany.
          </p>
        )}
      </section>

      {/* ── Liczby ────────────────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <p className="text-2xl font-bold">{data.avg.kcal}</p>
            <p className="text-xs text-gray-500">
              średnio kcal / dzień{data.daysLogged > 0 ? ` (z ${data.daysLogged} dni)` : ''}
            </p>
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

        <button onClick={() => setShowTable((s) => !s)} className="text-xs text-blue-600 underline mt-3">
          {showTable ? 'ukryj tabelę' : 'pokaż dane jako tabelę'}
        </button>
        {showTable && (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-gray-500">
                <tr>
                  <th className="text-left font-medium py-1">Dzień</th>
                  <th className="text-right font-medium">kcal</th>
                  <th className="text-right font-medium">śr. 7 dni</th>
                  <th className="text-right font-medium">waga</th>
                </tr>
              </thead>
              <tbody>
                {data.days.map((d) => (
                  <tr key={d.date} className="border-t border-gray-100">
                    <td className="py-1">{d.date.slice(5)}</td>
                    <td className="text-right">{d.logged ? d.kcal : '—'}</td>
                    <td className="text-right">{d.kcalAvg ?? '—'}</td>
                    <td className="text-right">{d.weight ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Produkty z zakresu ────────────────────────────────────────── */}
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

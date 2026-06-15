'use client';

import { useState, useEffect, useRef } from 'react';

interface Props {
  userId?: string;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function weekStart(d: Date): Date {
  const dd = new Date(d);
  dd.setHours(0, 0, 0, 0);
  dd.setDate(dd.getDate() - ((dd.getDay() + 6) % 7));
  return dd;
}

function cellColor(count: number): string {
  if (count === 0) return 'bg-gray-100';
  if (count === 1) return 'bg-green-200';
  if (count === 2) return 'bg-green-400';
  return 'bg-green-600';
}

const MONTHS_PL = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];

export function ActivityHeatmap({ userId }: Props) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const from = new Date();
    from.setFullYear(from.getFullYear() - 1);
    const params = new URLSearchParams({ from: toDateStr(from), limit: '400' });
    if (userId) params.set('userId', userId);
    fetch(`/api/sessions?${params}`)
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data)) return;
        const map: Record<string, number> = {};
        for (const s of data) {
          const d = (s.date as string).slice(0, 10);
          map[d] = (map[d] || 0) + 1;
        }
        setCounts(map);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [userId]);

  // Build 52-week grid — start from Monday 51 weeks before current week
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const gridStart = weekStart(today);
  gridStart.setDate(gridStart.getDate() - 51 * 7);

  const weeks: Date[][] = [];
  for (let w = 0; w < 52; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(gridStart);
      day.setDate(gridStart.getDate() + w * 7 + d);
      week.push(day);
    }
    weeks.push(week);
  }

  // Month label positions — show label on the first week of each new month
  const monthLabels: { label: string; col: number }[] = [];
  let lastMonth = -1;
  weeks.forEach((week, wi) => {
    const m = week[0].getMonth();
    if (m !== lastMonth) {
      monthLabels.push({ label: MONTHS_PL[m], col: wi });
      lastMonth = m;
    }
  });

  useEffect(() => {
    if (loaded && scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [loaded]);

  if (!loaded) return null;

  const totalSessions = Object.values(counts).reduce((s, v) => s + v, 0);
  const activeDays = Object.keys(counts).length;
  if (totalSessions === 0) return null;

  // Day labels (Mon, Wed, Fri)
  const DAY_LABELS = ['Pn', '', 'Śr', '', 'Pt', '', 'Nd'];

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-gray-700">Aktywność — ostatni rok</h2>
        <span className="text-xs text-gray-500">
          {totalSessions} treningów · {activeDays} {activeDays === 1 ? 'dzień' : 'dni'}
        </span>
      </div>

      <div ref={scrollRef} className="overflow-x-auto -mx-1">
        <div className="inline-flex flex-col px-1" style={{ minWidth: 'max-content' }}>
          {/* Month labels */}
          <div className="flex mb-1" style={{ paddingLeft: '18px' }}>
            {monthLabels.map((m, i) => {
              const prevCol = i > 0 ? monthLabels[i - 1].col : 0;
              const cols = i === 0 ? m.col : m.col - prevCol;
              return (
                <div
                  key={i}
                  className="text-[9px] text-gray-400 shrink-0"
                  style={{ width: `${cols * 11}px` }}
                >
                  {m.label}
                </div>
              );
            })}
          </div>

          {/* Grid */}
          <div className="flex gap-0">
            {/* Day labels */}
            <div className="flex flex-col mr-1 shrink-0" style={{ gap: '2px' }}>
              {DAY_LABELS.map((d, i) => (
                <div key={i} className="text-[9px] text-gray-400 leading-none flex items-center justify-end pr-1"
                  style={{ width: '16px', height: '9px' }}>
                  {d}
                </div>
              ))}
            </div>

            {/* Weeks */}
            <div className="flex" style={{ gap: '2px' }}>
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col" style={{ gap: '2px' }}>
                  {week.map((day, di) => {
                    const key = toDateStr(day);
                    const count = counts[key] || 0;
                    const isFuture = day > today;
                    return (
                      <div
                        key={di}
                        title={isFuture ? '' : `${key}: ${count} ${count === 1 ? 'trening' : 'treningów'}`}
                        className={`rounded-[2px] ${isFuture ? 'opacity-0' : cellColor(count)}`}
                        style={{ width: '9px', height: '9px' }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-1 mt-2 justify-end">
        <span className="text-[10px] text-gray-400">Mniej</span>
        {(['bg-gray-100', 'bg-green-200', 'bg-green-400', 'bg-green-600'] as const).map((c, i) => (
          <div key={i} className={`rounded-[2px] ${c}`} style={{ width: '9px', height: '9px' }} />
        ))}
        <span className="text-[10px] text-gray-400">Więcej</span>
      </div>
    </div>
  );
}

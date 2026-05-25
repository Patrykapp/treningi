'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Exercise, User, SetData } from '@/types';
import { formatDate, formatDateInput } from '@/lib/utils';

interface EntryWithSession {
  id: string;
  sets: number;
  reps: number;
  weight: number;
  rpe?: number | null;
  comment?: string | null;
  setsData?: SetData[];
  exercise: Exercise;
  session: {
    id: string;
    date: string;
    user: User;
    notes?: string | null;
  };
}

interface ChartPoint {
  date: string;
  [key: string]: string | number | undefined;
}

export default function CwiczeniePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [entries, setEntries] = useState<EntryWithSession[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [filterUserId, setFilterUserId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [exRes, usersRes] = await Promise.all([
        fetch(`/api/exercises`).then(r => r.json()),
        fetch('/api/users').then(r => r.json()),
      ]);
      const ex = exRes.find((e: Exercise) => e.id === id);
      setExercise(ex || null);
      setUsers(usersRes);

      const entriesRes = await fetch(`/api/entries?exerciseId=${id}`).then(r => r.json());
      setEntries(entriesRes);
      setLoading(false);
    };
    load();
  }, [id]);

  const filtered = filterUserId
    ? entries.filter(e => e.session.user.id === filterUserId)
    : entries;

  // Stats
  const bestWeight = filtered.length ? Math.max(...filtered.map(e => e.weight)) : 0;
  const lastEntry = filtered[0]; // sorted desc by date from API

  // Chart data: group by date, one point per user
  const chartData: ChartPoint[] = [];
  const byDate = new Map<string, ChartPoint>();

  const usersInData = [...new Set(entries.map(e => e.session.user.name))];

  for (const entry of [...entries].reverse()) {
    const dateKey = formatDateInput(entry.session.date);
    if (!byDate.has(dateKey)) {
      byDate.set(dateKey, { date: formatDate(entry.session.date) });
    }
    const point = byDate.get(dateKey)!;
    const userName = entry.session.user.name;
    // Use max weight for that day
    if (!point[userName] || (point[userName] as number) < entry.weight) {
      point[userName] = entry.weight;
    }
  }
  byDate.forEach(v => chartData.push(v));

  const colors = ['#3b82f6', '#f97316'];

  const filteredChartData = filterUserId
    ? chartData.map(p => {
        const userName = users.find(u => u.id === filterUserId)?.name;
        if (!userName) return p;
        const result: ChartPoint = { date: p.date };
        result[userName] = p[userName];
        return result;
      })
    : chartData;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Link href="/historia" className="text-blue-600">← Wróć</Link>
          <h1 className="text-xl font-bold">{exercise?.name || '...'}</h1>
        </div>
        {exercise?.muscleGroup && (
          <p className="text-sm text-gray-700 mt-1">{exercise.muscleGroup}</p>
        )}
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-600">Ładowanie...</div>
      ) : (
        <div className="px-4 py-4 space-y-4">
          {/* User filter */}
          <div className="flex gap-2">
            <button
              onClick={() => setFilterUserId('')}
              className={`flex-1 py-2 rounded-xl text-sm font-medium ${!filterUserId ? 'bg-blue-600 text-white' : 'bg-white text-gray-700'}`}
            >
              Wszyscy
            </button>
            {users.map(u => (
              <button
                key={u.id}
                onClick={() => setFilterUserId(u.id)}
                className={`flex-1 py-2 rounded-xl text-sm font-medium ${filterUserId === u.id ? 'bg-blue-600 text-white' : 'bg-white text-gray-700'}`}
              >
                {u.name}
              </button>
            ))}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-2xl p-4 text-center shadow-sm">
              <div className="text-2xl font-bold text-blue-600">{bestWeight}kg</div>
              <div className="text-xs text-gray-700 font-medium mt-1">Najlepszy wynik</div>
            </div>
            <div className="bg-white rounded-2xl p-4 text-center shadow-sm">
              <div className="text-2xl font-bold text-gray-800">{lastEntry?.weight || 0}kg</div>
              <div className="text-xs text-gray-700 font-medium mt-1">Ostatni wynik</div>
              {lastEntry && <div className="text-xs text-gray-600">{formatDate(lastEntry.session.date)}</div>}
            </div>
          </div>

          {/* Chart */}
          {chartData.length > 1 && (
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-3">Progres ciężaru</h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={filteredChartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} unit="kg" />
                  <Tooltip formatter={(v) => [`${v}kg`]} />
                  <Legend />
                  {usersInData.map((name, i) => (
                    <Line
                      key={name}
                      type="monotone"
                      dataKey={name}
                      stroke={colors[i % colors.length]}
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* History */}
          <div className="space-y-2">
            <h3 className="font-semibold text-gray-900">Historia</h3>
            {filtered.length === 0 ? (
              <p className="text-gray-600 text-center py-4">Brak wyników</p>
            ) : (
              filtered.map(entry => (
                <div key={entry.id} className="bg-white rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium text-gray-900">{formatDate(entry.session.date)}</span>
                      <span className="ml-2 text-sm text-blue-600">{entry.session.user.name}</span>
                    </div>
                    <div className="text-right text-sm">
                      {entry.setsData && entry.setsData.length > 0 ? (
                        <div className="text-gray-800">
                          {entry.setsData.map((s, i) => (
                            <span key={i}>{i > 0 && <span className="text-gray-400 mx-0.5">·</span>}{s.reps}×<strong>{s.weight}kg</strong></span>
                          ))}
                        </div>
                      ) : (
                        <div><span className="font-bold text-gray-900">{entry.weight}kg</span><span className="text-gray-700 ml-1">{entry.sets}×{entry.reps}</span></div>
                      )}
                    </div>
                  </div>
                  {(entry.rpe || entry.comment) && (
                    <div className="mt-1 text-sm text-gray-700">
                      {entry.rpe && <span>RPE {entry.rpe} </span>}
                      {entry.comment && <span className="italic">{entry.comment}</span>}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

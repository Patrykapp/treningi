'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Exercise, User, SetData } from '@/types';
import { formatDate, formatDateInput } from '@/lib/utils';
import { Toast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';

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
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Formularz "Dodaj wynik"
  const [showForm, setShowForm] = useState(false);
  const [formDate, setFormDate] = useState(formatDateInput(new Date()));
  const [formUserId, setFormUserId] = useState('');
  const [formCustomSets, setFormCustomSets] = useState(false);
  const [formSets, setFormSets] = useState(3);
  const [formReps, setFormReps] = useState(10);
  const [formWeight, setFormWeight] = useState(0);
  const [formRpe, setFormRpe] = useState('');
  const [formComment, setFormComment] = useState('');
  const [formSetsData, setFormSetsData] = useState<SetData[]>([]);
  const [saving, setSaving] = useState(false);
  const { isLoggedIn } = useAuth();

  const loadData = async () => {
    const [exRes, usersRes, entriesRes] = await Promise.all([
      fetch('/api/exercises').then(r => r.json()),
      fetch('/api/users').then(r => r.json()),
      fetch(`/api/entries?exerciseId=${id}`).then(r => r.json()),
    ]);
    const ex = exRes.find((e: Exercise) => e.id === id);
    setExercise(ex || null);
    setUsers(usersRes);
    setEntries(entriesRes);
    setLoading(false);

    // Domyślny użytkownik
    const saved = localStorage.getItem('selectedUserId');
    if (saved) setFormUserId(saved);
    else if (usersRes.length > 0) setFormUserId(usersRes[0].id);
  };

  useEffect(() => { loadData(); }, [id]);

  const filtered = filterUserId
    ? entries.filter(e => e.session.user.id === filterUserId)
    : entries;

  const bestWeight = filtered.length ? Math.max(...filtered.map(e =>
    e.setsData && e.setsData.length > 0 ? Math.max(...e.setsData.map(s => s.weight)) : e.weight
  )) : 0;
  const lastEntry = filtered[0];

  // Dane wykresu
  const usersInData = [...new Set(entries.map(e => e.session.user.name))];
  const byDate = new Map<string, ChartPoint>();
  for (const entry of [...entries].reverse()) {
    const dateKey = formatDateInput(entry.session.date);
    if (!byDate.has(dateKey)) byDate.set(dateKey, { date: formatDate(entry.session.date) });
    const point = byDate.get(dateKey)!;
    const userName = entry.session.user.name;
    const entryMax = entry.setsData && entry.setsData.length > 0
      ? Math.max(...entry.setsData.map(s => s.weight))
      : entry.weight;
    if (!point[userName] || (point[userName] as number) < entryMax) {
      point[userName] = entryMax;
    }
  }
  const chartData: ChartPoint[] = [];
  byDate.forEach(v => chartData.push(v));

  const filteredChartData = filterUserId
    ? chartData.map(p => {
        const userName = users.find(u => u.id === filterUserId)?.name;
        if (!userName) return p;
        return { date: p.date, [userName]: p[userName] };
      })
    : chartData;

  const colors = ['#3b82f6', '#f97316'];

  // Formularz: obsługa serii
  const initCustomSets = () => {
    setFormSetsData(Array.from({ length: formSets }, () => ({ reps: formReps, weight: formWeight })));
    setFormCustomSets(true);
  };
  const addSet = () => {
    const last = formSetsData.length > 0 ? formSetsData[formSetsData.length - 1] : { reps: formReps, weight: formWeight };
    setFormSetsData(prev => [...prev, { ...last }]);
  };
  const removeSet = (i: number) => setFormSetsData(prev => prev.filter((_, idx) => idx !== i));
  const updateSet = (i: number, field: 'reps' | 'weight', val: number) => {
    setFormSetsData(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: val } : s));
  };

  const handleSave = async () => {
    if (!formUserId) { setToast({ message: 'Wybierz osobę', type: 'error' }); return; }
    if (formCustomSets && formSetsData.length === 0) { setToast({ message: 'Dodaj serie', type: 'error' }); return; }
    if (!formCustomSets && !formWeight) { setToast({ message: 'Podaj ciężar', type: 'error' }); return; }

    setSaving(true);
    try {
      const sd = formCustomSets ? formSetsData : [];
      const entry = {
        exerciseId: id,
        sets: formCustomSets ? sd.length : formSets,
        reps: formCustomSets ? Math.max(...sd.map(s => s.reps)) : formReps,
        weight: formCustomSets ? Math.max(...sd.map(s => s.weight)) : formWeight,
        rpe: formRpe ? Number(formRpe) : undefined,
        comment: formComment || undefined,
        setsData: sd,
      };
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: formDate, userId: formUserId, notes: '', entries: [entry] }),
      });
      if (res.ok) {
        setToast({ message: 'Wynik zapisany! 💪', type: 'success' });
        setShowForm(false);
        setFormComment('');
        setFormRpe('');
        setFormSetsData([]);
        setFormCustomSets(false);
        // Odśwież dane i wykres
        const newEntries = await fetch(`/api/entries?exerciseId=${id}`).then(r => r.json());
        setEntries(newEntries);
      } else {
        setToast({ message: 'Błąd zapisu', type: 'error' });
      }
    } finally {
      setSaving(false);
    }
  };

  const shortName = exercise?.name?.includes(' - ')
    ? exercise.name.split(' - ').slice(1).join(' - ')
    : exercise?.name;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="bg-white border-b px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Link href="/cwiczenia" className="text-blue-600 font-medium">← Wróć</Link>
          <div>
            <h1 className="text-lg font-bold text-gray-900 leading-tight">{shortName || '...'}</h1>
            {exercise?.muscleGroup && <p className="text-xs text-gray-600">{exercise.muscleGroup}</p>}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-600">Ładowanie...</div>
      ) : (
        <div className="px-4 py-4 space-y-4">

          {/* Przycisk Dodaj wynik / Zaloguj */}
          {!showForm && (
            isLoggedIn ? (
              <button
                onClick={() => setShowForm(true)}
                className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-base"
              >
                + Dodaj wynik
              </button>
            ) : (
              <Link
                href="/login"
                className="block w-full bg-gray-100 text-gray-700 text-center py-4 rounded-2xl font-medium text-base"
              >
                🔒 Zaloguj się aby dodać wynik
              </Link>
            )
          )}

          {/* Formularz dodawania wyniku */}
          {showForm && (
            <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-gray-900">Nowy wynik</h2>
                <button onClick={() => setShowForm(false)} className="text-gray-500 text-lg px-2">✕</button>
              </div>

              {/* Data */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Data</label>
                <input
                  type="date"
                  value={formDate}
                  onChange={e => setFormDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900"
                />
              </div>

              {/* Kto */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Kto</label>
                <div className="flex gap-2">
                  {users.map(u => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setFormUserId(u.id)}
                      className={`flex-1 py-2 rounded-xl font-medium text-sm ${formUserId === u.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'}`}
                    >
                      {u.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Toggle trybu */}
              <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
                <button
                  type="button"
                  onClick={() => { setFormCustomSets(false); setFormSetsData([]); }}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${!formCustomSets ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}
                >
                  Jednakowe serie
                </button>
                <button
                  type="button"
                  onClick={initCustomSets}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${formCustomSets ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}
                >
                  Różne serie
                </button>
              </div>

              {/* Jednakowe serie */}
              {!formCustomSets && (
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Serie</label>
                    <input type="number" min="1" value={formSets}
                      onChange={e => setFormSets(parseInt(e.target.value) || 1)}
                      className="w-full border border-gray-200 rounded-xl px-2 py-3 text-center text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Powt.</label>
                    <input type="number" min="1" value={formReps}
                      onChange={e => setFormReps(parseInt(e.target.value) || 1)}
                      className="w-full border border-gray-200 rounded-xl px-2 py-3 text-center text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Ciężar (kg)</label>
                    <input type="number" min="0" step="0.5" value={formWeight}
                      onChange={e => setFormWeight(parseFloat(e.target.value) || 0)}
                      className="w-full border border-gray-200 rounded-xl px-2 py-3 text-center text-gray-900"
                    />
                  </div>
                </div>
              )}

              {/* Różne serie */}
              {formCustomSets && (
                <div className="space-y-2">
                  <div className="grid grid-cols-12 gap-1 text-xs font-medium text-gray-700 px-1">
                    <span className="col-span-2 text-center">Seria</span>
                    <span className="col-span-4 text-center">Powt.</span>
                    <span className="col-span-5 text-center">Ciężar (kg)</span>
                  </div>
                  {formSetsData.map((s, i) => (
                    <div key={i} className="grid grid-cols-12 gap-1 items-center">
                      <span className="col-span-2 text-center text-sm font-semibold text-gray-700">#{i + 1}</span>
                      <input type="number" min="1" value={s.reps}
                        onChange={e => updateSet(i, 'reps', parseInt(e.target.value) || 1)}
                        className="col-span-4 border border-gray-200 rounded-xl px-2 py-2.5 text-center text-gray-900"
                      />
                      <input type="number" min="0" step="0.5" value={s.weight}
                        onChange={e => updateSet(i, 'weight', parseFloat(e.target.value) || 0)}
                        className="col-span-5 border border-gray-200 rounded-xl px-2 py-2.5 text-center text-gray-900"
                      />
                      <button onClick={() => removeSet(i)} className="col-span-1 text-red-400 text-xl font-bold flex items-center justify-center">×</button>
                    </div>
                  ))}
                  <button
                    onClick={addSet}
                    className="w-full border border-dashed border-blue-300 text-blue-600 rounded-xl py-2 text-sm font-medium"
                  >
                    + Dodaj serię
                  </button>
                </div>
              )}

              {/* RPE + komentarz */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">RPE (1-10)</label>
                  <input type="number" min="1" max="10" step="0.5" value={formRpe}
                    onChange={e => setFormRpe(e.target.value)}
                    placeholder="opcjonalne"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Komentarz</label>
                  <input type="text" value={formComment}
                    onChange={e => setFormComment(e.target.value)}
                    placeholder="opcjonalne"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-gray-900"
                  />
                </div>
              </div>

              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold text-base disabled:opacity-60"
              >
                {saving ? 'Zapisuję...' : 'Zapisz wynik'}
              </button>
            </div>
          )}

          {/* Filtr użytkownika */}
          <div className="flex gap-2">
            <button
              onClick={() => setFilterUserId('')}
              className={`flex-1 py-2 rounded-xl text-sm font-medium ${!filterUserId ? 'bg-blue-600 text-white' : 'bg-white text-gray-900'}`}
            >
              Wszyscy
            </button>
            {users.map(u => (
              <button key={u.id} onClick={() => setFilterUserId(u.id)}
                className={`flex-1 py-2 rounded-xl text-sm font-medium ${filterUserId === u.id ? 'bg-blue-600 text-white' : 'bg-white text-gray-900'}`}
              >
                {u.name}
              </button>
            ))}
          </div>

          {/* Statystyki */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-2xl p-4 text-center shadow-sm">
              <div className="text-2xl font-bold text-blue-600">{bestWeight}kg</div>
              <div className="text-xs text-gray-700 font-medium mt-1">Najlepszy wynik</div>
            </div>
            <div className="bg-white rounded-2xl p-4 text-center shadow-sm">
              <div className="text-2xl font-bold text-gray-900">
                {lastEntry ? (lastEntry.setsData && lastEntry.setsData.length > 0
                  ? Math.max(...lastEntry.setsData.map(s => s.weight))
                  : lastEntry.weight) : 0}kg
              </div>
              <div className="text-xs text-gray-700 font-medium mt-1">Ostatni wynik</div>
              {lastEntry && <div className="text-xs text-gray-600 mt-0.5">{formatDate(lastEntry.session.date)}</div>}
            </div>
          </div>

          {/* Wykres */}
          {chartData.length > 0 && (
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-3">Progres ciężaru</h3>
              {chartData.length < 2 ? (
                <p className="text-sm text-gray-600 text-center py-4">Dodaj więcej wyników, żeby zobaczyć wykres.</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={filteredChartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} unit="kg" />
                    <Tooltip formatter={(v) => [`${v}kg`]} />
                    <Legend />
                    {usersInData.map((name, i) => (
                      <Line key={name} type="monotone" dataKey={name}
                        stroke={colors[i % colors.length]} strokeWidth={2} dot={{ r: 4 }} connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          )}

          {/* Historia */}
          <div className="space-y-2">
            <h3 className="font-semibold text-gray-900">Historia</h3>
            {filtered.length === 0 ? (
              <p className="text-gray-600 text-center py-4">Brak wyników — dodaj pierwszy!</p>
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

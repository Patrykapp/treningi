'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { Exercise, User, SetData } from '@/types';
import { formatDate, formatDateInput } from '@/lib/utils';
import { Toast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { activeSession } from '@/hooks/useActiveSession';

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

function calcVolume(entry: EntryWithSession): number {
  if (entry.setsData && entry.setsData.length > 0) {
    return entry.setsData.reduce((sum, s) => sum + s.reps * s.weight, 0);
  }
  return entry.sets * entry.reps * entry.weight;
}

function calcEntryMax(entry: EntryWithSession): number {
  if (entry.setsData && entry.setsData.length > 0) {
    return Math.max(...entry.setsData.map(s => s.weight));
  }
  return entry.weight;
}

// Epley formula: 1RM = weight * (1 + reps/30)
function calc1RM(weight: number, reps: number): number {
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

export default function CwiczeniePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [entries, setEntries] = useState<EntryWithSession[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [filterUserId, setFilterUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [prBanner, setPrBanner] = useState(false);

  // Kalkulator 1RM
  const [showCalc, setShowCalc] = useState(false);
  const [calcWeight, setCalcWeight] = useState(100);
  const [calcReps, setCalcReps] = useState(5);

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

  const [chartType, setChartType] = useState<'weight' | 'volume'>('weight');

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

    const saved = localStorage.getItem('selectedUserId');
    if (saved) setFormUserId(saved);
    else if (usersRes.length > 0) setFormUserId(usersRes[0].id);
  };

  useEffect(() => { loadData(); }, [id]);

  const filtered = filterUserId
    ? entries.filter(e => e.session.user.id === filterUserId)
    : entries;

  const bestWeight = filtered.length ? Math.max(...filtered.map(calcEntryMax)) : 0;
  const lastEntry = filtered[0];

  // Dane wykresów
  const usersInData = [...new Set(entries.map(e => e.session.user.name))];
  const byDate = new Map<string, ChartPoint>();
  for (const entry of [...entries].reverse()) {
    const dateKey = formatDateInput(entry.session.date);
    if (!byDate.has(dateKey)) byDate.set(dateKey, { date: formatDate(entry.session.date) });
    const point = byDate.get(dateKey)!;
    const userName = entry.session.user.name;
    const entryMax = calcEntryMax(entry);
    if (!point[userName] || (point[userName] as number) < entryMax) {
      point[userName] = entryMax;
    }
    // volume
    const volKey = `${userName}_vol`;
    point[volKey] = ((point[volKey] as number) || 0) + calcVolume(entry);
  }
  const chartData: ChartPoint[] = [];
  byDate.forEach(v => chartData.push(v));

  const filteredChartData = filterUserId
    ? chartData.map(p => {
        const userName = users.find(u => u.id === filterUserId)?.name;
        if (!userName) return p;
        return { date: p.date, [userName]: p[userName], [`${userName}_vol`]: p[`${userName}_vol`] };
      })
    : chartData;

  const colors = ['#3b82f6', '#f97316'];

  // Formularz serii
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

  const buildEntry = () => {
    const sd = formCustomSets ? formSetsData : [];
    return {
      exerciseId: id,
      exerciseName: exercise?.name || '',
      sets: formCustomSets ? sd.length : formSets,
      reps: formCustomSets ? Math.max(...sd.map(s => s.reps)) : formReps,
      weight: formCustomSets ? Math.max(...sd.map(s => s.weight)) : formWeight,
      rpe: formRpe ? Number(formRpe) : undefined,
      comment: formComment || undefined,
      setsData: sd,
    };
  };

  const checkPR = (newMax: number): boolean => {
    const userPrevEntries = entries.filter(e => e.session.user.id === formUserId);
    const prevBest = userPrevEntries.length ? Math.max(...userPrevEntries.map(calcEntryMax)) : 0;
    return newMax > prevBest && prevBest > 0;
  };

  const resetForm = () => {
    setShowForm(false);
    setFormComment('');
    setFormRpe('');
    setFormSetsData([]);
    setFormCustomSets(false);
  };

  // Dodaj do bieżącego treningu – zapisuje od razu do bazy
  const handleAddToDraft = async () => {
    if (!formUserId) { setToast({ message: 'Wybierz osobę', type: 'error' }); return; }
    if (formCustomSets && formSetsData.length === 0) { setToast({ message: 'Dodaj serie', type: 'error' }); return; }
    if (!formCustomSets && !formWeight) { setToast({ message: 'Podaj ciężar', type: 'error' }); return; }

    setSaving(true);
    try {
      const entry = buildEntry();
      const newMax = formCustomSets ? Math.max(...formSetsData.map(s => s.weight)) : formWeight;
      const isPR = checkPR(newMax);

      const existingId = activeSession.getId();

      if (existingId) {
        // Dołącz ćwiczenie do istniejącej sesji
        const res = await fetch(`/api/sessions/${existingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entry }),
        });
        if (!res.ok) {
          // Sesja mogła zostać usunięta – stwórz nową
          activeSession.clear();
          const newRes = await fetch('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: formDate, userId: formUserId, notes: '', entries: [entry] }),
          });
          if (newRes.ok) {
            const newSession = await newRes.json();
            activeSession.setId(newSession.id);
          }
        }
      } else {
        // Pierwsza sesja – utwórz nową
        const res = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: formDate, userId: formUserId, notes: '', entries: [entry] }),
        });
        if (res.ok) {
          const newSession = await res.json();
          activeSession.setId(newSession.id);
        }
      }

      if (isPR) {
        setPrBanner(true);
        setTimeout(() => setPrBanner(false), 4000);
        setToast({ message: `🏆 PR! ${newMax}kg dodane do treningu`, type: 'success' });
      } else {
        const exShort = exercise?.name?.includes(' - ')
          ? exercise.name.split(' - ').slice(1).join(' - ')
          : exercise?.name;
        setToast({ message: `${exShort} dodane do treningu 💪`, type: 'success' });
      }

      // Odśwież listę wpisów na tej stronie
      const newEntries = await fetch(`/api/entries?exerciseId=${id}`).then(r => r.json());
      setEntries(newEntries);
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  // Zapisz od razu jako osobny wynik
  const handleSaveAlone = async () => {
    if (!formUserId) { setToast({ message: 'Wybierz osobę', type: 'error' }); return; }
    if (formCustomSets && formSetsData.length === 0) { setToast({ message: 'Dodaj serie', type: 'error' }); return; }
    if (!formCustomSets && !formWeight) { setToast({ message: 'Podaj ciężar', type: 'error' }); return; }

    const entry = buildEntry();
    const newMax = formCustomSets ? Math.max(...formSetsData.map(s => s.weight)) : formWeight;
    const isPR = checkPR(newMax);

    setSaving(true);
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: formDate, userId: formUserId, notes: '', entries: [entry] }),
      });
      if (res.ok) {
        if (isPR) {
          setPrBanner(true);
          setTimeout(() => setPrBanner(false), 4000);
          setToast({ message: `🏆 Nowy rekord osobisty! ${newMax}kg`, type: 'success' });
        } else {
          setToast({ message: 'Wynik zapisany! 💪', type: 'success' });
        }
        resetForm();
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

      {/* PR Banner */}
      {prBanner && (
        <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
          <div className="bg-yellow-400 text-yellow-900 px-8 py-5 rounded-3xl shadow-2xl text-center animate-bounce">
            <div className="text-4xl mb-1">🏆</div>
            <div className="font-bold text-lg">Nowy rekord osobisty!</div>
          </div>
        </div>
      )}

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

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Data</label>
                <input
                  type="date"
                  value={formDate}
                  onChange={e => setFormDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900"
                />
              </div>

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

              {/* Główna akcja: dodaj do bieżącego treningu */}
              <button
                onClick={handleAddToDraft}
                className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold text-base"
              >
                + Dodaj do treningu
              </button>
              {/* Opcjonalnie: zapisz sam od razu */}
              <button
                onClick={handleSaveAlone}
                disabled={saving}
                className="w-full bg-gray-100 text-gray-700 py-2.5 rounded-xl text-sm font-medium disabled:opacity-60"
              >
                {saving ? 'Zapisuję...' : 'Zapisz jako osobny wynik'}
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
              <div className="text-xs text-gray-700 font-medium mt-1">🏆 Rekord</div>
            </div>
            <div className="bg-white rounded-2xl p-4 text-center shadow-sm">
              <div className="text-2xl font-bold text-gray-900">
                {lastEntry ? calcEntryMax(lastEntry) : 0}kg
              </div>
              <div className="text-xs text-gray-700 font-medium mt-1">Ostatni wynik</div>
              {lastEntry && <div className="text-xs text-gray-600 mt-0.5">{formatDate(lastEntry.session.date)}</div>}
            </div>
          </div>

          {/* Wykres */}
          {chartData.length > 0 && (
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              {/* Toggle wykres */}
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900">Wykres</h3>
                <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                  <button
                    onClick={() => setChartType('weight')}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${chartType === 'weight' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}
                  >
                    Ciężar
                  </button>
                  <button
                    onClick={() => setChartType('volume')}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${chartType === 'volume' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}
                  >
                    Wolumen
                  </button>
                </div>
              </div>

              {chartData.length < 2 ? (
                <p className="text-sm text-gray-600 text-center py-4">Dodaj więcej wyników, żeby zobaczyć wykres.</p>
              ) : chartType === 'weight' ? (
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
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={filteredChartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} unit="kg" />
                    <Tooltip formatter={(v) => [`${Math.round(Number(v))} kg`]} />
                    <Legend />
                    {usersInData.map((name, i) => (
                      <Bar key={name} dataKey={`${name}_vol`} name={name}
                        fill={colors[i % colors.length]} radius={[4, 4, 0, 0]}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          )}

          {/* Kalkulator 1RM */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <button
              onClick={() => setShowCalc(o => !o)}
              className="w-full flex items-center justify-between px-4 py-3.5 text-left"
            >
              <span className="font-semibold text-gray-900 text-sm">🧮 Kalkulator 1RM (Epley)</span>
              <span className="text-gray-400 text-lg">{showCalc ? '▴' : '▾'}</span>
            </button>
            {showCalc && (
              <div className="px-4 pb-4 space-y-3 border-t border-gray-100">
                <p className="text-xs text-gray-500 mt-2">Oszacowanie maksymalnego ciężaru na 1 powtórzenie</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Ciężar (kg)</label>
                    <input
                      type="number" min="0" step="0.5" value={calcWeight}
                      onChange={e => setCalcWeight(parseFloat(e.target.value) || 0)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-3 text-center text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Powtórzenia</label>
                    <input
                      type="number" min="1" max="30" value={calcReps}
                      onChange={e => setCalcReps(parseInt(e.target.value) || 1)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-3 text-center text-gray-900"
                    />
                  </div>
                </div>
                <div className="bg-blue-50 rounded-xl p-3 text-center">
                  <span className="text-xs text-blue-700 font-medium">Szacowany 1RM: </span>
                  <span className="text-2xl font-bold text-blue-700">{calc1RM(calcWeight, calcReps)} kg</span>
                </div>
                {/* Tabela % 1RM */}
                <div className="grid grid-cols-3 gap-1 text-xs">
                  {[100, 95, 90, 85, 80, 75].map(pct => {
                    const oneRM = calc1RM(calcWeight, calcReps);
                    return (
                      <div key={pct} className="bg-gray-50 rounded-lg p-2 text-center">
                        <div className="font-bold text-gray-900">{Math.round(oneRM * pct / 100)}kg</div>
                        <div className="text-gray-500">{pct}%</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Historia */}
          <div className="space-y-2">
            <h3 className="font-semibold text-gray-900">Historia</h3>
            {filtered.length === 0 ? (
              <p className="text-gray-600 text-center py-4">Brak wyników — dodaj pierwszy!</p>
            ) : (
              filtered.map(entry => {
                const isPersonalBest = calcEntryMax(entry) === bestWeight && bestWeight > 0;
                return (
                  <div key={entry.id} className={`bg-white rounded-2xl p-4 shadow-sm ${isPersonalBest ? 'border-l-4 border-yellow-400' : ''}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium text-gray-900">{formatDate(entry.session.date)}</span>
                        <span className="ml-2 text-sm text-blue-600">{entry.session.user.name}</span>
                        {isPersonalBest && <span className="ml-1 text-yellow-500 text-xs font-bold">🏆 PR</span>}
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
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
